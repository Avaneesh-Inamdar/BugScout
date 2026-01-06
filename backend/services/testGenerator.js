const Groq = require('groq-sdk');

const GROQ_PROMPT = `You are an instruction-following system.
Given UI element metadata and page text, generate a QA test plan.
Return ONLY valid JSON with this structure:
{
  "page_type": "login|signup|checkout|other",
  "elements": [
    { "id": "e1", "role": "input", "subtype": "email", "selector_hint": "input[type=email]" }
  ],
  "test_plan": [
    {
      "id": "t1",
      "type": "negative",
      "name": "Test name here",
      "steps": [
        { "action": "type", "target": "e1", "value": "" },
        { "action": "click", "target": "submit" }
      ],
      "expected": "Validation error shown"
    }
  ],
  "confidence": 0.0
}

Rules:
- Always generate 3 test cases
- At least 2 must be negative
- Keep selectors simple
- No explanations, only JSON

Input:
`;

async function generate(pageData) {
  // Try AI first, fall back to rules
  try {
    if (process.env.GROQ_API_KEY) {
      const aiResult = await generateWithAI(pageData);
      if (aiResult && aiResult.test_plan && aiResult.test_plan.length > 0) {
        return aiResult;
      }
    }
  } catch (error) {
    console.warn('AI generation failed, using fallback:', error.message);
  }
  
  // Rule-based fallback
  return generateWithRules(pageData);
}

async function generateWithAI(pageData) {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  
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
  
  const completion = await groq.chat.completions.create({
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
  
  const responseText = completion.choices[0]?.message?.content || '';
  
  // Extract JSON from response
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in AI response');
  }
  
  return JSON.parse(jsonMatch[0]);
}

function generateWithRules(pageData) {
  const { pageType, elements } = pageData;
  
  const elementMap = {};
  elements.forEach(e => {
    elementMap[e.id] = e;
    if (e.role) elementMap[e.role] = e;
  });
  
  const testPlan = [];
  
  if (pageType === 'login' || pageType === 'signup') {
    const emailEl = elements.find(e => e.role === 'email_input' || e.type === 'email');
    const passEl = elements.find(e => e.role === 'password_input' || e.type === 'password');
    const submitEl = elements.find(e => e.role === 'submit_button' || e.role === 'button');
    
    if (emailEl && passEl && submitEl) {
      // Test 1: Empty submission (negative)
      testPlan.push({
        id: 't1',
        type: 'negative',
        name: 'Empty form submission',
        steps: [
          { action: 'click', target: submitEl.id }
        ],
        expected: 'Validation error shown for required fields'
      });
      
      // Test 2: Invalid email (negative)
      testPlan.push({
        id: 't2',
        type: 'negative',
        name: 'Invalid email format',
        steps: [
          { action: 'type', target: emailEl.id, value: 'invalid-email' },
          { action: 'type', target: passEl.id, value: 'password123' },
          { action: 'click', target: submitEl.id }
        ],
        expected: 'Email validation error shown'
      });
      
      // Test 3: Valid credentials (positive)
      testPlan.push({
        id: 't3',
        type: 'positive',
        name: 'Valid credentials submission',
        steps: [
          { action: 'type', target: emailEl.id, value: 'test@example.com' },
          { action: 'type', target: passEl.id, value: 'ValidPass123!' },
          { action: 'click', target: submitEl.id }
        ],
        expected: 'Form submits successfully or redirects'
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
          { action: 'click', target: submitEl?.id || 'button' }
        ],
        expected: 'No results or validation message'
      });
      
      testPlan.push({
        id: 't2',
        type: 'negative',
        name: 'Special characters search',
        steps: [
          { action: 'type', target: searchInput.id, value: '!@#$%^&*()' },
          { action: 'click', target: submitEl?.id || 'button' }
        ],
        expected: 'Handles special characters gracefully'
      });
      
      testPlan.push({
        id: 't3',
        type: 'positive',
        name: 'Valid search query',
        steps: [
          { action: 'type', target: searchInput.id, value: 'test query' },
          { action: 'click', target: submitEl?.id || 'button' }
        ],
        expected: 'Search results displayed'
      });
    }
  }
  
  // Generic fallback tests
  if (testPlan.length === 0) {
    const inputs = elements.filter(e => e.tagName === 'input' || e.tagName === 'textarea');
    const buttons = elements.filter(e => e.role === 'button' || e.role === 'submit_button');
    
    if (inputs.length > 0 && buttons.length > 0) {
      testPlan.push({
        id: 't1',
        type: 'negative',
        name: 'Empty form submission',
        steps: [
          { action: 'click', target: buttons[0].id }
        ],
        expected: 'Validation or error handling'
      });
      
      testPlan.push({
        id: 't2',
        type: 'negative',
        name: 'Invalid input data',
        steps: [
          { action: 'type', target: inputs[0].id, value: '!@#$%' },
          { action: 'click', target: buttons[0].id }
        ],
        expected: 'Handles invalid input gracefully'
      });
      
      testPlan.push({
        id: 't3',
        type: 'positive',
        name: 'Valid form interaction',
        steps: [
          { action: 'type', target: inputs[0].id, value: 'test value' },
          { action: 'click', target: buttons[0].id }
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
