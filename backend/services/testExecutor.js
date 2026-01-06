const { chromium } = require('playwright');
const storageService = require('./storageService');

async function execute(testRun) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  // Build element ID -> selector map from pageData
  const elementMap = buildElementMap(testRun.pageData?.elements || []);
  
  const results = [];
  
  try {
    for (const test of testRun.tests) {
      const result = await executeTest(browser, testRun.url, test, testRun.id, elementMap);
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
  
  // Strategy 1: Direct selector
  try {
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
        if (element) break;
      } catch (e) { /* continue */ }
    }
  }
  
  if (!element) {
    throw new Error(`Element not found: ${target} (selector: ${selector})`);
  }
  
  // Scroll element into view first
  await element.scrollIntoViewIfNeeded().catch(() => {});
  
  // Execute action with force option for stubborn elements
  switch (action) {
    case 'type':
      await element.fill(value || '');
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
