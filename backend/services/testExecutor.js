const { chromium } = require('playwright');
const storageService = require('./storageService');
const bugExplainer = require('./bugExplainer');

/**
 * Execute tests with optional detailed flow mode
 * @param {Object} testRun - The test run object
 * @param {Object} options - Execution options
 * @param {boolean} options.detailedFlow - Enable step-by-step screenshots and detailed logging
 */
async function execute(testRun, options = {}) {
  const { detailedFlow = false } = options;
  const elementMap = buildElementMap(testRun.pageData?.elements || []);
  const results = [];
  
  // Run each test with its own browser instance to avoid context issues
  for (const test of testRun.tests) {
    let browser = null;
    try {
      browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--single-process',
          '--no-zygote',
          '--disable-extensions',
          '--disable-background-networking',
          '--disable-sync',
          '--disable-translate',
          '--hide-scrollbars',
          '--mute-audio',
          '--no-first-run'
        ]
      });
      
      const result = await executeTest(browser, testRun.url, test, testRun.id, elementMap, detailedFlow);
      results.push(result);
    } catch (err) {
      console.error(`Test ${test.id} error:`, err.message);
      results.push({ ...test, status: 'fail', error: err.message, screenshots: [], flowSteps: [] });
    } finally {
      if (browser) {
        try { await browser.close(); } catch (e) { /* ignore */ }
      }
    }
  }
  
  return results;
}

// Build map: internal ID (e0, e1) -> real selector
function buildElementMap(elements) {
  const map = {};
  for (const el of elements) {
    map[el.id] = el.selector;
    // Also map by role for convenience
    if (el.role) {
      map[el.role] = el.selector;
    }
  }
  return map;
}

// Resolve target to real selector
function resolveSelector(target, elementMap) {
  // If target is an internal ID (e0, e1, etc.), resolve it
  if (elementMap[target]) {
    return elementMap[target];
  }
  // Otherwise assume it's already a valid selector
  return target;
}

async function executeTest(browser, url, test, runId, elementMap, detailedFlow = false) {
  const page = await browser.newPage();
  const flowSteps = []; // Store detailed step information
  let lastScreenshotHash = null; // Track to avoid duplicate screenshots
  
  try {
    // Larger viewport for better screenshots in detailed mode
    await page.setViewportSize(detailedFlow ? { width: 1280, height: 720 } : { width: 800, height: 600 });
    
    // Only block resources in non-detailed mode
    if (!detailedFlow) {
      await page.route('**/*.{png,jpg,jpeg,gif,webp,svg,ico,woff,woff2,ttf,mp4,mp3}', route => route.abort());
    }
    
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1000);
    
    // Capture initial page state in detailed mode
    if (detailedFlow) {
      const { screenshot, hash } = await captureSmartScreenshot(page, runId, test.id, 0, 'initial', lastScreenshotHash);
      lastScreenshotHash = hash;
      flowSteps.push({
        stepNumber: 0,
        action: 'navigate',
        target: url,
        value: null,
        status: 'pass',
        screenshot,
        timestamp: Date.now(),
        description: `Navigate to ${new URL(url).hostname}`,
        pageTitle: await page.title().catch(() => ''),
        pageUrl: page.url()
      });
    }
    
    // Execute steps
    for (let i = 0; i < test.steps.length; i++) {
      const step = test.steps[i];
      const stepStartTime = Date.now();
      const prevUrl = page.url();
      
      try {
        await executeStep(page, step, elementMap);
        await page.waitForTimeout(detailedFlow ? 500 : 200);
        
        if (detailedFlow) {
          const currentUrl = page.url();
          const urlChanged = currentUrl !== prevUrl;
          const isSignificantAction = ['click', 'submit', 'select', 'check', 'navigate'].includes(step.action);
          
          // Only capture screenshot if URL changed OR it's a significant action
          if (urlChanged || isSignificantAction) {
            const { screenshot, hash, isDuplicate } = await captureSmartScreenshot(
              page, runId, test.id, i + 1, step.action, lastScreenshotHash
            );
            
            if (!isDuplicate) {
              lastScreenshotHash = hash;
            }
            
            flowSteps.push({
              stepNumber: i + 1,
              action: step.action,
              target: step.target,
              value: maskSensitiveData(step.value, step.target),
              status: 'pass',
              screenshot: isDuplicate ? null : screenshot, // Don't store duplicate
              timestamp: stepStartTime,
              duration: Date.now() - stepStartTime,
              description: generateStepDescription(step),
              pageTitle: await page.title().catch(() => ''),
              pageUrl: currentUrl,
              urlChanged,
              skippedScreenshot: isDuplicate ? 'duplicate' : null
            });
          } else {
            // For non-significant actions (like typing), just log without screenshot
            flowSteps.push({
              stepNumber: i + 1,
              action: step.action,
              target: step.target,
              value: maskSensitiveData(step.value, step.target),
              status: 'pass',
              screenshot: null,
              timestamp: stepStartTime,
              duration: Date.now() - stepStartTime,
              description: generateStepDescription(step),
              pageTitle: await page.title().catch(() => ''),
              pageUrl: currentUrl,
              skippedScreenshot: 'minor_action'
            });
          }
        }
      } catch (stepError) {
        if (detailedFlow) {
          // Always capture screenshot on error
          const { screenshot } = await captureSmartScreenshot(page, runId, test.id, i + 1, 'error', null);
          flowSteps.push({
            stepNumber: i + 1,
            action: step.action,
            target: step.target,
            value: maskSensitiveData(step.value, step.target),
            status: 'fail',
            error: stepError.message,
            screenshot,
            timestamp: stepStartTime,
            duration: Date.now() - stepStartTime,
            description: generateStepDescription(step),
            pageTitle: await page.title().catch(() => ''),
            pageUrl: page.url()
          });
        }
        throw stepError;
      }
    }
    
    // Capture final state (only if different from last screenshot)
    if (detailedFlow) {
      const { screenshot, isDuplicate } = await captureSmartScreenshot(
        page, runId, test.id, test.steps.length + 1, 'final', lastScreenshotHash
      );
      
      if (!isDuplicate) {
        flowSteps.push({
          stepNumber: test.steps.length + 1,
          action: 'complete',
          target: null,
          value: null,
          status: 'pass',
          screenshot,
          timestamp: Date.now(),
          description: 'Test completed successfully',
          pageTitle: await page.title().catch(() => ''),
          pageUrl: page.url()
        });
      }
    }
    
    // Filter out steps without screenshots for cleaner flow view
    const cleanedFlowSteps = detailedFlow ? flowSteps.filter(s => s.screenshot || s.status === 'fail') : [];
    
    return { 
      ...test, 
      status: 'pass', 
      screenshots: cleanedFlowSteps.filter(s => s.screenshot).map(s => s.screenshot),
      flowSteps: cleanedFlowSteps,
      error: null 
    };
  } catch (error) {
    // Filter out steps without screenshots
    const cleanedFlowSteps = detailedFlow ? flowSteps.filter(s => s.screenshot || s.status === 'fail') : [];
    
    return { 
      ...test, 
      status: 'fail', 
      screenshots: cleanedFlowSteps.filter(s => s.screenshot).map(s => s.screenshot),
      flowSteps: cleanedFlowSteps,
      error: error.message 
    };
  } finally {
    await page.close();
  }
}

/**
 * Smart screenshot capture - avoids duplicates by comparing page content hash
 */
async function captureSmartScreenshot(page, runId, testId, stepNum, stage, lastHash) {
  try {
    // Get a simple hash of visible content to detect duplicates
    const currentHash = await page.evaluate(() => {
      const content = document.body?.innerText?.substring(0, 500) || '';
      const url = window.location.href;
      return `${url}::${content.length}::${content.substring(0, 100)}`;
    }).catch(() => '');
    
    // Check if page content is same as last screenshot
    const isDuplicate = lastHash && currentHash === lastHash;
    
    if (isDuplicate) {
      return { screenshot: null, hash: currentHash, isDuplicate: true };
    }
    
    const screenshot = await page.screenshot({ 
      type: 'jpeg',
      quality: 50,
      fullPage: false
    });
    const filename = `${runId}/${testId}_step${stepNum}_${stage}_${Date.now()}.jpg`;
    const url = await storageService.uploadScreenshot(filename, screenshot);
    
    return { screenshot: url, hash: currentHash, isDuplicate: false };
  } catch (e) {
    console.error('Smart screenshot capture failed:', e.message);
    return { screenshot: null, hash: null, isDuplicate: false };
  }
}

/**
 * Capture a screenshot for a specific step (legacy)
 */
async function captureStepScreenshot(page, runId, testId, stepNum, stage) {
  try {
    const screenshot = await page.screenshot({ 
      type: 'jpeg',
      quality: 50, // Balance between quality and size
      fullPage: false
    });
    const filename = `${runId}/${testId}_step${stepNum}_${stage}_${Date.now()}.jpg`;
    const url = await storageService.uploadScreenshot(filename, screenshot);
    return url;
  } catch (e) {
    console.error('Screenshot capture failed:', e.message);
    return null;
  }
}

/**
 * Generate human-readable step description
 */
function generateStepDescription(step) {
  const { action, target, value } = step;
  const shortTarget = target?.length > 40 ? target.substring(0, 40) + '...' : target;
  
  switch (action) {
    case 'click':
    case 'tap':
      return `Click on "${shortTarget}"`;
    case 'type':
    case 'fill':
      const maskedValue = maskSensitiveData(value, target);
      return `Type "${maskedValue}" into "${shortTarget}"`;
    case 'select':
    case 'selectOption':
      return `Select "${value}" from "${shortTarget}"`;
    case 'hover':
      return `Hover over "${shortTarget}"`;
    case 'check':
      return `Check checkbox "${shortTarget}"`;
    case 'uncheck':
      return `Uncheck checkbox "${shortTarget}"`;
    case 'press':
    case 'key':
      return `Press ${value || 'Enter'} key`;
    case 'wait':
    case 'delay':
      return `Wait for ${value || 1000}ms`;
    case 'clear':
      return `Clear input "${shortTarget}"`;
    case 'scroll':
      return `Scroll to "${shortTarget}"`;
    case 'assert':
    case 'verify':
      return `Verify element "${shortTarget}" exists`;
    default:
      return `${action} on "${shortTarget}"`;
  }
}

/**
 * Mask sensitive data like passwords
 */
function maskSensitiveData(value, target) {
  if (!value) return '';
  const targetLower = (target || '').toLowerCase();
  if (targetLower.includes('password') || targetLower.includes('secret') || targetLower.includes('token')) {
    return '••••••••';
  }
  return value.length > 30 ? value.substring(0, 30) + '...' : value;
}

async function executeStep(page, step, elementMap) {
  const { action, target, value } = step;
  
  // Handle wait action specially - doesn't need a selector
  if (action === 'wait' || action === 'delay' || action === 'sleep') {
    await page.waitForTimeout(parseInt(value) || 1000);
    return;
  }
  
  // Skip if no target provided
  if (!target) {
    console.log(`Skipping step with no target: ${action}`);
    return;
  }
  
  // Resolve internal ID to real selector
  const selector = resolveSelector(target, elementMap);
  
  // Skip if selector is null/undefined/empty
  if (!selector) {
    console.log(`Skipping step with invalid selector: ${action} on "${target}"`);
    return;
  }
  
  console.log(`Executing: ${action} on "${selector}" (from target: "${target}")`);
  
  // Try to find element with multiple strategies
  let element = null;
  let locator = null;
  
  // Handle special Playwright selector formats (with null check)
  const isTextSelector = selector.startsWith?.('text=') || false;
  const isRoleSelector = selector.startsWith?.('role=') || false;
  const isShadowSelector = selector.includes?.('>>>') || false;
  const isIframeSelector = selector.includes?.('iframe >>') || false;
  
  // Strategy 1: Use Playwright locator API for special selectors
  if (isTextSelector || isRoleSelector) {
    try {
      locator = page.locator(selector);
      const count = await locator.count();
      if (count > 0) {
        element = await locator.first().elementHandle();
      }
    } catch (e) { 
      console.log(`Locator failed for ${selector}:`, e.message);
    }
  }
  
  // Strategy 2: Handle Shadow DOM selectors
  if (!element && isShadowSelector) {
    try {
      const parts = selector.split('>>>').map(s => s.trim());
      locator = page.locator(parts.join(' >> '));
      const count = await locator.count();
      if (count > 0) {
        element = await locator.first().elementHandle();
      }
    } catch (e) {
      console.log(`Shadow DOM selector failed:`, e.message);
    }
  }
  
  // Strategy 3: Handle iframe selectors
  if (!element && isIframeSelector) {
    try {
      const [iframePart, innerSelector] = selector.split('iframe >>').map(s => s.trim());
      const frame = page.frameLocator('iframe').first();
      locator = frame.locator(innerSelector || iframePart);
      const count = await locator.count();
      if (count > 0) {
        // For iframe elements, we work with locator directly
        element = { isFrameLocator: true, locator };
      }
    } catch (e) {
      console.log(`Iframe selector failed:`, e.message);
    }
  }
  
  // Strategy 4: Direct CSS/attribute selector
  if (!element) {
    try {
      locator = page.locator(selector);
      const count = await locator.count();
      if (count > 0) {
        element = await locator.first().elementHandle();
      }
    } catch (e) { /* continue */ }
  }
  
  // Strategy 5: Try common variations if not found
  if (!element) {
    const fallbackSelectors = [
      `[data-testid="${target}"]`,
      `[data-test="${target}"]`,
      `[data-cy="${target}"]`,
      `text="${target}"`,
      `button:has-text("${target}")`,
      `a:has-text("${target}")`,
      `input[placeholder*="${target}" i]`,
      `[aria-label*="${target}" i]`,
      `[title*="${target}" i]`
    ];
    
    for (const sel of fallbackSelectors) {
      try {
        locator = page.locator(sel);
        const count = await locator.count();
        if (count > 0) {
          element = await locator.first().elementHandle();
          break;
        }
      } catch (e) { /* continue */ }
    }
  }
  
  // Strategy 6: Try getByRole, getByText, getByPlaceholder
  if (!element && target) {
    try {
      // Try by text
      locator = page.getByText(target, { exact: false });
      let count = await locator.count();
      if (count > 0) {
        element = await locator.first().elementHandle();
      }
      
      // Try by placeholder
      if (!element) {
        locator = page.getByPlaceholder(target, { exact: false });
        count = await locator.count();
        if (count > 0) {
          element = await locator.first().elementHandle();
        }
      }
      
      // Try by label
      if (!element) {
        locator = page.getByLabel(target, { exact: false });
        count = await locator.count();
        if (count > 0) {
          element = await locator.first().elementHandle();
        }
      }
    } catch (e) { /* continue */ }
  }
  
  if (!element) {
    throw new Error(`Element not found: ${target} (selector: ${selector})`);
  }
  
  // Handle iframe locator differently
  if (element.isFrameLocator) {
    locator = element.locator;
    element = null; // Will use locator directly
  } else {
    // Scroll element into view first
    await element.scrollIntoViewIfNeeded().catch(() => {});
  }
  
  // Wait for element to be visible and enabled before interacting
  try {
    await locator.waitFor({ state: 'visible', timeout: 10000 });
  } catch (e) {
    console.log(`Warning: Element may not be fully visible: ${selector}`);
  }
  
  // Execute action with force option for stubborn elements
  // Use locator when element handle is not available (iframe case)
  const target_el = element || locator;
  
  switch (action) {
    case 'type':
    case 'fill':
      try {
        // First try normal fill with a shorter timeout
        await locator.fill(value || '', { timeout: 5000 });
      } catch (e) {
        // If fill fails, try clicking first to focus, then fill with force
        console.log(`Fill failed, trying alternative approach for: ${selector}`);
        try {
          await locator.click({ force: true, timeout: 3000 });
          await page.waitForTimeout(200);
          await locator.fill(value || '', { force: true, timeout: 5000 });
        } catch (e2) {
          // Last resort: use keyboard input
          console.log(`Force fill failed, using keyboard input for: ${selector}`);
          await locator.click({ force: true });
          await page.keyboard.type(value || '');
        }
      }
      break;
    case 'click':
    case 'tap':
      try {
        await locator.click({ timeout: 5000 });
      } catch (e) {
        // If normal click fails, try force click
        await locator.click({ force: true });
      }
      break;
    case 'doubleclick':
    case 'dblclick':
      await locator.dblclick();
      break;
    case 'rightclick':
      await locator.click({ button: 'right' });
      break;
    case 'hover':
    case 'mouseover':
      await locator.hover();
      break;
    case 'select':
    case 'selectOption':
      await locator.selectOption(value);
      break;
    case 'check':
      await locator.check();
      break;
    case 'uncheck':
      await locator.uncheck();
      break;
    case 'press':
    case 'key':
      await locator.press(value || 'Enter');
      break;
    case 'wait':
    case 'delay':
    case 'sleep':
      await page.waitForTimeout(parseInt(value) || 1000);
      break;
    case 'clear':
      await locator.fill('');
      break;
    case 'focus':
      await locator.focus();
      break;
    case 'blur':
      await locator.blur();
      break;
    case 'scroll':
    case 'scrollIntoView':
      await locator.scrollIntoViewIfNeeded();
      break;
    case 'screenshot':
      // Skip - handled separately
      break;
    case 'assert':
    case 'verify':
      // For assertions, just check element exists (already done above)
      break;
    default:
      // Instead of failing, log warning and try click as fallback
      console.warn(`Unknown action "${action}", attempting click as fallback`);
      try {
        await locator.click({ timeout: 5000 });
      } catch (e) {
        throw new Error(`Unknown action: ${action}`);
      }
  }
}

async function captureScreenshot(page, runId, testId, stage) {
  // Tiny screenshot to save memory
  const screenshot = await page.screenshot({ 
    type: 'jpeg',
    quality: 30,
    fullPage: false,
    clip: { x: 0, y: 0, width: 800, height: 400 }
  });
  const filename = `${runId}/${testId}_${stage}_${Date.now()}.jpg`;
  const url = await storageService.uploadScreenshot(filename, screenshot);
  return url;
}

module.exports = { execute };
