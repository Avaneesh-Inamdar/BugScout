const apiKeyManager = require('./apiKeyManager');
const pageInspector = require('./pageInspector');

/**
 * Generate comprehensive end-to-end journey tests
 * Tests the full user flow from start to finish
 */

const JOURNEY_PROMPT = `You are a QA expert creating a comprehensive end-to-end user journey test.

Analyze the page and create a COMPLETE user journey test that covers:
1. If signup exists: Test full signup flow with valid data
2. If login exists: Test login flow
3. If products/items exist: Browse and interact with them
4. If cart exists: Add items to cart
5. If checkout exists: Complete checkout flow (stop before actual payment)
6. Test all visible buttons and links to ensure they work

IMPORTANT RULES:
- Use EXACT CSS selectors from the input elements
- Create ONE comprehensive test with ALL steps in sequence
- Include realistic test data (names, emails, etc.)
- Take logical order: signup → login → browse → cart → checkout
- Test button clicks to verify they respond
- Maximum 25 steps to keep it manageable

Return ONLY valid JSON:
{
  "journey_name": "Complete User Journey",
  "page_type": "ecommerce|webapp|landing|form",
  "test": {
    "id": "journey_1",
    "type": "e2e_journey",
    "name": "Full User Journey: Signup to Checkout",
    "steps": [
      { "action": "type", "target": "input[name=email]", "value": "testuser@example.com", "description": "Enter email for signup" },
      { "action": "click", "target": "button[type=submit]", "value": null, "description": "Submit signup form" }
    ],
    "expected": "User can complete full journey from signup to checkout"
  },
  "detected_flows": ["signup", "login", "cart", "checkout"],
  "buttons_to_test": ["Submit", "Add to Cart", "Checkout"]
}

Page Data:
`;

/**
 * Generate a comprehensive end-to-end journey test
 */
async function generateJourneyTest(url) {
  // First, inspect the page to get all elements
  const pageData = await pageInspector.inspect(url);
  
  // Detect what flows are available on this page
  const detectedFlows = detectAvailableFlows(pageData);
  
  // Try AI generation first
  if (apiKeyManager.hasKeys()) {
    try {
      const aiResult = await generateWithAI(pageData, detectedFlows);
      if (aiResult && aiResult.test && aiResult.test.steps?.length > 0) {
        return {
          ...aiResult,
          pageData,
          url
        };
      }
    } catch (error) {
      console.warn('AI journey generation failed:', error.message);
    }
  }
  
  // Fallback to rule-based generation
  return generateWithRules(pageData, detectedFlows, url);
}

/**
 * Detect what user flows are available on the page
 */
function detectAvailableFlows(pageData) {
  const flows = [];
  const elements = pageData.elements || [];
  const text = (pageData.visibleText || '').toLowerCase();
  
  // Check for signup
  const hasSignup = elements.some(e => 
    e.type === 'password' || 
    e.placeholder?.toLowerCase().includes('password') ||
    e.visibleText?.toLowerCase().includes('sign up') ||
    e.visibleText?.toLowerCase().includes('register') ||
    e.visibleText?.toLowerCase().includes('create account')
  ) && (text.includes('sign up') || text.includes('register') || text.includes('create account'));
  
  if (hasSignup) flows.push('signup');
  
  // Check for login
  const hasLogin = elements.some(e => 
    e.type === 'password' || 
    e.visibleText?.toLowerCase().includes('login') ||
    e.visibleText?.toLowerCase().includes('sign in')
  ) && (text.includes('login') || text.includes('sign in'));
  
  if (hasLogin) flows.push('login');
  
  // Check for search
  const hasSearch = elements.some(e => 
    e.type === 'search' || 
    e.placeholder?.toLowerCase().includes('search') ||
    e.name?.toLowerCase().includes('search')
  );
  
  if (hasSearch) flows.push('search');
  
  // Check for cart/shopping
  const hasCart = text.includes('cart') || text.includes('basket') || 
    text.includes('add to cart') || text.includes('buy now');
  
  if (hasCart) flows.push('cart');
  
  // Check for checkout
  const hasCheckout = text.includes('checkout') || text.includes('payment') || 
    text.includes('place order') || text.includes('complete purchase');
  
  if (hasCheckout) flows.push('checkout');
  
  // Check for forms
  const hasForms = elements.filter(e => e.tagName === 'INPUT' || e.tagName === 'TEXTAREA').length > 2;
  if (hasForms) flows.push('forms');
  
  // Check for navigation
  const hasNav = elements.filter(e => e.role === 'link' || e.tagName === 'A').length > 3;
  if (hasNav) flows.push('navigation');
  
  return flows;
}

async function generateWithAI(pageData, detectedFlows) {
  const inputData = {
    page_type: pageData.pageType,
    detected_flows: detectedFlows,
    visible_text: pageData.visibleText.substring(0, 2000),
    elements: pageData.elements.slice(0, 50).map(e => ({
      id: e.id,
      role: e.role,
      type: e.type,
      tagName: e.tagName,
      placeholder: e.placeholder,
      visibleText: e.visibleText?.substring(0, 50),
      selector: e.selector
    }))
  };
  
  const completion = await apiKeyManager.executeWithFallback(async (groq) => {
    return await groq.chat.completions.create({
      messages: [
        { role: 'user', content: JOURNEY_PROMPT + JSON.stringify(inputData, null, 2) }
      ],
      model: 'llama-3.1-8b-instant',
      temperature: 0.2,
      max_tokens: 3000
    });
  });
  
  const responseText = completion.choices[0]?.message?.content || '';
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  
  if (!jsonMatch) {
    throw new Error('No JSON found in AI response');
  }
  
  return JSON.parse(jsonMatch[0]);
}

function generateWithRules(pageData, detectedFlows, url) {
  const elements = pageData.elements || [];
  const steps = [];
  
  // Helper functions
  const findElement = (criteria) => {
    return elements.find(e => {
      for (const [key, value] of Object.entries(criteria)) {
        const val = typeof value === 'string' ? value.toLowerCase() : value;
        if (key === 'type' && e.type?.toLowerCase() === val) return true;
        if (key === 'role' && e.role?.toLowerCase() === val) return true;
        if (key === 'placeholderIncludes' && e.placeholder?.toLowerCase().includes(val)) return true;
        if (key === 'textIncludes' && e.visibleText?.toLowerCase().includes(val)) return true;
        if (key === 'nameIncludes' && e.name?.toLowerCase().includes(val)) return true;
      }
      return false;
    });
  };
  
  const findAllElements = (criteria) => {
    return elements.filter(e => {
      for (const [key, value] of Object.entries(criteria)) {
        const val = typeof value === 'string' ? value.toLowerCase() : value;
        if (key === 'type' && e.type?.toLowerCase() === val) return true;
        if (key === 'role' && e.role?.toLowerCase() === val) return true;
        if (key === 'tagName' && e.tagName?.toLowerCase() === val) return true;
      }
      return false;
    });
  };
  
  // Test data
  const testData = {
    name: 'Test User',
    firstName: 'Test',
    lastName: 'User',
    email: 'testuser' + Date.now() + '@example.com',
    phone: '9876543210',
    password: 'TestPass123!',
    address: '123 Test Street',
    city: 'Test City',
    zip: '12345',
    cardNumber: '4111111111111111',
    cardExpiry: '12/28',
    cardCvv: '123'
  };
  
  // 1. SIGNUP FLOW
  if (detectedFlows.includes('signup')) {
    const nameInput = findElement({ placeholderIncludes: 'name' }) || findElement({ nameIncludes: 'name' });
    const emailInput = findElement({ type: 'email' }) || findElement({ placeholderIncludes: 'email' });
    const phoneInput = findElement({ type: 'tel' }) || findElement({ placeholderIncludes: 'phone' });
    const passwordInput = findElement({ type: 'password' });
    const confirmPassword = elements.find(e => e.type === 'password' && e !== passwordInput);
    const signupButton = findElement({ textIncludes: 'sign up' }) || findElement({ textIncludes: 'register' }) || findElement({ textIncludes: 'create' });
    
    if (nameInput) steps.push({ action: 'type', target: nameInput.selector, value: testData.name, description: 'Enter full name' });
    if (emailInput) steps.push({ action: 'type', target: emailInput.selector, value: testData.email, description: 'Enter email address' });
    if (phoneInput) steps.push({ action: 'type', target: phoneInput.selector, value: testData.phone, description: 'Enter phone number' });
    if (passwordInput) steps.push({ action: 'type', target: passwordInput.selector, value: testData.password, description: 'Enter password' });
    if (confirmPassword) steps.push({ action: 'type', target: confirmPassword.selector, value: testData.password, description: 'Confirm password' });
    
    // Check any checkboxes (terms, newsletter)
    const checkboxes = findAllElements({ type: 'checkbox' });
    checkboxes.slice(0, 2).forEach((cb, i) => {
      steps.push({ action: 'check', target: cb.selector, value: null, description: `Check checkbox ${i + 1}` });
    });
    
    if (signupButton) steps.push({ action: 'click', target: signupButton.selector, value: null, description: 'Click signup button' });
    steps.push({ action: 'wait', target: null, value: '2000', description: 'Wait for signup to process' });
  }
  
  // 2. LOGIN FLOW
  if (detectedFlows.includes('login') && !detectedFlows.includes('signup')) {
    const emailInput = findElement({ type: 'email' }) || findElement({ placeholderIncludes: 'email' }) || findElement({ placeholderIncludes: 'username' });
    const passwordInput = findElement({ type: 'password' });
    const loginButton = findElement({ textIncludes: 'login' }) || findElement({ textIncludes: 'sign in' }) || findElement({ type: 'submit' });
    
    if (emailInput) steps.push({ action: 'type', target: emailInput.selector, value: 'test@example.com', description: 'Enter login email' });
    if (passwordInput) steps.push({ action: 'type', target: passwordInput.selector, value: testData.password, description: 'Enter login password' });
    if (loginButton) steps.push({ action: 'click', target: loginButton.selector, value: null, description: 'Click login button' });
    steps.push({ action: 'wait', target: null, value: '2000', description: 'Wait for login' });
  }
  
  // 3. SEARCH FLOW
  if (detectedFlows.includes('search')) {
    const searchInput = findElement({ type: 'search' }) || findElement({ placeholderIncludes: 'search' }) || findElement({ nameIncludes: 'search' });
    const searchButton = findElement({ textIncludes: 'search' }) || findElement({ role: 'button' });
    
    if (searchInput) {
      steps.push({ action: 'type', target: searchInput.selector, value: 'test product', description: 'Enter search query' });
      if (searchButton) {
        steps.push({ action: 'click', target: searchButton.selector, value: null, description: 'Click search button' });
      } else {
        steps.push({ action: 'press', target: searchInput.selector, value: 'Enter', description: 'Press Enter to search' });
      }
      steps.push({ action: 'wait', target: null, value: '1500', description: 'Wait for search results' });
    }
  }
  
  // 4. CART FLOW
  if (detectedFlows.includes('cart')) {
    const addToCartButton = findElement({ textIncludes: 'add to cart' }) || findElement({ textIncludes: 'buy' });
    const cartLink = findElement({ textIncludes: 'cart' }) || findElement({ textIncludes: 'basket' });
    
    if (addToCartButton) {
      steps.push({ action: 'click', target: addToCartButton.selector, value: null, description: 'Add item to cart' });
      steps.push({ action: 'wait', target: null, value: '1000', description: 'Wait for cart update' });
    }
    if (cartLink) {
      steps.push({ action: 'click', target: cartLink.selector, value: null, description: 'Go to cart' });
      steps.push({ action: 'wait', target: null, value: '1500', description: 'Wait for cart page' });
    }
  }
  
  // 5. CHECKOUT FLOW
  if (detectedFlows.includes('checkout')) {
    const checkoutButton = findElement({ textIncludes: 'checkout' }) || findElement({ textIncludes: 'proceed' });
    const addressInput = findElement({ placeholderIncludes: 'address' }) || findElement({ nameIncludes: 'address' });
    const cityInput = findElement({ placeholderIncludes: 'city' }) || findElement({ nameIncludes: 'city' });
    const zipInput = findElement({ placeholderIncludes: 'zip' }) || findElement({ placeholderIncludes: 'postal' });
    const cardInput = findElement({ placeholderIncludes: 'card' }) || findElement({ nameIncludes: 'card' });
    
    if (checkoutButton) {
      steps.push({ action: 'click', target: checkoutButton.selector, value: null, description: 'Proceed to checkout' });
      steps.push({ action: 'wait', target: null, value: '1500', description: 'Wait for checkout page' });
    }
    if (addressInput) steps.push({ action: 'type', target: addressInput.selector, value: testData.address, description: 'Enter shipping address' });
    if (cityInput) steps.push({ action: 'type', target: cityInput.selector, value: testData.city, description: 'Enter city' });
    if (zipInput) steps.push({ action: 'type', target: zipInput.selector, value: testData.zip, description: 'Enter ZIP code' });
    
    // Note: Don't actually submit payment
    if (cardInput) {
      steps.push({ action: 'type', target: cardInput.selector, value: testData.cardNumber, description: 'Enter test card number (not submitted)' });
    }
  }
  
  // 6. TEST ALL BUTTONS
  const buttons = findAllElements({ role: 'button' }).slice(0, 5);
  const links = findAllElements({ tagName: 'a' }).filter(l => 
    l.href && !l.href.includes('javascript:') && !l.href.startsWith('#')
  ).slice(0, 3);
  
  // Test a few buttons that haven't been clicked yet
  const clickedSelectors = new Set(steps.filter(s => s.action === 'click').map(s => s.target));
  
  buttons.forEach((btn, i) => {
    if (!clickedSelectors.has(btn.selector) && btn.visibleText) {
      steps.push({ 
        action: 'click', 
        target: btn.selector, 
        value: null, 
        description: `Test button: ${btn.visibleText.substring(0, 30)}` 
      });
      steps.push({ action: 'wait', target: null, value: '500', description: 'Wait after button click' });
    }
  });
  
  // Test navigation links
  links.forEach((link, i) => {
    if (!clickedSelectors.has(link.selector) && link.visibleText) {
      steps.push({ 
        action: 'click', 
        target: link.selector, 
        value: null, 
        description: `Test link: ${link.visibleText.substring(0, 30)}` 
      });
      steps.push({ action: 'wait', target: null, value: '1000', description: 'Wait for navigation' });
    }
  });
  
  return {
    journey_name: 'Complete User Journey',
    page_type: pageData.pageType,
    url,
    detected_flows: detectedFlows,
    test: {
      id: 'journey_' + Date.now(),
      type: 'e2e_journey',
      name: `Full User Journey: ${detectedFlows.join(' → ')}`,
      steps: steps.slice(0, 30), // Limit to 30 steps
      expected: 'User can complete the full journey without errors'
    },
    pageData
  };
}

module.exports = { generateJourneyTest, detectAvailableFlows };
