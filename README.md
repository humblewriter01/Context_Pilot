# Context Pilot - Jira Ticket Analyzer (React Application)

Context Pilot is an AI-powered code impact and file prediction system for software engineering teams. It analyzes Jira tickets (summaries, descriptions, acceptance criteria) and predicts precisely which frontend components, backend APIs, database models/migrations, configurations, and test suites must be modified.

This application is rewritten in **React 19 + TypeScript + Vite + Tailwind CSS**, unifying the original Python Flask backend, PyGithub verifier, PostgreSQL telemetry schema, and Chrome Extension into a responsive web application.

---

## 🚀 Key Features

### 1. Jira Issue Analyzer & Extension Simulator
- Interactive Atlassian Jira issue view with breadcrumbs, priority, assignee, status, and rich text descriptions.
- Injected **"Analyze Files"** button featuring the authentic gradient (`#667eea` to `#764ba2`) and loading spinner.
- Floating **File Analysis Results Popover**:
  - Categorized breakdown: **Frontend** (🎨), **Backend** (⚙️), **Database** (🗄️), **Config** (⚙️), and **Tests** (✓).
  - Senior engineer architectural impact reasoning.
  - Confidence scoring badge (High, Medium, Low).
  - One-click file path copying and bulk copy.
  - In-popover feedback system for accuracy ratings (1–5 stars, accurate / inaccurate toggle, notes).

### 2. GitHub Codebase Verifier
- Ported from `github_verifier.py`.
- Tests predicted file paths against repositories (e.g., `owner/repo` on branch `main`).
- Calculates overall verification rate (`verified / total`).
- Provides directory suggestions for missing files (fuzzy matching against standard directories like `src/`, `app/`, `components/`, `api/`, `models/`, etc.).
- Inspects repository structure (detecting frontend, backend, or full-stack projects).

### 3. Analytics & Usage Dashboard
- Real-time aggregation mirroring the PostgreSQL `user_stats` view:
  - Monthly ticket quota usage progress bar.
  - Total analyses performed.
  - Mean model confidence score.
  - Engineer accuracy rating percentage.
  - Distribution breakdown across stack categories.
  - Recent analysis audit records.

### 4. Subscription & Quota Management
- Implements subscription plans:
  - **Free Tier**: 5 tickets/month, community support.
  - **Pro Tier**: 100 tickets/month, GitHub verification, 90-day retention, priority processing.
  - **Enterprise Tier**: Unlimited tickets, team features, custom models.
- Includes testing utilities: instant tier switching and **"Reset Monthly Usage"** button.

### 5. Chrome Extension Popup View
- Recreates the extension toolbar popup (`popup.html` and `firebase_auth.js`).
- Displays Google OAuth / Firebase session status and 3-step usage guide.

---

## 🛠️ Development & Build

```bash
# Install dependencies
npm install

# Start Vite dev server on port 3000
npm run dev

# Build production bundle
npm run build
```
