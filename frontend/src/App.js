import React, { useState, useEffect, Component } from 'react';
import { auth, signInWithGoogle, logOut, onAuthStateChanged } from './firebase';

const API_URL = process.env.REACT_APP_API_URL || '';

// Error Boundary to catch React errors
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('React Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <h1>Something went wrong</h1>
          <p>{this.state.error?.message || 'Unknown error'}</p>
          <button onClick={() => window.location.reload()} style={{ padding: '10px 20px', marginTop: '20px' }}>
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

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
  const [shareModal, setShareModal] = useState(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [sharedReport, setSharedReport] = useState(null);
  const [sharedReportLoading, setSharedReportLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [openFaq, setOpenFaq] = useState(null);
  const [detailedFlowMode, setDetailedFlowMode] = useState(false);
  const [flowViewTest, setFlowViewTest] = useState(null); // For viewing flow steps of a specific test

  const toggleFaq = (index) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  const faqData = [
    {
      question: "What types of websites can BugScout test?",
      answer: "BugScout works with any publicly accessible website. It's optimized for testing login forms, signup flows, search functionality, and checkout processes. However, some websites with aggressive bot protection may block automated testing."
    },
    {
      question: "How does the AI generate test cases?",
      answer: "BugScout analyzes your page structure, identifies interactive elements like forms and buttons, and uses Llama 3.1 to generate relevant test scenarios including negative tests, edge cases, and validation checks based on the page type."
    },
    {
      question: "Can I edit the auto-generated tests?",
      answer: "Yes! All generated tests are fully editable. You can modify test steps, change selectors, add new tests, or remove unnecessary ones before execution."
    },
    {
      question: "What do the accessibility scores mean?",
      answer: "Accessibility scores are based on WCAG 2.1 guidelines. Issues are categorized as Critical (blocks users), Serious (significant barriers), Moderate (causes frustration), and Minor (best practice improvements). A score of 90+ indicates good accessibility."
    },
    {
      question: "How are performance metrics calculated?",
      answer: "We measure Core Web Vitals including First Contentful Paint (FCP), Largest Contentful Paint (LCP), Cumulative Layout Shift (CLS), and Time to First Byte (TTFB). These metrics follow Google's standards for measuring user experience."
    },
    {
      question: "Can I share test results with my team?",
      answer: "Yes! Each test run can generate a shareable link that anyone can view without signing in. You can set expiration times for shared links and revoke access anytime. Great for sharing bug reports with developers."
    }
  ];

  useEffect(() => {
    // Listen for auth state changes
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
      if (currentUser) {
        fetchTestRuns(currentUser.uid);
      } else {
        setTestRuns([]);
      }
    });

    // Check if we're on a shared report URL
    const path = window.location.pathname;
    if (path.startsWith('/share/')) {
      const shareId = path.split('/share/')[1];
      if (shareId) {
        loadSharedReport(shareId);
      }
    }
    
    document.body.classList.toggle('dark', darkMode);
    
    return () => unsubscribe();
  }, [darkMode]);

  const loadSharedReport = async (shareId) => {
    setSharedReportLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/shared/${shareId}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSharedReport(data);
    } catch (err) {
      setSharedReport({ error: err.message });
    } finally {
      setSharedReportLoading(false);
    }
  };

  const fetchTestRuns = async (userId) => {
    if (!userId) return;
    try {
      const res = await fetch(`${API_URL}/api/test-runs?userId=${userId}`);
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
    if (!url || !user) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/generate-tests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, preset: presetType, userId: user.uid })
      });
      const data = await res.json();
      if (data.error) {
        throw new Error(data.error);
      }
      setCurrentRun(data);
      setActiveTab('editor');
      fetchTestRuns(user.uid);
    } catch (err) {
      const errorMsg = err.message.includes('blocked') || err.message.includes('empty') 
        ? `This website has bot protection and cannot be tested automatically. Try a different URL or a site you own.`
        : `Failed to generate tests: ${err.message}`;
      alert(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const executeTests = async (useDetailedFlow = detailedFlowMode) => {
    if (!currentRun) return;
    setLoading(true);
    try {
      // First, ping the server to wake it up if sleeping
      try {
        await fetch(`${API_URL}/health`, { method: 'GET' });
      } catch (e) {
        // Server might be waking up, wait a bit
        await new Promise(r => setTimeout(r, 3000));
      }
      
      await saveChanges();
      
      // Use AbortController for timeout (3 minutes for normal, 4 for detailed)
      const controller = new AbortController();
      const timeoutMs = useDetailedFlow ? 240000 : 180000;
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      
      const res = await fetch(`${API_URL}/api/test-runs/${currentRun.id}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ detailedFlow: useDetailedFlow }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      const data = await res.json();
      if (data.error) {
        throw new Error(data.error);
      }
      // Validate response has required fields
      if (data && data.id && data.tests) {
        setCurrentRun(data);
      } else {
        throw new Error('Invalid response from server');
      }
      if (user) fetchTestRuns(user.uid);
    } catch (err) {
      console.error('Test execution error:', err);
      let errorMsg = err.message;
      if (err.name === 'AbortError') {
        errorMsg = 'Request timed out. The server may be busy or sleeping. Please try again in a moment.';
      } else if (err.message.includes('NetworkError') || err.message.includes('fetch')) {
        errorMsg = 'Network error. The server may be waking up (free tier). Please wait 30 seconds and try again.';
      }
      alert('Failed to execute tests: ' + errorMsg);
      // Reload the test run to get current state
      try {
        const res = await fetch(`${API_URL}/api/test-runs/${currentRun.id}`);
        const data = await res.json();
        if (data && data.id && !data.error) setCurrentRun(data);
      } catch (e) { /* ignore */ }
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
      if (user) fetchTestRuns(user.uid);
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
        body: JSON.stringify({ flowName: flowName || 'Recorded Flow', userId: user?.uid })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      setRecordingSession(null);
      setFlowName('');
      setCurrentRun(data.testRun);
      setActiveTab('editor');
      if (user) fetchTestRuns(user.uid);
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

  // Share Functions
  const createShareLink = async (expiresIn = null) => {
    if (!currentRun) return;
    setShareLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/test-runs/${currentRun.id}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresIn })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      const fullUrl = `${window.location.origin}/share/${data.shareId}`;
      setShareModal({ ...data, fullUrl });
      
      // Update current run with share info
      setCurrentRun({ ...currentRun, shareId: data.shareId });
      if (user) fetchTestRuns(user.uid);
    } catch (err) {
      alert('Failed to create share link: ' + err.message);
    } finally {
      setShareLoading(false);
    }
  };

  const revokeShareLink = async () => {
    if (!currentRun?.shareId) return;
    if (!window.confirm('Revoke this share link? Anyone with the link will no longer be able to view the report.')) return;
    
    try {
      await fetch(`${API_URL}/api/test-runs/${currentRun.id}/share`, {
        method: 'DELETE'
      });
      setCurrentRun({ ...currentRun, shareId: null });
      setShareModal(null);
      if (user) fetchTestRuns(user.uid);
    } catch (err) {
      alert('Failed to revoke share link: ' + err.message);
    }
  };

  const copyShareLink = (url) => {
    navigator.clipboard.writeText(url);
    alert('Link copied to clipboard!');
  };

  const handleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (err) {
      console.error('Sign in error:', err);
      alert('Failed to sign in: ' + err.message);
    }
  };

  const handleSignOut = async () => {
    try {
      await logOut();
      setCurrentRun(null);
      setTestRuns([]);
      setActiveTab('dashboard');
    } catch (err) {
      console.error('Sign out error:', err);
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
      {/* Shared Report View */}
      {(sharedReport || sharedReportLoading) && (
        <>
          <nav className="navbar">
            <div className="nav-brand" onClick={() => { window.location.href = '/'; }} style={{ cursor: 'pointer' }}>
              <img src={`${process.env.PUBLIC_URL}/logo.png`} alt="BugScout" className="logo-img" />
              <span className="brand-text">BugScout</span>
            </div>
            <span className="shared-badge">📤 Shared Report</span>
            <button className="theme-toggle" onClick={toggleDarkMode}>
              {darkMode ? '☀️' : '🌙'}
            </button>
          </nav>
          <main className="main-content">
            {sharedReportLoading ? (
              <div className="loading-state">
                <span className="spinner large"></span>
                <p>Loading shared report...</p>
              </div>
            ) : sharedReport.error ? (
              <div className="error-state">
                <div className="error-icon">❌</div>
                <h2>Report Not Available</h2>
                <p>{sharedReport.error}</p>
                <a href="/" className="btn btn-primary">Go to BugScout</a>
              </div>
            ) : (
              <div className="shared-report">
                <div className="shared-report-header">
                  <div>
                    <h1>{new URL(sharedReport.testRun.url).hostname}</h1>
                    <p className="subtitle">{sharedReport.testRun.url}</p>
                  </div>
                  <div className="shared-meta">
                    <span className={`status-badge ${getStatusClass(sharedReport.testRun.status)}`}>
                      {sharedReport.testRun.status.replace(/_/g, ' ')}
                    </span>
                    <span className="view-count">👁️ {sharedReport.viewCount} views</span>
                  </div>
                </div>

                <div className="shared-stats">
                  <div className="stat-card">
                    <div className="stat-value">{sharedReport.testRun.tests?.length || 0}</div>
                    <div className="stat-label">Tests</div>
                  </div>
                  <div className="stat-card success">
                    <div className="stat-value">{sharedReport.testRun.tests?.filter(t => t.status === 'pass').length || 0}</div>
                    <div className="stat-label">Passed</div>
                  </div>
                  <div className="stat-card danger">
                    <div className="stat-value">{sharedReport.testRun.tests?.filter(t => t.status === 'fail').length || 0}</div>
                    <div className="stat-label">Failed</div>
                  </div>
                </div>

                <div className="shared-tests">
                  <h2>Test Results</h2>
                  {sharedReport.testRun.tests?.map((test, idx) => (
                    <div key={idx} className={`shared-test-card ${test.status}`}>
                      <div className="test-header">
                        <span className={`status-icon ${test.status}`}>
                          {test.status === 'pass' ? '✅' : test.status === 'fail' ? '❌' : '⏳'}
                        </span>
                        <h3>{test.name}</h3>
                        <span className={`type-badge ${test.type}`}>{test.type}</span>
                      </div>
                      
                      {test.steps && (
                        <div className="test-steps">
                          {test.steps.map((step, sIdx) => (
                            <div key={sIdx} className="step-item">
                              <span className="step-num">{sIdx + 1}</span>
                              <span className="step-action">{step.action}</span>
                              <span className="step-target">{step.target}</span>
                              {step.value && <span className="step-value">"{step.value}"</span>}
                            </div>
                          ))}
                        </div>
                      )}

                      {test.error && <div className="error-box">❌ {test.error}</div>}

                      {test.explanation && (
                        <div className="ai-explanation">
                          <div className="explanation-header">
                            <span className="ai-badge">🤖 AI Analysis</span>
                          </div>
                          <p>{test.explanation.summary}</p>
                          <p><strong>Suggested fix:</strong> {test.explanation.suggestedFix}</p>
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

                <div className="shared-footer">
                  <p>Shared on {new Date(sharedReport.sharedAt).toLocaleString()}</p>
                  <a href="/" className="btn btn-primary">Create Your Own Tests →</a>
                </div>
              </div>
            )}
          </main>
          {modalImage && (
            <div className="modal-overlay" onClick={() => setModalImage(null)}>
              <div className="modal-content" onClick={e => e.stopPropagation()}>
                <button className="modal-close" onClick={() => setModalImage(null)}>✕</button>
                <img src={modalImage} alt="Screenshot" />
              </div>
            </div>
          )}
        </>
      )}

      {/* Regular App View */}
      {!sharedReport && !sharedReportLoading && (
        <>
      <nav className="navbar">
        <div className="nav-brand" onClick={() => setActiveTab('dashboard')} style={{ cursor: 'pointer' }}>
          <img src={`${process.env.PUBLIC_URL}/logo.png`} alt="BugScout" className="logo-img" />
          <span className="brand-text">BugScout</span>
        </div>
        <div className="nav-tabs">
          {user && (
            <>
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
                className={`nav-tab ${activeTab === 'guide' ? 'active' : ''}`}
                onClick={() => setActiveTab('guide')}
              >
                📖 Guide
              </button>
            </>
          )}
        </div>
        <div className="nav-right">
          {authLoading ? (
            <span className="spinner"></span>
          ) : user ? (
            <div className="user-menu">
              <img src={user.photoURL} alt={user.displayName} className="user-avatar" />
              <span className="user-name">{user.displayName?.split(' ')[0]}</span>
              <button className="btn btn-outline btn-sm" onClick={handleSignOut}>
                Sign Out
              </button>
            </div>
          ) : (
            <button className="btn btn-primary" onClick={handleSignIn}>
              🔐 Sign in with Google
            </button>
          )}
          <button className="theme-toggle" onClick={toggleDarkMode}>
            {darkMode ? '☀️' : '🌙'}
          </button>
        </div>
      </nav>

      <main className="main-content">
        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <div className="dashboard">
            {!user ? (
              <div className="landing-page">
                <div className="landing-hero">
                  <div className="hero-content">
                    <div className="hero-badge">🚀 AI-Powered QA Testing</div>
                    <h1>Find Bugs Before<br/><span className="gradient-text">Your Users Do</span></h1>
                    <p className="hero-subtitle">
                      BugScout automatically generates, executes, and analyzes tests for your web applications. 
                      Get AI-powered insights, accessibility audits, and performance reports in minutes.
                    </p>
                    <button className="btn btn-primary btn-xl" onClick={handleSignIn}>
                      <img src="https://www.google.com/favicon.ico" alt="Google" className="google-icon" />
                      Get Started Free
                    </button>
                  </div>
                  <div className="hero-visual">
                    <div className="hero-mockup-v2">
                      <div className="mockup-terminal-header">
                        <div className="terminal-dots">
                          <span className="tdot"></span>
                          <span className="tdot"></span>
                          <span className="tdot"></span>
                        </div>
                        <span className="terminal-title">BugScout Test Runner</span>
                        <div className="terminal-actions">
                          <span className="live-indicator"></span>
                          <span>Live</span>
                        </div>
                      </div>
                      <div className="mockup-terminal-body">
                        <div className="test-result-row success">
                          <div className="result-status">
                            <span className="status-dot success"></span>
                            <span className="status-text">PASS</span>
                          </div>
                          <span className="result-name">Login form validation</span>
                          <span className="result-time">124ms</span>
                        </div>
                        <div className="test-result-row success">
                          <div className="result-status">
                            <span className="status-dot success"></span>
                            <span className="status-text">PASS</span>
                          </div>
                          <span className="result-name">Password strength check</span>
                          <span className="result-time">89ms</span>
                        </div>
                        <div className="test-result-row failure">
                          <div className="result-status">
                            <span className="status-dot failure"></span>
                            <span className="status-text">FAIL</span>
                          </div>
                          <span className="result-name">Empty email submission</span>
                          <span className="result-time">201ms</span>
                        </div>
                        <div className="ai-insight-box">
                          <div className="ai-insight-header">
                            <span className="ai-icon">✨</span>
                            <span>AI Insight</span>
                          </div>
                          <p>Missing error message for invalid email format. Add validation feedback to improve UX.</p>
                        </div>
                        <div className="test-summary">
                          <span className="summary-item"><strong>3</strong> tests</span>
                          <span className="summary-item success"><strong>2</strong> passed</span>
                          <span className="summary-item failure"><strong>1</strong> failed</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="landing-features">
                  <h2>Everything you need to ship with confidence</h2>
                  <div className="features-grid">
                    <div className="feature-card">
                      <div className="feature-icon">🤖</div>
                      <h3>AI Test Generation</h3>
                      <p>Automatically generate comprehensive test plans by analyzing your pages</p>
                    </div>
                    <div className="feature-card">
                      <div className="feature-icon">🐛</div>
                      <h3>Smart Bug Explanations</h3>
                      <p>Get plain-English explanations of failures with suggested fixes</p>
                    </div>
                    <div className="feature-card">
                      <div className="feature-icon">♿</div>
                      <h3>Accessibility Audits</h3>
                      <p>WCAG compliance checks for color contrast, alt text, and more</p>
                    </div>
                    <div className="feature-card">
                      <div className="feature-icon">⚡</div>
                      <h3>Performance Insights</h3>
                      <p>Core Web Vitals, load times, and optimization recommendations</p>
                    </div>
                    <div className="feature-card">
                      <div className="feature-icon">🔍</div>
                      <h3>Visual Regression</h3>
                      <p>Catch unintended UI changes with screenshot comparisons</p>
                    </div>
                    <div className="feature-card">
                      <div className="feature-icon">📤</div>
                      <h3>Shareable Reports</h3>
                      <p>Generate public links to share test results with your team</p>
                    </div>
                  </div>
                </div>

                <div className="landing-showcase">
                  <h2>See BugScout in Action</h2>
                  <p className="showcase-subtitle">Powerful features, beautiful interface</p>
                  <div className="showcase-grid">
                    <div className="showcase-item">
                      <div className="showcase-preview">
                        <div className="preview-window">
                          <div className="preview-header">
                            <span className="dot red"></span>
                            <span className="dot yellow"></span>
                            <span className="dot green"></span>
                            <span className="preview-title">Test Editor</span>
                          </div>
                          <div className="preview-content editor-preview">
                            <div className="preview-test-card">
                              <div className="ptc-header">
                                <span className="ptc-status pass">✅</span>
                                <span className="ptc-name">Login Form Validation</span>
                              </div>
                              <div className="ptc-steps">
                                <div className="ptc-step"><span>1</span> Type "test@email.com"</div>
                                <div className="ptc-step"><span>2</span> Type "password123"</div>
                                <div className="ptc-step"><span>3</span> Click Submit</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                      <h3>Visual Test Editor</h3>
                      <p>Edit test steps with an intuitive drag-and-drop interface</p>
                    </div>
                    <div className="showcase-item">
                      <div className="showcase-preview">
                        <div className="preview-window">
                          <div className="preview-header">
                            <span className="dot red"></span>
                            <span className="dot yellow"></span>
                            <span className="dot green"></span>
                            <span className="preview-title">Accessibility</span>
                          </div>
                          <div className="preview-content a11y-preview">
                            <div className="a11y-score-preview">
                              <div className="score-ring">87</div>
                            </div>
                            <div className="a11y-issues-preview">
                              <div className="issue-row critical">2 Critical</div>
                              <div className="issue-row warning">5 Warnings</div>
                              <div className="issue-row pass">12 Passed</div>
                            </div>
                          </div>
                        </div>
                      </div>
                      <h3>Accessibility Scores</h3>
                      <p>Get instant WCAG compliance reports with actionable fixes</p>
                    </div>
                    <div className="showcase-item">
                      <div className="showcase-preview">
                        <div className="preview-window">
                          <div className="preview-header">
                            <span className="dot red"></span>
                            <span className="dot yellow"></span>
                            <span className="dot green"></span>
                            <span className="preview-title">Performance</span>
                          </div>
                          <div className="preview-content perf-preview">
                            <div className="perf-metrics">
                              <div className="perf-metric good">
                                <span className="metric-val">1.2s</span>
                                <span className="metric-label">FCP</span>
                              </div>
                              <div className="perf-metric good">
                                <span className="metric-val">2.1s</span>
                                <span className="metric-label">LCP</span>
                              </div>
                              <div className="perf-metric warning">
                                <span className="metric-val">0.15</span>
                                <span className="metric-label">CLS</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                      <h3>Performance Metrics</h3>
                      <p>Track Core Web Vitals and optimize load times</p>
                    </div>
                  </div>
                </div>

                <div className="landing-faq">
                  <h2>Frequently Asked Questions</h2>
                  <div className="faq-accordion">
                    {faqData.map((faq, index) => (
                      <div key={index} className={`faq-item ${openFaq === index ? 'open' : ''}`}>
                        <button className="faq-question" onClick={() => toggleFaq(index)}>
                          <span>{faq.question}</span>
                          <span className="faq-icon">{openFaq === index ? '−' : '+'}</span>
                        </button>
                        <div className="faq-answer">
                          <p>{faq.answer}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="landing-cta">
                  <h2>Ready to catch bugs automatically?</h2>
                  <p>Join developers who trust BugScout for their QA needs</p>
                  <button className="btn btn-primary btn-xl" onClick={handleSignIn}>
                    <img src="https://www.google.com/favicon.ico" alt="Google" className="google-icon" />
                    Sign in with Google
                  </button>
                </div>

                <footer className="landing-footer">
                  <p>Made by <strong>The Unexecutables</strong></p>
                </footer>
              </div>
            ) : (
              <>
                <h1>Welcome back, {user.displayName?.split(' ')[0]}!</h1>
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
              </>
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
                <h1>{currentRun.url ? (() => { try { return new URL(currentRun.url).hostname; } catch { return currentRun.url; } })() : 'Unknown'}</h1>
                <p className="subtitle">{currentRun.url || 'No URL'}</p>
              </div>
              <div className="editor-actions">
                {currentRun.shareId ? (
                  <button className="btn btn-outline shared" onClick={() => setShareModal({ 
                    shareId: currentRun.shareId, 
                    fullUrl: `${window.location.origin}/share/${currentRun.shareId}` 
                  })}>
                    🔗 Shared
                  </button>
                ) : (
                  <button 
                    className="btn btn-outline" 
                    onClick={() => createShareLink()}
                    disabled={shareLoading || currentRun.status === 'pending_review'}
                  >
                    {shareLoading ? <span className="spinner"></span> : '🔗'} Share
                  </button>
                )}
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
                <div className="run-options">
                  <button 
                    className="btn btn-success"
                    onClick={() => executeTests(false)}
                    disabled={loading}
                  >
                    {loading ? <span className="spinner"></span> : '▶️'} Run All
                  </button>
                  <button 
                    className="btn btn-primary"
                    onClick={() => executeTests(true)}
                    disabled={loading}
                    title="Capture screenshots at each step for detailed flow visualization"
                  >
                    {loading ? <span className="spinner"></span> : '📸'} Run with Flow View
                  </button>
                </div>
              </div>
            </div>

            <div className="editor-meta">
              <span className={`status-badge ${getStatusClass(currentRun.status || 'pending')}`}>
                {(currentRun.status || 'pending').replace(/_/g, ' ')}
              </span>
              <span className="meta-item">📄 {currentRun.pageData?.pageType || 'Unknown'} page</span>
              <span className="meta-item">🧪 {currentRun.tests?.length || 0} tests</span>
              {currentRun.confidence && (
                <span className="meta-item">🎯 {(currentRun.confidence * 100).toFixed(0)}% confidence</span>
              )}
              {currentRun.hasDetailedFlow && (
                <span className="meta-item flow-badge">📸 Flow View Available</span>
              )}
            </div>

            {loading && (
              <div className="loading-overlay">
                <div className="loading-content">
                  <div className="loading-spinner"></div>
                  <p>Running tests{detailedFlowMode ? ' with flow capture' : ''}<span className="loading-dots"><span></span><span></span><span></span></span></p>
                </div>
              </div>
            )}

            {/* Test Results Summary Banner */}
            {!loading && currentRun.status && currentRun.status.toLowerCase() !== 'pending_review' && currentRun.tests?.some(t => t.status === 'pass' || t.status === 'fail') && (
              <div className={`results-summary ${currentRun.tests?.every(t => t.status === 'pass') ? 'success' : 'failure'}`}>
                <div className="results-icon">
                  {currentRun.tests?.every(t => t.status === 'pass') ? '✅' : '❌'}
                </div>
                <div className="results-info">
                  <h3>
                    {currentRun.tests?.every(t => t.status === 'pass')
                      ? 'All Tests Passed!' 
                      : `${currentRun.tests?.filter(t => t.status === 'fail').length || 0} Test${currentRun.tests?.filter(t => t.status === 'fail').length !== 1 ? 's' : ''} Failed`}
                  </h3>
                  <p>
                    {currentRun.tests?.filter(t => t.status === 'pass').length || 0} passed
                    {currentRun.tests?.filter(t => t.status === 'fail').length > 0 && 
                      ` · ${currentRun.tests?.filter(t => t.status === 'fail').length} failed`}
                    {currentRun.tests?.filter(t => t.status === 'pending').length > 0 && 
                      ` · ${currentRun.tests?.filter(t => t.status === 'pending').length} pending`}
                  </p>
                </div>
              </div>
            )}

            <div className="test-list">
              {(currentRun.tests || []).length === 0 ? (
                <div className="empty-state">
                  <p>No tests generated. Try adding a custom test or use a different URL.</p>
                  <button className="btn btn-primary" onClick={addCustomTest}>
                    ➕ Add Custom Test
                  </button>
                </div>
              ) : currentRun.tests.map((test, tIdx) => (
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
                      {test.flowSteps?.length > 0 && (
                        <button 
                          className="btn-icon flow-view-btn" 
                          onClick={() => setFlowViewTest(test)}
                          title="View step-by-step flow"
                        >
                          📸
                        </button>
                      )}
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
                          {/* Show current selector if it's a custom/real selector not in elements list */}
                          {step.target && !elements.find(el => el.id === step.target || el.selector === step.target) && (
                            <option value={step.target}>{step.target}</option>
                          )}
                          {elements.map(el => (
                            <option key={el.id} value={el.selector || el.id}>
                              {el.selector || el.id}: {el.role || el.tagName} {el.visibleText ? `"${el.visibleText.substring(0,15)}"` : ''} {el.placeholder ? `[${el.placeholder}]` : ''}
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
              ))
              }
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
                      <span>📦 {perfResults.metrics.totalSizeFormatted || formatBytes(perfResults.metrics.totalSize || 0)}</span>
                      <span>🔗 {perfResults.metrics.totalRequests || 0} requests</span>
                      {perfResults.source === 'lighthouse' ? (
                        <span>🔬 Lighthouse</span>
                      ) : (
                        <span>⏱️ {perfResults.metrics.loadTime || 0}ms load</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Lighthouse Category Scores */}
                {perfResults.scores && (
                  <div className="lighthouse-scores">
                    <div className={`lighthouse-score-card ${getPerfScoreColor(perfResults.scores.performance)}`}>
                      <div className="lighthouse-score-value">{perfResults.scores.performance}</div>
                      <div className="lighthouse-score-label">Performance</div>
                    </div>
                    <div className={`lighthouse-score-card ${getPerfScoreColor(perfResults.scores.accessibility)}`}>
                      <div className="lighthouse-score-value">{perfResults.scores.accessibility}</div>
                      <div className="lighthouse-score-label">Accessibility</div>
                    </div>
                    <div className={`lighthouse-score-card ${getPerfScoreColor(perfResults.scores.bestPractices)}`}>
                      <div className="lighthouse-score-value">{perfResults.scores.bestPractices}</div>
                      <div className="lighthouse-score-label">Best Practices</div>
                    </div>
                    <div className={`lighthouse-score-card ${getPerfScoreColor(perfResults.scores.seo)}`}>
                      <div className="lighthouse-score-value">{perfResults.scores.seo}</div>
                      <div className="lighthouse-score-label">SEO</div>
                    </div>
                  </div>
                )}

                {/* Core Web Vitals */}
                <div className="metrics-grid">
                  <div className={`metric-card ${perfResults.coreWebVitals?.fcp?.rating || getMetricStatus('fcp', perfResults.metrics.fcp)}`}>
                    <div className="metric-label">First Contentful Paint</div>
                    <div className="metric-value">{perfResults.metrics.fcp >= 1000 ? (perfResults.metrics.fcp / 1000).toFixed(1) + 's' : perfResults.metrics.fcp + 'ms'}</div>
                    <div className="metric-target">Target: &lt;1.8s</div>
                  </div>
                  <div className={`metric-card ${perfResults.coreWebVitals?.lcp?.rating || getMetricStatus('lcp', perfResults.metrics.lcp)}`}>
                    <div className="metric-label">Largest Contentful Paint</div>
                    <div className="metric-value">{perfResults.metrics.lcp >= 1000 ? (perfResults.metrics.lcp / 1000).toFixed(1) + 's' : perfResults.metrics.lcp + 'ms'}</div>
                    <div className="metric-target">Target: &lt;2.5s</div>
                  </div>
                  <div className={`metric-card ${perfResults.coreWebVitals?.cls?.rating || getMetricStatus('cls', perfResults.metrics.cls)}`}>
                    <div className="metric-label">Cumulative Layout Shift</div>
                    <div className="metric-value">{perfResults.metrics.cls}</div>
                    <div className="metric-target">Target: &lt;0.1</div>
                  </div>
                  {perfResults.metrics.tbt !== undefined ? (
                    <div className={`metric-card ${perfResults.coreWebVitals?.tbt?.rating || 'neutral'}`}>
                      <div className="metric-label">Total Blocking Time</div>
                      <div className="metric-value">{perfResults.metrics.tbt}ms</div>
                      <div className="metric-target">Target: &lt;200ms</div>
                    </div>
                  ) : perfResults.metrics.ttfb !== undefined && (
                    <div className={`metric-card ${getMetricStatus('ttfb', perfResults.metrics.ttfb)}`}>
                      <div className="metric-label">Time to First Byte</div>
                      <div className="metric-value">{perfResults.metrics.ttfb}ms</div>
                      <div className="metric-target">Target: &lt;600ms</div>
                    </div>
                  )}
                </div>

                {/* Additional Lighthouse Metrics */}
                {perfResults.metrics.si !== undefined && (
                  <div className="metrics-grid secondary">
                    <div className="metric-card neutral">
                      <div className="metric-label">Speed Index</div>
                      <div className="metric-value">{perfResults.metrics.si >= 1000 ? (perfResults.metrics.si / 1000).toFixed(1) + 's' : perfResults.metrics.si + 'ms'}</div>
                    </div>
                    <div className="metric-card neutral">
                      <div className="metric-label">Time to Interactive</div>
                      <div className="metric-value">{perfResults.metrics.tti >= 1000 ? (perfResults.metrics.tti / 1000).toFixed(1) + 's' : perfResults.metrics.tti + 'ms'}</div>
                    </div>
                  </div>
                )}

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

      {/* Guide Tab */}
      {activeTab === 'guide' && (
        <main className="main-content">
          <div className="guide-page">
            <div className="guide-header">
              <h1>📖 How to Use BugScout</h1>
              <p>Complete guide to all features and capabilities</p>
            </div>

            <div className="guide-sections">
              {/* Getting Started */}
              <div className="guide-section">
                <div className="guide-section-header">
                  <span className="guide-section-icon">🚀</span>
                  <h2>Getting Started</h2>
                </div>
                <div className="guide-section-content">
                  <div className="guide-step">
                    <div className="guide-step-number">1</div>
                    <div className="guide-step-content">
                      <h3>Sign In</h3>
                      <p>Sign in with your Google account to access all features. Your test runs and results are securely stored and linked to your account.</p>
                    </div>
                  </div>
                  <div className="guide-step">
                    <div className="guide-step-number">2</div>
                    <div className="guide-step-content">
                      <h3>Enter a URL</h3>
                      <p>On the Dashboard or New Test tab, paste the URL of the webpage you want to test. Make sure the URL is publicly accessible.</p>
                    </div>
                  </div>
                  <div className="guide-step">
                    <div className="guide-step-number">3</div>
                    <div className="guide-step-content">
                      <h3>Generate Tests</h3>
                      <p>Click "Generate Tests" and BugScout will analyze the page, identify interactive elements, and create relevant test cases automatically.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Test Generation */}
              <div className="guide-section">
                <div className="guide-section-header">
                  <span className="guide-section-icon">🤖</span>
                  <h2>AI Test Generation</h2>
                </div>
                <div className="guide-section-content">
                  <p className="guide-intro">BugScout uses AI to automatically generate test cases based on your page content.</p>
                  
                  <div className="guide-feature-grid">
                    <div className="guide-feature">
                      <h4>Test Presets</h4>
                      <ul>
                        <li><strong>Auto Detect:</strong> AI analyzes the page and determines the best test strategy</li>
                        <li><strong>Login Flow:</strong> Tests for email/password validation, empty submissions, invalid formats</li>
                        <li><strong>Signup Flow:</strong> Registration form validation, password requirements, field validation</li>
                        <li><strong>Checkout:</strong> Payment form testing, required field validation</li>
                        <li><strong>Search:</strong> Search functionality, empty queries, special characters</li>
                      </ul>
                    </div>
                    <div className="guide-feature">
                      <h4>Generated Test Types</h4>
                      <ul>
                        <li><strong>Negative Tests:</strong> Invalid inputs, empty submissions, boundary violations</li>
                        <li><strong>Positive Tests:</strong> Valid data submission, expected user flows</li>
                        <li><strong>Edge Cases:</strong> Special characters, long inputs, unusual scenarios</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* Test Editor */}
              <div className="guide-section">
                <div className="guide-section-header">
                  <span className="guide-section-icon">✏️</span>
                  <h2>Test Editor</h2>
                </div>
                <div className="guide-section-content">
                  <p className="guide-intro">Review, modify, and customize your test cases before execution.</p>
                  
                  <div className="guide-feature-grid">
                    <div className="guide-feature">
                      <h4>Editing Tests</h4>
                      <ul>
                        <li>Click on any test to expand and view its steps</li>
                        <li>Modify test names and expected outcomes</li>
                        <li>Add, remove, or reorder test steps</li>
                        <li>Change action types: click, type, select, check, uncheck</li>
                      </ul>
                    </div>
                    <div className="guide-feature">
                      <h4>Test Steps</h4>
                      <ul>
                        <li><strong>Action:</strong> What to do (click, type, select)</li>
                        <li><strong>Target:</strong> CSS selector for the element</li>
                        <li><strong>Value:</strong> Text to type or option to select</li>
                      </ul>
                    </div>
                    <div className="guide-feature">
                      <h4>Custom Tests</h4>
                      <ul>
                        <li>Click "Add Custom Test" to create your own test case</li>
                        <li>Define custom steps for specific scenarios</li>
                        <li>Combine with AI-generated tests for comprehensive coverage</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* Running Tests */}
              <div className="guide-section">
                <div className="guide-section-header">
                  <span className="guide-section-icon">▶️</span>
                  <h2>Running Tests</h2>
                </div>
                <div className="guide-section-content">
                  <p className="guide-intro">Execute your tests and view detailed results with screenshots.</p>
                  
                  <div className="guide-step">
                    <div className="guide-step-number">1</div>
                    <div className="guide-step-content">
                      <h3>Execute Tests</h3>
                      <p>Click "Run Tests" to execute all test cases. BugScout opens a headless browser, navigates to your URL, and performs each test step.</p>
                    </div>
                  </div>
                  <div className="guide-step">
                    <div className="guide-step-number">2</div>
                    <div className="guide-step-content">
                      <h3>View Results</h3>
                      <p>Each test shows Pass ✅ or Fail ❌ status. Failed tests include error messages and AI-powered explanations of what went wrong.</p>
                    </div>
                  </div>
                  <div className="guide-step">
                    <div className="guide-step-number">3</div>
                    <div className="guide-step-content">
                      <h3>Screenshots</h3>
                      <p>Before and after screenshots are captured for each test. Click any screenshot to view it full-size. Error screenshots show the page state when a test failed.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Accessibility */}
              <div className="guide-section">
                <div className="guide-section-header">
                  <span className="guide-section-icon">♿</span>
                  <h2>Accessibility Auditing</h2>
                </div>
                <div className="guide-section-content">
                  <p className="guide-intro">Run comprehensive accessibility audits based on WCAG 2.1 guidelines.</p>
                  
                  <div className="guide-feature-grid">
                    <div className="guide-feature">
                      <h4>How to Run</h4>
                      <ol>
                        <li>Go to the Accessibility tab</li>
                        <li>Enter the URL you want to audit</li>
                        <li>Click "Run Accessibility Audit"</li>
                        <li>Review the score and issues found</li>
                      </ol>
                    </div>
                    <div className="guide-feature">
                      <h4>Issue Severity</h4>
                      <ul>
                        <li><strong>Critical:</strong> Blocks users from accessing content</li>
                        <li><strong>Serious:</strong> Creates significant barriers</li>
                        <li><strong>Moderate:</strong> Causes frustration or confusion</li>
                        <li><strong>Minor:</strong> Best practice improvements</li>
                      </ul>
                    </div>
                    <div className="guide-feature">
                      <h4>Common Issues Detected</h4>
                      <ul>
                        <li>Missing alt text on images</li>
                        <li>Low color contrast ratios</li>
                        <li>Missing form labels</li>
                        <li>Keyboard navigation issues</li>
                        <li>Missing ARIA attributes</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* Performance */}
              <div className="guide-section">
                <div className="guide-section-header">
                  <span className="guide-section-icon">⚡</span>
                  <h2>Performance Analysis</h2>
                </div>
                <div className="guide-section-content">
                  <p className="guide-intro">Measure Core Web Vitals and get optimization recommendations.</p>
                  
                  <div className="guide-feature-grid">
                    <div className="guide-feature">
                      <h4>Metrics Measured</h4>
                      <ul>
                        <li><strong>FCP (First Contentful Paint):</strong> Time until first content appears. Good: &lt;1.8s</li>
                        <li><strong>LCP (Largest Contentful Paint):</strong> Time until main content loads. Good: &lt;2.5s</li>
                        <li><strong>CLS (Cumulative Layout Shift):</strong> Visual stability score. Good: &lt;0.1</li>
                        <li><strong>TTFB (Time to First Byte):</strong> Server response time. Good: &lt;600ms</li>
                      </ul>
                    </div>
                    <div className="guide-feature">
                      <h4>Resource Analysis</h4>
                      <ul>
                        <li>Total page size breakdown</li>
                        <li>Number of requests by type</li>
                        <li>JavaScript, CSS, image sizes</li>
                        <li>Third-party resource impact</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sharing */}
              <div className="guide-section">
                <div className="guide-section-header">
                  <span className="guide-section-icon">📤</span>
                  <h2>Sharing Reports</h2>
                </div>
                <div className="guide-section-content">
                  <p className="guide-intro">Share test results with your team without requiring them to sign in.</p>
                  
                  <div className="guide-feature-grid">
                    <div className="guide-feature">
                      <h4>Creating Share Links</h4>
                      <ol>
                        <li>Open a completed test run in the Editor</li>
                        <li>Click the "Share" button</li>
                        <li>Copy the generated link</li>
                        <li>Send to anyone - no login required to view</li>
                      </ol>
                    </div>
                    <div className="guide-feature">
                      <h4>Share Options</h4>
                      <ul>
                        <li>Set expiration time for links</li>
                        <li>View count tracking</li>
                        <li>Revoke access anytime</li>
                        <li>Full test results visible to viewers</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tips */}
              <div className="guide-section tips">
                <div className="guide-section-header">
                  <span className="guide-section-icon">💡</span>
                  <h2>Pro Tips</h2>
                </div>
                <div className="guide-section-content">
                  <div className="guide-tips-grid">
                    <div className="guide-tip">
                      <h4>🎯 Better Selectors</h4>
                      <p>Add data-testid attributes to your elements for more reliable test targeting. BugScout prioritizes these over generic selectors.</p>
                    </div>
                    <div className="guide-tip">
                      <h4>🔄 Re-run Failed Tests</h4>
                      <p>If a test fails due to timing issues, try running it again. Some dynamic pages need multiple attempts.</p>
                    </div>
                    <div className="guide-tip">
                      <h4>📱 Test Responsively</h4>
                      <p>Tests run at 1280x720 viewport. For mobile testing, consider testing your responsive breakpoints separately.</p>
                    </div>
                    <div className="guide-tip">
                      <h4>🔒 Bot Protection</h4>
                      <p>Some websites block automated testing. If tests fail immediately, the site may have bot protection enabled.</p>
                    </div>
                    <div className="guide-tip">
                      <h4>📊 Export Results</h4>
                      <p>Use the Export button to download test results as JSON for integration with your CI/CD pipeline.</p>
                    </div>
                    <div className="guide-tip">
                      <h4>🔍 AI Suggestions</h4>
                      <p>Check the Suggestions tab for AI-recommended test cases you might have missed.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      )}

      {/* Share Modal */}
      {shareModal && (
        <div className="modal-overlay" onClick={() => setShareModal(null)}>
          <div className="share-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShareModal(null)}>✕</button>
            <div className="share-modal-content">
              <div className="share-icon">🔗</div>
              <h2>Share Test Report</h2>
              <p>Anyone with this link can view the test results</p>
              
              <div className="share-link-box">
                <input 
                  type="text" 
                  value={shareModal.fullUrl} 
                  readOnly 
                  onClick={(e) => e.target.select()}
                />
                <button className="btn btn-primary" onClick={() => copyShareLink(shareModal.fullUrl)}>
                  📋 Copy
                </button>
              </div>

              {shareModal.expiresAt && (
                <p className="share-expiry">
                  ⏰ Expires: {new Date(shareModal.expiresAt).toLocaleString()}
                </p>
              )}

              <div className="share-actions">
                <button className="btn btn-outline" onClick={() => window.open(shareModal.fullUrl, '_blank')}>
                  🔍 Preview
                </button>
                <button className="btn btn-danger-outline" onClick={revokeShareLink}>
                  🗑️ Revoke Link
                </button>
              </div>
            </div>
          </div>
        </div>
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

      {/* Flow View Modal */}
      {flowViewTest && (
        <div className="modal-overlay flow-modal" onClick={() => setFlowViewTest(null)}>
          <div className="flow-modal-content" onClick={e => e.stopPropagation()}>
            <div className="flow-modal-header">
              <h2>📸 Test Flow: {flowViewTest.name}</h2>
              <button className="modal-close" onClick={() => setFlowViewTest(null)}>✕</button>
            </div>
            
            <div className="flow-summary">
              <span className={`flow-status ${flowViewTest.status}`}>
                {flowViewTest.status === 'pass' ? '✅ Passed' : '❌ Failed'}
              </span>
              <span className="flow-steps-count">
                {flowViewTest.flowSteps?.length || 0} steps captured
              </span>
            </div>

            <div className="flow-timeline">
              {flowViewTest.flowSteps?.map((step, idx) => (
                <div 
                  key={idx} 
                  className={`flow-step ${step.status} ${step.action === 'complete' ? 'final' : ''}`}
                >
                  <div className="flow-step-marker">
                    <div className="step-number-circle">
                      {step.action === 'navigate' ? '🌐' : 
                       step.action === 'complete' ? '🏁' :
                       step.status === 'fail' ? '❌' : idx}
                    </div>
                    {idx < flowViewTest.flowSteps.length - 1 && <div className="step-connector"></div>}
                  </div>
                  
                  <div className="flow-step-content">
                    <div className="flow-step-header">
                      <span className="flow-action-badge">{step.action}</span>
                      <span className="flow-step-desc">{step.description}</span>
                      {step.duration && (
                        <span className="flow-duration">{step.duration}ms</span>
                      )}
                    </div>
                    
                    {step.target && step.action !== 'navigate' && step.action !== 'complete' && (
                      <div className="flow-step-details">
                        <code className="flow-target">{step.target}</code>
                        {step.value && <span className="flow-value">→ "{step.value}"</span>}
                      </div>
                    )}
                    
                    {step.error && (
                      <div className="flow-error">
                        ❌ {step.error}
                      </div>
                    )}
                    
                    {step.screenshot && (
                      <div className="flow-screenshot-container">
                        <img 
                          src={`${API_URL}${step.screenshot}`} 
                          alt={`Step ${idx}: ${step.description}`}
                          className="flow-screenshot"
                          onClick={() => setModalImage(`${API_URL}${step.screenshot}`)}
                        />
                        <div className="flow-page-info">
                          {step.pageTitle && <span className="page-title">{step.pageTitle}</span>}
                          {step.pageUrl && <span className="page-url">{step.pageUrl}</span>}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}

function AppWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

export default AppWithErrorBoundary;
