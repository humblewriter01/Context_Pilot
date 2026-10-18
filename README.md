# Context Pilot - Jira Ticket Analyzer (Full-Stack React + Node.js)

Context Pilot is an AI-powered code impact and file prediction system for software engineering teams. It analyzes Jira tickets (summaries, descriptions, acceptance criteria) and predicts precisely which frontend components, backend APIs, database models/migrations, configurations, and test suites must be modified.

Powered by **Google Gemini 3.8 Flash** with **Paystack Payment Gateway** and an **Enterprise Admin Portal**.

---

## 🚀 Key Features

### 1. Modern Collapsible Sidebar & Navigation
- Collapsible sidebar with labels for all major sections:
  - **Jira Issue Analyzer**: Live interactive ticket analysis.
  - **Dashboard & Stats**: Real-time telemetry & audit charts.
  - **GitHub Verifier**: Codebase existence verification.
  - **Audit History**: Historical prediction log and feedback ratings.
  - **Chrome Extension**: Extension toolbar popup simulator.
  - **Plans & Paystack**: Automated subscription billing.
  - **Admin Portal**: Link directly to `/admin`.

### 2. Professional Admin Portal (`/admin`)
- Accessible at `/admin` or via the topbar and sidebar Admin buttons.
- Protected by master administrator credentials:
  - **Default Email**: `admin@contextpilot.com`
  - **Default Password**: `ContextPilotAdmin2026!`
- **Overview & AI Telemetry**: Live Gemini 3.8 Flash request counts, estimated token usage, system uptime, and transaction volume.
- **Paystack Payment Gateway Settings**: Form to input Paystack Public Key (`pk_...`) and Secret Key (`sk_...`), toggle Live/Test mode, and set plan prices in NGN.
- **User Directory**: View registered users and modify their tiers (`Free`, `Pro`, `Enterprise`).
- **Payment Ledger**: Real-time transaction history from Paystack with verification references and settlement statuses.
- **Deployment Hub**: Configurations and guides for Render and Vercel.

### 3. Paystack Payment Gateway Integration
- Real server-side integration with Paystack API:
  - `POST /api/paystack/initialize`: Initializes checkout transactions.
  - `GET /api/paystack/verify/:reference`: Verifies transactions with Paystack and activates Pro / Enterprise plans.
  - `POST /api/paystack/webhook`: Processes instant payment webhook notifications.

### 4. Real Gemini 3.8 Flash Engine
- Runs on server-side `@google/genai` TypeScript SDK via `POST /api/analyze`.
- Zero mock data: evaluates real ticket descriptions and returns structured JSON across full-stack categories.

---

## 🚢 Deployment (Render, Vercel & Cloud Run)

### Current Live Deployment (Cloud Run)
The application is pre-configured and continuously running on your Google Cloud Run instance.

### Deploying to Render.com
Context Pilot includes a production `render.yaml` blueprint:
1. Connect your GitHub repository to [Render.com](https://render.com).
2. Select **New Web Service** (or Blueprint).
3. Set **Build Command**: `npm install && npm run build`
4. Set **Start Command**: `npm run start`
5. Add Environment Variables:
   - `GEMINI_API_KEY`: Your Google Gemini API Key
   - `PAYSTACK_SECRET_KEY`: Your Paystack Secret Key (`sk_live_...` or `sk_test_...`)
   - `PAYSTACK_PUBLIC_KEY`: Your Paystack Public Key (`pk_live_...` or `pk_test_...`)
   - `ADMIN_PASSWORD`: Your custom master admin password

### Deploying to Vercel
Context Pilot includes `vercel.json`:
1. Import repository into [Vercel](https://vercel.com).
2. Select **Vite** framework preset.
3. Add Environment Variables (`GEMINI_API_KEY`, `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`).
4. Click **Deploy**.

---

## 🛠️ Local Development

```bash
# Install dependencies
npm install

# Start development server on port 3000
npm run dev

# Run production build
npm run build
```
