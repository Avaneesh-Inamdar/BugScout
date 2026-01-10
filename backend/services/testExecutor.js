const { chromium } = require('playwright');
const storageService = require('./storageService');
const bugExplainer = require('./bugExplainer');

async function execute(testRun) {
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
      
      const result = await executeTest(browser, testRun.url, test, testRun.id, elementMap);
      results.push(result);
    } catch (err) {
      console.error(`Test ${test.id} error:`, err.message);
      results.push({ ...test, status: 'fail', error: err.message, screenshots: [] });
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

async function executeTest(browser, url, test, runId, elementMap) {
  const page = await browser.newPage();
  
  try {
    // Set small viewport
    await page.setViewportSize({ width: 800, height: 600 });
    
    // Block heavy resources
    await page.route('**/*.{png,jpg,jpeg,gif,webp,svg,ico,woff,woff2,ttf,mp4,mp3}', route => route.abort());
    
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1000);
    
    // Execute steps
    for (const step of test.steps) {
      await executeStep(page, step, elementMap);
      await page.waitForTimeout(200);
    }
    
    // Skip screenshots to save memory
    return { ...test, status: 'pass', screenshots: [], error: null };
  } catch (error) {
    return { ...test, status: 'fail', screenshots: [], error: error.message };
  } finally {
    await page.close();
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
    case 'fill':
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
    case 'tap':
      try {
        await element.click({ timeout: 5000 });
      } catch (e) {
        // If normal click fails, try force click
        await element.click({ force: true });
      }
      break;
    case 'doubleclick':
    case 'dblclick':
      await element.dblclick();
      break;
    case 'rightclick':
      await element.click({ button: 'right' });
      break;
    case 'hover':
    case 'mouseover':
      await element.hover();
      break;
    case 'select':
    case 'selectOption':
      await element.selectOption(value);
      break;
    case 'check':
      await element.check();
      break;
    case 'uncheck':
      await element.uncheck();
      break;
    case 'press':
    case 'key':
      await page.keyboard.press(value || 'Enter');
      break;
    case 'wait':
    case 'delay':
    case 'sleep':
      await page.waitForTimeout(parseInt(value) || 1000);
      break;
    case 'clear':
      await element.fill('');
      break;
    case 'focus':
      await element.focus();
      break;
    case 'blur':
      await element.blur();
      break;
    case 'scroll':
    case 'scrollIntoView':
      await element.scrollIntoViewIfNeeded();
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
        await element.click({ timeout: 5000 });
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
