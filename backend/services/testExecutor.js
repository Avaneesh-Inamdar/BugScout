const { chromium } = require('playwright');
const storageService = require('./storageService');
const bugExplainer = require('./bugExplainer');

// Reuse browser instance to save memory
let browserInstance = null;

async function getBrowser() {
  if (!browserInstance) {
    browserInstance = await chromium.launch({
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
        '--disable-default-apps',
        '--disable-sync',
        '--disable-translate',
        '--hide-scrollbars',
        '--mute-audio',
        '--no-first-run',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--js-flags=--max-old-space-size=128',
        '--renderer-process-limit=1',
        '--disable-software-rasterizer'
      ]
    });
  }
  return browserInstance;
}

async function closeBrowser() {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

async function execute(testRun) {
  const browser = await getBrowser();
  const elementMap = buildElementMap(testRun.pageData?.elements || []);
  const results = [];
  
  try {
    // Run only first 2 tests to save memory
    const testsToRun = testRun.tests.slice(0, 2);
    
    for (const test of testsToRun) {
      const result = await executeTest(browser, testRun.url, test, testRun.id, elementMap);
      
      if (result.status === 'fail') {
        try {
          result.explanation = await bugExplainer.explainFailure(result, testRun.pageData);
        } catch (e) {
          console.log('Skipping AI explanation to save memory');
        }
      }
      
      results.push(result);
    }
    
    // Mark remaining tests as skipped
    for (let i = 2; i < testRun.tests.length; i++) {
      results.push({ ...testRun.tests[i], status: 'skipped', error: 'Skipped to save memory' });
    }
  } finally {
    await closeBrowser();
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
    viewport: { width: 800, height: 600 },  // Smaller viewport
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
    bypassCSP: true,
    javaScriptEnabled: true
  });
  
  const page = await context.newPage();
  
  // Block ALL unnecessary resources
  await page.route('**/*', (route) => {
    const type = route.request().resourceType();
    if (['image', 'font', 'media', 'stylesheet', 'other'].includes(type)) {
      route.abort();
    } else {
      route.continue();
    }
  });
  
  const screenshots = [];

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1000);
    
    // Skip before screenshot to save memory
    
    for (const step of test.steps) {
      await executeStep(page, step, elementMap);
      await page.waitForTimeout(200);
    }
    
    // Only capture one small screenshot
    const shot = await captureScreenshot(page, runId, test.id, 'result');
    screenshots.push(shot);
    
    return { ...test, status: 'pass', screenshots, error: null };
  } catch (error) {
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
