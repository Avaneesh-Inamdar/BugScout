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
      '--disable-extensions'
    ]
  });
  
  // Build element ID -> selector map from pageData
  const elementMap = buildElementMap(testRun.pageData?.elements || []);
  
  const results = [];
  
  try {
    for (const test of testRun.tests) {
      const result = await executeTest(browser, testRun.url, test, testRun.id, elementMap);
      
      // If test failed, get AI explanation
      if (result.status === 'fail') {
        console.log(`[${testRun.id}] Getting AI explanation for failed test: ${test.name}`);
        result.explanation = await bugExplainer.explainFailure(result, testRun.pageData);
      }
      
      results.push(result);
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
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const screenshots = [];

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    
    // Before screenshot
    const beforeShot = await captureScreenshot(page, runId, test.id, 'before');
    screenshots.push(beforeShot);
    
    // Execute steps with selector resolution
    for (const step of test.steps) {
      await executeStep(page, step, elementMap);
      await page.waitForTimeout(500);
    }
    
    // After screenshot
    const afterShot = await captureScreenshot(page, runId, test.id, 'after');
    screenshots.push(afterShot);
    
    return { ...test, status: 'pass', screenshots, error: null };
  } catch (error) {
    const errorShot = await captureScreenshot(page, runId, test.id, 'error');
    screenshots.push(errorShot);
    return { ...test, status: 'fail', screenshots, error: error.message };
  } finally {
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
  const screenshot = await page.screenshot({ type: 'png' });
  const filename = `${runId}/${testId}_${stage}_${Date.now()}.png`;
  const url = await storageService.uploadScreenshot(filename, screenshot);
  return url;
}

module.exports = { execute };
