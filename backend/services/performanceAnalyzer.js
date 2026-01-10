const { chromium } = require('playwright');

/**
 * Analyze page performance metrics
 */
async function analyze(url) {
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
      // Memory optimization
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

    // Wait for network idle (important for SPAs/dynamic sites)
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    const networkIdleTime = Date.now() - startTime;

    // For dynamic sites, wait a bit more for content to render
    await page.waitForTimeout(2000);

    // Get performance timing from browser with better LCP capture for dynamic sites
    const performanceTiming = await page.evaluate(() => {
      return new Promise((resolve) => {
        const timing = performance.timing;
        const paint = performance.getEntriesByType('paint');
        let lcpValue = 0;
        
        // Get existing LCP entries
        const existingLcp = performance.getEntriesByType('largest-contentful-paint');
        if (existingLcp.length > 0) {
          lcpValue = existingLcp[existingLcp.length - 1].startTime;
        }

        // Set up observer for any new LCP entries (for dynamic content)
        const lcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          if (entries.length > 0) {
            lcpValue = entries[entries.length - 1].startTime;
          }
        });
        
        try {
          lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
        } catch (e) {
          // LCP observer not supported
        }

        // Wait a short time to capture any pending LCP updates
        setTimeout(() => {
          lcpObserver.disconnect();
          
          // Fallback: if no LCP, estimate from DOM content
          if (lcpValue === 0) {
            // Use FCP as fallback, or estimate from domContentLoaded
            const fcp = paint.find(p => p.name === 'first-contentful-paint')?.startTime || 0;
            lcpValue = fcp > 0 ? fcp * 1.2 : (timing.domContentLoadedEventEnd - timing.navigationStart);
          }
          
          resolve({
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
            
            // LCP with fallback
            largestContentfulPaint: lcpValue
          });
        }, 500);
      });
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
  let validMetrics = 0;
  let totalDeductions = 0;

  // FCP scoring (target: < 1.8s)
  if (metrics.fcp > 0) {
    validMetrics++;
    if (metrics.fcp > 3000) totalDeductions += 25;
    else if (metrics.fcp > 1800) totalDeductions += 15;
    else if (metrics.fcp > 1000) totalDeductions += 5;
  }

  // LCP scoring (target: < 2.5s)
  if (metrics.lcp > 0) {
    validMetrics++;
    if (metrics.lcp > 4000) totalDeductions += 25;
    else if (metrics.lcp > 2500) totalDeductions += 15;
    else if (metrics.lcp > 1500) totalDeductions += 5;
  }

  // CLS scoring (target: < 0.1)
  // CLS of 0 is valid and good
  validMetrics++;
  if (metrics.cls > 0.25) totalDeductions += 20;
  else if (metrics.cls > 0.1) totalDeductions += 10;

  // TTFB scoring (target: < 600ms)
  if (metrics.ttfb > 0) {
    validMetrics++;
    if (metrics.ttfb > 1500) totalDeductions += 15;
    else if (metrics.ttfb > 600) totalDeductions += 8;
  }

  // Total size scoring (target: < 2MB)
  if (metrics.totalSize > 0) {
    validMetrics++;
    if (metrics.totalSize > 5000000) totalDeductions += 15;
    else if (metrics.totalSize > 2000000) totalDeductions += 8;
  }

  // Unused code penalty
  if (coverage.js.total > 0) {
    validMetrics++;
    if (coverage.js.usedPercent < 50) totalDeductions += 10;
    else if (coverage.js.usedPercent < 70) totalDeductions += 5;
  }

  // Load time as fallback metric for dynamic sites
  if (metrics.loadTime > 0) {
    validMetrics++;
    if (metrics.loadTime > 5000) totalDeductions += 20;
    else if (metrics.loadTime > 3000) totalDeductions += 10;
    else if (metrics.loadTime > 2000) totalDeductions += 5;
  }

  // If we have very few valid metrics, use load time more heavily
  if (validMetrics < 3 && metrics.loadTime > 0) {
    // Fallback scoring based primarily on load time
    score = 100;
    if (metrics.loadTime > 8000) score = 30;
    else if (metrics.loadTime > 5000) score = 50;
    else if (metrics.loadTime > 3000) score = 70;
    else if (metrics.loadTime > 2000) score = 85;
    else score = 95;
    
    // Still apply some deductions from other metrics
    score -= Math.min(totalDeductions, 30);
  } else {
    score -= totalDeductions;
  }

  return Math.max(0, Math.min(100, score));
}

function generateRecommendations(results) {
  const recs = [];
  const { metrics, coverage, resources } = results;

  // Check if we had trouble capturing metrics (common with dynamic sites)
  if (metrics.fcp === 0 && metrics.lcp === 0) {
    recs.push({
      type: 'info',
      title: 'Limited Metrics Available',
      description: 'Some performance metrics could not be captured. This is common with highly dynamic sites or SPAs. Load time and resource metrics are still available.',
      impact: 'low'
    });
  }

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
