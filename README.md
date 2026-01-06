# 🔬 BugScout

**AI-Powered QA Testing Platform for Web Applications**

BugScout automatically generates, executes, and analyzes tests for your web applications. Get AI-powered insights, accessibility audits, and performance reports in minutes.

🌐 **Live Demo:** [https://bugscout.web.app](https://bugscout.web.app)

---

## 🚀 Features

### 🤖 AI Test Generation
Automatically generate comprehensive test plans by simply entering a URL. BugScout analyzes your page structure and creates relevant test cases including:
- Form validation tests
- Negative test scenarios
- Edge case detection
- Login/Signup flow testing

### 🐛 Smart Bug Explanations
When tests fail, BugScout provides plain-English explanations powered by AI:
- What went wrong
- Likely cause of the failure
- Suggested fixes
- Actionable tips for developers

### ♿ Accessibility Auditing
Run comprehensive accessibility audits based on WCAG guidelines:
- Contrast ratio checks
- Missing alt text detection
- ARIA label validation
- Keyboard navigation issues
- Accessibility score with detailed breakdown

### ⚡ Performance Analysis
Get detailed performance metrics for any webpage:
- First Contentful Paint (FCP)
- Largest Contentful Paint (LCP)
- Cumulative Layout Shift (CLS)
- Time to First Byte (TTFB)
- Resource breakdown and optimization suggestions

### 🎬 Flow Recorder
Record user interactions and convert them into automated tests:
- Click tracking
- Form input capture
- Navigation recording
- Exportable test scripts

### 💡 AI Test Suggestions
Get intelligent suggestions for additional test cases based on your page content:
- Security tests
- Boundary tests
- UX improvements
- Business logic validation

### 📤 Shareable Reports
Generate shareable links for test reports:
- Public report URLs
- View count tracking
- Expiration settings
- One-click sharing

---

## 🛠️ Tech Stack

### Google Cloud Technologies
- **Firebase Hosting** - Fast, secure hosting for the web application
- **Firebase Authentication** - Google Sign-In integration for user management
- **Cloud Firestore** - NoSQL database for storing test runs and results
- **Firebase Storage** - Screenshot and asset storage

### Frontend
- **React.js** - Modern UI framework
- **CSS3** - Custom styling with dark mode support

### Backend
- **Node.js** - Server runtime
- **Express.js** - API framework
- **Playwright** - Browser automation for test execution

### AI/ML
- **Llama 3.1** - LLM-powered test generation and bug explanations

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
- Click **Run Tests** to execute all test cases
- View real-time results with screenshots
- Failed tests include AI-powered explanations

### 5. Additional Tools

#### Accessibility Audit
1. Go to **Accessibility** tab
2. Enter URL and click **Run Audit**
3. Review issues by severity (Critical, Serious, Moderate, Minor)

#### Performance Analysis
1. Go to **Performance** tab
2. Enter URL and click **Analyze**
3. View Core Web Vitals and optimization suggestions

#### Flow Recorder
1. Go to **Recorder** tab
2. Enter URL and click **Start Recording**
3. Interact with the page in the opened browser
4. Click **Stop** to save the recorded flow as a test

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
PORT=5000

# frontend/.env.development
REACT_APP_API_URL=http://localhost:5000
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
│   └── services/
│       ├── pageInspector.js   # Page analysis & element detection
│       ├── testGenerator.js   # AI-powered test generation
│       ├── testExecutor.js    # Playwright test runner
│       ├── bugExplainer.js    # AI failure explanations
│       ├── accessibilityAuditor.js
│       ├── performanceAnalyzer.js
│       ├── flowRecorder.js    # User interaction recorder
│       ├── testSuggester.js   # AI test suggestions
│       ├── visualDiff.js      # Screenshot comparison
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
└── Dockerfile                 # Container configuration
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

## 📄 License

This project is open source and available under the MIT License.

---

## 👨‍💻 Author

**Avaneesh Inamdar**

- GitHub: [@Avaneesh-Inamdar](https://github.com/Avaneesh-Inamdar)

---

<p align="center">
  Made with ❤️ using Google Cloud Technologies
</p>
