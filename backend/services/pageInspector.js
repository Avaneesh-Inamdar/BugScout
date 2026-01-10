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
    
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      window.chrome = { runtime: {} };
    });
    
    const page = await context.newPage();
    
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    });
    
    // Navigate with retry logic
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
    
    // Enhanced SPA content loading
    await waitForSPAContent(page);
    
    // Check if page has content
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
    
    const screenshot = await page.screenshot({ fullPage: false, type: 'jpeg', quality: 60 });
    const screenshotBase64 = screenshot.toString('base64');
    
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
    
    const visibleText = await safeEvaluate(() => {
      return document.body?.innerText?.substring(0, 2000) || '';
    }, '');
    
    // Extract elements from main document
    const mainElements = await safeEvaluate(() => extractInteractiveElements(document), []);
    
    // Extract elements from Shadow DOM
    const shadowElements = await safeEvaluate(() => {
      const elements = [];
      const shadowHosts = document.querySelectorAll('*');
      
      shadowHosts.forEach(host => {
        if (host.shadowRoot) {
          const shadowEls = extractInteractiveElements(host.shadowRoot, host);
          elements.push(...shadowEls);
        }
      });
      
      return elements;
    }, []);
    
    // Extract elements from iframes (same-origin only)
    let iframeElements = [];
    try {
      const frames = page.frames();
      for (const frame of frames) {
        if (frame === page.mainFrame()) continue;
        try {
          const frameEls = await frame.evaluate(() => {
            if (typeof extractInteractiveElements === 'function') {
              return extractInteractiveElements(document);
            }
            return [];
          });
          iframeElements.push(...frameEls.map(el => ({
            ...el,
            selector: `iframe >> ${el.selector}`,
            inIframe: true
          })));
        } catch (e) {
          // Cross-origin iframe, skip
        }
      }
    } catch (e) {
      // Ignore iframe errors
    }
    
    // Combine and deduplicate elements
    const allElements = [...mainElements, ...shadowElements, ...iframeElements];
    const seen = new Set();
    const elements = allElements.filter(el => {
      if (!el || !el.selector) return false;
      const key = el.selector + el.visibleText;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 80);
    
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

// Inject the extraction function into page context

async function waitForSPAContent(page) {
  // Inject the element extraction function first
  await page.addScriptTag({
    content: `
      window.extractInteractiveElements = function(root, shadowHost) {
        const interactiveSelectors = [
          'input:not([type="hidden"])',
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
          '[role="tab"]',
          '[role="switch"]',
          '[role="slider"]',
          '[role="option"]',
          '[role="listbox"]',
          '[onclick]',
          '[ng-click]',
          '[data-action]',
          '[data-click]',
          '[data-href]',
          '[data-link]',
          '[data-toggle]',
          '[data-target]',
          '[data-bs-toggle]',
          '[data-bs-target]',
          '.btn',
          '.button',
          '.clickable',
          '.link',
          '[tabindex]:not([tabindex="-1"])',
          '[contenteditable="true"]',
          'label[for]',
          'summary',
          'details',
          '[draggable="true"]'
        ].join(', ');
        
        const els = root.querySelectorAll(interactiveSelectors);
        const results = [];
        let idx = 0;
        
        // Also find elements with cursor:pointer style
        const allEls = root.querySelectorAll('div, span, li, p, img, svg');
        const clickableByStyle = Array.from(allEls).filter(el => {
          try {
            const style = window.getComputedStyle(el);
            return style.cursor === 'pointer' && !el.closest('a, button, input, select, textarea');
          } catch (e) { return false; }
        });
        
        const allInteractive = [...Array.from(els), ...clickableByStyle];
        
        for (const el of allInteractive) {
          if (idx >= 100) break;
          
          const rect = el.getBoundingClientRect();
          // More lenient visibility check
          if (rect.width < 1 || rect.height < 1) continue;
          // Check if element is actually visible
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
          // Skip elements way outside viewport
          if (rect.top > window.innerHeight * 3 || rect.bottom < -100) continue;
          if (rect.left > window.innerWidth * 2 || rect.right < -100) continue;
          
          const tagName = el.tagName.toLowerCase();
          const type = el.getAttribute('type') || '';
          const placeholder = el.getAttribute('placeholder') || '';
          const ariaLabel = el.getAttribute('aria-label') || '';
          const name = el.getAttribute('name') || '';
          const id = el.getAttribute('id') || '';
          const className = typeof el.className === 'string' ? el.className : '';
          const role = el.getAttribute('role') || '';
          const title = el.getAttribute('title') || '';
          const href = el.getAttribute('href') || '';
          const visibleText = (el.innerText?.substring(0, 100) || el.value || el.getAttribute('value') || '').trim();
          
          const selector = generateSelector(el, tagName, id, name, type, placeholder, ariaLabel, visibleText, className, role, title, href, shadowHost);
          
          results.push({
            id: 'e' + idx,
            selector,
            tagName,
            type,
            placeholder,
            ariaLabel,
            name,
            visibleText: visibleText.substring(0, 50),
            title,
            href: href ? href.substring(0, 100) : '',
            role: getElementRole(tagName, type, role),
            bounds: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) }
          });
          idx++;
        }
        
        return results;
        
        function generateSelector(el, tagName, id, name, type, placeholder, ariaLabel, visibleText, className, role, title, href, shadowHost) {
          const prefix = shadowHost ? '>>> ' : '';
          
          // Priority 1: data-testid or similar testing attributes
          const testId = el.getAttribute('data-testid') || el.getAttribute('data-cy') || el.getAttribute('data-test') || el.getAttribute('data-qa');
          if (testId) return prefix + '[data-testid="' + escapeAttr(testId) + '"]';
          
          // Priority 2: ID (skip auto-generated looking IDs)
          if (id && !id.match(/^[a-f0-9-]{20,}$/i) && !id.match(/^\\d+$/) && !id.match(/^:r[0-9a-z]+:$/i) && !id.match(/^ember\\d+$/i) && !id.match(/^react-/i)) {
            return prefix + '#' + cssEscape(id);
          }
          
          // Priority 3: aria-label (great for accessibility)
          if (ariaLabel && ariaLabel.length < 60) {
            return prefix + '[aria-label="' + escapeAttr(ariaLabel) + '"]';
          }
          
          // Priority 4: name attribute for form elements
          if (name && ['input', 'select', 'textarea', 'button'].includes(tagName)) {
            return prefix + tagName + '[name="' + escapeAttr(name) + '"]';
          }
          
          // Priority 5: Specific input types
          if (tagName === 'input') {
            if (type === 'email') return prefix + 'input[type="email"]';
            if (type === 'password') return prefix + 'input[type="password"]';
            if (type === 'tel') return prefix + 'input[type="tel"]';
            if (type === 'search') return prefix + 'input[type="search"]';
            if (type === 'submit') return prefix + 'input[type="submit"]';
            if (type === 'file') return prefix + 'input[type="file"]';
            if (type === 'date') return prefix + 'input[type="date"]';
            if (type === 'number') return prefix + 'input[type="number"]';
            if (placeholder) return prefix + 'input[placeholder="' + escapeAttr(placeholder) + '"]';
          }
          
          // Priority 6: title attribute
          if (title && title.length < 60) {
            return prefix + tagName + '[title="' + escapeAttr(title) + '"]';
          }
          
          // Priority 7: Text content for buttons/links (using Playwright text selector)
          if (visibleText && visibleText.length > 0 && visibleText.length < 40) {
            const cleanText = visibleText.replace(/[\\n\\r\\t]+/g, ' ').trim();
            if (cleanText && (tagName === 'button' || tagName === 'a' || role === 'button' || role === 'link')) {
              return prefix + 'text="' + cleanText + '"';
            }
          }
          
          // Priority 8: Role with text
          if (role && visibleText && visibleText.length < 40) {
            return prefix + 'role=' + role + '[name="' + escapeAttr(visibleText.substring(0, 30)) + '"]';
          }
          
          // Priority 9: Role alone for specific roles
          if (role === 'searchbox') return prefix + '[role="searchbox"]';
          if (role === 'textbox') return prefix + '[role="textbox"]';
          if (role === 'combobox') return prefix + '[role="combobox"]';
          
          // Priority 10: Meaningful class names
          if (className) {
            const classes = className.split(/\\s+/).filter(c => 
              c && c.length > 2 && c.length < 30 &&
              !c.match(/^[a-z]{1,2}[0-9]+/i) && // Skip minified
              !c.match(/^css-/) && // Skip CSS-in-JS
              !c.match(/^sc-/) && // Skip styled-components
              !c.match(/^_/) && // Skip private classes
              (c.includes('btn') || c.includes('button') || c.includes('input') || 
               c.includes('field') || c.includes('submit') || c.includes('search') ||
               c.includes('login') || c.includes('signup') || c.includes('form') ||
               c.includes('nav') || c.includes('menu') || c.includes('link') ||
               c.includes('action') || c.includes('primary') || c.includes('secondary'))
            );
            if (classes.length > 0) {
              return prefix + tagName + '.' + classes[0];
            }
          }
          
          // Priority 11: href for links
          if (tagName === 'a' && href && !href.startsWith('javascript:') && !href.startsWith('#')) {
            const shortHref = href.length > 50 ? href.substring(0, 50) : href;
            return prefix + 'a[href*="' + escapeAttr(shortHref.split('?')[0].split('#')[0]) + '"]';
          }
          
          // Fallback: Generate a unique path-based selector
          return prefix + generatePathSelector(el, tagName);
        }
        
        function generatePathSelector(el, tagName) {
          const path = [];
          let current = el;
          let depth = 0;
          
          while (current && current !== document.body && depth < 4) {
            const tag = current.tagName.toLowerCase();
            const parent = current.parentElement;
            
            if (parent) {
              const siblings = Array.from(parent.children).filter(c => c.tagName.toLowerCase() === tag);
              if (siblings.length > 1) {
                const index = siblings.indexOf(current) + 1;
                path.unshift(tag + ':nth-of-type(' + index + ')');
              } else {
                path.unshift(tag);
              }
            } else {
              path.unshift(tag);
            }
            
            current = parent;
            depth++;
          }
          
          return path.join(' > ');
        }
        
        function cssEscape(str) {
          return str.replace(/([\\[\\]#.:>+~=^$*|])/g, '\\\\$1');
        }
        
        function escapeAttr(str) {
          return str.replace(/"/g, '\\\\"').replace(/\\n/g, ' ').trim();
        }
        
        function getElementRole(tag, type, ariaRole) {
          if (ariaRole) {
            const roleMap = {
              'button': 'button', 'link': 'link', 'textbox': 'text_input',
              'searchbox': 'search_input', 'checkbox': 'checkbox', 'radio': 'radio',
              'combobox': 'dropdown', 'listbox': 'dropdown', 'menuitem': 'menu_item',
              'tab': 'tab', 'switch': 'toggle', 'slider': 'slider', 'option': 'option'
            };
            if (roleMap[ariaRole]) return roleMap[ariaRole];
          }
          
          if (tag === 'input') {
            const typeMap = {
              'email': 'email_input', 'password': 'password_input', 'tel': 'phone_input',
              'text': 'text_input', 'search': 'search_input', 'submit': 'submit_button',
              'checkbox': 'checkbox', 'radio': 'radio', 'number': 'number_input',
              'date': 'date_input', 'file': 'file_input', 'url': 'url_input'
            };
            return typeMap[type] || 'input';
          }
          
          const tagMap = {
            'button': 'button', 'select': 'dropdown', 'textarea': 'textarea',
            'a': 'link', 'label': 'label', 'summary': 'expandable', 'details': 'expandable'
          };
          return tagMap[tag] || 'interactive';
        }
      };
    `
  }).catch(() => {});
  
  // Strategy 1: Wait for network idle
  try {
    await page.waitForLoadState('networkidle', { timeout: 8000 });
  } catch (e) { /* continue */ }
  
  // Strategy 2: Wait for common SPA frameworks
  try {
    await page.waitForFunction(() => {
      // React
      if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) return true;
      if (document.querySelector('[data-reactroot], [data-react-helmet], #__next, #root[data-reactroot]')) return true;
      // Vue
      if (window.__VUE__ || window.__NUXT__) return true;
      if (document.querySelector('[data-v-], [data-server-rendered]')) return true;
      // Angular
      if (window.ng || document.querySelector('[ng-version], [_ngcontent]')) return true;
      // Svelte
      if (document.querySelector('[class*="svelte-"]')) return true;
      // Check for loading states to disappear
      const loaders = document.querySelectorAll('[class*="loading"], [class*="spinner"], [class*="skeleton"], [class*="shimmer"], [aria-busy="true"]');
      const visibleLoaders = Array.from(loaders).filter(l => {
        const rect = l.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      if (visibleLoaders.length === 0) return true;
      // Default: substantial content
      return document.body?.innerHTML?.length > 1000;
    }, { timeout: 10000 });
  } catch (e) { /* continue */ }
  
  // Strategy 3: Wait for DOM to stabilize
  await page.waitForTimeout(1500);
  
  // Strategy 4: Scroll to trigger lazy loading
  try {
    await page.evaluate(() => {
      window.scrollTo(0, Math.min(500, document.body.scrollHeight / 4));
    });
    await page.waitForTimeout(800);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
  } catch (e) { /* continue */ }
  
  // Strategy 5: Click to dismiss any overlays/modals
  try {
    await page.evaluate(() => {
      // Try to close cookie banners, modals, etc.
      const closeButtons = document.querySelectorAll('[class*="close"], [class*="dismiss"], [class*="accept"], [aria-label*="close"], [aria-label*="Close"], button[class*="cookie"]');
      closeButtons.forEach(btn => {
        try {
          const rect = btn.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight) {
            // Don't actually click, just check visibility
          }
        } catch (e) {}
      });
    });
  } catch (e) { /* continue */ }
  
  // Strategy 6: Trigger any pending animations/transitions
  try {
    await page.evaluate(() => {
      document.querySelectorAll('*').forEach(el => {
        try {
          const style = window.getComputedStyle(el);
          if (style.animationDuration !== '0s' || style.transitionDuration !== '0s') {
            el.style.animationDuration = '0s';
            el.style.transitionDuration = '0s';
          }
        } catch (e) {}
      });
    });
  } catch (e) { /* continue */ }
  
  await page.waitForTimeout(500);
}

function detectPageType(elements, text) {
  const hasEmail = elements.some(e => e.type === 'email' || e.role === 'email_input');
  const hasPassword = elements.some(e => e.type === 'password' || e.role === 'password_input');
  const hasSearchInput = elements.some(e => 
    e.type === 'search' || 
    e.role === 'search_input' ||
    e.placeholder?.toLowerCase().includes('search') ||
    e.name?.toLowerCase().includes('search') ||
    e.ariaLabel?.toLowerCase().includes('search')
  );
  const textLower = text.toLowerCase();
  
  if (hasEmail && hasPassword) {
    if (textLower.includes('sign up') || textLower.includes('register') || textLower.includes('create account') || textLower.includes('join')) {
      return 'signup';
    }
    return 'login';
  }
  
  if (hasPassword && !hasEmail) {
    return 'login';
  }
  
  if (textLower.includes('checkout') || textLower.includes('payment') || textLower.includes('cart') || textLower.includes('order summary')) {
    return 'checkout';
  }
  
  if (hasSearchInput || elements.some(e => e.role === 'searchbox')) {
    return 'search';
  }
  
  if (textLower.includes('contact') && elements.some(e => e.role === 'textarea')) {
    return 'contact';
  }
  
  if (elements.some(e => e.type === 'file' || e.role === 'file_input')) {
    return 'upload';
  }
  
  return 'other';
}

module.exports = { inspect };
