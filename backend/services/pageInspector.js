const { chromium } = require('playwright');

async function inspect(url) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 }
    });
    const page = await context.newPage();
    
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    
    // Capture full-page screenshot
    const screenshot = await page.screenshot({ fullPage: true, type: 'png' });
    const screenshotBase64 = screenshot.toString('base64');
    
    // Extract visible text
    const visibleText = await page.evaluate(() => {
      return document.body.innerText.substring(0, 2000);
    });
    
    // Extract interactive elements with REAL selectors
    const elements = await page.evaluate(() => {
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
          if (type === 'text') return 'text_input';
          if (type === 'submit') return 'submit_button';
          if (type === 'checkbox') return 'checkbox';
          if (type === 'radio') return 'radio';
          return 'input';
        }
        if (tag === 'button') return 'button';
        if (tag === 'select') return 'dropdown';
        if (tag === 'textarea') return 'textarea';
        if (tag === 'a') return 'link';
        return 'interactive';
      }
    });
    
    // Detect page type based on elements
    const pageType = detectPageType(elements, visibleText);
    
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
  
  if (textLower.includes('search')) {
    return 'search';
  }
  
  if (textLower.includes('contact') && elements.some(e => e.role === 'textarea')) {
    return 'contact';
  }
  
  return 'other';
}

module.exports = { inspect };
