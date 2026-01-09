const apiKeyManager = require('./apiKeyManager');

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
- Always generate 3 test cases
- At least 2 must be negative
- CRITICAL: Use the actual CSS selectors from the input elements, not internal IDs like e0, e1, e2
- If an element has selector "input[type=password]", use that exact string as the target
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
        target: idToSelector[step.target] || step.target
      }))
    }));
  }
  
  return result;
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
  
  if (pageType === 'login' || pageType === 'signup') {
    const emailEl = elements.find(e => e.role === 'email_input' || e.type === 'email');
    const passEl = elements.find(e => e.role === 'password_input' || e.type === 'password');
    const phoneEl = elements.find(e => e.type === 'tel' || e.placeholder?.toLowerCase().includes('phone') || e.placeholder?.toLowerCase().includes('mobile'));
    const submitEl = elements.find(e => e.role === 'submit_button' || e.role === 'button');
    
    // Handle phone-based login (like meesho)
    if (phoneEl && !emailEl && submitEl) {
      testPlan.push({
        id: 't1',
        type: 'negative',
        name: 'Empty phone submission',
        steps: [
          { action: 'click', target: submitEl.selector }
        ],
        expected: 'Validation error shown for required phone number'
      });
      
      testPlan.push({
        id: 't2',
        type: 'negative',
        name: 'Invalid phone number',
        steps: [
          { action: 'type', target: phoneEl.selector, value: '123' },
          { action: 'click', target: submitEl.selector }
        ],
        expected: 'Phone validation error shown'
      });
      
      testPlan.push({
        id: 't3',
        type: 'positive',
        name: 'Valid phone number submission',
        steps: [
          { action: 'type', target: phoneEl.selector, value: '9876543210' },
          { action: 'click', target: submitEl.selector }
        ],
        expected: 'OTP screen or next step shown'
      });
    }
    // Handle email/password login
    else if (emailEl && passEl && submitEl) {
      testPlan.push({
        id: 't1',
        type: 'negative',
        name: 'Empty form submission',
        steps: [
          { action: 'click', target: submitEl.selector }
        ],
        expected: 'Validation error shown for required fields'
      });
      
      testPlan.push({
        id: 't2',
        type: 'negative',
        name: 'Invalid email format',
        steps: [
          { action: 'type', target: emailEl.selector, value: 'invalid-email' },
          { action: 'type', target: passEl.selector, value: 'password123' },
          { action: 'click', target: submitEl.selector }
        ],
        expected: 'Email validation error shown'
      });
      
      testPlan.push({
        id: 't3',
        type: 'positive',
        name: 'Valid credentials submission',
        steps: [
          { action: 'type', target: emailEl.selector, value: 'test@example.com' },
          { action: 'type', target: passEl.selector, value: 'ValidPass123!' },
          { action: 'click', target: submitEl.selector }
        ],
        expected: 'Form submits successfully or redirects'
      });
    }
    // Handle password-only (like some login flows)
    else if (passEl && submitEl) {
      testPlan.push({
        id: 't1',
        type: 'negative',
        name: 'Empty password submission',
        steps: [
          { action: 'click', target: submitEl.selector }
        ],
        expected: 'Validation error shown'
      });
      
      testPlan.push({
        id: 't2',
        type: 'negative',
        name: 'Short password',
        steps: [
          { action: 'type', target: passEl.selector, value: '123' },
          { action: 'click', target: submitEl.selector }
        ],
        expected: 'Password validation error shown'
      });
      
      testPlan.push({
        id: 't3',
        type: 'positive',
        name: 'Valid password submission',
        steps: [
          { action: 'type', target: passEl.selector, value: 'ValidPass123!' },
          { action: 'click', target: submitEl.selector }
        ],
        expected: 'Form submits successfully'
      });
    }
  } else if (pageType === 'search') {
    const searchInput = elements.find(e => e.role === 'text_input' || e.tagName === 'input');
    const submitEl = elements.find(e => e.role === 'submit_button' || e.role === 'button');
    
    if (searchInput) {
      testPlan.push({
        id: 't1',
        type: 'negative',
        name: 'Empty search',
        steps: [
          { action: 'click', target: submitEl?.selector || 'button' }
        ],
        expected: 'No results or validation message'
      });
      
      testPlan.push({
        id: 't2',
        type: 'negative',
        name: 'Special characters search',
        steps: [
          { action: 'type', target: searchInput.selector, value: '!@#$%^&*()' },
          { action: 'click', target: submitEl?.selector || 'button' }
        ],
        expected: 'Handles special characters gracefully'
      });
      
      testPlan.push({
        id: 't3',
        type: 'positive',
        name: 'Valid search query',
        steps: [
          { action: 'type', target: searchInput.selector, value: 'test query' },
          { action: 'click', target: submitEl?.selector || 'button' }
        ],
        expected: 'Search results displayed'
      });
    }
  }
  
  // Generic fallback tests - use real selectors
  if (testPlan.length === 0) {
    const inputs = elements.filter(e => e.tagName === 'input' || e.tagName === 'textarea');
    const buttons = elements.filter(e => e.role === 'button' || e.role === 'submit_button');
    
    if (inputs.length > 0 && buttons.length > 0) {
      testPlan.push({
        id: 't1',
        type: 'negative',
        name: 'Empty form submission',
        steps: [
          { action: 'click', target: buttons[0].selector }
        ],
        expected: 'Validation or error handling'
      });
      
      testPlan.push({
        id: 't2',
        type: 'negative',
        name: 'Invalid input data',
        steps: [
          { action: 'type', target: inputs[0].selector, value: '!@#$%' },
          { action: 'click', target: buttons[0].selector }
        ],
        expected: 'Handles invalid input gracefully'
      });
      
      testPlan.push({
        id: 't3',
        type: 'positive',
        name: 'Valid form interaction',
        steps: [
          { action: 'type', target: inputs[0].selector, value: 'test value' },
          { action: 'click', target: buttons[0].selector }
        ],
        expected: 'Form processes input correctly'
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
    confidence: 0.7
  };
}

module.exports = { generate };
