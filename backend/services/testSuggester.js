const apiKeyManager = require('./apiKeyManager');

const SUGGEST_PROMPT = `You are a senior QA engineer. Analyze the page elements and suggest edge cases and test scenarios that developers often miss.

Focus on:
- Security vulnerabilities (XSS, SQL injection, etc.)
- Boundary conditions (max length, special characters)
- Edge cases (empty inputs, whitespace only, unicode)
- User experience issues (error handling, loading states)
- Business logic flaws

Return JSON array of suggestions:
[
  {
    "category": "security|boundary|edge_case|ux|business_logic",
    "title": "Short title",
    "description": "What to test and why",
    "testSteps": ["Step 1", "Step 2"],
    "priority": "high|medium|low",
    "risk": "What could go wrong if not tested"
  }
]

Generate 5-8 unique, actionable suggestions. No generic advice.

Page Info:
`;

async function suggest(pageData) {
  const suggestions = [];

  // Always add rule-based suggestions first
  const ruleBased = getRuleBasedSuggestions(pageData);
  suggestions.push(...ruleBased);

  // Try AI suggestions using apiKeyManager with fallback
  if (apiKeyManager.hasKeys()) {
    try {
      const aiSuggestions = await getAISuggestions(pageData);
      suggestions.push(...aiSuggestions);
    } catch (error) {
      console.error('AI suggestions error:', error.message);
    }
  }

  // Deduplicate by title
  const seen = new Set();
  return suggestions.filter(s => {
    if (seen.has(s.title)) return false;
    seen.add(s.title);
    return true;
  }).slice(0, 10);
}

async function getAISuggestions(pageData) {
  const pageInfo = `
Page Type: ${pageData.pageType || 'unknown'}
URL: ${pageData.url || 'N/A'}
Elements found:
${pageData.elements?.slice(0, 15).map(el => 
  `- ${el.role || el.tagName}: ${el.type || ''} ${el.placeholder || ''} ${el.visibleText?.substring(0, 30) || ''}`
).join('\n')}
`;

  const response = await apiKeyManager.executeWithFallback(async (groq) => {
    return await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: SUGGEST_PROMPT },
        { role: 'user', content: pageInfo }
      ],
      temperature: 0.7,
      max_tokens: 1000
    });
  });

  const content = response.choices[0]?.message?.content || '';
  
  // Extract JSON array
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.map(s => ({ ...s, source: 'ai' }));
  }
  
  return [];
}

function getRuleBasedSuggestions(pageData) {
  const suggestions = [];
  const elements = pageData.elements || [];

  // Check for input fields
  const inputs = elements.filter(el => el.tagName === 'INPUT' || el.role === 'input');
  const hasEmailInput = inputs.some(el => el.type === 'email' || el.placeholder?.toLowerCase().includes('email'));
  const hasPasswordInput = inputs.some(el => el.type === 'password');
  const hasTextInput = inputs.some(el => el.type === 'text' || !el.type);

  if (hasEmailInput) {
    suggestions.push({
      category: 'boundary',
      title: 'Email Format Edge Cases',
      description: 'Test unusual but valid email formats',
      testSteps: [
        'Enter email with + symbol: test+tag@example.com',
        'Enter email with subdomain: user@mail.example.com',
        'Enter very long email (254 chars max)',
        'Enter email with unicode: tëst@example.com'
      ],
      priority: 'medium',
      risk: 'Valid users may be rejected',
      source: 'rule'
    });

    suggestions.push({
      category: 'security',
      title: 'Email Input XSS Test',
      description: 'Check if email field sanitizes script injection',
      testSteps: [
        'Enter: <script>alert("xss")</script>@test.com',
        'Enter: test@<img src=x onerror=alert(1)>.com',
        'Check if input is escaped in error messages'
      ],
      priority: 'high',
      risk: 'Cross-site scripting vulnerability',
      source: 'rule'
    });
  }

  if (hasPasswordInput) {
    suggestions.push({
      category: 'security',
      title: 'Password Field Security',
      description: 'Verify password handling security',
      testSteps: [
        'Check password is masked (type="password")',
        'Verify password not in URL params',
        'Check autocomplete="new-password" or "off"',
        'Test copy-paste into password field'
      ],
      priority: 'high',
      risk: 'Password exposure or interception',
      source: 'rule'
    });

    suggestions.push({
      category: 'boundary',
      title: 'Password Boundary Tests',
      description: 'Test password length and character limits',
      testSteps: [
        'Enter 1 character password',
        'Enter 100+ character password',
        'Enter password with only spaces',
        'Enter password with unicode: pässwörd123'
      ],
      priority: 'medium',
      risk: 'Users locked out or security bypass',
      source: 'rule'
    });
  }

  if (hasTextInput) {
    suggestions.push({
      category: 'security',
      title: 'SQL Injection Test',
      description: 'Check if text inputs are vulnerable to SQL injection',
      testSteps: [
        "Enter: ' OR '1'='1",
        "Enter: '; DROP TABLE users; --",
        "Enter: 1' AND '1'='1",
        'Check for database errors in response'
      ],
      priority: 'high',
      risk: 'Database compromise or data leak',
      source: 'rule'
    });

    suggestions.push({
      category: 'edge_case',
      title: 'Special Characters Handling',
      description: 'Test how special characters are processed',
      testSteps: [
        'Enter: <>&"\' (HTML special chars)',
        'Enter: 你好世界 (Chinese characters)',
        'Enter: 🎉🚀💻 (Emojis)',
        'Enter: NULL, undefined, NaN'
      ],
      priority: 'medium',
      risk: 'Display issues or crashes',
      source: 'rule'
    });
  }

  // Check for forms
  const hasForm = elements.some(el => el.tagName === 'FORM');
  if (hasForm) {
    suggestions.push({
      category: 'ux',
      title: 'Form Submission Edge Cases',
      description: 'Test form behavior under various conditions',
      testSteps: [
        'Submit form with all fields empty',
        'Double-click submit button rapidly',
        'Submit form, then press back button',
        'Submit form with network disconnected'
      ],
      priority: 'medium',
      risk: 'Duplicate submissions or lost data',
      source: 'rule'
    });
  }

  // Check for buttons
  const buttons = elements.filter(el => el.tagName === 'BUTTON' || el.role === 'button');
  if (buttons.length > 0) {
    suggestions.push({
      category: 'ux',
      title: 'Button State Testing',
      description: 'Verify button states and feedback',
      testSteps: [
        'Click button and check for loading state',
        'Verify button disables during processing',
        'Test keyboard activation (Enter/Space)',
        'Check button focus visibility'
      ],
      priority: 'low',
      risk: 'Poor user experience or confusion',
      source: 'rule'
    });
  }

  return suggestions;
}

module.exports = { suggest };
