import React, { useState, useEffect } from 'react';
import './firebase'; // Initialize Firebase

const API_URL = process.env.REACT_APP_API_URL || '';

function App() {
  const [url, setUrl] = useState('');
  const [testRuns, setTestRuns] = useState([]);
  const [currentRun, setCurrentRun] = useState(null);
  const [loading, setLoading] = useState(false);
  const [modalImage, setModalImage] = useState(null);
  const [showAddTest, setShowAddTest] = useState(false);

  useEffect(() => {
    fetchTestRuns();
  }, []);

  const fetchTestRuns = async () => {
    try {
      const res = await fetch(`${API_URL}/api/test-runs`);
      const data = await res.json();
      setTestRuns(data);
    } catch (err) {
      console.error('Failed to fetch test runs:', err);
    }
  };

  const generateTests = async () => {
    if (!url) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/generate-tests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const data = await res.json();
      setCurrentRun(data);
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
    setShowAddTest(false);
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

  const getStatusClass = (status) => {
    if (status === 'pass' || status === 'completed') return 'status-pass';
    if (status === 'fail' || status === 'completed_with_failures') return 'status-fail';
    if (status === 'running') return 'status-running';
    return 'status-pending';
  };

  const elements = currentRun?.pageData?.elements || [];

  return (
    <div className="app">
      <header>
        <h1>🤖 Autonomous QA Agent</h1>
        <p>Generate and execute automated tests for any website</p>
      </header>

      <div className="card">
        <h2>🔗 Test a Website</h2>
        <div className="input-group">
          <input
            type="url"
            placeholder="Enter website URL (e.g., https://example.com/login)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && generateTests()}
          />
          <button className="btn btn-primary" onClick={generateTests} disabled={loading || !url}>
            {loading ? 'Processing...' : 'Generate Tests'}
          </button>
        </div>
      </div>

      {currentRun && (
        <div className="card">
          <div className="card-header">
            <h2>📋 Test Plan: {currentRun.url}</h2>
            <button className="btn btn-secondary" onClick={addCustomTest}>
              ➕ Add Custom Test
            </button>
          </div>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
            <span className={`status-badge ${getStatusClass(currentRun.status)}`}>
              {currentRun.status}
            </span>
            <span className="test-type">Page Type: {currentRun.pageData?.pageType}</span>
          </div>
          {currentRun.confidence && (
            <p className="confidence">AI Confidence: {(currentRun.confidence * 100).toFixed(0)}%</p>
          )}

          <div className="test-list">
            {currentRun.tests.map((test, tIdx) => (
              <div key={test.id} className={`test-item ${test.type === 'custom' ? 'custom-test' : ''}`}>
                <div className="test-header">
                  <div style={{ flex: 1 }}>
                    <input
                      className="test-name-input"
                      value={test.name}
                      onChange={(e) => updateTest(tIdx, 'name', e.target.value)}
                    />
                    <span className={`test-type-badge ${test.type === 'custom' ? 'custom' : 'auto'}`}>
                      {test.type === 'custom' ? '🛠 Custom' : '🤖 Auto'} • {test.type === 'custom' ? '' : test.type}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span className={`status-badge ${getStatusClass(test.status)}`}>
                      {test.status}
                    </span>
                    <button className="btn btn-danger btn-sm" onClick={() => deleteTest(tIdx)}>🗑️</button>
                  </div>
                </div>

                <div className="step-list">
                  {test.steps.map((step, sIdx) => (
                    <div key={sIdx} className="step-item">
                      <span className="step-num">{sIdx + 1}</span>
                      <select
                        value={step.action}
                        onChange={(e) => updateStep(tIdx, sIdx, 'action', e.target.value)}
                      >
                        <option value="click">Click</option>
                        <option value="type">Type</option>
                      </select>
                      
                      <select
                        value={step.target}
                        onChange={(e) => updateStep(tIdx, sIdx, 'target', e.target.value)}
                        className="target-select"
                      >
                        <option value="">-- Select Element --</option>
                        {elements.map(el => (
                          <option key={el.id} value={el.id}>
                            {el.id}: {el.role || el.tagName} {el.visibleText ? `"${el.visibleText.substring(0,20)}"` : ''} {el.placeholder ? `[${el.placeholder}]` : ''}
                          </option>
                        ))}
                      </select>
                      
                      {step.action === 'type' && (
                        <input
                          placeholder="Value to type"
                          value={step.value || ''}
                          onChange={(e) => updateStep(tIdx, sIdx, 'value', e.target.value)}
                          className="value-input"
                        />
                      )}
                      
                      <button className="btn btn-icon" onClick={() => removeStep(tIdx, sIdx)} title="Remove step">✕</button>
                    </div>
                  ))}
                  <button className="btn btn-sm btn-outline" onClick={() => addStep(tIdx)}>+ Add Step</button>
                </div>

                <div className="expected-row">
                  <label>Expected:</label>
                  <input
                    value={test.expected || ''}
                    onChange={(e) => updateTest(tIdx, 'expected', e.target.value)}
                    placeholder="What should happen?"
                  />
                </div>

                {test.error && <div className="error-msg">❌ {test.error}</div>}

                {test.screenshots?.length > 0 && (
                  <div className="screenshots">
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

          <div className="actions">
            <button className="btn btn-primary" onClick={saveChanges}>
              💾 Save Changes
            </button>
            <button
              className="btn btn-success"
              onClick={executeTests}
              disabled={loading || currentRun.status === 'running'}
            >
              {loading ? '⏳ Running...' : '▶️ Run Tests'}
            </button>
          </div>
        </div>
      )}

      {testRuns.length > 0 && (
        <div className="card">
          <h2>📜 Test History</h2>
          <div className="history-list">
            {testRuns.map((run) => (
              <div
                key={run.id}
                className={`history-item ${currentRun?.id === run.id ? 'active' : ''}`}
                onClick={() => loadRun(run.id)}
              >
                <div>
                  <div className="history-url">{run.url}</div>
                  <div className="history-date">
                    {new Date(run.createdAt).toLocaleString()}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span className={`status-badge ${getStatusClass(run.status)}`}>
                    {run.status}
                  </span>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={(e) => deleteRun(run.id, e)}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {modalImage && (
        <div className="modal-overlay" onClick={() => setModalImage(null)}>
          <div className="modal-content">
            <img src={modalImage} alt="Screenshot" />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
