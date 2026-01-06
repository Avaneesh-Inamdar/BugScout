import React, { useState, useEffect } from 'react';
import './firebase';

const API_URL = process.env.REACT_APP_API_URL || '';

function App() {
  const [url, setUrl] = useState('');
  const [testRuns, setTestRuns] = useState([]);
  const [currentRun, setCurrentRun] = useState(null);
  const [loading, setLoading] = useState(false);
  const [modalImage, setModalImage] = useState(null);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('darkMode') === 'true');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [testPreset, setTestPreset] = useState('auto');
  const [a11yResults, setA11yResults] = useState(null);
  const [a11yLoading, setA11yLoading] = useState(false);
  const [suggestions, setSuggestions] = useState(null);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [visualDiff, setVisualDiff] = useState(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [perfResults, setPerfResults] = useState(null);
  const [perfLoading, setPerfLoading] = useState(false);
  const [recordingSession, setRecordingSession] = useState(null);
  const [recordingLoading, setRecordingLoading] = useState(false);
  const [flowName, setFlowName] = useState('');

  useEffect(() => {
    fetchTestRuns();
    document.body.classList.toggle('dark', darkMode);
  }, [darkMode]);

  const fetchTestRuns = async () => {
    try {
      const res = await fetch(`${API_URL}/api/test-runs`);
      const data = await res.json();
      setTestRuns(data);
    } catch (err) {
      console.error('Failed to fetch test runs:', err);
    }
  };

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
    localStorage.setItem('darkMode', !darkMode);
  };

  const generateTests = async (presetType = testPreset) => {
    if (!url) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/generate-tests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, preset: presetType })
      });
      const data = await res.json();
      setCurrentRun(data);
      setActiveTab('editor');
      fetchTestRuns();
    } catch (err) {
      alert('Failed to generate tests: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const executeTests = async () => {
    if (!currentRun) return;
    setLoading(true);
    try {
      await saveChanges();
      const res = await fetch(`${API_URL}/api/test-runs/${currentRun.id}/execute`, {
        method: 'POST'
      });
      const data = await res.json();
      setCurrentRun(data);
      fetchTestRuns();
    } catch (err) {
      alert('Failed to execute tests: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const updateTest = (testIdx, field, value) => {
    const updated = { ...currentRun };
    updated.tests[testIdx][field] = value;
    setCurrentRun(updated);
  };

  const updateStep = (testIdx, stepIdx, field, value) => {
    const updated = { ...currentRun };
    updated.tests[testIdx].steps[stepIdx][field] = value;
    setCurrentRun(updated);
  };

  const addStep = (testIdx) => {
    const updated = { ...currentRun };
    updated.tests[testIdx].steps.push({ action: 'click', target: '', value: '' });
    setCurrentRun(updated);
  };

  const removeStep = (testIdx, stepIdx) => {
    const updated = { ...currentRun };
    updated.tests[testIdx].steps.splice(stepIdx, 1);
    setCurrentRun(updated);
  };

  const deleteTest = (testIdx) => {
    if (!window.confirm('Delete this test?')) return;
    const updated = { ...currentRun };
    updated.tests.splice(testIdx, 1);
    setCurrentRun(updated);
  };

  const addCustomTest = () => {
    const newTest = {
      id: `custom_${Date.now()}`,
      type: 'custom',
      name: 'New Custom Test',
      steps: [{ action: 'click', target: '', value: '' }],
      expected: 'Custom test expectation',
      status: 'pending',
      screenshots: []
    };
    const updated = { ...currentRun };
    updated.tests.push(newTest);
    setCurrentRun(updated);
  };

  const saveChanges = async () => {
    try {
      await fetch(`${API_URL}/api/test-runs/${currentRun.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tests: currentRun.tests })
      });
    } catch (err) {
      alert('Failed to save: ' + err.message);
    }
  };

  const loadRun = async (id) => {
    try {
      const res = await fetch(`${API_URL}/api/test-runs/${id}`);
      const data = await res.json();
      setCurrentRun(data);
      setActiveTab('editor');
    } catch (err) {
      console.error('Failed to load run:', err);
    }
  };

  const deleteRun = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this test run?')) return;
    try {
      await fetch(`${API_URL}/api/test-runs/${id}`, { method: 'DELETE' });
      if (currentRun?.id === id) setCurrentRun(null);
      fetchTestRuns();
    } catch (err) {
      alert('Failed to delete: ' + err.message);
    }
  };

  const exportResults = () => {
    if (!currentRun) return;
    const report = {
      ...currentRun,
      exportedAt: new Date().toISOString(),
      summary: {
        total: currentRun.tests.length,
        passed: currentRun.tests.filter(t => t.status === 'pass').length,
        failed: currentRun.tests.filter(t => t.status === 'fail').length
      }
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `test-report-${currentRun.id}.json`;
    a.click();
  };

  const runAccessibilityAudit = async () => {
    if (!url) return;
    setA11yLoading(true);
    setA11yResults(null);
    try {
      const res = await fetch(`${API_URL}/api/accessibility-audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const data = await res.json();
      setA11yResults(data);
    } catch (err) {
      alert('Accessibility audit failed: ' + err.message);
    } finally {
      setA11yLoading(false);
    }
  };

  const getScoreColor = (score) => {
    if (score >= 90) return 'score-excellent';
    if (score >= 70) return 'score-good';
    if (score >= 50) return 'score-fair';
    return 'score-poor';
  };

  const getTestSuggestions = async () => {
    if (!url) return;
    setSuggestLoading(true);
    setSuggestions(null);
    try {
      const res = await fetch(`${API_URL}/api/suggest-tests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const data = await res.json();
      setSuggestions(data);
    } catch (err) {
      alert('Failed to get suggestions: ' + err.message);
    } finally {
      setSuggestLoading(false);
    }
  };

  const getCategoryIcon = (category) => {
    const icons = {
      security: '🔒',
      boundary: '📏',
      edge_case: '🎯',
      ux: '✨',
      business_logic: '💼'
    };
    return icons[category] || '📋';
  };

  const getPriorityColor = (priority) => {
    const colors = { high: 'priority-high', medium: 'priority-medium', low: 'priority-low' };
    return colors[priority] || '';
  };

  const runVisualDiff = async () => {
    if (!currentRun) return;
    setDiffLoading(true);
    setVisualDiff(null);
    try {
      const res = await fetch(`${API_URL}/api/test-runs/${currentRun.id}/visual-diff`, {
        method: 'POST'
      });
      const data = await res.json();
      setVisualDiff(data);
    } catch (err) {
      alert('Visual diff failed: ' + err.message);
    } finally {
      setDiffLoading(false);
    }
  };

  const runPerformanceAudit = async () => {
    if (!url) return;
    setPerfLoading(true);
    setPerfResults(null);
    try {
      const res = await fetch(`${API_URL}/api/performance-audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const data = await res.json();
      setPerfResults(data);
    } catch (err) {
      alert('Performance audit failed: ' + err.message);
    } finally {
      setPerfLoading(false);
    }
  };

  const getPerfScoreColor = (score) => {
    if (score >= 90) return 'perf-excellent';
    if (score >= 50) return 'perf-average';
    return 'perf-poor';
  };

  // Flow Recording Functions
  const startRecording = async () => {
    if (!url) return;
    setRecordingLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/recording/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setRecordingSession(data);
      // Start polling for status
      pollRecordingStatus(data.sessionId);
    } catch (err) {
      alert('Failed to start recording: ' + err.message);
    } finally {
      setRecordingLoading(false);
    }
  };

  const pollRecordingStatus = async (sessionId) => {
    const poll = async () => {
      if (!sessionId) return;
      try {
        const res = await fetch(`${API_URL}/api/recording/${sessionId}/status`);
        const data = await res.json();
        if (data.error) {
          setRecordingSession(null);
          return;
        }
        setRecordingSession(data);
      } catch (err) {
        console.error('Polling error:', err);
      }
    };
    
    // Poll every 2 seconds while recording
    const interval = setInterval(async () => {
      if (!recordingSession || recordingSession.status !== 'recording') {
        clearInterval(interval);
        return;
      }
      await poll();
    }, 2000);
    
    // Initial poll
    await poll();
  };

  const stopRecording = async () => {
    if (!recordingSession?.sessionId) return;
    setRecordingLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/recording/${recordingSession.sessionId}/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flowName: flowName || 'Recorded Flow' })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      setRecordingSession(null);
      setFlowName('');
      setCurrentRun(data.testRun);
      setActiveTab('editor');
      fetchTestRuns();
      alert('Recording saved! You can now edit and run the test.');
    } catch (err) {
      alert('Failed to stop recording: ' + err.message);
    } finally {
      setRecordingLoading(false);
    }
  };

  const cancelRecording = async () => {
    if (!recordingSession?.sessionId) return;
    try {
      await fetch(`${API_URL}/api/recording/${recordingSession.sessionId}/cancel`, {
        method: 'POST'
      });
      setRecordingSession(null);
      setFlowName('');
    } catch (err) {
      console.error('Cancel error:', err);
      setRecordingSession(null);
    }
  };

  const getMetricStatus = (metric, value) => {
    const thresholds = {
      fcp: { good: 1800, poor: 3000 },
      lcp: { good: 2500, poor: 4000 },
      cls: { good: 0.1, poor: 0.25 },
      ttfb: { good: 600, poor: 1500 }
    };
    const t = thresholds[metric];
    if (!t) return 'neutral';
    if (value <= t.good) return 'good';
    if (value <= t.poor) return 'average';
    return 'poor';
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStatusClass = (status) => {
    if (status === 'pass' || status === 'completed') return 'status-pass';
    if (status === 'fail' || status === 'completed_with_failures') return 'status-fail';
    if (status === 'running') return 'status-running';
    return 'status-pending';
  };

  // Stats calculations
  const stats = {
    totalRuns: testRuns.length,
    passed: testRuns.filter(r => r.status === 'completed').length,
    failed: testRuns.filter(r => r.status === 'completed_with_failures').length,
    pending: testRuns.filter(r => r.status === 'pending_review').length
  };

  const elements = currentRun?.pageData?.elements || [];

  const presets = [
    { id: 'auto', name: 'Auto Detect', icon: '🤖', desc: 'AI analyzes the page' },
    { id: 'login', name: 'Login Flow', icon: '🔐', desc: 'Email, password, submit' },
    { id: 'signup', name: 'Signup Flow', icon: '📝', desc: 'Registration forms' },
    { id: 'checkout', name: 'Checkout', icon: '🛒', desc: 'Payment flows' },
    { id: 'search', name: 'Search', icon: '🔍', desc: 'Search functionality' }
  ];

  return (
    <div className={`app ${darkMode ? 'dark' : ''}`}>
      <nav className="navbar">
        <div className="nav-brand">
          <span className="logo">🔬</span>
          <span className="brand-text">BugScout</span>
        </div>
        <div className="nav-tabs">
          <button 
            className={`nav-tab ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            📊 Dashboard
          </button>
          <button 
            className={`nav-tab ${activeTab === 'new' ? 'active' : ''}`}
            onClick={() => setActiveTab('new')}
          >
            ➕ New Test
          </button>
          {currentRun && (
            <button 
              className={`nav-tab ${activeTab === 'editor' ? 'active' : ''}`}
              onClick={() => setActiveTab('editor')}
            >
              ✏️ Editor
            </button>
          )}
          <button 
            className={`nav-tab ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            📜 History
          </button>
          <button 
            className={`nav-tab ${activeTab === 'accessibility' ? 'active' : ''}`}
            onClick={() => setActiveTab('accessibility')}
          >
            ♿ Accessibility
          </button>
          <button 
            className={`nav-tab ${activeTab === 'suggestions' ? 'active' : ''}`}
            onClick={() => setActiveTab('suggestions')}
          >
            💡 Suggestions
          </button>
          <button 
            className={`nav-tab ${activeTab === 'performance' ? 'active' : ''}`}
            onClick={() => setActiveTab('performance')}
          >
            ⚡ Performance
          </button>
          <button 
            className={`nav-tab ${activeTab === 'recorder' ? 'active' : ''}`}
            onClick={() => setActiveTab('recorder')}
          >
            🎬 Recorder
          </button>
        </div>
        <button className="theme-toggle" onClick={toggleDarkMode}>
          {darkMode ? '☀️' : '🌙'}
        </button>
      </nav>

      <main className="main-content">
        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <div className="dashboard">
            <h1>Welcome to BugScout</h1>
            <p className="subtitle">AI-powered autonomous QA testing</p>
            
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon">📋</div>
                <div className="stat-value">{stats.totalRuns}</div>
                <div className="stat-label">Total Tests</div>
              </div>
              <div className="stat-card success">
                <div className="stat-icon">✅</div>
                <div className="stat-value">{stats.passed}</div>
                <div className="stat-label">Passed</div>
              </div>
              <div className="stat-card danger">
                <div className="stat-icon">❌</div>
                <div className="stat-value">{stats.failed}</div>
                <div className="stat-label">Failed</div>
              </div>
              <div className="stat-card warning">
                <div className="stat-icon">⏳</div>
                <div className="stat-value">{stats.pending}</div>
                <div className="stat-label">Pending</div>
              </div>
            </div>

            <div className="quick-start">
              <h2>Quick Start</h2>
              <div className="input-group-large">
                <input
                  type="url"
                  placeholder="Paste any URL to start testing..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && generateTests()}
                />
                <button 
                  className="btn btn-primary btn-large" 
                  onClick={() => generateTests()}
                  disabled={loading || !url}
                >
                  {loading ? <span className="spinner"></span> : '🚀'} Start Testing
                </button>
              </div>
            </div>

            {testRuns.length > 0 && (
              <div className="recent-tests">
                <h2>Recent Tests</h2>
                <div className="recent-grid">
                  {testRuns.slice(0, 4).map(run => (
                    <div key={run.id} className="recent-card" onClick={() => loadRun(run.id)}>
                      <div className="recent-url">{new URL(run.url).hostname}</div>
                      <div className="recent-meta">
                        <span className={`status-dot ${getStatusClass(run.status)}`}></span>
                        <span>{new Date(run.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* New Test Tab */}
        {activeTab === 'new' && (
          <div className="new-test">
            <h1>Create New Test</h1>
            <p className="subtitle">Enter a URL and choose a testing strategy</p>

            <div className="card">
              <label className="input-label">Target URL</label>
              <div className="input-group-large">
                <input
                  type="url"
                  placeholder="https://example.com/login"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>
            </div>

            <div className="card">
              <label className="input-label">Test Preset</label>
              <div className="preset-grid">
                {presets.map(preset => (
                  <div 
                    key={preset.id}
                    className={`preset-card ${testPreset === preset.id ? 'selected' : ''}`}
                    onClick={() => setTestPreset(preset.id)}
                  >
                    <div className="preset-icon">{preset.icon}</div>
                    <div className="preset-name">{preset.name}</div>
                    <div className="preset-desc">{preset.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            <button 
              className="btn btn-primary btn-large btn-full"
              onClick={() => generateTests()}
              disabled={loading || !url}
            >
              {loading ? <><span className="spinner"></span> Analyzing Page...</> : '🔬 Generate Test Plan'}
            </button>
          </div>
        )}

        {/* Editor Tab */}
        {activeTab === 'editor' && currentRun && (
          <div className="editor">
            <div className="editor-header">
              <div>
                <h1>{new URL(currentRun.url).hostname}</h1>
                <p className="subtitle">{currentRun.url}</p>
              </div>
              <div className="editor-actions">
                <button className="btn btn-outline" onClick={exportResults}>
                  📥 Export
                </button>
                <button 
                  className="btn btn-outline" 
                  onClick={runVisualDiff}
                  disabled={diffLoading || currentRun.status === 'pending_review'}
                >
                  {diffLoading ? <span className="spinner"></span> : '🔍'} Visual Diff
                </button>
                <button className="btn btn-secondary" onClick={addCustomTest}>
                  ➕ Add Test
                </button>
                <button 
                  className="btn btn-success"
                  onClick={executeTests}
                  disabled={loading}
                >
                  {loading ? <span className="spinner"></span> : '▶️'} Run All
                </button>
              </div>
            </div>

            <div className="editor-meta">
              <span className={`status-badge ${getStatusClass(currentRun.status)}`}>
                {currentRun.status.replace(/_/g, ' ')}
              </span>
              <span className="meta-item">📄 {currentRun.pageData?.pageType || 'Unknown'} page</span>
              <span className="meta-item">🧪 {currentRun.tests.length} tests</span>
              {currentRun.confidence && (
                <span className="meta-item">🎯 {(currentRun.confidence * 100).toFixed(0)}% confidence</span>
              )}
            </div>

            <div className="test-list">
              {currentRun.tests.map((test, tIdx) => (
                <div key={test.id} className={`test-card ${test.type === 'custom' ? 'custom' : ''}`}>
                  <div className="test-card-header">
                    <input
                      className="test-name-input"
                      value={test.name}
                      onChange={(e) => updateTest(tIdx, 'name', e.target.value)}
                    />
                    <div className="test-badges">
                      <span className={`type-badge ${test.type}`}>
                        {test.type === 'custom' ? '🛠️' : test.type === 'negative' ? '⚠️' : '✓'} {test.type}
                      </span>
                      <span className={`status-badge sm ${getStatusClass(test.status)}`}>
                        {test.status}
                      </span>
                      <button className="btn-icon" onClick={() => deleteTest(tIdx)}>🗑️</button>
                    </div>
                  </div>

                  <div className="steps-container">
                    {test.steps.map((step, sIdx) => (
                      <div key={sIdx} className="step-row">
                        <span className="step-number">{sIdx + 1}</span>
                        <select
                          value={step.action}
                          onChange={(e) => updateStep(tIdx, sIdx, 'action', e.target.value)}
                          className="step-action"
                        >
                          <option value="click">Click</option>
                          <option value="type">Type</option>
                          <option value="wait">Wait</option>
                          <option value="assert">Assert</option>
                        </select>
                        <select
                          value={step.target}
                          onChange={(e) => updateStep(tIdx, sIdx, 'target', e.target.value)}
                          className="step-target"
                        >
                          <option value="">Select element...</option>
                          {elements.map(el => (
                            <option key={el.id} value={el.id}>
                              {el.id}: {el.role || el.tagName} {el.visibleText ? `"${el.visibleText.substring(0,15)}"` : ''} {el.placeholder ? `[${el.placeholder}]` : ''}
                            </option>
                          ))}
                        </select>
                        {(step.action === 'type' || step.action === 'wait') && (
                          <input
                            placeholder={step.action === 'wait' ? 'ms' : 'Value'}
                            value={step.value || ''}
                            onChange={(e) => updateStep(tIdx, sIdx, 'value', e.target.value)}
                            className="step-value"
                          />
                        )}
                        <button className="btn-icon sm" onClick={() => removeStep(tIdx, sIdx)}>✕</button>
                      </div>
                    ))}
                    <button className="btn btn-ghost" onClick={() => addStep(tIdx)}>+ Add Step</button>
                  </div>

                  <div className="expected-section">
                    <label>Expected Result:</label>
                    <input
                      value={test.expected || ''}
                      onChange={(e) => updateTest(tIdx, 'expected', e.target.value)}
                      placeholder="What should happen after these steps?"
                    />
                  </div>

                  {test.error && <div className="error-box">❌ {test.error}</div>}

                  {test.explanation && (
                    <div className="ai-explanation">
                      <div className="explanation-header">
                        <span className="ai-badge">🤖 AI Analysis</span>
                        <span className={`severity-badge ${test.explanation.severity}`}>
                          {test.explanation.severity}
                        </span>
                      </div>
                      <p className="explanation-summary">{test.explanation.summary}</p>
                      <div className="explanation-details">
                        <div className="explanation-item">
                          <strong>What went wrong:</strong>
                          <p>{test.explanation.whatWentWrong}</p>
                        </div>
                        <div className="explanation-item">
                          <strong>Likely cause:</strong>
                          <p>{test.explanation.likelyCause}</p>
                        </div>
                        <div className="explanation-item">
                          <strong>Suggested fix:</strong>
                          <p>{test.explanation.suggestedFix}</p>
                        </div>
                        {test.explanation.tips?.length > 0 && (
                          <div className="explanation-tips">
                            <strong>Tips:</strong>
                            <ul>
                              {test.explanation.tips.map((tip, i) => (
                                <li key={i}>{tip}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {test.screenshots?.length > 0 && (
                    <div className="screenshots-row">
                      {test.screenshots.map((src, i) => (
                        <img
                          key={i}
                          src={`${API_URL}${src}`}
                          alt={`Screenshot ${i + 1}`}
                          className="screenshot-thumb"
                          onClick={() => setModalImage(`${API_URL}${src}`)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Visual Diff Results */}
            {visualDiff && visualDiff.comparisons?.length > 0 && (
              <div className="visual-diff-section">
                <h2>🔍 Visual Regression Results</h2>
                <div className="diff-grid">
                  {visualDiff.comparisons.map((comp, idx) => (
                    <div key={idx} className={`diff-card ${comp.status}`}>
                      <div className="diff-header">
                        <h3>{comp.testName}</h3>
                        <span className={`diff-status ${comp.status}`}>
                          {comp.status === 'changed' ? `${comp.diffPercent}% changed` : 
                           comp.status === 'unchanged' ? 'No changes' : 'Error'}
                        </span>
                      </div>
                      {comp.error ? (
                        <p className="diff-error">{comp.error}</p>
                      ) : (
                        <div className="diff-images">
                          <div className="diff-image-container">
                            <span className="diff-label">Before</span>
                            <img 
                              src={`${API_URL}${comp.beforeImage}`} 
                              alt="Before"
                              onClick={() => setModalImage(`${API_URL}${comp.beforeImage}`)}
                            />
                          </div>
                          <div className="diff-image-container">
                            <span className="diff-label">After</span>
                            <img 
                              src={`${API_URL}${comp.afterImage}`} 
                              alt="After"
                              onClick={() => setModalImage(`${API_URL}${comp.afterImage}`)}
                            />
                          </div>
                          <div className="diff-image-container highlight">
                            <span className="diff-label">Diff</span>
                            <img 
                              src={`${API_URL}${comp.diffImage}`} 
                              alt="Diff"
                              onClick={() => setModalImage(`${API_URL}${comp.diffImage}`)}
                            />
                          </div>
                        </div>
                      )}
                      {comp.diffPixels > 0 && (
                        <div className="diff-stats">
                          <span>{comp.diffPixels.toLocaleString()} pixels changed</span>
                          <span>{comp.width}x{comp.height}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div className="history">
            <h1>Test History</h1>
            <p className="subtitle">{testRuns.length} test runs</p>

            {testRuns.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📭</div>
                <p>No tests yet. Create your first test!</p>
                <button className="btn btn-primary" onClick={() => setActiveTab('new')}>
                  Create Test
                </button>
              </div>
            ) : (
              <div className="history-table">
                {testRuns.map(run => (
                  <div 
                    key={run.id} 
                    className={`history-row ${currentRun?.id === run.id ? 'active' : ''}`}
                    onClick={() => loadRun(run.id)}
                  >
                    <div className="history-main">
                      <div className="history-url">{run.url}</div>
                      <div className="history-date">{new Date(run.createdAt).toLocaleString()}</div>
                    </div>
                    <div className="history-stats">
                      <span className="test-count">{run.tests?.length || 0} tests</span>
                      <span className={`status-badge ${getStatusClass(run.status)}`}>
                        {run.status.replace(/_/g, ' ')}
                      </span>
                      <button 
                        className="btn-icon danger"
                        onClick={(e) => deleteRun(run.id, e)}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

            {/* Suggestions Tab */}
      {activeTab === 'suggestions' && (
        <main className="main-content">
          <div className="suggestions-page">
            <h1>💡 Smart Test Suggestions</h1>
            <p className="subtitle">AI-powered edge cases and security tests you might miss</p>

            <div className="card">
              <label className="input-label">Website URL</label>
              <div className="input-group-large">
                <input
                  type="url"
                  placeholder="https://example.com/login"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && getTestSuggestions()}
                />
                <button 
                  className="btn btn-primary btn-large"
                  onClick={getTestSuggestions}
                  disabled={suggestLoading || !url}
                >
                  {suggestLoading ? <><span className="spinner"></span> Analyzing...</> : '🧠 Get Suggestions'}
                </button>
              </div>
            </div>

            {suggestions && (
              <div className="suggestions-results">
                <div className="suggestions-header">
                  <h2>Found {suggestions.suggestions?.length || 0} Test Ideas</h2>
                  <span className="page-type-badge">📄 {suggestions.pageType || 'Unknown'} page</span>
                </div>

                <div className="suggestions-grid">
                  {suggestions.suggestions?.map((suggestion, idx) => (
                    <div key={idx} className={`suggestion-card ${suggestion.category}`}>
                      <div className="suggestion-top">
                        <span className="category-icon">{getCategoryIcon(suggestion.category)}</span>
                        <span className={`priority-badge ${getPriorityColor(suggestion.priority)}`}>
                          {suggestion.priority}
                        </span>
                        {suggestion.source === 'ai' && <span className="ai-tag">🤖 AI</span>}
                      </div>
                      <h3>{suggestion.title}</h3>
                      <p className="suggestion-desc">{suggestion.description}</p>
                      
                      <div className="suggestion-steps">
                        <strong>Test Steps:</strong>
                        <ol>
                          {suggestion.testSteps?.map((step, i) => (
                            <li key={i}>{step}</li>
                          ))}
                        </ol>
                      </div>

                      <div className="suggestion-risk">
                        <span className="risk-icon">⚠️</span>
                        <span>{suggestion.risk}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </main>
      )}

      {/* Performance Tab */}
      {activeTab === 'performance' && (
        <main className="main-content">
          <div className="performance-page">
            <h1>⚡ Performance Insights</h1>
            <p className="subtitle">Measure Core Web Vitals and get optimization recommendations</p>

            <div className="card">
              <label className="input-label">Website URL</label>
              <div className="input-group-large">
                <input
                  type="url"
                  placeholder="https://example.com"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && runPerformanceAudit()}
                />
                <button 
                  className="btn btn-primary btn-large"
                  onClick={runPerformanceAudit}
                  disabled={perfLoading || !url}
                >
                  {perfLoading ? <><span className="spinner"></span> Analyzing...</> : '📊 Analyze Performance'}
                </button>
              </div>
            </div>

            {perfResults && (
              <>
                <div className="perf-score-section">
                  <div className={`perf-score-circle ${getPerfScoreColor(perfResults.score)}`}>
                    <span className="perf-score-value">{perfResults.score}</span>
                  </div>
                  <div className="perf-score-info">
                    <h2>Performance Score</h2>
                    <p>{perfResults.url}</p>
                    <div className="perf-quick-stats">
                      <span>📦 {perfResults.metrics.totalSizeFormatted}</span>
                      <span>🔗 {perfResults.metrics.totalRequests} requests</span>
                      <span>⏱️ {perfResults.metrics.loadTime}ms load</span>
                    </div>
                  </div>
                </div>

                <div className="metrics-grid">
                  <div className={`metric-card ${getMetricStatus('fcp', perfResults.metrics.fcp)}`}>
                    <div className="metric-label">First Contentful Paint</div>
                    <div className="metric-value">{perfResults.metrics.fcp}ms</div>
                    <div className="metric-target">Target: &lt;1.8s</div>
                  </div>
                  <div className={`metric-card ${getMetricStatus('lcp', perfResults.metrics.lcp)}`}>
                    <div className="metric-label">Largest Contentful Paint</div>
                    <div className="metric-value">{perfResults.metrics.lcp}ms</div>
                    <div className="metric-target">Target: &lt;2.5s</div>
                  </div>
                  <div className={`metric-card ${getMetricStatus('cls', perfResults.metrics.cls)}`}>
                    <div className="metric-label">Cumulative Layout Shift</div>
                    <div className="metric-value">{perfResults.metrics.cls}</div>
                    <div className="metric-target">Target: &lt;0.1</div>
                  </div>
                  <div className={`metric-card ${getMetricStatus('ttfb', perfResults.metrics.ttfb)}`}>
                    <div className="metric-label">Time to First Byte</div>
                    <div className="metric-value">{perfResults.metrics.ttfb}ms</div>
                    <div className="metric-target">Target: &lt;600ms</div>
                  </div>
                </div>

                {perfResults.coverage && (
                  <div className="card">
                    <h2>📦 Code Coverage</h2>
                    <div className="coverage-bars">
                      <div className="coverage-item">
                        <div className="coverage-label">
                          <span>JavaScript</span>
                          <span>{perfResults.coverage.js.usedPercent}% used</span>
                        </div>
                        <div className="coverage-bar">
                          <div 
                            className="coverage-fill js" 
                            style={{ width: `${perfResults.coverage.js.usedPercent}%` }}
                          ></div>
                        </div>
                      </div>
                      <div className="coverage-item">
                        <div className="coverage-label">
                          <span>CSS</span>
                          <span>{perfResults.coverage.css.usedPercent}% used</span>
                        </div>
                        <div className="coverage-bar">
                          <div 
                            className="coverage-fill css" 
                            style={{ width: `${perfResults.coverage.css.usedPercent}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {perfResults.recommendations?.length > 0 && (
                  <div className="card">
                    <h2>💡 Recommendations</h2>
                    <div className="perf-recommendations">
                      {perfResults.recommendations.map((rec, idx) => (
                        <div key={idx} className={`perf-rec ${rec.type}`}>
                          <div className="rec-header">
                            <span className={`rec-type ${rec.type}`}>
                              {rec.type === 'critical' ? '🔴' : rec.type === 'warning' ? '🟡' : '🟢'} {rec.type}
                            </span>
                            <span className={`rec-impact ${rec.impact}`}>{rec.impact} impact</span>
                          </div>
                          <h3>{rec.title}</h3>
                          <p>{rec.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {perfResults.resources && Object.keys(perfResults.resources).length > 0 && (
                  <div className="card">
                    <h2>📊 Resource Breakdown</h2>
                    <div className="resource-table">
                      {Object.entries(perfResults.resources).map(([type, data]) => (
                        <div key={type} className="resource-row">
                          <span className="resource-type">{type}</span>
                          <span className="resource-count">{data.count} files</span>
                          <span className="resource-size">{formatBytes(data.size)}</span>
                          <span className="resource-time">{data.avgDuration}ms avg</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      )}

      {/* Accessibility Tab */}
      {activeTab === 'accessibility' && (
        <main className="main-content">
          <div className="accessibility-page">
            <h1>♿ Accessibility Audit</h1>
            <p className="subtitle">Check your website for WCAG 2.1 compliance issues</p>

            <div className="card">
              <label className="input-label">Website URL</label>
              <div className="input-group-large">
                <input
                  type="url"
                  placeholder="https://example.com"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && runAccessibilityAudit()}
                />
                <button 
                  className="btn btn-primary btn-large"
                  onClick={runAccessibilityAudit}
                  disabled={a11yLoading || !url}
                >
                  {a11yLoading ? <><span className="spinner"></span> Scanning...</> : '🔍 Run Audit'}
                </button>
              </div>
            </div>

            {a11yResults && (
              <>
                <div className="a11y-score-card">
                  <div className={`score-circle ${getScoreColor(a11yResults.score)}`}>
                    <span className="score-value">{a11yResults.score}</span>
                    <span className="score-label">/ 100</span>
                  </div>
                  <div className="score-details">
                    <h2>Accessibility Score</h2>
                    <p>{a11yResults.url}</p>
                    <div className="issue-summary">
                      <span className="issue-count critical">{a11yResults.summary.critical} Critical</span>
                      <span className="issue-count high">{a11yResults.summary.high} High</span>
                      <span className="issue-count medium">{a11yResults.summary.medium} Medium</span>
                      <span className="issue-count low">{a11yResults.summary.low} Low</span>
                    </div>
                  </div>
                </div>

                {a11yResults.issues.length > 0 && (
                  <div className="card">
                    <h2>🚨 Issues Found ({a11yResults.issues.length})</h2>
                    <div className="a11y-issues">
                      {a11yResults.issues.map((issue, idx) => (
                        <div key={idx} className={`a11y-issue ${issue.severity}`}>
                          <div className="issue-header">
                            <span className={`severity-tag ${issue.severity}`}>{issue.severity}</span>
                            <span className="wcag-tag">WCAG {issue.wcag}</span>
                            <h3>{issue.name}</h3>
                          </div>
                          <p className="issue-description">{issue.description}</p>
                          <p className="issue-message">{issue.message}</p>
                          {issue.elements?.length > 0 && (
                            <div className="issue-elements">
                              <strong>Affected elements:</strong>
                              {issue.elements.map((el, i) => (
                                <code key={i}>{el.html || el.text}</code>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {a11yResults.passed.length > 0 && (
                  <div className="card">
                    <h2>✅ Passed Checks ({a11yResults.passed.length})</h2>
                    <div className="passed-checks">
                      {a11yResults.passed.map((check, idx) => (
                        <div key={idx} className="passed-item">
                          <span className="check-icon">✓</span>
                          <span>{check.name}</span>
                          <span className="wcag-tag small">WCAG {check.wcag}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      )}

      {/* Recorder Tab */}
      {activeTab === 'recorder' && (
        <main className="main-content">
          <div className="recorder-page">
            <h1>🎬 Flow Recorder</h1>
            <p className="subtitle">Record your interactions and replay them as automated tests</p>

            {!recordingSession ? (
              <div className="card">
                <label className="input-label">Start URL</label>
                <div className="input-group-large">
                  <input
                    type="url"
                    placeholder="https://example.com/login"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && startRecording()}
                  />
                  <button 
                    className="btn btn-primary btn-large"
                    onClick={startRecording}
                    disabled={recordingLoading || !url}
                  >
                    {recordingLoading ? <><span className="spinner"></span> Starting...</> : '⏺️ Start Recording'}
                  </button>
                </div>
                <p className="input-hint">A browser window will open. Interact with the page, then come back here to stop recording.</p>
              </div>
            ) : (
              <div className="recording-active">
                <div className="recording-status-card">
                  <div className="recording-indicator">
                    <span className="recording-dot"></span>
                    <span>Recording in progress...</span>
                  </div>
                  <div className="recording-url">{recordingSession.url}</div>
                  <div className="recording-stats">
                    <span className="stat">📝 {recordingSession.stepCount || 0} steps recorded</span>
                    <span className="stat">⏱️ Started {new Date(recordingSession.startedAt).toLocaleTimeString()}</span>
                  </div>
                </div>

                <div className="card">
                  <label className="input-label">Flow Name</label>
                  <input
                    type="text"
                    placeholder="e.g., Login Flow, Checkout Process"
                    value={flowName}
                    onChange={(e) => setFlowName(e.target.value)}
                    className="flow-name-input"
                  />
                </div>

                {recordingSession.steps?.length > 0 && (
                  <div className="card">
                    <h3>Recorded Steps</h3>
                    <div className="recorded-steps-list">
                      {recordingSession.steps.map((step, idx) => (
                        <div key={idx} className="recorded-step">
                          <span className="step-num">{idx + 1}</span>
                          <span className={`step-action-badge ${step.action}`}>{step.action}</span>
                          <span className="step-selector">{step.selector}</span>
                          {step.value && <span className="step-value">"{step.value}"</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="recording-actions">
                  <button 
                    className="btn btn-success btn-large"
                    onClick={stopRecording}
                    disabled={recordingLoading}
                  >
                    {recordingLoading ? <><span className="spinner"></span> Saving...</> : '⏹️ Stop & Save'}
                  </button>
                  <button 
                    className="btn btn-outline"
                    onClick={cancelRecording}
                    disabled={recordingLoading}
                  >
                    ❌ Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="recorder-tips">
              <h3>💡 Tips for Recording</h3>
              <ul>
                <li>Click through your user flow naturally - clicks, typing, and form submissions are captured</li>
                <li>Wait for pages to load before interacting with elements</li>
                <li>Use unique identifiers (IDs, data-testid) on elements for more reliable playback</li>
                <li>After saving, you can edit the recorded steps in the Editor tab</li>
              </ul>
            </div>
          </div>
        </main>
      )}

      {/* Screenshot Modal */}
      {modalImage && (
        <div className="modal-overlay" onClick={() => setModalImage(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setModalImage(null)}>✕</button>
            <img src={modalImage} alt="Screenshot" />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
