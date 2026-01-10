const apiKeyManager = require('./apiKeyManager');
const pageInspector = require('./pageInspector');

/**
 * Generate intelligent end-to-end journey tests
 * AI analyzes the page and decides what to test based on what it sees
 */

const SMART_JOURNEY_PROMPT = `You are an expert QA tester analyzing a real webpage. Your job is to understand the page and create a realistic user journey test.

ANALYZE THE PAGE:
1. Look at the visible text to understand what this page is for
2. Examine each element - what is it? what does it do?
3. Think about what a real user would do on this page
4. Consider the logical flow: what comes first, what comes next?

THINK STEP BY STEP:
- What is the main purpose of this page?
- What forms or inputs exist? What data do they need?
- What buttons are there? What do they do?
- What is the expected user journey from start to finish?
- What could go wrong? What should we test?

IMPORTANT RULES:
1. Use ONLY the exact CSS selectors provided in the elements list
2. Fill forms with realistic test data appropriate for each field
3. Follow the natural user flow (don't click checkout before adding to cart)
4. Include wait steps after actions that trigger page changes
5. Stop before any real payment/transaction
6. Test error states too (empty submissions, invalid data)

For each input field, analyze its purpose from:
- The placeholder text
- The field name/type
- Surrounding labels or text
- Its position in the form

Then provide appropriate test data:
- Email fields: use testuser@example.com format
- Password fields: use TestPass123!
- Name fields: use realistic names like "John Smith"
- Phone fields: use valid format like "555-123-4567"
- Address fields: use "123 Test Street"
- Card numbers: use test card 4111111111111111
- Dates: use future dates for expiry, past for birthdays

Return a JSON object with your analysis and test plan:
{
  "page_analysis": {
    "purpose": "What this page is for",
    "main_features": ["feature1", "feature2"],
    "user_goal": "What a user wants to accomplish here"
  },
  "test": {
    "id": "journey_1",
    "type": "e2e_journey", 
    "name": "Descriptive name based on what you're testing",
    "steps": [
      {
        "action": "type|click|select|check|wait|hover|press",
        "target": "exact CSS selector from elements",
        "value": "appropriate value or null",
        "reasoning": "Why this step is needed"
      }
    ],
    "expected": "What should happen if the test passes"
  },
  "detected_flows": ["what user flows you identified"],
  "potential_issues": ["things that might fail or need attention"]
}

AVAILABLE ACTIONS:
- type: Enter text into an input (target: selector, value: text to type)
- click: Click a button/link (target: selector, value: null)
- select: Choose from dropdown (target: selector, value: option value)
- check: Check a checkbox (target: selector, value: null)
- wait: Pause for page load (target: null, value: milliseconds as string)
- hover: Mouse over element (target: selector, value: null)
- press: Press keyboard key (target: selector, value: "Enter" or key name)
- clear: Clear input field (target: selector, value: null)

NOW ANALYZE THIS PAGE:
`;

/**
 * Generate an intelligent journey test by having AI analyze the page
 */
async function generateJourneyTest(url) {
  // First, get detailed page data
  const pageData = await pageInspector.inspect(url);
  
  // Prepare rich context for AI
  const pageContext = buildPageContext(pageData, url);
  
  // Try AI generation
  if (apiKeyManager.hasKeys()) {
    try {
      const aiResult = await generateWithAI(pageContext);
      if (aiResult && aiResult.test && aiResult.test.steps?.length > 0) {
        // Validate and fix selectors
        const validatedResult = validateAndFixSelectors(aiResult, pageData.elements);
        return {
          ...validatedResult,
          pageData,
          url,
          source: 'ai'
        };
      }
    } catch (error) {
      console.warn('AI journey generation failed:', error.message);
    }
  }
  
  // Fallback to smart rule-based generation
  return generateSmartFallback(pageData, url);
}

/**
 * Build rich context about the page for AI to analyze
 */
function buildPageContext(pageData, url) {
  const elements = pageData.elements || [];
  
  // Group elements by type for better understanding
  const inputs = elements.filter(e => e.tagName === 'INPUT' || e.tagName === 'TEXTAREA');
  const buttons = elements.filter(e => e.role === 'button' || e.tagName === 'BUTTON');
  const links = elements.filter(e => e.role === 'link' || e.tagName === 'A');
  const selects = elements.filter(e => e.tagName === 'SELECT');
  const checkboxes = elements.filter(e => e.type === 'checkbox');
  
  // Build detailed element descriptions
  const elementDescriptions = elements.slice(0, 60).map(e => {
    let desc = `- ${e.tagName || 'ELEMENT'}`;
    if (e.type) desc += ` type="${e.type}"`;
    if (e.placeholder) desc += ` placeholder="${e.placeholder}"`;
    if (e.name) desc += ` name="${e.name}"`;
    if (e.visibleText) desc += ` text="${e.visibleText.substring(0, 50)}"`;
    if (e.ariaLabel) desc += ` aria-label="${e.ariaLabel}"`;
    desc += ` | selector: ${e.selector}`;
    return desc;
  }).join('\n');
  
  return {
    url,
    pageType: pageData.pageType,
    title: pageData.title || '',
    visibleText: pageData.visibleText?.substring(0, 3000) || '',
    summary: {
      totalElements: elements.length,
      inputs: inputs.length,
      buttons: buttons.length,
      links: links.length,
      selects: selects.length,
      checkboxes: checkboxes.length
    },
    elementDescriptions,
    elements: elements.slice(0, 60).map(e => ({
      selector: e.selector,
      tagName: e.tagName,
      type: e.type,
      name: e.name,
      placeholder: e.placeholder,
      visibleText: e.visibleText?.substring(0, 100),
      ariaLabel: e.ariaLabel,
      role: e.role,
      href: e.href
    }))
  };
}

async function generateWithAI(pageContext) {
  const prompt = SMART_JOURNEY_PROMPT + `
URL: ${pageContext.url}
Page Type: ${pageContext.pageType}
Page Title: ${pageContext.title}

VISIBLE TEXT ON PAGE:
${pageContext.visibleText.substring(0, 2000)}

PAGE STATISTICS:
- ${pageContext.summary.inputs} input fields
- ${pageContext.summary.buttons} buttons
- ${pageContext.summary.links} links
- ${pageContext.summary.selects} dropdowns
- ${pageContext.summary.checkboxes} checkboxes

ELEMENTS ON PAGE (with their CSS selectors):
${pageContext.elementDescriptions}

Based on your analysis of this page, create a comprehensive test that a real user would perform. Think about what makes sense for THIS specific page.`;

  const completion = await apiKeyManager.executeWithFallback(async (groq) => {
    return await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.3-70b-versatile', // Use larger model for better reasoning
      temperature: 0.3,
      max_tokens: 4000
    });
  });
  
  const responseText = completion.choices[0]?.message?.content || '';
  
  // Extract JSON from response
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in AI response');
  }
  
  const result = JSON.parse(jsonMatch[0]);
  
  // Add reasoning to step descriptions if not present
  if (result.test?.steps) {
    result.test.steps = result.test.steps.map((step, idx) => ({
      ...step,
      description: step.reasoning || generateStepDescription(step)
    }));
  }
  
  return result;
}

/**
 * Validate AI-generated selectors and fix if needed
 */
function validateAndFixSelectors(aiResult, elements) {
  const selectorSet = new Set(elements.map(e => e.selector));
  const elementMap = {};
  elements.forEach(e => {
    elementMap[e.selector] = e;
    if (e.name) elementMap[e.name] = e;
    if (e.placeholder) elementMap[e.placeholder.toLowerCase()] = e;
    if (e.type) elementMap[e.type] = e;
  });
  
  if (aiResult.test?.steps) {
    aiResult.test.steps = aiResult.test.steps.map(step => {
      if (!step.target || step.action === 'wait') return step;
      
      // If selector is valid, keep it
      if (selectorSet.has(step.target)) return step;
      
      // Try to find matching element
      const targetLower = step.target.toLowerCase();
      
      // Try by name
      const byName = elements.find(e => e.name?.toLowerCase() === targetLower);
      if (byName) return { ...step, target: byName.selector };
      
      // Try by placeholder
      const byPlaceholder = elements.find(e => 
        e.placeholder?.toLowerCase().includes(targetLower) ||
        targetLower.includes(e.placeholder?.toLowerCase() || '')
      );
      if (byPlaceholder) return { ...step, target: byPlaceholder.selector };
      
      // Try by visible text
      const byText = elements.find(e => 
        e.visibleText?.toLowerCase().includes(targetLower) ||
        targetLower.includes(e.visibleText?.toLowerCase() || '')
      );
      if (byText) return { ...step, target: byText.selector };
      
      // Try by type for inputs
      if (step.action === 'type') {
        if (targetLower.includes('email')) {
          const emailInput = elements.find(e => e.type === 'email');
          if (emailInput) return { ...step, target: emailInput.selector };
        }
        if (targetLower.includes('password')) {
          const passInput = elements.find(e => e.type === 'password');
          if (passInput) return { ...step, target: passInput.selector };
        }
      }
      
      // Keep original if no match found (will fail gracefully during execution)
      return step;
    });
  }
  
  return aiResult;
}

/**
 * Generate step description
 */
function generateStepDescription(step) {
  const { action, target, value } = step;
  switch (action) {
    case 'type': return `Enter "${value}" into ${target}`;
    case 'click': return `Click on ${target}`;
    case 'select': return `Select "${value}" from ${target}`;
    case 'check': return `Check ${target}`;
    case 'wait': return `Wait ${value}ms for page to load`;
    case 'hover': return `Hover over ${target}`;
    case 'press': return `Press ${value} key`;
    default: return `${action} on ${target}`;
  }
}

/**
 * Smart fallback when AI is unavailable
 */
function generateSmartFallback(pageData, url) {
  const elements = pageData.elements || [];
  const steps = [];
  const text = (pageData.visibleText || '').toLowerCase();
  
  // Analyze what's on the page
  const hasLogin = text.includes('login') || text.includes('sign in');
  const hasSignup = text.includes('sign up') || text.includes('register') || text.includes('create account');
  const hasSearch = elements.some(e => e.type === 'search' || e.placeholder?.toLowerCase().includes('search'));
  const hasCart = text.includes('cart') || text.includes('add to cart');
  const hasCheckout = text.includes('checkout') || text.includes('payment');
  const hasContact = text.includes('contact') || text.includes('message');
  
  // Find elements by purpose
  const findByPurpose = (purposes) => {
    for (const purpose of purposes) {
      const found = elements.find(e => 
        e.type?.toLowerCase() === purpose ||
        e.name?.toLowerCase().includes(purpose) ||
        e.placeholder?.toLowerCase().includes(purpose) ||
        e.ariaLabel?.toLowerCase().includes(purpose)
      );
      if (found) return found;
    }
    return null;
  };
  
  const emailInput = findByPurpose(['email', 'e-mail', 'username']);
  const passwordInput = elements.find(e => e.type === 'password');
  const nameInput = findByPurpose(['name', 'fullname', 'full name']);
  const phoneInput = findByPurpose(['phone', 'tel', 'mobile']);
  const searchInput = findByPurpose(['search', 'query', 'q']);
  const submitButton = elements.find(e => 
    e.type === 'submit' || 
    e.visibleText?.toLowerCase().includes('submit') ||
    e.visibleText?.toLowerCase().includes('login') ||
    e.visibleText?.toLowerCase().includes('sign')
  );
  
  // Build intelligent test based on page content
  if (hasSignup || hasLogin) {
    if (nameInput) {
      steps.push({ action: 'type', target: nameInput.selector, value: 'John Smith', description: 'Enter name' });
    }
    if (emailInput) {
      steps.push({ action: 'type', target: emailInput.selector, value: 'testuser@example.com', description: 'Enter email' });
    }
    if (phoneInput) {
      steps.push({ action: 'type', target: phoneInput.selector, value: '555-123-4567', description: 'Enter phone' });
    }
    if (passwordInput) {
      steps.push({ action: 'type', target: passwordInput.selector, value: 'TestPass123!', description: 'Enter password' });
      // Check for confirm password
      const confirmPass = elements.find(e => e.type === 'password' && e !== passwordInput);
      if (confirmPass) {
        steps.push({ action: 'type', target: confirmPass.selector, value: 'TestPass123!', description: 'Confirm password' });
      }
    }
    
    // Check any checkboxes (terms, etc)
    const checkboxes = elements.filter(e => e.type === 'checkbox').slice(0, 2);
    checkboxes.forEach(cb => {
      steps.push({ action: 'check', target: cb.selector, value: null, description: 'Accept terms/conditions' });
    });
    
    if (submitButton) {
      steps.push({ action: 'click', target: submitButton.selector, value: null, description: 'Submit form' });
      steps.push({ action: 'wait', target: null, value: '2000', description: 'Wait for response' });
    }
  } else if (hasSearch && searchInput) {
    steps.push({ action: 'type', target: searchInput.selector, value: 'test query', description: 'Enter search term' });
    steps.push({ action: 'press', target: searchInput.selector, value: 'Enter', description: 'Submit search' });
    steps.push({ action: 'wait', target: null, value: '1500', description: 'Wait for results' });
  } else if (hasContact) {
    if (nameInput) steps.push({ action: 'type', target: nameInput.selector, value: 'John Smith', description: 'Enter name' });
    if (emailInput) steps.push({ action: 'type', target: emailInput.selector, value: 'test@example.com', description: 'Enter email' });
    const messageInput = elements.find(e => e.tagName === 'TEXTAREA');
    if (messageInput) steps.push({ action: 'type', target: messageInput.selector, value: 'This is a test message.', description: 'Enter message' });
    if (submitButton) steps.push({ action: 'click', target: submitButton.selector, value: null, description: 'Send message' });
  } else {
    // Generic: fill all visible inputs and click buttons
    const inputs = elements.filter(e => e.tagName === 'INPUT' && e.type !== 'hidden').slice(0, 5);
    inputs.forEach(input => {
      let value = 'test';
      if (input.type === 'email') value = 'test@example.com';
      else if (input.type === 'tel') value = '555-123-4567';
      else if (input.type === 'number') value = '42';
      else if (input.type === 'password') value = 'TestPass123!';
      steps.push({ action: 'type', target: input.selector, value, description: `Fill ${input.type || 'text'} field` });
    });
    
    const buttons = elements.filter(e => e.role === 'button').slice(0, 2);
    buttons.forEach(btn => {
      steps.push({ action: 'click', target: btn.selector, value: null, description: `Click ${btn.visibleText || 'button'}` });
    });
  }
  
  const detectedFlows = [];
  if (hasSignup) detectedFlows.push('signup');
  if (hasLogin) detectedFlows.push('login');
  if (hasSearch) detectedFlows.push('search');
  if (hasCart) detectedFlows.push('cart');
  if (hasCheckout) detectedFlows.push('checkout');
  if (hasContact) detectedFlows.push('contact');
  
  return {
    page_analysis: {
      purpose: pageData.pageType + ' page',
      main_features: detectedFlows,
      user_goal: 'Complete the main action on this page'
    },
    test: {
      id: 'journey_' + Date.now(),
      type: 'e2e_journey',
      name: `User Journey: ${detectedFlows.join(' → ') || 'Page Interaction'}`,
      steps: steps.slice(0, 25),
      expected: 'User can complete the journey without errors'
    },
    detected_flows: detectedFlows,
    potential_issues: [],
    pageData,
    url,
    source: 'fallback'
  };
}

module.exports = { generateJourneyTest };
