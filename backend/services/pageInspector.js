const { chromium } = require('playwright');

async function inspect(url) {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',
      '--no-zygote',
      '--disable-extensions',
      '--window-size=1280,720',
      // Memory optimization
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-sync',
      '--disable-translate',
      '--hide-scrollbars',
      '--metrics-recording-only',
      '--mute-audio',
      '--no-first-run',
      '--js-flags=--max-old-space-size=256'
    ]
  });
  
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'en-US',
      timezoneId: 'America/New_York',
      javaScriptEnabled: true
    });
    
    // Remove webdriver property to avoid detection
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      // Also hide automation indicators
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      window.chrome = { runtime: {} };
    });
    
    const page = await context.newPage();
    
    // Set extra headers to look more like a real browser
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    });
    
    // Navigate with retry logic for redirects
    let retries = 3;
    while (retries > 0) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        break;
      } catch (navError) {
        retries--;
        if (retries === 0) {
          console.warn(`Navigation warning for ${url}:`, navError.message);
        }
        await page.waitForTimeout(1000);
      }
    }
    
    // Wait for SPA content to load - try multiple strategies
    await waitForSPAContent(page);
    
    // Check if page has content with retry
    let bodyContent = 0;
    for (let i = 0; i < 3; i++) {
      try {
        bodyContent = await page.evaluate(() => document.body?.innerHTML?.length || 0);
        break;
      } catch (e) {
        if (e.message.includes('Execution context was destroyed')) {
          await page.waitForTimeout(2000);
          continue;
        }
        throw e;
      }
    }
    
    if (bodyContent < 100) {
      throw new Error('Page appears to be blocked or empty. The website may have bot protection.');
    }
    
    // Capture screenshot (JPEG for smaller size)
    const screenshot = await page.screenshot({ fullPage: false, type: 'jpeg', quality: 60 });
    const screenshotBase64 = screenshot.toString('base64');
    
    // Helper function to safely evaluate with retry
    const safeEvaluate = async (fn, defaultValue) => {
      for (let i = 0; i < 3; i++) {
        try {
          return await page.evaluate(fn);
        } catch (e) {
          if (e.message.includes('Execution context was destroyed')) {
            await page.waitForTimeout(1500);
            continue;
          }
          throw e;
        }
      }
      return defaultValue;
    };
    
    // Extract visible text with retry
    const visibleText = await safeEvaluate(() => {
      return document.body?.innerText?.substring(0, 2000) || '';
    }, '');
    
    // Extract interactive elements with REAL selectors
    const elements = await safeEvaluate(() => {
      // Extended selectors for SPAs and modern frameworks
      const interactiveSelectors = [
        'input',
        'button',
        'select',
        'textarea',
        'a[href]',
        '[role="button"]',
        '[role="link"]',
        '[role="textbox"]',
        '[role="checkbox"]',
        '[role="radio"]',
        '[role="combobox"]',
        '[role="searchbox"]',
        '[role="menuitem"]',
        '[onclick]',
        '[ng-click]',
        '[v-on\\:click]',
        '[@click]',
        '[data-action]',
        '[data-click]',
        '.btn',
        '.button',
        '[class*="btn"]',
        '[class*="button"]',
        '[class*="input"]',
        '[class*="field"]',
        '[tabindex="0"]',
        '[contenteditable="true"]'
      ].join(', ');
      
      const els = document.querySelectorAll(interactiveSelectors);
      const seen = new Set(); // Avoid duplicates
      
      return Array.from(els).slice(0, 100).map((el, idx) => {
        const rect = el.getBoundingClientRect();
        // Skip invisible elements but be more lenient
        if (rect.width < 5 || rect.height < 5) return null;
        // Skip elements outside viewport
        if (rect.top > window.innerHeight * 2 || rect.left > window.innerWidth) return null;
        
        const tagName = el.tagName.toLowerCase();
        const type = el.getAttribute('type') || '';
        const placeholder = el.getAttribute('placeholder') || '';
        const ariaLabel = el.getAttribute('aria-label') || '';
        const name = el.getAttribute('name') || '';
        const id = el.getAttribute('id') || '';
        const className = el.className || '';
        const role = el.getAttribute('role') || '';
        const visibleText = (el.innerText?.substring(0, 100) || el.value || '').trim();
        
        // Generate REAL browser selector (priority order)
        const selector = generateSelector(el, tagName, id, name, type, placeholder, ariaLabel, visibleText, className, role);
        
        // Skip duplicates
        if (seen.has(selector)) return null;
        seen.add(selector);
        
        return {
          id: `e${idx}`,
          selector,
          tagName,
          type,
          placeholder,
          ariaLabel,
          name,
          visibleText,
          role: getElementRole(tagName, type, role)
        };
      }).filter(Boolean).slice(0, 50);

      function generateSelector(el, tagName, id, name, type, placeholder, ariaLabel, visibleText, className, role) {
        // Priority 1: ID (most reliable) - but skip auto-generated IDs
        if (id && !id.match(/^[a-f0-9-]{20,}$/i) && !id.match(/^\d+$/)) {
          return `#${CSS.escape(id)}`;
        }
        
        // Priority 2: data-testid or data-cy (testing attributes)
        const testId = el.getAttribute('data-testid') || el.getAttribute('data-cy') || el.getAttribute('data-test');
        if (testId) return `[data-testid="${testId}"]`;
        
        // Priority 3: aria-label
        if (ariaLabel) return `[aria-label="${ariaLabel}"]`;
        
        // Priority 4: name attribute
        if (name) return `${tagName}[name="${name}"]`;
        
        // Priority 5: Visible text for buttons/links
        if (visibleText && visibleText.length < 50 && (tagName === 'button' || tagName === 'a' || role === 'button')) {
          const cleanText = visibleText.replace(/"/g, '\\"').substring(0, 30);
          return `${tagName}:has-text("${cleanText}")`;
        }
        
        // Priority 6: type + placeholder for inputs
        if (tagName === 'input') {
          if (type === 'email') return 'input[type="email"]';
          if (type === 'password') return 'input[type="password"]';
          if (type === 'tel') return 'input[type="tel"]';
          if (type === 'submit') return 'input[type="submit"]';
          if (type === 'search') return 'input[type="search"]';
          if (placeholder) return `input[placeholder="${placeholder}"]`;
          if (type && type !== 'text') return `input[type="${type}"]`;
        }
        
        // Priority 7: role attribute
        if (role === 'button' && visibleText) {
          return `[role="button"]:has-text("${visibleText.substring(0, 30)}")`;
        }
        if (role === 'textbox') return '[role="textbox"]';
        if (role === 'searchbox') return '[role="searchbox"]';
        
        // Priority 8: Meaningful class names
        if (className && typeof className === 'string') {
          const classes = className.split(/\s+/).filter(c => 
            c && !c.match(/^[a-z]{1,2}\d+/i) && // Skip minified classes
            (c.includes('btn') || c.includes('button') || c.includes('input') || 
             c.includes('field') || c.includes('submit') || c.includes('search'))
          );
          if (classes.length > 0) {
            return `${tagName}.${classes[0]}`;
          }
        }
        
        // Fallback: tag name with index
        return tagName;
      }
      
      function getElementRole(tag, type, ariaRole) {
        if (ariaRole === 'button') return 'button';
        if (ariaRole === 'textbox' || ariaRole === 'searchbox') return 'text_input';
        if (ariaRole === 'checkbox') return 'checkbox';
        if (ariaRole === 'radio') return 'radio';
        if (ariaRole === 'combobox') return 'dropdown';
        
        if (tag === 'input') {
          if (type === 'email') return 'email_input';
          if (type === 'password') return 'password_input';
          if (type === 'tel') return 'phone_input';
          if (type === 'text') return 'text_input';
          if (type === 'search') return 'search_input';
          if (type === 'submit') return 'submit_button';
          if (type === 'checkbox') return 'checkbox';
          if (type === 'radio') return 'radio';
          if (type === 'number') return 'number_input';
          return 'input';
        }
        if (tag === 'button') return 'button';
        if (tag === 'select') return 'dropdown';
        if (tag === 'textarea') return 'textarea';
        if (tag === 'a') return 'link';
        return 'interactive';
      }
    }, []);
    
    // Detect page type based on elements
    const pageType = detectPageType(elements || [], visibleText);
    
    return {
      url,
      pageType,
      visibleText,
      elements,
      screenshot: screenshotBase64
    };
  } finally {
    await browser.close();
  }
}

// Wait for SPA content to fully load
async function waitForSPAContent(page) {
  // Strategy 1: Wait for network to be idle
  try {
    await page.waitForLoadState('networkidle', { timeout: 10000 });
  } catch (e) { /* continue */ }
  
  // Strategy 2: Wait for common SPA frameworks to finish
  try {
    await page.waitForFunction(() => {
      // Check if React/Vue/Angular have finished rendering
      if (window.__NUXT__ || window.__NEXT_DATA__) return true;
      if (document.querySelector('[data-reactroot]')) return true;
      if (document.querySelector('[ng-version]')) return true;
      if (document.querySelector('[data-v-]')) return true;
      // Check for loading indicators to disappear
      const loaders = document.querySelectorAll('[class*="loading"], [class*="spinner"], [class*="skeleton"]');
      if (loaders.length === 0) return true;
      // Default: check if body has substantial content
      return document.body?.innerHTML?.length > 500;
    }, { timeout: 8000 });
  } catch (e) { /* continue */ }
  
  // Strategy 3: Wait a bit more for any lazy-loaded content
  await page.waitForTimeout(2000);
  
  // Strategy 4: Scroll to trigger lazy loading
  try {
    await page.evaluate(() => {
      window.scrollTo(0, 300);
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(1000);
  } catch (e) { /* continue */ }
}

function detectPageType(elements, text) {
  const hasEmail = elements.some(e => e.type === 'email' || e.role === 'email_input');
  const hasPassword = elements.some(e => e.type === 'password' || e.role === 'password_input');
  const hasSearchInput = elements.some(e => 
    e.type === 'search' || 
    e.placeholder?.toLowerCase().includes('search') ||
    e.name?.toLowerCase().includes('search') ||
    e.ariaLabel?.toLowerCase().includes('search')
  );
  const textLower = text.toLowerCase();
  
  if (hasEmail && hasPassword) {
    if (textLower.includes('sign up') || textLower.includes('register') || textLower.includes('create account')) {
      return 'signup';
    }
    return 'login';
  }
  
  if (textLower.includes('checkout') || textLower.includes('payment') || textLower.includes('cart')) {
    return 'checkout';
  }
  
  if (hasSearchInput || textLower.includes('search') || textLower.includes('wikipedia')) {
    return 'search';
  }
  
  if (textLower.includes('contact') && elements.some(e => e.role === 'textarea')) {
    return 'contact';
  }
  
  return 'other';
}

module.exports = { inspect };
