const apiKeyManager = require('./apiKeyManager');

// Supported actions in testExecutor
const SUPPORTED_ACTIONS = ['click', 'type', 'fill', 'hover', 'select', 'check', 'uncheck', 'press', 'wait', 'clear', 'focus', 'doubleclick', 'rightclick', 'scroll'];

const GROQ_PROMPT = `You are an instruction-following system.
Given UI element metadata and page text, generate a QA test plan.

IMPORTANT: Use the EXACT "selector" values from the input elements as targets, NOT the "id" values.
The "id" values (e0, e1, etc.) are internal references - you must use the actual CSS selectors.

Return ONLY valid JSON with this structure:
{
  "page_type": "login|signup|checkout|other",
  "elements": [
    { "id": "e1", "role": "input", "subtype": "email", "selector": "input[type=email]" }
  ],
  "test_plan": [
    {
      "id": "t1",
      "type": "negative",
      "name": "Test name here",
      "steps": [
        { "action": "type", "target": "input[type=email]", "value": "" },
        { "action": "click", "target": "button:has-text(\\"Submit\\")" }
      ],
      "expected": "Validation error shown"
    }
  ],
  "confidence": 0.0
}

Rules:
- Generate exactly 2 test cases (to save server resources)
- At least 1 must be negative
- CRITICAL: Use the actual CSS selectors from the input elements, not internal IDs like e0, e1, e2
- If an element has selector "input[type=password]", use that exact string as the target
- ONLY use these actions: click, type, hover, select, check, uncheck, press, wait, clear, focus
- No explanations, only JSON

Input:
`;

async function generate(pageData) {
  // Try AI first, fall back to rules
  try {
    if (apiKeyManager.hasKeys()) {
      const aiResult = await generateWithAI(pageData);
      // Validate AI result has real data, not template placeholders
      if (aiResult && aiResult.test_plan && aiResult.test_plan.length > 0) {
        const hasRealData = aiResult.test_plan.some(t => 
          t.name && !t.name.includes('Test name here') && 
          t.steps?.some(s => s.target && s.target !== 'e1' && s.target !== 'submit')
        );
        if (hasRealData) {
          return aiResult;
        }
        console.warn('AI returned template data, using rule-based fallback');
      }
    }
  } catch (error) {
    console.warn('AI generation failed, using fallback:', error.message);
  }
  
  // Rule-based fallback - always works
  return generateWithRules(pageData);
}

async function generateWithAI(pageData) {
  // Build a map of internal IDs to real selectors for post-processing
  const idToSelector = {};
  pageData.elements.forEach(e => {
    idToSelector[e.id] = e.selector;
    if (e.role) idToSelector[e.role] = e.selector;
  });
  
  const inputData = {
    page_type: pageData.pageType,
    visible_text: pageData.visibleText.substring(0, 1000),
    elements: pageData.elements.map(e => ({
      id: e.id,
      role: e.role,
      type: e.type,
      placeholder: e.placeholder,
      selector: e.selector
    }))
  };
  
  // Use API key manager with automatic fallback
  const completion = await apiKeyManager.executeWithFallback(async (groq) => {
    return await groq.chat.completions.create({
      messages: [
        {
          role: 'user',
          content: GROQ_PROMPT + JSON.stringify(inputData, null, 2)
        }
      ],
      model: 'llama-3.1-8b-instant',
      temperature: 0.1,
      max_tokens: 2000
    });
  });
  
  const responseText = completion.choices[0]?.message?.content || '';
  
  // Extract JSON from response
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in AI response');
  }
  
  const result = JSON.parse(jsonMatch[0]);
  
  // Post-process: Replace any internal IDs (e0, e1, etc.) with real selectors
  if (result.test_plan) {
    result.test_plan = result.test_plan.map(test => ({
      ...test,
      steps: test.steps.map(step => ({
        ...step,
        // If target is an internal ID, replace with real selector
        target: idToSelector[step.target] || step.target,
        // Normalize action to supported ones
        action: normalizeAction(step.action)
      }))
    }));
  }
  
  return result;
}

// Normalize action names to supported ones
function normalizeAction(action) {
  const actionMap = {
    'input': 'type',
    'enter': 'type',
    'fill': 'type',
    'tap': 'click',
    'submit': 'click',
    'mouseover': 'hover',
    'mouseenter': 'hover',
    'dblclick': 'doubleclick',
    'selectOption': 'select',
    'choose': 'select',
    'delay': 'wait',
    'sleep': 'wait',
    'pause': 'wait',
    'key': 'press',
    'keyboard': 'press',
    'scrollIntoView': 'scroll',
    'scrollTo': 'scroll'
  };
  
  const normalized = action?.toLowerCase() || 'click';
  return actionMap[normalized] || normalized;
}

function generateWithRules(pageData) {
  const { pageType, elements } = pageData;
  
  // Build lookup maps using real selectors
  const elementMap = {};
  elements.forEach(e => {
    elementMap[e.id] = e;
    if (e.role) elementMap[e.role] = e;
  });
  
  const testPlan = [];
  
  // Helper to find elements by various criteria
  const findElement = (criteria) => {
    return elements.find(e => {
      for (const [key, value] of Object.entries(criteria)) {
        if (key === 'role' && e.role === value) return true;
        if (key === 'type' && e.type === value) return true;
        if (key === 'placeholderIncludes' && e.placeholder?.toLowerCase().includes(value)) return true;
        if (key === 'nameIncludes' && e.name?.toLowerCase().includes(value)) return true;
        if (key === 'textIncludes' && e.visibleText?.toLowerCase().includes(value)) return true;
        if (key === 'ariaIncludes' && e.ariaLabel?.toLowerCase().includes(value)) return true;
      }
      return false;
    });
  };
  
  // Find all interactive elements by type
  const emailEl = findElement({ type: 'email' }) || findElement({ role: 'email_input' });
  const passEl = findElement({ type: 'password' }) || findElement({ role: 'password_input' });
  const phoneEl = findElement({ type: 'tel' }) || findElement({ placeholderIncludes: 'phone' }) || findElement({ placeholderIncludes: 'mobile' });
  const nameEl = findElement({ placeholderIncludes: 'name' }) || findElement({ nameIncludes: 'name' });
  const searchEl = findElement({ type: 'search' }) || findElement({ role: 'search_input' }) || findElement({ placeholderIncludes: 'search' }) || findElement({ nameIncludes: 'search' }) || findElement({ name: 'q' });
  const submitEl = findElement({ type: 'submit' }) || findElement({ role: 'submit_button' }) || elements.find(e => e.role === 'button' && (e.visibleText?.toLowerCase().includes('submit') || e.visibleText?.toLowerCase().includes('login') || e.visibleText?.toLowerCase().includes('sign')));
  const buttons = elements.filter(e => e.role === 'button' || e.tagName === 'button');
  const links = elements.filter(e => e.role === 'link' || e.tagName === 'a');
  const inputs = elements.filter(e => e.tagName === 'input' && e.type !== 'hidden');
  const dropdowns = elements.filter(e => e.role === 'dropdown' || e.tagName === 'select');
  const checkboxes = elements.filter(e => e.role === 'checkbox' || e.type === 'checkbox');
  
  if (pageType === 'login' || pageType === 'signup') {
    // Comprehensive login/signup flow test
    const flowSteps = [];
    
    // Step 1: Test empty submission first
    if (submitEl) {
      testPlan.push({
        id: 't1',
        type: 'negative',
        name: 'Empty form submission',
        steps: [{ action: 'click', target: submitEl.selector }],
        expected: 'Validation error shown for required fields'
      });
    }
    
    // Step 2: Build comprehensive form fill test
    if (nameEl) flowSteps.push({ action: 'type', target: nameEl.selector, value: 'Test User' });
    if (emailEl) flowSteps.push({ action: 'type', target: emailEl.selector, value: 'test@example.com' });
    if (phoneEl) flowSteps.push({ action: 'type', target: phoneEl.selector, value: '9876543210' });
    if (passEl) flowSteps.push({ action: 'type', target: passEl.selector, value: 'SecurePass123!' });
    
    // Handle confirm password if exists
    const confirmPassEl = elements.find(e => 
      (e.type === 'password' && e !== passEl) || 
      e.placeholder?.toLowerCase().includes('confirm') ||
      e.name?.toLowerCase().includes('confirm')
    );
    if (confirmPassEl) flowSteps.push({ action: 'type', target: confirmPassEl.selector, value: 'SecurePass123!' });
    
    // Handle checkboxes (terms, newsletter, etc.)
    checkboxes.forEach((cb, idx) => {
      if (idx < 2) { // Limit to first 2 checkboxes
        flowSteps.push({ action: 'check', target: cb.selector });
      }
    });
    
    // Handle dropdowns
    dropdowns.forEach((dd, idx) => {
      if (idx < 1) { // Limit to first dropdown
        flowSteps.push({ action: 'click', target: dd.selector });
      }
    });
    
    if (submitEl) flowSteps.push({ action: 'click', target: submitEl.selector });
    
    if (flowSteps.length > 1) {
      testPlan.push({
        id: 't2',
        type: 'positive',
        name: `Complete ${pageType} flow`,
        steps: flowSteps,
        expected: 'Form submits successfully, user is logged in or account created'
      });
    }
    
    // Step 3: Invalid email test
    if (emailEl && submitEl) {
      testPlan.push({
        id: 't3',
        type: 'negative',
        name: 'Invalid email format',
        steps: [
          { action: 'type', target: emailEl.selector, value: 'invalid-email' },
          ...(passEl ? [{ action: 'type', target: passEl.selector, value: 'password123' }] : []),
          { action: 'click', target: submitEl.selector }
        ],
        expected: 'Email validation error shown'
      });
    }
    
    // Step 4: Weak password test (for signup)
    if (pageType === 'signup' && passEl && submitEl) {
      testPlan.push({
        id: 't4',
        type: 'negative',
        name: 'Weak password',
        steps: [
          ...(emailEl ? [{ action: 'type', target: emailEl.selector, value: 'test@example.com' }] : []),
          { action: 'type', target: passEl.selector, value: '123' },
          { action: 'click', target: submitEl.selector }
        ],
        expected: 'Password strength error shown'
      });
    }
    
  } else if (pageType === 'search') {
    // Comprehensive search flow
    if (searchEl) {
      // Test 1: Empty search
      testPlan.push({
        id: 't1',
        type: 'negative',
        name: 'Empty search',
        steps: submitEl ? [
          { action: 'click', target: submitEl.selector }
        ] : [
          { action: 'click', target: searchEl.selector },
          { action: 'press', target: searchEl.selector, value: 'Enter' }
        ],
        expected: 'No results or validation message'
      });
      
      // Test 2: Special characters
      testPlan.push({
        id: 't2',
        type: 'negative',
        name: 'Special characters search',
        steps: submitEl ? [
          { action: 'type', target: searchEl.selector, value: '!@#$%^&*()' },
          { action: 'click', target: submitEl.selector }
        ] : [
          { action: 'type', target: searchEl.selector, value: '!@#$%^&*()' },
          { action: 'press', target: searchEl.selector, value: 'Enter' }
        ],
        expected: 'Handles special characters gracefully'
      });
      
      // Test 3: Valid search
      testPlan.push({
        id: 't3',
        type: 'positive',
        name: 'Valid search query',
        steps: submitEl ? [
          { action: 'type', target: searchEl.selector, value: 'test product' },
          { action: 'click', target: submitEl.selector }
        ] : [
          { action: 'type', target: searchEl.selector, value: 'test product' },
          { action: 'press', target: searchEl.selector, value: 'Enter' }
        ],
        expected: 'Search results displayed'
      });
      
      // Test 4: Long query
      testPlan.push({
        id: 't4',
        type: 'boundary',
        name: 'Long search query',
        steps: [
          { action: 'type', target: searchEl.selector, value: 'this is a very long search query to test the input field limits and behavior' },
          { action: 'press', target: searchEl.selector, value: 'Enter' }
        ],
        expected: 'Handles long query appropriately'
      });
    }
    
  } else if (pageType === 'checkout') {
    // Comprehensive checkout flow
    const cardNumberEl = findElement({ placeholderIncludes: 'card' }) || findElement({ nameIncludes: 'card' });
    const expiryEl = findElement({ placeholderIncludes: 'expir' }) || findElement({ nameIncludes: 'expir' }) || findElement({ placeholderIncludes: 'mm' });
    const cvvEl = findElement({ placeholderIncludes: 'cvv' }) || findElement({ placeholderIncludes: 'cvc' }) || findElement({ nameIncludes: 'cvv' });
    const addressEl = findElement({ placeholderIncludes: 'address' }) || findElement({ nameIncludes: 'address' });
    const cityEl = findElement({ placeholderIncludes: 'city' }) || findElement({ nameIncludes: 'city' });
    const zipEl = findElement({ placeholderIncludes: 'zip' }) || findElement({ placeholderIncludes: 'postal' }) || findElement({ nameIncludes: 'zip' });
    const payButton = findElement({ textIncludes: 'pay' }) || findElement({ textIncludes: 'place order' }) || findElement({ textIncludes: 'complete' }) || submitEl;
    
    // Test 1: Empty checkout submission
    if (payButton) {
      testPlan.push({
        id: 't1',
        type: 'negative',
        name: 'Empty checkout submission',
        steps: [{ action: 'click', target: payButton.selector }],
        expected: 'Validation errors shown for required fields'
      });
    }
    
    // Test 2: Invalid card number
    if (cardNumberEl && payButton) {
      testPlan.push({
        id: 't2',
        type: 'negative',
        name: 'Invalid card number',
        steps: [
          { action: 'type', target: cardNumberEl.selector, value: '1234' },
          { action: 'click', target: payButton.selector }
        ],
        expected: 'Card number validation error'
      });
    }
    
    // Test 3: Complete checkout flow
    const checkoutSteps = [];
    if (nameEl) checkoutSteps.push({ action: 'type', target: nameEl.selector, value: 'Test User' });
    if (emailEl) checkoutSteps.push({ action: 'type', target: emailEl.selector, value: 'test@example.com' });
    if (phoneEl) checkoutSteps.push({ action: 'type', target: phoneEl.selector, value: '9876543210' });
    if (addressEl) checkoutSteps.push({ action: 'type', target: addressEl.selector, value: '123 Test Street' });
    if (cityEl) checkoutSteps.push({ action: 'type', target: cityEl.selector, value: 'Test City' });
    if (zipEl) checkoutSteps.push({ action: 'type', target: zipEl.selector, value: '12345' });
    if (cardNumberEl) checkoutSteps.push({ action: 'type', target: cardNumberEl.selector, value: '4111111111111111' });
    if (expiryEl) checkoutSteps.push({ action: 'type', target: expiryEl.selector, value: '12/25' });
    if (cvvEl) checkoutSteps.push({ action: 'type', target: cvvEl.selector, value: '123' });
    if (payButton) checkoutSteps.push({ action: 'click', target: payButton.selector });
    
    if (checkoutSteps.length > 2) {
      testPlan.push({
        id: 't3',
        type: 'positive',
        name: 'Complete checkout flow',
        steps: checkoutSteps,
        expected: 'Order placed successfully or payment processed'
      });
    }
    
  } else if (pageType === 'contact') {
    // Contact form flow
    const messageEl = elements.find(e => e.tagName === 'textarea' || e.role === 'textarea');
    const subjectEl = findElement({ placeholderIncludes: 'subject' }) || findElement({ nameIncludes: 'subject' });
    
    // Test 1: Empty submission
    if (submitEl) {
      testPlan.push({
        id: 't1',
        type: 'negative',
        name: 'Empty contact form',
        steps: [{ action: 'click', target: submitEl.selector }],
        expected: 'Validation errors for required fields'
      });
    }
    
    // Test 2: Complete contact form
    const contactSteps = [];
    if (nameEl) contactSteps.push({ action: 'type', target: nameEl.selector, value: 'Test User' });
    if (emailEl) contactSteps.push({ action: 'type', target: emailEl.selector, value: 'test@example.com' });
    if (phoneEl) contactSteps.push({ action: 'type', target: phoneEl.selector, value: '9876543210' });
    if (subjectEl) contactSteps.push({ action: 'type', target: subjectEl.selector, value: 'Test Inquiry' });
    if (messageEl) contactSteps.push({ action: 'type', target: messageEl.selector, value: 'This is a test message for the contact form.' });
    if (submitEl) contactSteps.push({ action: 'click', target: submitEl.selector });
    
    if (contactSteps.length > 1) {
      testPlan.push({
        id: 't2',
        type: 'positive',
        name: 'Complete contact form',
        steps: contactSteps,
        expected: 'Message sent successfully'
      });
    }
  }
  
  // Generic fallback tests - comprehensive coverage of all elements
  if (testPlan.length === 0) {
    // Test 1: Empty form submission
    if (buttons.length > 0) {
      testPlan.push({
        id: 't1',
        type: 'negative',
        name: 'Empty form submission',
        steps: [{ action: 'click', target: buttons[0].selector }],
        expected: 'Validation or error handling'
      });
    }
    
    // Test 2: Fill all inputs and submit
    const formSteps = [];
    inputs.slice(0, 5).forEach((input, idx) => { // Limit to first 5 inputs
      let value = 'test value';
      if (input.type === 'email') value = 'test@example.com';
      else if (input.type === 'tel') value = '9876543210';
      else if (input.type === 'number') value = '42';
      else if (input.type === 'url') value = 'https://example.com';
      else if (input.type === 'date') value = '2025-01-10';
      formSteps.push({ action: 'type', target: input.selector, value });
    });
    
    // Handle checkboxes
    checkboxes.slice(0, 2).forEach(cb => {
      formSteps.push({ action: 'check', target: cb.selector });
    });
    
    // Handle dropdowns
    dropdowns.slice(0, 1).forEach(dd => {
      formSteps.push({ action: 'click', target: dd.selector });
    });
    
    if (buttons.length > 0) {
      formSteps.push({ action: 'click', target: buttons[0].selector });
    }
    
    if (formSteps.length > 1) {
      testPlan.push({
        id: 't2',
        type: 'positive',
        name: 'Complete form interaction',
        steps: formSteps,
        expected: 'Form processes correctly'
      });
    }
    
    // Test 3: Test navigation links
    const navLinks = links.filter(l => 
      l.visibleText && 
      !l.href?.includes('javascript:') && 
      !l.href?.startsWith('#')
    ).slice(0, 2);
    
    if (navLinks.length > 0) {
      testPlan.push({
        id: 't3',
        type: 'positive',
        name: 'Navigation test',
        steps: navLinks.map(link => ({ action: 'click', target: link.selector })),
        expected: 'Navigation works correctly'
      });
    }
    
    // Test 4: Invalid input test
    if (inputs.length > 0 && buttons.length > 0) {
      testPlan.push({
        id: 't4',
        type: 'negative',
        name: 'Invalid input data',
        steps: [
          { action: 'type', target: inputs[0].selector, value: '!@#$%^&*()' },
          { action: 'click', target: buttons[0].selector }
        ],
        expected: 'Handles invalid input gracefully'
      });
    }
  }
  
  return {
    page_type: pageType,
    elements: elements.map(e => ({
      id: e.id,
      role: e.role,
      subtype: e.type,
      selector: e.selector
    })),
    test_plan: testPlan,
    confidence: testPlan.length > 2 ? 0.8 : 0.6
  };
}

module.exports = { generate };
