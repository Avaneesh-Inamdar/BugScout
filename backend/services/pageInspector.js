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
      timezoneId: 'America/New_York'
    });
    
    // Remove webdriver property to avoid detection
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
    
    const page = await context.newPage();
    
    // Set extra headers to look more like a real browser
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    });
    
    // Navigate with retry logic for redirects
    let retries = 3;
    while (retries > 0) {
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        break;
      } catch (navError) {
        retries--;
        if (retries === 0) {
          console.warn(`Navigation warning for ${url}:`, navError.message);
          // Try one more time with domcontentloaded
          try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
          } catch (e) {
            // Continue anyway - page might have partially loaded
          }
        }
        await page.waitForTimeout(1000);
      }
    }
    
    // Wait for page to stabilize after any redirects
    await page.waitForTimeout(3000);
    
    // Wait for network to be idle
    try {
      await page.waitForLoadState('networkidle', { timeout: 5000 });
    } catch (e) {
      // Continue if timeout
    }
    
    // Check if page has content with retry
    let bodyContent = 0;
    for (let i = 0; i < 3; i++) {
      try {
        bodyContent = await page.evaluate(() => document.body?.innerHTML?.length || 0);
        break;
      } catch (e) {
        if (e.message.includes('Execution context was destroyed')) {
          // Page navigated, wait and retry
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
      const interactiveSelectors = 'input, button, select, textarea, a[href], [role="button"]';
      const els = document.querySelectorAll(interactiveSelectors);
      
      return Array.from(els).slice(0, 50).map((el, idx) => {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return null;
        
        const tagName = el.tagName.toLowerCase();
        const type = el.getAttribute('type') || '';
        const placeholder = el.getAttribute('placeholder') || '';
        const ariaLabel = el.getAttribute('aria-label') || '';
        const name = el.getAttribute('name') || '';
        const id = el.getAttribute('id') || '';
        const visibleText = (el.innerText?.substring(0, 100) || el.value || '').trim();
        
        // Generate REAL browser selector (priority order)
        const selector = generateSelector(el, tagName, id, name, type, placeholder, ariaLabel, visibleText);
        
        return {
          id: `e${idx}`,
          selector,  // Real browser selector
          tagName,
          type,
          placeholder,
          ariaLabel,
          name,
          visibleText,
          role: getElementRole(tagName, type)
        };
      }).filter(Boolean);

      function generateSelector(el, tagName, id, name, type, placeholder, ariaLabel, visibleText) {
        // Priority 1: ID (most reliable)
        if (id) return `#${id}`;
        
        // Priority 2: aria-label
        if (ariaLabel) return `[aria-label="${ariaLabel}"]`;
        
        // Priority 3: name attribute
        if (name) return `${tagName}[name="${name}"]`;
        
        // Priority 4: Visible text for buttons/links
        if (visibleText && (tagName === 'button' || tagName === 'a')) {
          return `${tagName}:has-text("${visibleText.substring(0, 30)}")`;
        }
        
        // Priority 5: type + placeholder for inputs
        if (tagName === 'input') {
          if (type === 'email') return 'input[type="email"]';
          if (type === 'password') return 'input[type="password"]';
          if (type === 'submit') return 'input[type="submit"]';
          if (placeholder) return `input[placeholder="${placeholder}"]`;
          if (type) return `input[type="${type}"]`;
        }
        
        // Priority 6: role="button" with text
        if (el.getAttribute('role') === 'button' && visibleText) {
          return `[role="button"]:has-text("${visibleText.substring(0, 30)}")`;
        }
        
        // Fallback: tag name (least specific)
        return tagName;
      }
      
      function getElementRole(tag, type) {
        if (tag === 'input') {
          if (type === 'email') return 'email_input';
          if (type === 'password') return 'password_input';
          if (type === 'tel') return 'phone_input';
          if (type === 'text') return 'text_input';
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
