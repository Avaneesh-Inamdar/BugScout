require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const pageInspector = require('./services/pageInspector');
const testGenerator = require('./services/testGenerator');
const testExecutor = require('./services/testExecutor');
const firestoreService = require('./services/firestoreService');
const accessibilityAuditor = require('./services/accessibilityAuditor');
const testSuggester = require('./services/testSuggester');
const visualDiff = require('./services/visualDiff');
const performanceAnalyzer = require('./services/performanceAnalyzer');
const flowRecorder = require('./services/flowRecorder');

const app = express();
app.use(cors());
app.use(express.json());

// Serve screenshots
app.use('/screenshots', express.static(path.join(__dirname, '../screenshots')));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Generate tests for a URL
app.post('/api/generate-tests', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const runId = uuidv4();
    
    // Step A: Page Inspection
    console.log(`[${runId}] Inspecting page: ${url}`);
    const pageData = await pageInspector.inspect(url);
    
    // Step B & C: AI Test Planning with Fallback
    console.log(`[${runId}] Generating test plan...`);
    const testPlan = await testGenerator.generate(pageData);
    
    // Save to Firestore - store original elements with selectors for execution
    const testRun = {
      id: runId,
      url,
      status: 'pending_review',
      createdAt: new Date().toISOString(),
      pageData: {
        pageType: testPlan.page_type,
        elements: pageData.elements  // Original elements with real selectors
      },
      tests: testPlan.test_plan.map(t => ({
        ...t,
        status: 'pending',
        screenshots: []
      })),
      confidence: testPlan.confidence
    };
    
    await firestoreService.saveTestRun(testRun);
    
    res.json(testRun);
  } catch (error) {
    console.error('Generate tests error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get test run by ID
app.get('/api/test-runs/:id', async (req, res) => {
  try {
    const testRun = await firestoreService.getTestRun(req.params.id);
    if (!testRun) {
      return res.status(404).json({ error: 'Test run not found' });
    }
    res.json(testRun);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all test runs
app.get('/api/test-runs', async (req, res) => {
  try {
    const testRuns = await firestoreService.getAllTestRuns();
    res.json(testRuns);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update test plan (human-in-the-loop editing)
app.put('/api/test-runs/:id', async (req, res) => {
  try {
    const { tests } = req.body;
    await firestoreService.updateTestRun(req.params.id, { tests });
    const updated = await firestoreService.getTestRun(req.params.id);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Execute tests
app.post('/api/test-runs/:id/execute', async (req, res) => {
  try {
    const testRun = await firestoreService.getTestRun(req.params.id);
    if (!testRun) {
      return res.status(404).json({ error: 'Test run not found' });
    }

    await firestoreService.updateTestRun(req.params.id, { status: 'running' });
    
    console.log(`[${req.params.id}] Executing tests...`);
    const results = await testExecutor.execute(testRun);
    
    const finalStatus = results.every(t => t.status === 'pass') ? 'completed' : 'completed_with_failures';
    
    await firestoreService.updateTestRun(req.params.id, {
      status: finalStatus,
      tests: results,
      completedAt: new Date().toISOString()
    });
    
    const updated = await firestoreService.getTestRun(req.params.id);
    res.json(updated);
  } catch (error) {
    console.error('Execute tests error:', error);
    await firestoreService.updateTestRun(req.params.id, { status: 'error', error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Delete test run
app.delete('/api/test-runs/:id', async (req, res) => {
  try {
    await firestoreService.deleteTestRun(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Accessibility Audit
app.post('/api/accessibility-audit', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`[A11y] Auditing: ${url}`);
    const results = await accessibilityAuditor.audit(url);
    res.json(results);
  } catch (error) {
    console.error('Accessibility audit error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Smart Test Suggestions
app.post('/api/suggest-tests', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`[Suggest] Analyzing: ${url}`);
    const pageData = await pageInspector.inspect(url);
    pageData.url = url;
    
    const suggestions = await testSuggester.suggest(pageData);
    res.json({ url, suggestions, pageType: pageData.pageType });
  } catch (error) {
    console.error('Test suggestions error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Visual Regression - Compare screenshots in a test run
app.post('/api/test-runs/:id/visual-diff', async (req, res) => {
  try {
    const testRun = await firestoreService.getTestRun(req.params.id);
    if (!testRun) {
      return res.status(404).json({ error: 'Test run not found' });
    }

    console.log(`[VisualDiff] Comparing screenshots for: ${req.params.id}`);
    const comparisons = await visualDiff.compareTestRun(testRun);
    
    // Save visual diff results to test run
    await firestoreService.updateTestRun(req.params.id, { visualDiff: comparisons });
    
    res.json({ testRunId: req.params.id, comparisons });
  } catch (error) {
    console.error('Visual diff error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Performance Analysis
app.post('/api/performance-audit', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`[Perf] Analyzing: ${url}`);
    const results = await performanceAnalyzer.analyze(url);
    res.json(results);
  } catch (error) {
    console.error('Performance audit error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Flow Recording - Start recording session
app.post('/api/recording/start', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`[Recorder] Starting recording for: ${url}`);
    const session = await flowRecorder.startRecording(url);
    res.json(session);
  } catch (error) {
    console.error('Start recording error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Flow Recording - Get recording status
app.get('/api/recording/:sessionId/status', async (req, res) => {
  try {
    const status = await flowRecorder.getRecordingStatus(req.params.sessionId);
    res.json(status);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

// Flow Recording - Stop and save recording
app.post('/api/recording/:sessionId/stop', async (req, res) => {
  try {
    const { flowName } = req.body;
    console.log(`[Recorder] Stopping recording: ${req.params.sessionId}`);
    const flow = await flowRecorder.stopRecording(req.params.sessionId, flowName);
    
    // Convert to test run and save
    const runId = uuidv4();
    const testRun = flowRecorder.flowToTestRun(flow, runId);
    await firestoreService.saveTestRun(testRun);
    
    res.json({ flow, testRun });
  } catch (error) {
    console.error('Stop recording error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Flow Recording - Cancel recording
app.post('/api/recording/:sessionId/cancel', async (req, res) => {
  try {
    const result = await flowRecorder.cancelRecording(req.params.sessionId);
    res.json(result);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

// Flow Recording - List active sessions
app.get('/api/recording/sessions', (req, res) => {
  const sessions = flowRecorder.listActiveSessions();
  res.json(sessions);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`QA Agent API running on port ${PORT}`);
});
