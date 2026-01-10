# 🔬 BugScout

**AI-Powered QA Testing Platform for Web Applications**

BugScout automatically generates, executes, and analyzes tests for your web applications. Get AI-powered insights, accessibility audits, and performance reports powered by Google Lighthouse in minutes.

🌐 **Live Demo:** [https://bugscout.web.app](https://bugscout.web.app)

---

## 🚀 Features

### 🤖 AI Test Generation
Automatically generate comprehensive test plans by simply entering a URL. BugScout analyzes your page structure and creates relevant test cases including:
- Form validation tests
- Negative test scenarios
- Edge case detection
- Login/Signup flow testing
- Smart action normalization (supports click, type, hover, select, and more)

### 🐛 Smart Bug Explanations
When tests fail, BugScout provides plain-English explanations powered by AI:
- What went wrong
- Likely cause of the failure
- Suggested fixes
- Actionable tips for developers

### ✅ Test Results Summary
Clear visual feedback after test execution:
- Prominent success/failure banner
- Pass/fail/pending breakdown
- Individual test status indicators
- Animated loading states

### ♿ Accessibility Auditing
Run comprehensive accessibility audits based on WCAG guidelines:
- Contrast ratio checks
- Missing alt text detection
- ARIA label validation
- Keyboard navigation issues
- Accessibility score with detailed breakdown

### ⚡ Performance Analysis (Google Lighthouse)
Get detailed performance metrics powered by Google PageSpeed Insights API:
- **4 Category Scores**: Performance, Accessibility, Best Practices, SEO
- **Core Web Vitals**: FCP, LCP, CLS, TBT with good/needs-improvement/poor ratings
- **Speed Index & Time to Interactive**
- **Detailed Recommendations** from Lighthouse audits with potential savings
- Resource breakdown and optimization suggestions

### 💡 AI Test Suggestions
Get intelligent suggestions for additional test cases based on your page content:
- Security tests (XSS, SQL injection detection)
- Boundary tests
- UX improvements
- Business logic validation

### 📤 Shareable Reports
Generate shareable links for test reports:
- Public report URLs
- View count tracking
- Expiration settings
- One-click sharing

### 🔄 Smart API Rate Limiting
Built-in protection against API rate limits:
- Automatic API key rotation
- Exponential backoff on rate limits
- Graceful fallbacks when APIs are unavailable

---

## 🛠️ Tech Stack

### Google Cloud Technologies
- **Firebase Hosting** - Fast, secure hosting for the web application
- **Firebase Authentication** - Google Sign-In integration for user management
- **Cloud Firestore** - NoSQL database for storing test runs and results
- **Google PageSpeed Insights API** - Lighthouse-powered performance analysis

### Frontend
- **React.js** - Modern UI framework
- **CSS3** - Custom styling with dark mode support

### Backend
- **Node.js** - Server runtime
- **Express.js** - API framework
- **Playwright** - Browser automation for test execution

### AI/ML
- **Llama 3.1** (via Groq) - LLM-powered test generation and bug explanations

### Deployment
- **Railway** - Backend hosting with Docker support
- **Firebase Hosting** - Frontend deployment

---

## 🎯 Supported Test Actions

BugScout's test executor supports a wide range of actions:

| Action | Aliases | Description |
|--------|---------|-------------|
| `click` | `tap` | Click on an element |
| `type` | `fill`, `input` | Enter text into an input field |
| `hover` | `mouseover` | Hover over an element |
| `select` | `selectOption`, `choose` | Select dropdown option |
| `check` | - | Check a checkbox |
| `uncheck` | - | Uncheck a checkbox |
| `press` | `key` | Press a keyboard key |
| `wait` | `delay`, `sleep` | Wait for specified milliseconds |
| `clear` | - | Clear input field |
| `focus` | - | Focus on an element |
| `doubleclick` | `dblclick` | Double-click an element |
| `rightclick` | - | Right-click an element |
| `scroll` | `scrollIntoView` | Scroll element into view |

---

## 📖 How to Use

### 1. Sign In
Visit [bugscout.web.app](https://bugscout.web.app) and sign in with your Google account.

### 2. Generate Tests
1. Navigate to **New Test** tab
2. Enter the URL you want to test
3. Select a test preset (Auto Detect, Login Flow, Signup, etc.)
4. Click **Generate Tests**

### 3. Review & Edit Tests
- View AI-generated test cases in the **Editor** tab
- Modify test steps, add custom tests, or remove unnecessary ones
- Each test shows the action, target element, and expected value

### 4. Execute Tests
- Click **Run All** to execute all test cases
- View results with a clear pass/fail summary banner
- Failed tests include AI-powered explanations

### 5. Additional Tools

#### Accessibility Audit
1. Go to **Accessibility** tab
2. Enter URL and click **Run Audit**
3. Review issues by severity (Critical, Serious, Moderate, Minor)

#### Performance Analysis
1. Go to **Performance** tab
2. Enter URL and click **Analyze**
3. View Lighthouse scores (Performance, Accessibility, Best Practices, SEO)
4. Check Core Web Vitals with color-coded ratings
5. Review detailed recommendations with potential time savings

#### Share Reports
1. Open a completed test run in **Editor**
2. Click **Share** button
3. Copy the generated link to share with your team

---

## 🏃 Running Locally

### Prerequisites
- Node.js 18+
- npm or yarn
- Firebase CLI

### Setup

1. **Clone the repository**
```bash
git clone https://github.com/Avaneesh-Inamdar/BugScout.git
cd BugScout
```

2. **Install dependencies**
```bash
npm install
cd frontend && npm install
```

3. **Configure environment variables**
```bash
# Root .env
GROQ_API_KEY=your_groq_api_key
PAGESPEED_API_KEY=your_google_pagespeed_api_key
PORT=3001

# frontend/.env.development
REACT_APP_API_URL=http://localhost:3001
```

4. **Start the backend**
```bash
npm start
```

5. **Start the frontend**
```bash
cd frontend
npm start
```

6. **Open in browser**
```
http://localhost:3000
```

---

## 📁 Project Structure

```
BugScout/
├── backend/
│   ├── server.js              # Express API server
│   ├── Dockerfile             # Docker config for Railway
│   └── services/
│       ├── pageInspector.js   # Page analysis & element detection
│       ├── testGenerator.js   # AI-powered test generation
│       ├── testExecutor.js    # Playwright test runner
│       ├── bugExplainer.js    # AI failure explanations
│       ├── accessibilityAuditor.js
│       ├── performanceAnalyzer.js  # Google Lighthouse integration
│       ├── visualDiff.js      # Screenshot comparison
│       ├── apiKeyManager.js   # API key rotation & rate limiting
│       ├── firestoreService.js
│       └── storageService.js
├── frontend/
│   ├── src/
│   │   ├── App.js             # Main React component
│   │   ├── firebase.js        # Firebase configuration
│   │   ├── styles.css         # Application styles
│   │   └── index.js
│   └── public/
├── firebase.json              # Firebase hosting config
├── firestore.rules            # Firestore security rules
└── Dockerfile                 # Root container configuration
```

---

## 🔒 Security

- All user data is isolated by Firebase Authentication UID
- Firestore security rules enforce user-level access control
- Shared reports use unique, unguessable IDs
- No sensitive data is stored in client-side code

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

## 👨‍💻 Made By

**The Unexecutables**

---

<p align="center">
  Made by The Unexecutables using Google Technologies
</p>
