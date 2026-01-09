const { chromium } = require('playwright');
const storageService = require('./storageService');
const bugExplainer = require('./bugExplainer');

async function execute(testRun) {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',
      '--no-zygote',
      '--disable-extensions',
      // Memory optimization flags
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-sync',
      '--disable-translate',
      '--hide-scrollbars',
      '--metrics-recording-only',
      '--mute-audio',
      '--no-first-run',
      '--safebrowsing-disable-auto-update',
      '--js-flags=--max-old-space-size=256'
    ]
  });
  
  // Build element ID -> selector map from pageData
  const elementMap = buildElementMap(testRun.pageData?.elements || []);
  
  const results = [];
  
  try {
    // Execute tests sequentially, reusing browser context to save memory
    for (const test of testRun.tests) {
      const result = await executeTest(browser, testRun.url, test, testRun.id, elementMap);
      
      // If test failed, get AI explanation
      if (result.status === 'fail') {
        console.log(`[${testRun.id}] Getting AI explanation for failed test: ${test.name}`);
        result.explanation = await bugExplainer.explainFailure(result, testRun.pageData);
      }
      
      results.push(result);
      
      // Force garbage collection hint between tests
      if (global.gc) global.gc();
    }
  } finally {
    await browser.close();
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

async function executeTest(browser, url, test, runId, elementMap) {
  const context = await browser.newContext({ 
    viewport: { width: 1280, height: 720 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    // Reduce memory usage
    bypassCSP: true,
    javaScriptEnabled: true
  });
  
  const page = await context.newPage();
  
  // Block unnecessary resources to save memory
  await page.route('**/*', (route) => {
    const resourceType = route.request().resourceType();
    // Block images, fonts, media to save memory
    if (['image', 'font', 'media'].includes(resourceType)) {
      route.abort();
    } else {
      route.continue();
    }
  });
  
  const screenshots = [];

  try {
    // Navigate with retry logic
    let navSuccess = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        navSuccess = true;
        break;
      } catch (e) {
        console.log(`Navigation attempt ${attempt + 1} failed: ${e.message}`);
        if (attempt === 1) throw e;
        await page.waitForTimeout(1000);
      }
    }
    
    // Wait for page to stabilize (shorter wait)
    await page.waitForTimeout(1500);
    
    // Before screenshot (smaller, compressed)
    const beforeShot = await captureScreenshot(page, runId, test.id, 'before');
    screenshots.push(beforeShot);
    
    // Execute steps with selector resolution
    for (const step of test.steps) {
      await executeStep(page, step, elementMap);
      await page.waitForTimeout(300);
    }
    
    // Wait a bit for any page changes
    await page.waitForTimeout(500);
    
    // After screenshot
    const afterShot = await captureScreenshot(page, runId, test.id, 'after');
    screenshots.push(afterShot);
    
    return { ...test, status: 'pass', screenshots, error: null };
  } catch (error) {
    console.error(`Test "${test.name}" failed:`, error.message);
    let errorShot = null;
    try {
      errorShot = await captureScreenshot(page, runId, test.id, 'error');
      screenshots.push(errorShot);
    } catch (e) {
      console.error('Failed to capture error screenshot:', e.message);
    }
    return { ...test, status: 'fail', screenshots, error: error.message };
  } finally {
    await page.close();
    await context.close();
  }
}

async function executeStep(page, step, elementMap) {
  const { action, target, value } = step;
  
  // Resolve internal ID to real selector
  const selector = resolveSelector(target, elementMap);
  
  console.log(`Executing: ${action} on "${selector}" (from target: "${target}")`);
  
  // Try to find element with multiple strategies
  let element = null;
  let locator = null;
  
  // Strategy 1: Direct selector
  try {
    locator = page.locator(selector);
    element = await page.$(selector);
  } catch (e) { /* continue */ }
  
  // Strategy 2: Try common variations if not found
  if (!element) {
    const fallbackSelectors = [
      selector,
      `[data-testid="${selector}"]`,
      `button:has-text("${selector}")`,
      `a:has-text("${selector}")`,
      `input[placeholder*="${selector}" i]`
    ];
    
    for (const sel of fallbackSelectors) {
      try {
        element = await page.$(sel);
        if (element) {
          locator = page.locator(sel);
          break;
        }
      } catch (e) { /* continue */ }
    }
  }
  
  if (!element) {
    throw new Error(`Element not found: ${target} (selector: ${selector})`);
  }
  
  // Scroll element into view first
  await element.scrollIntoViewIfNeeded().catch(() => {});
  
  // Wait for element to be visible and enabled before interacting
  try {
    await locator.waitFor({ state: 'visible', timeout: 10000 });
  } catch (e) {
    console.log(`Warning: Element may not be fully visible: ${selector}`);
  }
  
  // Execute action with force option for stubborn elements
  switch (action) {
    case 'type':
      try {
        // First try normal fill with a shorter timeout
        await element.fill(value || '', { timeout: 5000 });
      } catch (e) {
        // If fill fails, try clicking first to focus, then fill with force
        console.log(`Fill failed, trying alternative approach for: ${selector}`);
        try {
          await element.click({ force: true, timeout: 3000 });
          await page.waitForTimeout(200);
          await element.fill(value || '', { force: true, timeout: 5000 });
        } catch (e2) {
          // Last resort: use keyboard input
          console.log(`Force fill failed, using keyboard input for: ${selector}`);
          await element.click({ force: true });
          await page.keyboard.type(value || '');
        }
      }
      break;
    case 'click':
      try {
        await element.click({ timeout: 5000 });
      } catch (e) {
        // If normal click fails, try force click
        await element.click({ force: true });
      }
      break;
    case 'select':
      await element.selectOption(value);
      break;
    case 'check':
      await element.check();
      break;
    case 'uncheck':
      await element.uncheck();
      break;
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

async function captureScreenshot(page, runId, testId, stage) {
  // Use JPEG with quality reduction to save memory and storage
  const screenshot = await page.screenshot({ 
    type: 'jpeg',
    quality: 60,
    fullPage: false
  });
  const filename = `${runId}/${testId}_${stage}_${Date.now()}.jpg`;
  const url = await storageService.uploadScreenshot(filename, screenshot);
  return url;
}

module.exports = { execute };
