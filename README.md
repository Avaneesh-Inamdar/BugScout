# Autonomous QA Agent

AI-powered web testing agent that automatically generates and executes test cases.

## Quick Start (Local Development)

```bash
# Install dependencies
npm install
cd frontend && npm install && cd ..

# Set up environment
cp .env.example .env
# Add your GROQ_API_KEY to .env (get free key at https://console.groq.com/keys)

# Start backend
npm start

# In another terminal, start frontend
cd frontend && npm start
```

Backend runs on http://localhost:3001, Frontend on http://localhost:3000

## How It Works

1. Enter a URL in the dashboard
2. Click "Generate Tests" - Playwright inspects the page, AI generates test cases
3. Review/edit the generated tests
4. Click "Run Tests" - Playwright executes tests and captures screenshots
5. View pass/fail results with screenshots

## Deploy to Google Cloud

```bash
# Build and deploy API to Cloud Run
gcloud builds submit --tag gcr.io/PROJECT_ID/qa-agent-api
gcloud run deploy qa-agent-api --image gcr.io/PROJECT_ID/qa-agent-api --platform managed --allow-unauthenticated --set-env-vars GROQ_API_KEY=your_key

# Deploy frontend to Firebase Hosting
cd frontend && npm run build
firebase deploy --only hosting
```

## Tech Stack

- Backend: Node.js, Express, Playwright
- Frontend: React
- AI: Groq API (free tier, Llama 3.1)
- Storage: Firestore + Cloud Storage (or local for dev)
