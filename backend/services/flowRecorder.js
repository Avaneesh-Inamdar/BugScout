const { chromium } = require('playwright');
const { v4: uuidv4 } = require('uuid');

// Store active recording sessions
const activeSessions = new Map();

/**
 * Start a recording session - launches browser and injects recording script
 */
async function startRecording(url) {
  const sessionId = uuidv4();
  
  const browser = await chromium.launch({
    headless: false, // User needs to see and interact
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-extensions'
    ]
  });
  
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });
  
  const page = await context.newPage();
  
  // Store recorded actions
  const recordedSteps = [];
  
  // Inject recording script that captures user interactions
  await page.addInitScript(() => {
    window.__qaRecorder = {
      steps: [],
      
      getSelector(element) {
        // Try to get the best selector for the element
        if (element.id) return `#${element.id}`;
        if (element.name) return `[name="${element.name}"]`;
        if (element.getAttribute('data-testid')) {
          return `[data-testid="${element.getAttribute('data-testid')}"]`;
        }
        if (element.getAttribute('aria-label')) {
          return `[aria-label="${element.getAttribute('aria-label')}"]`;
        }
        if (element.placeholder) {
          return `[placeholder="${element.placeholder}"]`;
        }
        
        // Build a CSS path
        const path = [];
        let current = element;
        while (current && current !== document.body) {
          let selector = current.tagName.toLowerCase();
          if (current.className && typeof current.className === 'string') {
            const classes = current.className.trim().split(/\s+/).filter(c => c && !c.includes(':'));
            if (classes.length > 0) {
              selector += '.' + classes.slice(0, 2).join('.');
            }
          }
          path.unshift(selector);
          current = current.parentElement;
        }
        return path.slice(-3).join(' > ');
      },
      
      recordStep(step) {
        this.steps.push(step);
        window.postMessage({ type: 'QA_RECORDER_STEP', step }, '*');
      }
    };
    
    // Record clicks
    document.addEventListener('click', (e) => {
      const target = e.target;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return; // Handle in focus
      
      window.__qaRecorder.recordStep({
        action: 'click',
        selector: window.__qaRecorder.getSelector(target),
        tagName: target.tagName,
        text: target.innerText?.substring(0, 50) || '',
        timestamp: Date.now()
      });
    }, true);
    
    // Record typing (on blur to capture full value)
    document.addEventListener('change', (e) => {
      const target = e.target;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        window.__qaRecorder.recordStep({
          action: target.tagName === 'SELECT' ? 'select' : 'type',
          selector: window.__qaRecorder.getSelector(target),
          value: target.value,
          tagName: target.tagName,
          inputType: target.type || 'text',
          timestamp: Date.now()
        });
      }
    }, true);
    
    // Record form submissions
    document.addEventListener('submit', (e) => {
      window.__qaRecorder.recordStep({
        action: 'submit',
        selector: window.__qaRecorder.getSelector(e.target),
        tagName: 'FORM',
        timestamp: Date.now()
      });
    }, true);
  });
  
  // Listen for recorded steps from the page
  page.on('console', async (msg) => {
    const text = msg.text();
    if (text.includes('QA_RECORDER')) {
      try {
        const data = JSON.parse(text.replace('QA_RECORDER:', ''));
        recordedSteps.push(data);
      } catch (e) { /* ignore */ }
    }
  });
  
  // Expose function to get steps from page context
  await page.exposeFunction('__getRecordedSteps', () => {
    return page.evaluate(() => window.__qaRecorder.steps);
  });
  
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  
  // Store session
  activeSessions.set(sessionId, {
    browser,
    context,
    page,
    url,
    recordedSteps,
    startedAt: new Date().toISOString()
  });
  
  return {
    sessionId,
    url,
    status: 'recording',
    message: 'Recording started. Interact with the page, then call stop to finish.'
  };
}

/**
 * Get current recorded steps for a session
 */
async function getRecordingStatus(sessionId) {
  const session = activeSessions.get(sessionId);
  if (!session) {
    throw new Error('Recording session not found');
  }
  
  // Get steps from page
  let steps = [];
  try {
    steps = await session.page.evaluate(() => window.__qaRecorder?.steps || []);
  } catch (e) {
    steps = session.recordedSteps;
  }
  
  return {
    sessionId,
    url: session.url,
    status: 'recording',
    stepCount: steps.length,
    steps: steps,
    startedAt: session.startedAt
  };
}

/**
 * Stop recording and return the recorded flow
 */
async function stopRecording(sessionId, flowName) {
  const session = activeSessions.get(sessionId);
  if (!session) {
    throw new Error('Recording session not found');
  }
  
  // Get final steps from page
  let steps = [];
  try {
    steps = await session.page.evaluate(() => window.__qaRecorder?.steps || []);
  } catch (e) {
    steps = session.recordedSteps;
  }
  
  // Close browser
  await session.browser.close();
  activeSessions.delete(sessionId);
  
  // Convert recorded steps to test format
  const testSteps = steps.map((step, idx) => ({
    action: step.action,
    target: step.selector,
    value: step.value || '',
    description: generateStepDescription(step)
  }));
  
  const flow = {
    id: uuidv4(),
    name: flowName || `Recorded Flow ${new Date().toLocaleDateString()}`,
    url: session.url,
    steps: testSteps,
    recordedAt: new Date().toISOString(),
    originalSteps: steps // Keep original for debugging
  };
  
  return flow;
}

/**
 * Cancel a recording session without saving
 */
async function cancelRecording(sessionId) {
  const session = activeSessions.get(sessionId);
  if (!session) {
    throw new Error('Recording session not found');
  }
  
  await session.browser.close();
  activeSessions.delete(sessionId);
  
  return { success: true, message: 'Recording cancelled' };
}

/**
 * Convert a recorded flow to a test run format
 */
function flowToTestRun(flow, runId) {
  return {
    id: runId,
    url: flow.url,
    status: 'pending_review',
    createdAt: new Date().toISOString(),
    source: 'recorded',
    flowId: flow.id,
    pageData: {
      pageType: 'recorded_flow',
      elements: flow.steps.map((step, idx) => ({
        id: `rec_${idx}`,
        selector: step.target,
        role: step.action
      }))
    },
    tests: [{
      id: `flow_${flow.id}`,
      type: 'recorded',
      name: flow.name,
      steps: flow.steps.map(step => ({
        action: step.action,
        target: step.target,
        value: step.value
      })),
      expected: 'Flow completes without errors',
      status: 'pending',
      screenshots: []
    }],
    confidence: 1.0
  };
}

/**
 * Generate human-readable step description
 */
function generateStepDescription(step) {
  switch (step.action) {
    case 'click':
      return `Click on ${step.text || step.tagName || 'element'}`;
    case 'type':
      return `Type "${step.value?.substring(0, 20)}${step.value?.length > 20 ? '...' : ''}" into ${step.inputType || 'input'}`;
    case 'select':
      return `Select "${step.value}" from dropdown`;
    case 'submit':
      return 'Submit form';
    default:
      return `${step.action} on ${step.selector}`;
  }
}

/**
 * List all active recording sessions
 */
function listActiveSessions() {
  const sessions = [];
  for (const [id, session] of activeSessions) {
    sessions.push({
      sessionId: id,
      url: session.url,
      startedAt: session.startedAt,
      stepCount: session.recordedSteps.length
    });
  }
  return sessions;
}

module.exports = {
  startRecording,
  getRecordingStatus,
  stopRecording,
  cancelRecording,
  flowToTestRun,
  listActiveSessions
};
