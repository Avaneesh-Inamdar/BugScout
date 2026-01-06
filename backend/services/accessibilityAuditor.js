const { chromium } = require('playwright');

// WCAG 2.1 checks
const CHECKS = {
  missingAltText: {
    name: 'Missing Alt Text',
    description: 'Images must have alternative text',
    wcag: '1.1.1',
    severity: 'critical',
    selector: 'img:not([alt]), img[alt=""]',
    getMessage: (count) => `${count} image(s) missing alt text`
  },
  emptyLinks: {
    name: 'Empty Links',
    description: 'Links must have discernible text',
    wcag: '2.4.4',
    severity: 'critical',
    selector: 'a:not([aria-label]):empty, a:not([aria-label]):not(:has(img)):not(:has(*:not(:empty)))',
    getMessage: (count) => `${count} link(s) have no accessible text`
  },
  emptyButtons: {
    name: 'Empty Buttons',
    description: 'Buttons must have discernible text',
    wcag: '4.1.2',
    severity: 'critical',
    selector: 'button:empty:not([aria-label]):not([title])',
    getMessage: (count) => `${count} button(s) have no accessible text`
  },
  missingFormLabels: {
    name: 'Missing Form Labels',
    description: 'Form inputs must have associated labels',
    wcag: '1.3.1',
    severity: 'high',
    selector: 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([aria-label]):not([id])',
    getMessage: (count) => `${count} input(s) missing labels`
  },
  missingLangAttribute: {
    name: 'Missing Language',
    description: 'Page must have a lang attribute',
    wcag: '3.1.1',
    severity: 'high',
    selector: 'html:not([lang])',
    getMessage: () => 'Page is missing lang attribute'
  },
  missingDocumentTitle: {
    name: 'Missing Page Title',
    description: 'Page must have a title',
    wcag: '2.4.2',
    severity: 'high',
    check: 'title'
  },
  lowContrastText: {
    name: 'Potential Low Contrast',
    description: 'Text may have insufficient contrast',
    wcag: '1.4.3',
    severity: 'medium',
    check: 'contrast'
  },
  missingSkipLink: {
    name: 'Missing Skip Link',
    description: 'Page should have a skip navigation link',
    wcag: '2.4.1',
    severity: 'low',
    selector: 'a[href="#main"], a[href="#content"], a.skip-link, [class*="skip"]',
    invert: true,
    getMessage: () => 'No skip navigation link found'
  },
  missingHeadingStructure: {
    name: 'Heading Structure',
    description: 'Page should have proper heading hierarchy',
    wcag: '1.3.1',
    severity: 'medium',
    check: 'headings'
  },
  autoplayMedia: {
    name: 'Autoplay Media',
    description: 'Media should not autoplay',
    wcag: '1.4.2',
    severity: 'medium',
    selector: 'video[autoplay], audio[autoplay]',
    getMessage: (count) => `${count} media element(s) with autoplay`
  }
};

async function audit(url) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const results = {
    url,
    timestamp: new Date().toISOString(),
    score: 100,
    issues: [],
    passed: [],
    summary: { critical: 0, high: 0, medium: 0, low: 0 }
  };

  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    // Run each check
    for (const [key, check] of Object.entries(CHECKS)) {
      const issue = await runCheck(page, key, check);
      if (issue) {
        results.issues.push(issue);
        results.summary[issue.severity]++;
      } else {
        results.passed.push({ name: check.name, wcag: check.wcag });
      }
    }

    // Calculate score
    const deductions = {
      critical: 25,
      high: 15,
      medium: 8,
      low: 3
    };
    
    let totalDeduction = 0;
    for (const issue of results.issues) {
      totalDeduction += deductions[issue.severity] || 5;
    }
    results.score = Math.max(0, 100 - totalDeduction);

  } catch (error) {
    results.error = error.message;
    results.score = 0;
  } finally {
    await browser.close();
  }

  return results;
}

async function runCheck(page, key, check) {
  try {
    // Special checks
    if (check.check === 'title') {
      const title = await page.title();
      if (!title || title.trim() === '') {
        return {
          id: key,
          name: check.name,
          description: check.description,
          wcag: check.wcag,
          severity: check.severity,
          message: 'Page has no title or empty title',
          elements: []
        };
      }
      return null;
    }

    if (check.check === 'headings') {
      const headings = await page.$$eval('h1, h2, h3, h4, h5, h6', els => 
        els.map(el => ({ tag: el.tagName, text: el.textContent?.trim().substring(0, 50) }))
      );
      
      const h1Count = headings.filter(h => h.tag === 'H1').length;
      if (h1Count === 0) {
        return {
          id: key,
          name: check.name,
          description: check.description,
          wcag: check.wcag,
          severity: check.severity,
          message: 'Page has no H1 heading',
          elements: []
        };
      }
      if (h1Count > 1) {
        return {
          id: key,
          name: check.name,
          description: check.description,
          wcag: check.wcag,
          severity: 'low',
          message: `Page has ${h1Count} H1 headings (should have 1)`,
          elements: []
        };
      }
      return null;
    }

    if (check.check === 'contrast') {
      // Basic contrast check - look for light gray text
      const lowContrastElements = await page.$$eval('*', els => {
        const issues = [];
        for (const el of els.slice(0, 100)) { // Limit for performance
          const style = window.getComputedStyle(el);
          const color = style.color;
          const bg = style.backgroundColor;
          
          // Simple check for very light text
          if (color && color.includes('rgb')) {
            const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
            if (match) {
              const [, r, g, b] = match.map(Number);
              // Check if text is very light gray
              if (r > 200 && g > 200 && b > 200) {
                const text = el.textContent?.trim().substring(0, 30);
                if (text) {
                  issues.push({ text, color });
                }
              }
            }
          }
        }
        return issues.slice(0, 5);
      });

      if (lowContrastElements.length > 0) {
        return {
          id: key,
          name: check.name,
          description: check.description,
          wcag: check.wcag,
          severity: check.severity,
          message: `${lowContrastElements.length} element(s) may have low contrast`,
          elements: lowContrastElements
        };
      }
      return null;
    }

    // Selector-based checks
    if (check.selector) {
      const elements = await page.$$(check.selector);
      const count = elements.length;

      if (check.invert) {
        // For checks where we want to find AT LEAST one element
        if (count === 0) {
          return {
            id: key,
            name: check.name,
            description: check.description,
            wcag: check.wcag,
            severity: check.severity,
            message: check.getMessage(count),
            elements: []
          };
        }
      } else {
        // For checks where we want to find NO elements
        if (count > 0) {
          const elementDetails = await Promise.all(
            elements.slice(0, 5).map(async (el) => {
              return await el.evaluate(e => ({
                tag: e.tagName,
                text: e.textContent?.trim().substring(0, 30) || '',
                html: e.outerHTML.substring(0, 100)
              }));
            })
          );

          return {
            id: key,
            name: check.name,
            description: check.description,
            wcag: check.wcag,
            severity: check.severity,
            message: check.getMessage(count),
            count,
            elements: elementDetails
          };
        }
      }
    }

    return null;
  } catch (error) {
    console.error(`Check ${key} failed:`, error.message);
    return null;
  }
}

module.exports = { audit };
