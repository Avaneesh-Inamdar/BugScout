const { chromium } = require('playwright');

/**
 * Analyze page performance metrics
 */
async function analyze(url) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const results = {
    url,
    timestamp: new Date().toISOString(),
    score: 0,
    metrics: {},
    resources: {},
    recommendations: []
  };

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Enable performance tracking
    await page.coverage.startJSCoverage();
    await page.coverage.startCSSCoverage();

    // Track network requests
    const requests = [];
    page.on('request', req => {
      requests.push({
        url: req.url(),
        type: req.resourceType(),
        startTime: Date.now()
      });
    });

    page.on('response', res => {
      const req = requests.find(r => r.url === res.url());
      if (req) {
        req.status = res.status();
        req.size = parseInt(res.headers()['content-length'] || '0');
        req.endTime = Date.now();
        req.duration = req.endTime - req.startTime;
      }
    });

    // Navigate and measure
    const startTime = Date.now();
    
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    const loadTime = Date.now() - startTime;

    // Wait for network idle
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    const networkIdleTime = Date.now() - startTime;

    // Get performance timing from browser
    const performanceTiming = await page.evaluate(() => {
      const timing = performance.timing;
      const paint = performance.getEntriesByType('paint');
      const lcp = performance.getEntriesByType('largest-contentful-paint');
      
      return {
        // Navigation timing
        dns: timing.domainLookupEnd - timing.domainLookupStart,
        tcp: timing.connectEnd - timing.connectStart,
        ttfb: timing.responseStart - timing.requestStart,
        download: timing.responseEnd - timing.responseStart,
        domParsing: timing.domInteractive - timing.responseEnd,
        domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart,
        
        // Paint timing
        firstPaint: paint.find(p => p.name === 'first-paint')?.startTime || 0,
        firstContentfulPaint: paint.find(p => p.name === 'first-contentful-paint')?.startTime || 0,
        
        // LCP (if available)
        largestContentfulPaint: lcp.length > 0 ? lcp[lcp.length - 1].startTime : 0
      };
    });

    // Get CLS (Cumulative Layout Shift)
    const cls = await page.evaluate(() => {
      return new Promise(resolve => {
        let clsValue = 0;
        const observer = new PerformanceObserver(list => {
          for (const entry of list.getEntries()) {
            if (!entry.hadRecentInput) {
              clsValue += entry.value;
            }
          }
        });
        observer.observe({ type: 'layout-shift', buffered: true });
        setTimeout(() => {
          observer.disconnect();
          resolve(clsValue);
        }, 1000);
      });
    }).catch(() => 0);

    // Get coverage data
    const jsCoverage = await page.coverage.stopJSCoverage();
    const cssCoverage = await page.coverage.stopCSSCoverage();

    // Calculate unused code
    let totalJsBytes = 0, usedJsBytes = 0;
    for (const entry of jsCoverage) {
      totalJsBytes += entry.text.length;
      for (const range of entry.ranges) {
        usedJsBytes += range.end - range.start;
      }
    }

    let totalCssBytes = 0, usedCssBytes = 0;
    for (const entry of cssCoverage) {
      totalCssBytes += entry.text.length;
      for (const range of entry.ranges) {
        usedCssBytes += range.end - range.start;
      }
    }

    // Analyze resources
    const resourcesByType = {};
    let totalSize = 0;
    for (const req of requests) {
      if (!resourcesByType[req.type]) {
        resourcesByType[req.type] = { count: 0, size: 0, avgDuration: 0, durations: [] };
      }
      resourcesByType[req.type].count++;
      resourcesByType[req.type].size += req.size || 0;
      if (req.duration) {
        resourcesByType[req.type].durations.push(req.duration);
      }
      totalSize += req.size || 0;
    }

    // Calculate averages
    for (const type in resourcesByType) {
      const durations = resourcesByType[type].durations;
      resourcesByType[type].avgDuration = durations.length > 0 
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 0;
      delete resourcesByType[type].durations;
    }

    // Build metrics
    results.metrics = {
      loadTime: Math.round(loadTime),
      networkIdleTime: Math.round(networkIdleTime),
      ttfb: Math.round(performanceTiming.ttfb),
      fcp: Math.round(performanceTiming.firstContentfulPaint),
      lcp: Math.round(performanceTiming.largestContentfulPaint),
      cls: parseFloat(cls.toFixed(3)),
      domContentLoaded: Math.round(performanceTiming.domContentLoaded),
      totalRequests: requests.length,
      totalSize: totalSize,
      totalSizeFormatted: formatBytes(totalSize)
    };

    // Code coverage
    results.coverage = {
      js: {
        total: totalJsBytes,
        used: usedJsBytes,
        unused: totalJsBytes - usedJsBytes,
        usedPercent: totalJsBytes > 0 ? Math.round((usedJsBytes / totalJsBytes) * 100) : 100
      },
      css: {
        total: totalCssBytes,
        used: usedCssBytes,
        unused: totalCssBytes - usedCssBytes,
        usedPercent: totalCssBytes > 0 ? Math.round((usedCssBytes / totalCssBytes) * 100) : 100
      }
    };

    results.resources = resourcesByType;

    // Calculate score (0-100)
    results.score = calculateScore(results.metrics, results.coverage);

    // Generate recommendations
    results.recommendations = generateRecommendations(results);

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

  // FCP scoring (target: < 1.8s)
  if (metrics.fcp > 3000) score -= 25;
  else if (metrics.fcp > 1800) score -= 15;
  else if (metrics.fcp > 1000) score -= 5;

  // LCP scoring (target: < 2.5s)
  if (metrics.lcp > 4000) score -= 25;
  else if (metrics.lcp > 2500) score -= 15;
  else if (metrics.lcp > 1500) score -= 5;

  // CLS scoring (target: < 0.1)
  if (metrics.cls > 0.25) score -= 20;
  else if (metrics.cls > 0.1) score -= 10;

  // TTFB scoring (target: < 600ms)
  if (metrics.ttfb > 1500) score -= 15;
  else if (metrics.ttfb > 600) score -= 8;

  // Total size scoring (target: < 2MB)
  if (metrics.totalSize > 5000000) score -= 15;
  else if (metrics.totalSize > 2000000) score -= 8;

  // Unused code penalty
  if (coverage.js.usedPercent < 50) score -= 10;
  else if (coverage.js.usedPercent < 70) score -= 5;

  return Math.max(0, Math.min(100, score));
}

function generateRecommendations(results) {
  const recs = [];
  const { metrics, coverage, resources } = results;

  // FCP recommendations
  if (metrics.fcp > 1800) {
    recs.push({
      type: 'critical',
      title: 'Improve First Contentful Paint',
      description: `FCP is ${metrics.fcp}ms (target: <1.8s). Consider reducing render-blocking resources.`,
      impact: 'high'
    });
  }

  // LCP recommendations
  if (metrics.lcp > 2500) {
    recs.push({
      type: 'critical',
      title: 'Optimize Largest Contentful Paint',
      description: `LCP is ${metrics.lcp}ms (target: <2.5s). Optimize images and reduce server response time.`,
      impact: 'high'
    });
  }

  // CLS recommendations
  if (metrics.cls > 0.1) {
    recs.push({
      type: 'warning',
      title: 'Reduce Layout Shift',
      description: `CLS is ${metrics.cls} (target: <0.1). Add size attributes to images and avoid inserting content above existing content.`,
      impact: 'medium'
    });
  }

  // TTFB recommendations
  if (metrics.ttfb > 600) {
    recs.push({
      type: 'warning',
      title: 'Reduce Server Response Time',
      description: `TTFB is ${metrics.ttfb}ms (target: <600ms). Consider using a CDN or optimizing server-side code.`,
      impact: 'medium'
    });
  }

  // Image optimization
  if (resources.image && resources.image.size > 500000) {
    recs.push({
      type: 'suggestion',
      title: 'Optimize Images',
      description: `Images total ${formatBytes(resources.image.size)}. Use WebP format and lazy loading.`,
      impact: 'medium'
    });
  }

  // JavaScript optimization
  if (coverage.js.usedPercent < 70) {
    recs.push({
      type: 'suggestion',
      title: 'Remove Unused JavaScript',
      description: `Only ${coverage.js.usedPercent}% of JavaScript is used. Consider code splitting and tree shaking.`,
      impact: 'medium'
    });
  }

  // CSS optimization
  if (coverage.css.usedPercent < 50) {
    recs.push({
      type: 'suggestion',
      title: 'Remove Unused CSS',
      description: `Only ${coverage.css.usedPercent}% of CSS is used. Use PurgeCSS or similar tools.`,
      impact: 'low'
    });
  }

  // Too many requests
  if (metrics.totalRequests > 50) {
    recs.push({
      type: 'suggestion',
      title: 'Reduce HTTP Requests',
      description: `${metrics.totalRequests} requests made. Bundle resources and use HTTP/2.`,
      impact: 'medium'
    });
  }

  // Large page size
  if (metrics.totalSize > 2000000) {
    recs.push({
      type: 'warning',
      title: 'Reduce Page Size',
      description: `Total page size is ${metrics.totalSizeFormatted}. Target under 2MB for better performance.`,
      impact: 'high'
    });
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
