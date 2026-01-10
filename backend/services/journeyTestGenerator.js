const apiKeyManager = require('./apiKeyManager');
const pageInspector = require('./pageInspector');

/**
 * Generate intelligent end-to-end journey tests
 * AI analyzes the page and decides what to test based on what it sees
 */

const SMART_JOURNEY_PROMPT = `You are an expert QA tester simulating a REAL USER journey on a website. Your goal is to test the COMPLETE user experience from start to finish.

CRITICAL: FOLLOW THE NATURAL USER JOURNEY ORDER:
1. SIGNUP FIRST - If there's a signup/register option, create a new account first
2. THEN LOGIN - After signup, login with the same credentials you just created
3. THEN EXPLORE - Browse products, search, navigate the site
4. THEN TAKE ACTION - Add to cart, fill forms, interact with features
5. FINALLY COMPLETE - Reach the end goal (checkout, submit, complete purchase - but STOP before real payment)

THINK LIKE A NEW USER:
- A new user visits the site for the first time
- They need to create an account before they can do anything
- After creating account, they login
- Then they explore what the site offers
- Finally they complete their goal (buy something, submit a form, etc.)

ANALYZE THE PAGE CAREFULLY:
1. What is this website/page for? (e-commerce, social media, service, etc.)
2. Is there a signup/register option? → Do that FIRST
3. Is there a login option? → Do that AFTER signup
4. What can users do after logging in? → Test those features
5. What is the end goal? (purchase, booking, submission) → Reach that point

IMPORTANT RULES:
1. Use ONLY the exact CSS selectors provided in the elements list
2. ALWAYS signup before login if both exist
3. Use the SAME email/password for signup and login
4. Fill forms with realistic test data appropriate for each field
5. Follow the natural user flow - don't skip steps
6. Include wait steps after actions that trigger page changes
7. Stop before any real payment/transaction
8. If you see "Sign Up" and "Login" links, click Sign Up first

TEST DATA TO USE (use these consistently):
- Email: testuser{{timestamp}}@example.com (I'll replace {{timestamp}})
- Password: TestPass123!
- Name: John Smith
- First Name: John
- Last Name: Smith
- Phone: 555-123-4567
- Address: 123 Test Street
- City: Test City
- State: California
- ZIP: 90210
- Country: United States
- Card Number: 4111111111111111 (test card)
- Card Expiry: 12/28
- Card CVV: 123

Return a JSON object with your analysis and COMPLETE user journey test:
{
  "page_analysis": {
    "purpose": "What this website/page is for",
    "website_type": "ecommerce|social|service|blog|webapp|other",
    "main_features": ["feature1", "feature2"],
    "user_goal": "What a user ultimately wants to accomplish",
    "has_signup": true/false,
    "has_login": true/false,
    "end_goal": "What the final action should be (checkout, submit, etc.)"
  },
  "test": {
    "id": "journey_1",
    "type": "e2e_journey", 
    "name": "Complete User Journey: Signup → Login → [Goal]",
    "steps": [
      {
        "action": "click",
        "target": "selector for signup link/button",
        "value": null,
        "reasoning": "First, navigate to signup page to create account"
      },
      {
        "action": "type",
        "target": "email input selector",
        "value": "testuser@example.com",
        "reasoning": "Enter email for new account"
      }
    ],
    "expected": "User can complete full journey from signup to [end goal]"
  },
  "detected_flows": ["signup", "login", "browse", "cart", "checkout"],
  "potential_issues": ["things that might fail"]
}

AVAILABLE ACTIONS:
- type: Enter text (target: selector, value: text)
- click: Click element (target: selector, value: null)
- select: Choose dropdown option (target: selector, value: option)
- check: Check checkbox (target: selector, value: null)
- wait: Pause (target: null, value: "2000" for 2 seconds)
- hover: Mouse over (target: selector, value: null)
- press: Keyboard key (target: selector, value: "Enter")
- clear: Clear input (target: selector, value: null)

NOW ANALYZE THIS PAGE AND CREATE A COMPLETE USER JOURNEY:
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
  const timestamp = Date.now();
  const testEmail = `testuser${timestamp}@example.com`;
  
  const prompt = SMART_JOURNEY_PROMPT + `
URL: ${pageContext.url}
Page Type Detected: ${pageContext.pageType}
Page Title: ${pageContext.title}

VISIBLE TEXT ON PAGE (read this to understand the website):
${pageContext.visibleText.substring(0, 2500)}

PAGE STATISTICS:
- ${pageContext.summary.inputs} input fields
- ${pageContext.summary.buttons} buttons
- ${pageContext.summary.links} links
- ${pageContext.summary.selects} dropdowns
- ${pageContext.summary.checkboxes} checkboxes

ALL ELEMENTS ON PAGE (use these exact selectors):
${pageContext.elementDescriptions}

REMEMBER:
- Use email: ${testEmail}
- Use password: TestPass123!
- SIGNUP FIRST if available, then LOGIN with same credentials
- Follow the complete user journey to the end goal

Create a comprehensive test that follows the FULL user journey from signup to the final goal.`;

  const completion = await apiKeyManager.executeWithFallback(async (groq) => {
    return await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.3-70b-versatile',
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
  
  // Replace any {{timestamp}} placeholders with actual timestamp
  if (result.test?.steps) {
    result.test.steps = result.test.steps.map((step, idx) => ({
      ...step,
      value: step.value?.replace?.(/\{\{timestamp\}\}/g, timestamp) || step.value,
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
 * Smart fallback when AI is unavailable - follows signup → login → goal flow
 */
function generateSmartFallback(pageData, url) {
  const elements = pageData.elements || [];
  const steps = [];
  const text = (pageData.visibleText || '').toLowerCase();
  const timestamp = Date.now();
  const testEmail = `testuser${timestamp}@example.com`;
  const testPassword = 'TestPass123!';
  
  // Analyze what's on the page
  const hasSignup = text.includes('sign up') || text.includes('register') || text.includes('create account');
  const hasLogin = text.includes('login') || text.includes('sign in') || text.includes('log in');
  const hasSearch = elements.some(e => e.type === 'search' || e.placeholder?.toLowerCase().includes('search'));
  const hasCart = text.includes('cart') || text.includes('add to cart') || text.includes('buy now');
  const hasCheckout = text.includes('checkout') || text.includes('payment') || text.includes('place order');
  const hasContact = text.includes('contact') || text.includes('message') || text.includes('inquiry');
  
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
  
  const findButton = (texts) => {
    for (const txt of texts) {
      const found = elements.find(e => 
        (e.role === 'button' || e.tagName === 'BUTTON' || e.tagName === 'A') &&
        e.visibleText?.toLowerCase().includes(txt)
      );
      if (found) return found;
    }
    return null;
  };
  
  // Common elements
  const emailInput = findByPurpose(['email', 'e-mail', 'username', 'user']);
  const passwordInput = elements.find(e => e.type === 'password');
  const confirmPasswordInput = elements.filter(e => e.type === 'password')[1]; // Second password field
  const nameInput = findByPurpose(['name', 'fullname', 'full name', 'full_name']);
  const firstNameInput = findByPurpose(['firstname', 'first name', 'first_name', 'fname']);
  const lastNameInput = findByPurpose(['lastname', 'last name', 'last_name', 'lname']);
  const phoneInput = findByPurpose(['phone', 'tel', 'mobile', 'cell']);
  
  // Buttons
  const signupButton = findButton(['sign up', 'register', 'create account', 'get started', 'join']);
  const signupLink = findButton(['sign up', 'register', 'create account']);
  const loginButton = findButton(['login', 'sign in', 'log in']);
  const loginLink = findButton(['login', 'sign in', 'log in']);
  const submitButton = elements.find(e => e.type === 'submit') || findButton(['submit', 'continue', 'next']);
  
  const detectedFlows = [];
  
  // STEP 1: SIGNUP FIRST (if available)
  if (hasSignup) {
    detectedFlows.push('signup');
    
    // If there's a signup link, click it first
    if (signupLink && !passwordInput) {
      steps.push({ action: 'click', target: signupLink.selector, value: null, description: 'Navigate to signup page' });
      steps.push({ action: 'wait', target: null, value: '2000', description: 'Wait for signup page to load' });
    }
    
    // Fill signup form
    if (firstNameInput) {
      steps.push({ action: 'type', target: firstNameInput.selector, value: 'John', description: 'Enter first name' });
    }
    if (lastNameInput) {
      steps.push({ action: 'type', target: lastNameInput.selector, value: 'Smith', description: 'Enter last name' });
    }
    if (nameInput && !firstNameInput) {
      steps.push({ action: 'type', target: nameInput.selector, value: 'John Smith', description: 'Enter full name' });
    }
    if (emailInput) {
      steps.push({ action: 'type', target: emailInput.selector, value: testEmail, description: 'Enter email for new account' });
    }
    if (phoneInput) {
      steps.push({ action: 'type', target: phoneInput.selector, value: '555-123-4567', description: 'Enter phone number' });
    }
    if (passwordInput) {
      steps.push({ action: 'type', target: passwordInput.selector, value: testPassword, description: 'Create password' });
    }
    if (confirmPasswordInput) {
      steps.push({ action: 'type', target: confirmPasswordInput.selector, value: testPassword, description: 'Confirm password' });
    }
    
    // Check any checkboxes (terms, etc)
    const checkboxes = elements.filter(e => e.type === 'checkbox').slice(0, 2);
    checkboxes.forEach(cb => {
      steps.push({ action: 'check', target: cb.selector, value: null, description: 'Accept terms/conditions' });
    });
    
    // Submit signup
    if (signupButton) {
      steps.push({ action: 'click', target: signupButton.selector, value: null, description: 'Submit signup form' });
    } else if (submitButton) {
      steps.push({ action: 'click', target: submitButton.selector, value: null, description: 'Submit signup form' });
    }
    steps.push({ action: 'wait', target: null, value: '3000', description: 'Wait for account creation' });
  }
  
  // STEP 2: LOGIN (after signup or if only login exists)
  if (hasLogin) {
    detectedFlows.push('login');
    
    // If we just signed up, we might need to go to login page
    if (hasSignup && loginLink) {
      steps.push({ action: 'click', target: loginLink.selector, value: null, description: 'Navigate to login page' });
      steps.push({ action: 'wait', target: null, value: '2000', description: 'Wait for login page' });
    }
    
    // Fill login form (use same credentials from signup)
    if (emailInput) {
      steps.push({ action: 'clear', target: emailInput.selector, value: null, description: 'Clear email field' });
      steps.push({ action: 'type', target: emailInput.selector, value: testEmail, description: 'Enter login email' });
    }
    if (passwordInput) {
      steps.push({ action: 'clear', target: passwordInput.selector, value: null, description: 'Clear password field' });
      steps.push({ action: 'type', target: passwordInput.selector, value: testPassword, description: 'Enter login password' });
    }
    
    // Submit login
    if (loginButton) {
      steps.push({ action: 'click', target: loginButton.selector, value: null, description: 'Submit login' });
    } else if (submitButton) {
      steps.push({ action: 'click', target: submitButton.selector, value: null, description: 'Submit login' });
    }
    steps.push({ action: 'wait', target: null, value: '3000', description: 'Wait for login to complete' });
  }
  
  // STEP 3: EXPLORE & INTERACT (after login)
  if (hasSearch) {
    detectedFlows.push('search');
    const searchInput = findByPurpose(['search', 'query', 'q']);
    if (searchInput) {
      steps.push({ action: 'type', target: searchInput.selector, value: 'test product', description: 'Search for products' });
      steps.push({ action: 'press', target: searchInput.selector, value: 'Enter', description: 'Submit search' });
      steps.push({ action: 'wait', target: null, value: '2000', description: 'Wait for search results' });
    }
  }
  
  // STEP 4: ADD TO CART (if e-commerce)
  if (hasCart) {
    detectedFlows.push('cart');
    const addToCartButton = findButton(['add to cart', 'add to bag', 'buy now', 'add']);
    if (addToCartButton) {
      steps.push({ action: 'click', target: addToCartButton.selector, value: null, description: 'Add item to cart' });
      steps.push({ action: 'wait', target: null, value: '1500', description: 'Wait for cart update' });
    }
    
    const viewCartButton = findButton(['view cart', 'cart', 'basket', 'bag']);
    if (viewCartButton) {
      steps.push({ action: 'click', target: viewCartButton.selector, value: null, description: 'View cart' });
      steps.push({ action: 'wait', target: null, value: '2000', description: 'Wait for cart page' });
    }
  }
  
  // STEP 5: CHECKOUT (final goal - but don't complete payment)
  if (hasCheckout) {
    detectedFlows.push('checkout');
    const checkoutButton = findButton(['checkout', 'proceed', 'continue to checkout', 'place order']);
    if (checkoutButton) {
      steps.push({ action: 'click', target: checkoutButton.selector, value: null, description: 'Proceed to checkout' });
      steps.push({ action: 'wait', target: null, value: '2000', description: 'Wait for checkout page' });
    }
    
    // Fill shipping info if present
    const addressInput = findByPurpose(['address', 'street', 'address1']);
    const cityInput = findByPurpose(['city', 'town']);
    const zipInput = findByPurpose(['zip', 'postal', 'postcode']);
    
    if (addressInput) steps.push({ action: 'type', target: addressInput.selector, value: '123 Test Street', description: 'Enter address' });
    if (cityInput) steps.push({ action: 'type', target: cityInput.selector, value: 'Test City', description: 'Enter city' });
    if (zipInput) steps.push({ action: 'type', target: zipInput.selector, value: '90210', description: 'Enter ZIP code' });
    
    // Note: Don't actually submit payment
    steps.push({ action: 'wait', target: null, value: '1000', description: 'Checkout form filled - stopping before payment' });
  }
  
  // STEP 6: CONTACT FORM (if that's the main purpose)
  if (hasContact && !hasSignup && !hasLogin) {
    detectedFlows.push('contact');
    if (nameInput) steps.push({ action: 'type', target: nameInput.selector, value: 'John Smith', description: 'Enter name' });
    if (emailInput) steps.push({ action: 'type', target: emailInput.selector, value: testEmail, description: 'Enter email' });
    const messageInput = elements.find(e => e.tagName === 'TEXTAREA');
    if (messageInput) steps.push({ action: 'type', target: messageInput.selector, value: 'This is a test inquiry message.', description: 'Enter message' });
    if (submitButton) steps.push({ action: 'click', target: submitButton.selector, value: null, description: 'Send message' });
  }
  
  // If no specific flow detected, do generic interaction
  if (steps.length === 0) {
    const inputs = elements.filter(e => e.tagName === 'INPUT' && e.type !== 'hidden').slice(0, 5);
    inputs.forEach(input => {
      let value = 'test';
      if (input.type === 'email') value = testEmail;
      else if (input.type === 'tel') value = '555-123-4567';
      else if (input.type === 'password') value = testPassword;
      steps.push({ action: 'type', target: input.selector, value, description: `Fill ${input.type || 'text'} field` });
    });
    
    const buttons = elements.filter(e => e.role === 'button').slice(0, 2);
    buttons.forEach(btn => {
      steps.push({ action: 'click', target: btn.selector, value: null, description: `Click ${btn.visibleText || 'button'}` });
    });
  }
  
  return {
    page_analysis: {
      purpose: pageData.pageType + ' page',
      website_type: hasCart ? 'ecommerce' : hasContact ? 'service' : 'webapp',
      main_features: detectedFlows,
      user_goal: detectedFlows.includes('checkout') ? 'Complete purchase' : 
                 detectedFlows.includes('signup') ? 'Create account and explore' : 
                 'Interact with the page',
      has_signup: hasSignup,
      has_login: hasLogin,
      end_goal: detectedFlows[detectedFlows.length - 1] || 'interaction'
    },
    test: {
      id: 'journey_' + timestamp,
      type: 'e2e_journey',
      name: `Complete Journey: ${detectedFlows.join(' → ') || 'Page Interaction'}`,
      steps: steps.slice(0, 30),
      expected: 'User can complete the full journey from signup to end goal'
    },
    detected_flows: detectedFlows,
    potential_issues: [],
    pageData,
    url,
    source: 'fallback'
  };
}

module.exports = { generateJourneyTest };
