const { chromium } = require('playwright');

/**
 * Analyze page performance using Google PageSpeed Insights API (primary)
 * with Playwright fallback for when API is unavailable
 */
async function analyze(url) {
  // Try PageSpeed Insights API first (more accurate)
  if (process.env.PAGESPEED_API_KEY) {
    try {
      console.log(`[Perf] Using PageSpeed Insights API for: ${url}`);
      const result = await analyzeWithPageSpeed(url);
      if (result && !result.error) {
        return result;
      }
      console.log('[Perf] PageSpeed API failed, falling back to Playwright');
    } catch (error) {
      console.error('[Perf] PageSpeed API error:', error.message);
    }
  }
  
  // Fallback to Playwright-based analysis
  console.log(`[Perf] Using Playwright analysis for: ${url}`);
  return analyzeWithPlaywright(url);
}

/**
 * Analyze using Google PageSpeed Insights API
 */
async function analyzeWithPageSpeed(url) {
  const apiKey = process.env.PAGESPEED_API_KEY;
  const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&key=${apiKey}&category=performance&category=accessibility&category=best-practices&category=seo&strategy=mobile`;
  
  const response = await fetch(apiUrl);
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `API returned ${response.status}`);
  }
  
  const data = await response.json();
  const lighthouse = data.lighthouseResult;
  
  if (!lighthouse) {
    throw new Error('No Lighthouse data in response');
  }
  
  // Extract scores (0-100)
  const categories = lighthouse.categories || {};
  const audits = lighthouse.audits || {};
  
  // Core Web Vitals from audits
  const fcp = audits['first-contentful-paint']?.numericValue || 0;
  const lcp = audits['largest-contentful-paint']?.numericValue || 0;
  const cls = audits['cumulative-layout-shift']?.numericValue || 0;
  const tbt = audits['total-blocking-time']?.numericValue || 0;
  const si = audits['speed-index']?.numericValue || 0;
  const tti = audits['interactive']?.numericValue || 0;
  
  // Resource metrics
  const totalByteWeight = audits['total-byte-weight']?.numericValue || 0;
  const networkRequests = audits['network-requests']?.details?.items?.length || 0;
  
  // Build results
  const results = {
    url,
    timestamp: new Date().toISOString(),
    source: 'lighthouse',
    score: Math.round((categories.performance?.score || 0) * 100),
    scores: {
      performance: Math.round((categories.performance?.score || 0) * 100),
      accessibility: Math.round((categories.accessibility?.score || 0) * 100),
      bestPractices: Math.round((categories['best-practices']?.score || 0) * 100),
      seo: Math.round((categories.seo?.score || 0) * 100)
    },
    metrics: {
      fcp: Math.round(fcp),
      lcp: Math.round(lcp),
      cls: parseFloat(cls.toFixed(3)),
      tbt: Math.round(tbt),
      si: Math.round(si),
      tti: Math.round(tti),
      totalSize: totalByteWeight,
      totalSizeFormatted: formatBytes(totalByteWeight),
      totalRequests: networkRequests
    },
    recommendations: []
  };
  
  // Extract failed audits as recommendations
  const auditOrder = [
    'render-blocking-resources',
    'uses-responsive-images',
    'offscreen-images',
    'unminified-css',
    'unminified-javascript',
    'unused-css-rules',
    'unused-javascript',
    'uses-optimized-images',
    'uses-webp-images',
    'uses-text-compression',
    'uses-rel-preconnect',
    'server-response-time',
    'redirects',
    'uses-rel-preload',
    'efficient-animated-content',
    'duplicated-javascript',
    'legacy-javascript',
    'dom-size',
    'critical-request-chains',
    'bootup-time',
    'mainthread-work-breakdown',
    'font-display',
    'third-party-summary'
  ];
  
  for (const auditId of auditOrder) {
    const audit = audits[auditId];
    if (audit && audit.score !== null && audit.score < 0.9) {
      const impact = audit.score < 0.5 ? 'high' : audit.score < 0.75 ? 'medium' : 'low';
      results.recommendations.push({
        type: audit.score < 0.5 ? 'critical' : 'warning',
        title: audit.title,
        description: audit.description?.replace(/<[^>]*>/g, '') || '',
        impact,
        savings: audit.details?.overallSavingsMs ? `${Math.round(audit.details.overallSavingsMs)}ms` : null
      });
    }
    
    if (results.recommendations.length >= 8) break;
  }
  
  // Add Core Web Vitals status
  results.coreWebVitals = {
    fcp: { value: results.metrics.fcp, rating: getFcpRating(results.metrics.fcp) },
    lcp: { value: results.metrics.lcp, rating: getLcpRating(results.metrics.lcp) },
    cls: { value: results.metrics.cls, rating: getClsRating(results.metrics.cls) },
    tbt: { value: results.metrics.tbt, rating: getTbtRating(results.metrics.tbt) }
  };
  
  return results;
}

// Rating functions based on Google's thresholds
function getFcpRating(ms) {
  if (ms <= 1800) return 'good';
  if (ms <= 3000) return 'needs-improvement';
  return 'poor';
}

function getLcpRating(ms) {
  if (ms <= 2500) return 'good';
  if (ms <= 4000) return 'needs-improvement';
  return 'poor';
}

function getClsRating(value) {
  if (value <= 0.1) return 'good';
  if (value <= 0.25) return 'needs-improvement';
  return 'poor';
}

function getTbtRating(ms) {
  if (ms <= 200) return 'good';
  if (ms <= 600) return 'needs-improvement';
  return 'poor';
}

/**
 * Fallback: Analyze using Playwright (when API unavailable)
 */
async function analyzeWithPlaywright(url) {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',
      '--no-zygote',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-sync',
      '--disable-translate',
      '--hide-scrollbars',
      '--mute-audio',
      '--no-first-run',
      '--js-flags=--max-old-space-size=256'
    ]
  });

  const results = {
    url,
    timestamp: new Date().toISOString(),
    source: 'playwright',
    score: 0,
    metrics: {},
    resources: {},
    recommendations: []
  };

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.coverage.startJSCoverage();
    await page.coverage.startCSSCoverage();

    const requests = [];
    
    page.on('request', req => {
      requests.push({
        url: req.url(),
        type: req.resourceType(),
        startTime: Date.now()
      });
    });

    page.on('response', async res => {
      const req = requests.find(r => r.url === res.url());
      if (req) {
        req.status = res.status();
        req.endTime = Date.now();
        req.duration = req.endTime - req.startTime;
        const contentLength = res.headers()['content-length'];
        req.size = contentLength ? parseInt(contentLength) : 0;
      }
    });

    const startTime = Date.now();
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    const loadTime = Date.now() - startTime;

    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const performanceTiming = await page.evaluate(() => {
      return new Promise((resolve) => {
        const paint = performance.getEntriesByType('paint');
        const fcp = paint.find(p => p.name === 'first-contentful-paint')?.startTime || 0;
        
        let lcpValue = 0;
        const existingLcp = performance.getEntriesByType('largest-contentful-paint');
        if (existingLcp.length > 0) {
          lcpValue = existingLcp[existingLcp.length - 1].startTime;
        }
        
        let clsValue = 0;
        const layoutShifts = performance.getEntriesByType('layout-shift');
        for (const entry of layoutShifts) {
          if (!entry.hadRecentInput) clsValue += entry.value;
        }

        setTimeout(() => {
          if (lcpValue === 0 && fcp > 0) lcpValue = fcp * 1.3;
          resolve({
            fcp: Math.max(0, fcp),
            lcp: Math.max(0, lcpValue),
            cls: Math.max(0, clsValue)
          });
        }, 500);
      });
    });

    const jsCoverage = await page.coverage.stopJSCoverage();
    const cssCoverage = await page.coverage.stopCSSCoverage();

    let totalJsBytes = 0, usedJsBytes = 0;
    for (const entry of jsCoverage) {
      totalJsBytes += entry.text.length;
      for (const range of entry.ranges) usedJsBytes += range.end - range.start;
    }

    let totalCssBytes = 0, usedCssBytes = 0;
    for (const entry of cssCoverage) {
      totalCssBytes += entry.text.length;
      for (const range of entry.ranges) usedCssBytes += range.end - range.start;
    }

    let totalSize = 0;
    const resourcesByType = {};
    for (const req of requests) {
      if (!resourcesByType[req.type]) {
        resourcesByType[req.type] = { count: 0, size: 0 };
      }
      resourcesByType[req.type].count++;
      resourcesByType[req.type].size += req.size || 0;
      totalSize += req.size || 0;
    }

    results.metrics = {
      loadTime: Math.round(loadTime),
      fcp: Math.round(performanceTiming.fcp),
      lcp: Math.round(performanceTiming.lcp),
      cls: parseFloat(performanceTiming.cls.toFixed(3)),
      totalRequests: requests.length,
      totalSize,
      totalSizeFormatted: formatBytes(totalSize)
    };

    results.coverage = {
      js: { total: totalJsBytes, used: usedJsBytes, usedPercent: totalJsBytes > 0 ? Math.round((usedJsBytes / totalJsBytes) * 100) : 100 },
      css: { total: totalCssBytes, used: usedCssBytes, usedPercent: totalCssBytes > 0 ? Math.round((usedCssBytes / totalCssBytes) * 100) : 100 }
    };

    results.resources = resourcesByType;
    results.score = calculateScore(results.metrics, results.coverage);
    results.recommendations = generateRecommendations(results);
    
    results.coreWebVitals = {
      fcp: { value: results.metrics.fcp, rating: getFcpRating(results.metrics.fcp) },
      lcp: { value: results.metrics.lcp, rating: getLcpRating(results.metrics.lcp) },
      cls: { value: results.metrics.cls, rating: getClsRating(results.metrics.cls) }
    };

    await context.close();
  } catch (error) {
    results.error = error.message;
    results.score = 0;
  } finally {
    await browser.close();
  }

  return results;
}

function calculateScore(metrics, coverage) {
  let score = 100;
  
  if (metrics.fcp > 3000) score -= 25;
  else if (metrics.fcp > 1800) score -= 15;
  else if (metrics.fcp > 1000) score -= 5;

  if (metrics.lcp > 4000) score -= 25;
  else if (metrics.lcp > 2500) score -= 15;
  else if (metrics.lcp > 1500) score -= 5;

  if (metrics.cls > 0.25) score -= 20;
  else if (metrics.cls > 0.1) score -= 10;

  if (metrics.totalSize > 5000000) score -= 15;
  else if (metrics.totalSize > 2000000) score -= 8;

  if (coverage?.js?.usedPercent < 50) score -= 10;
  else if (coverage?.js?.usedPercent < 70) score -= 5;

  return Math.max(0, Math.min(100, score));
}

function generateRecommendations(results) {
  const recs = [];
  const { metrics, coverage } = results;

  if (metrics.fcp > 1800) {
    recs.push({ type: 'critical', title: 'Improve First Contentful Paint', description: `FCP is ${metrics.fcp}ms (target: <1.8s)`, impact: 'high' });
  }
  if (metrics.lcp > 2500) {
    recs.push({ type: 'critical', title: 'Optimize Largest Contentful Paint', description: `LCP is ${metrics.lcp}ms (target: <2.5s)`, impact: 'high' });
  }
  if (metrics.cls > 0.1) {
    recs.push({ type: 'warning', title: 'Reduce Layout Shift', description: `CLS is ${metrics.cls} (target: <0.1)`, impact: 'medium' });
  }
  if (coverage?.js?.usedPercent < 70) {
    recs.push({ type: 'suggestion', title: 'Remove Unused JavaScript', description: `Only ${coverage.js.usedPercent}% of JS is used`, impact: 'medium' });
  }
  if (metrics.totalSize > 2000000) {
    recs.push({ type: 'warning', title: 'Reduce Page Size', description: `Total size is ${metrics.totalSizeFormatted}`, impact: 'high' });
  }

  return recs;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = { analyze };
