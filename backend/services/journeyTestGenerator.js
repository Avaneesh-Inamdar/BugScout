const apiKeyManager = require('./apiKeyManager');
const pageInspector = require('./pageInspector');

/**
 * Generate intelligent end-to-end journey tests
 * AI analyzes the page and decides what to test based on what it sees
 */

const SMART_JOURNEY_PROMPT = `You are an expert QA tester simulating a REAL USER journey on a website. Your goal is to test the COMPLETE user experience from start to finish.

CRITICAL RULES FOR SINGLE-PAGE APPS (SPAs):
- Many modern websites show login/signup on the SAME page with a toggle link
- When you click "Create account" or "Sign up" link, the FORM CHANGES but the page doesn't reload
- After clicking the toggle, you must use the NEW form's selectors, not the old ones
- Look for patterns like: "Don't have an account? Sign up" or "Already have an account? Login"
- The signup form will have DIFFERENT input IDs than the login form

CRITICAL: FOLLOW THE NATURAL USER JOURNEY ORDER:
1. SIGNUP FIRST - If there's a signup/register option or link, click it first to create a new account
2. FILL SIGNUP FORM - Use the signup form's input fields (these are DIFFERENT from login fields)
3. SUBMIT SIGNUP - Click the signup/register button
4. THEN LOGIN - After signup succeeds, go back to login and use the same credentials
5. THEN EXPLORE - Browse products, search, navigate the site

IMPORTANT - FORM FIELD IDENTIFICATION:
- Login forms typically have: email/username input, password input, "Sign In" button
- Signup forms typically have: name input, email input, password input, confirm password, "Sign Up" button
- If you see "#loginEmail" that's for LOGIN form
- If you see "#signupEmail" or "#registerEmail" that's for SIGNUP form
- NEVER use login form fields when filling signup form and vice versa

ANALYZE THE PAGE CAREFULLY:
1. Is this a login page with a "Sign up" or "Create account" link? → Click that link FIRST
2. After clicking signup link, what NEW form fields appear? → Use THOSE selectors
3. Look for input fields with "signup", "register", "new" in their IDs/names
4. The signup form fields are DIFFERENT from login form fields

TEST DATA TO USE (use these consistently):
- Email: testuser{{timestamp}}@example.com (I'll replace {{timestamp}})
- Password: TestPass123!
- Name: Test User
- First Name: Test
- Last Name: User

EXAMPLE FOR A TYPICAL LOGIN/SIGNUP PAGE:
If you see a login form with a "Create one" or "Sign up" link:
1. Click the "Create one" / "Sign up" link (this switches to signup form)
2. Wait for form to change
3. Fill the SIGNUP form fields (look for #signupEmail, #signupPassword, #signupName, etc.)
4. Click the signup/register button
5. Wait for success
6. If redirected to login, fill LOGIN form fields (#loginEmail, #loginPassword)
7. Click login button

Return a JSON object with your analysis and test:
{
  "page_analysis": {
    "purpose": "What this website/page is for",
    "website_type": "ecommerce|social|service|blog|webapp|other",
    "main_features": ["feature1", "feature2"],
    "user_goal": "What a user ultimately wants to accomplish",
    "has_signup": true/false,
    "has_login": true/false,
    "is_spa_toggle": true/false,
    "signup_link_selector": "selector to click to show signup form",
    "login_link_selector": "selector to click to show login form"
  },
  "test": {
    "id": "journey_1",
    "type": "e2e_journey", 
    "name": "Complete User Journey: Signup → Login → [Goal]",
    "steps": [
      {
        "action": "click",
        "target": "exact CSS selector from elements list",
        "value": null,
        "reasoning": "Why this step"
      }
    ],
    "expected": "User can complete full journey"
  },
  "detected_flows": ["signup", "login"],
  "potential_issues": ["things that might fail"]
}

AVAILABLE ACTIONS:
- click: Click element (target: selector, value: null)
- type: Enter text (target: selector, value: text to type)
- clear: Clear input field before typing (target: selector, value: null)
- wait: Pause for page/form changes (target: null, value: "2000" for 2 seconds)
- select: Choose dropdown option (target: selector, value: option)
- check: Check checkbox (target: selector, value: null)
- press: Keyboard key (target: selector, value: "Enter")

CRITICAL: Only use selectors that EXACTLY match ones in the elements list below!

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
  
  // Identify if this looks like a login/signup toggle page
  const hasLoginForm = pageContext.elements.some(e => 
    e.selector?.includes('login') || e.name?.includes('login')
  );
  const hasSignupForm = pageContext.elements.some(e => 
    e.selector?.includes('signup') || e.selector?.includes('register') || 
    e.name?.includes('signup') || e.name?.includes('register')
  );
  const hasToggleLink = pageContext.elements.some(e => 
    e.visibleText?.toLowerCase().includes('create') ||
    e.visibleText?.toLowerCase().includes('sign up') ||
    e.visibleText?.toLowerCase().includes('register') ||
    e.visibleText?.toLowerCase().includes("don't have")
  );
  
  // Group elements by form type for clarity
  const loginElements = pageContext.elements.filter(e => 
    e.selector?.toLowerCase().includes('login') || 
    e.name?.toLowerCase().includes('login')
  );
  const signupElements = pageContext.elements.filter(e => 
    e.selector?.toLowerCase().includes('signup') || 
    e.selector?.toLowerCase().includes('register') ||
    e.name?.toLowerCase().includes('signup') ||
    e.name?.toLowerCase().includes('register')
  );
  
  let formContext = '';
  if (loginElements.length > 0) {
    formContext += '\n\nLOGIN FORM ELEMENTS (use these ONLY for login):\n';
    formContext += loginElements.map(e => `- ${e.selector} (${e.type || e.tagName})`).join('\n');
  }
  if (signupElements.length > 0) {
    formContext += '\n\nSIGNUP FORM ELEMENTS (use these ONLY for signup):\n';
    formContext += signupElements.map(e => `- ${e.selector} (${e.type || e.tagName})`).join('\n');
  }
  if (hasToggleLink) {
    formContext += '\n\nNOTE: This appears to be a SINGLE PAGE with login/signup TOGGLE. ';
    formContext += 'Click the signup link first, then use SIGNUP form fields (not login fields)!';
  }
  
  const prompt = SMART_JOURNEY_PROMPT + `
URL: ${pageContext.url}
Page Type Detected: ${pageContext.pageType}
Page Title: ${pageContext.title}

VISIBLE TEXT ON PAGE:
${pageContext.visibleText.substring(0, 2000)}

PAGE STATISTICS:
- ${pageContext.summary.inputs} input fields
- ${pageContext.summary.buttons} buttons
- ${pageContext.summary.links} links
${formContext}

ALL AVAILABLE ELEMENTS (use EXACT selectors from this list):
${pageContext.elementDescriptions}

TEST DATA:
- Email: ${testEmail}
- Password: TestPass123!
- Name: Test User

IMPORTANT: 
1. If there's a "Create one" or "Sign up" link, click it FIRST
2. After clicking, use SIGNUP form fields (like #signupEmail), NOT login fields (like #loginEmail)
3. Each form has its own set of input fields - don't mix them up!

Generate a test that properly handles the signup → login flow.`;

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
  
  // Build multiple lookup maps for flexible matching
  const elementsBySelector = {};
  const elementsByName = {};
  const elementsByType = {};
  const elementsByText = {};
  
  elements.forEach(e => {
    elementsBySelector[e.selector] = e;
    if (e.name) elementsByName[e.name.toLowerCase()] = e;
    if (e.type) {
      if (!elementsByType[e.type]) elementsByType[e.type] = [];
      elementsByType[e.type].push(e);
    }
    if (e.visibleText) elementsByText[e.visibleText.toLowerCase().trim()] = e;
  });
  
  // Separate login and signup elements for smart matching
  const loginInputs = elements.filter(e => 
    e.selector?.toLowerCase().includes('login') && 
    (e.tagName === 'INPUT' || e.type)
  );
  const signupInputs = elements.filter(e => 
    (e.selector?.toLowerCase().includes('signup') || e.selector?.toLowerCase().includes('register')) && 
    (e.tagName === 'INPUT' || e.type)
  );
  
  if (aiResult.test?.steps) {
    // Track which phase we're in (signup vs login)
    let currentPhase = 'initial';
    
    aiResult.test.steps = aiResult.test.steps
      .filter(step => {
        if (!step.action) return false;
        if (step.action === 'wait' || step.action === 'delay') return true;
        if (step.target === 'Select element...' || step.target === 'Select element') return false;
        if (!step.target && step.action !== 'wait') return false;
        return true;
      })
      .map(step => {
        // Skip wait steps
        if (step.action === 'wait' || step.action === 'delay' || !step.target) return step;
        
        // Track phase based on clicks
        if (step.action === 'click') {
          const targetLower = (step.target || '').toLowerCase();
          const reasonLower = (step.reasoning || '').toLowerCase();
          if (targetLower.includes('signup') || targetLower.includes('register') || 
              targetLower.includes('create') || reasonLower.includes('signup')) {
            currentPhase = 'signup';
          } else if (targetLower.includes('login') || targetLower.includes('sign in') ||
                     reasonLower.includes('login')) {
            currentPhase = 'login';
          }
        }
        
        // Clean up the target
        let cleanTarget = step.target;
        
        // Fix malformed selectors like "#loginEmail: email_input [your@email.com]"
        if (cleanTarget.includes(':') && cleanTarget.includes('[') && !cleanTarget.startsWith('[')) {
          const idMatch = cleanTarget.match(/^#?([a-zA-Z][a-zA-Z0-9_-]*)/);
          if (idMatch) {
            cleanTarget = '#' + idMatch[1];
          }
        }
        
        // Remove trailing descriptions
        if (cleanTarget.includes(' [') && !cleanTarget.match(/\[[\w-]+=/)) {
          cleanTarget = cleanTarget.split(' [')[0].trim();
        }
        
        // If selector exists, use it
        if (selectorSet.has(cleanTarget)) {
          return { ...step, target: cleanTarget };
        }
        
        // Try to find the right element based on context
        const targetLower = (step.target || '').toLowerCase();
        
        // For type actions, try to find the right input based on phase and type
        if (step.action === 'type' || step.action === 'fill') {
          const isEmailField = targetLower.includes('email') || step.value?.includes('@');
          const isPasswordField = targetLower.includes('password');
          const isNameField = targetLower.includes('name');
          
          // Choose from the right form based on current phase
          const inputPool = currentPhase === 'signup' && signupInputs.length > 0 ? signupInputs :
                           currentPhase === 'login' && loginInputs.length > 0 ? loginInputs :
                           elements;
          
          if (isEmailField) {
            const emailInput = inputPool.find(e => e.type === 'email' || e.selector?.includes('email'));
            if (emailInput) return { ...step, target: emailInput.selector };
          }
          if (isPasswordField) {
            const passInput = inputPool.find(e => e.type === 'password');
            if (passInput) return { ...step, target: passInput.selector };
          }
          if (isNameField) {
            const nameInput = inputPool.find(e => 
              e.name?.toLowerCase().includes('name') || 
              e.placeholder?.toLowerCase().includes('name') ||
              e.selector?.includes('name')
            );
            if (nameInput) return { ...step, target: nameInput.selector };
          }
        }
        
        // For click actions, try to find by text
        if (step.action === 'click') {
          // Try exact text match first
          const byText = elements.find(e => 
            e.visibleText?.toLowerCase().trim() === targetLower.trim()
          );
          if (byText) return { ...step, target: byText.selector };
          
          // Try partial text match
          const byPartialText = elements.find(e => 
            e.visibleText?.toLowerCase().includes(targetLower) ||
            targetLower.includes(e.visibleText?.toLowerCase() || '')
          );
          if (byPartialText) return { ...step, target: byPartialText.selector };
          
          // Try by button/link role with text
          const byButtonText = elements.find(e => 
            (e.role === 'button' || e.tagName === 'BUTTON' || e.tagName === 'A') &&
            (e.visibleText?.toLowerCase().includes(targetLower.replace(/[^a-z]/g, '')) ||
             targetLower.includes(e.visibleText?.toLowerCase() || ''))
          );
          if (byButtonText) return { ...step, target: byButtonText.selector };
        }
        
        // Try by ID extraction
        const idMatch = step.target.match(/^#?([a-zA-Z][a-zA-Z0-9_-]*)/);
        if (idMatch) {
          const byId = elements.find(e => e.selector === '#' + idMatch[1]);
          if (byId) return { ...step, target: byId.selector };
        }
        
        // Try by name attribute
        const byName = elements.find(e => e.name?.toLowerCase() === targetLower);
        if (byName) return { ...step, target: byName.selector };
        
        // Try by placeholder
        const byPlaceholder = elements.find(e => 
          e.placeholder?.toLowerCase().includes(targetLower) ||
          targetLower.includes(e.placeholder?.toLowerCase() || '')
        );
        if (byPlaceholder) return { ...step, target: byPlaceholder.selector };
        
        // Try by aria-label
        const byAriaLabel = elements.find(e =>
          e.ariaLabel?.toLowerCase().includes(targetLower)
        );
        if (byAriaLabel) return { ...step, target: byAriaLabel.selector };
        
        console.log(`Could not fix selector: ${step.target} (phase: ${currentPhase})`);
        return { ...step, target: cleanTarget };
      });
    
    // Remove duplicate consecutive steps
    aiResult.test.steps = aiResult.test.steps.filter((step, idx, arr) => {
      if (idx === 0) return true;
      const prev = arr[idx - 1];
      // Remove if same action and target as previous
      if (step.action === prev.action && step.target === prev.target && step.value === prev.value) {
        return false;
      }
      return true;
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
