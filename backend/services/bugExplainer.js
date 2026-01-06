const Groq = require('groq-sdk');

const EXPLAIN_PROMPT = `You are a QA expert analyzing a failed test. Given the test details and error, provide:

1. **What Went Wrong**: A clear, non-technical explanation of the failure
2. **Likely Cause**: The most probable reason (element not found, timing issue, validation error, etc.)
3. **Suggested Fix**: Actionable steps to fix the test or the application
4. **Severity**: low | medium | high | critical

Respond in JSON format:
{
  "summary": "One sentence summary",
  "whatWentWrong": "Clear explanation",
  "likelyCause": "Technical cause",
  "suggestedFix": "How to fix it",
  "severity": "medium",
  "tips": ["tip1", "tip2"]
}

Test Details:
`;

async function explainFailure(test, pageContext) {
  if (!process.env.GROQ_API_KEY) {
    return getFallbackExplanation(test);
  }

  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    
    const testInfo = `
Test Name: ${test.name}
Test Type: ${test.type}
Steps: ${JSON.stringify(test.steps, null, 2)}
Expected: ${test.expected}
Error: ${test.error}
Page Type: ${pageContext?.pageType || 'unknown'}
`;

    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: EXPLAIN_PROMPT },
        { role: 'user', content: testInfo }
      ],
      temperature: 0.3,
      max_tokens: 500
    });

    const content = response.choices[0]?.message?.content || '';
    
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    return getFallbackExplanation(test);
  } catch (error) {
    console.error('Bug explainer error:', error.message);
    return getFallbackExplanation(test);
  }
}

function getFallbackExplanation(test) {
  const error = test.error || 'Unknown error';
  
  // Pattern matching for common errors
  if (error.includes('Element not found')) {
    return {
      summary: 'The test couldn\'t find an element on the page',
      whatWentWrong: 'The selector used to find the element didn\'t match anything on the page.',
      likelyCause: 'The element may have a different selector, might not be visible, or the page structure changed.',
      suggestedFix: 'Verify the element exists on the page and update the selector if needed.',
      severity: 'medium',
      tips: ['Check if the element is inside an iframe', 'Wait for the page to fully load', 'Try a more specific selector']
    };
  }
  
  if (error.includes('timeout') || error.includes('Timeout')) {
    return {
      summary: 'The operation took too long and timed out',
      whatWentWrong: 'The page or element didn\'t respond within the expected time.',
      likelyCause: 'Slow network, heavy page load, or the element never appeared.',
      suggestedFix: 'Increase timeout values or check if the page loads correctly.',
      severity: 'medium',
      tips: ['Check network conditions', 'Verify the URL is correct', 'Look for JavaScript errors']
    };
  }
  
  if (error.includes('navigation') || error.includes('net::')) {
    return {
      summary: 'Failed to load the page',
      whatWentWrong: 'The browser couldn\'t navigate to or load the target URL.',
      likelyCause: 'The URL might be incorrect, the server is down, or there\'s a network issue.',
      suggestedFix: 'Verify the URL is accessible and the server is running.',
      severity: 'high',
      tips: ['Check if the URL works in a browser', 'Verify server status', 'Check for CORS issues']
    };
  }
  
  // Generic fallback
  return {
    summary: 'The test encountered an unexpected error',
    whatWentWrong: error,
    likelyCause: 'An unexpected condition occurred during test execution.',
    suggestedFix: 'Review the error message and test steps for issues.',
    severity: 'medium',
    tips: ['Check the error screenshot', 'Verify test steps are correct', 'Try running the test manually']
  };
}

module.exports = { explainFailure };
