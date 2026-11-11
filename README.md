# Context Pilot - Jira Ticket Analyzer (Full-Stack React + Node.js)

Context Pilot is an AI-powered code impact and file prediction system for software engineering teams. It analyzes Jira tickets (summaries, descriptions, acceptance criteria) and predicts precisely which frontend components, backend APIs, database models/migrations, configurations, and test suites must be modified.

Powered by **Google Gemini (`gemini-2.5-flash`)** with **Paystack Payment Gateway** and an **Enterprise Admin Portal**.

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
- Protected by Supabase Auth: the signed-in user's email must match `ADMIN_EMAIL`.
  There is no shared admin password — sign in normally, then open `/admin`.
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

### 4. Real Gemini Analysis Engine
- Runs on the server-side `@google/genai` TypeScript SDK via `POST /api/analyze-ticket`.
- Model is configurable through `GEMINI_MODEL` (default `gemini-2.5-flash`).
- If the API key is missing or the call fails, a deterministic heuristic engine keeps the endpoint responsive.

---

## 🚢 Deployment (Vercel, Render & Cloud Run)

### Deploying to Vercel (recommended)

The repository ships with a serverless-ready layout:

| Path | Purpose |
| --- | --- |
| `api/index.js` | Prebuilt serverless bundle (generated from `server.ts` by `npm run build:api`). Vercel must see a real file here, so it is committed and refreshed on every build. |
| `vercel.json` | Rewrites `/api/*` to the function and serves the SPA elsewhere. |
| `dist/` | `vite build` output, served as static assets by Vercel. |

1. Import the repository into [Vercel](https://vercel.com) (framework preset **Vite**).
2. Add the environment variables listed below.
3. Deploy. `server.ts` only calls `app.listen()` outside Vercel — cold starts never bind a port.

`npm run build` runs `vite build` **and** `node scripts/build-api.mjs`, which re-bundles
`server.ts` into `api/index.js`. Never edit `api/index.js` by hand — change `server.ts` and rebuild.

**Required environment variables**

| Variable | Required | Notes |
| --- | --- | --- |
| `SUPABASE_URL` | ✅ | Server-only Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Server-only privileged database operations; never expose this in the frontend. |
| `VITE_SUPABASE_URL` | ✅ | Public Supabase project URL baked into the Vite frontend at build time. |
| `VITE_SUPABASE_ANON_KEY` | ✅ | Public anon key baked into the Vite frontend at build time. |
| `GEMINI_API_KEY` | ✅ | Server-side Gemini access. |
| `ADMIN_EMAIL` | ✅ | Email allowed into `/admin`. |
| `PAYSTACK_PUBLIC_KEY` / `PAYSTACK_SECRET_KEY` | optional | Needed for live billing. |
| `GEMINI_MODEL` | optional | Defaults to `gemini-2.5-flash`. |
| `USD_NGN_RATE` | optional | Conversion used for fixed NGN promo discounts charged in USD (default `1500`). |

Then run `supabase/schema.sql` in the Supabase SQL editor. GitHub verification uses the GitHub provider configured under Supabase Authentication → Providers. Add your app origin to the Supabase redirect URL allowlist. GitHub authorization is handled through the Supabase Auth session; the verifier does not add a separate credential store.

**Upgrading an existing database** — run `supabase/migrations/link_profiles_by_email.sql` once in the Supabase SQL editor
(it is safe to run again). It merges profiles that share an e-mail address, enforces one profile per address regardless of
letter case, and updates the sign-up trigger so that a new sign-in method (for example GitHub after e-mail sign-up) is linked
to the existing profile instead of creating a second one. New installations get the same behaviour from `supabase/schema.sql`.
Linking is done by verified e-mail address, so keep **Confirm email** enabled under Supabase Authentication.

**Database access from the browser** — the app reads and writes its tables only through the backend (service role). The two
browser roles keep the bare minimum, and every privilege they keep is paired with a row level security policy:

| Table | Visitor (`anon`) | Signed-in user (`authenticated`) |
| --- | --- | --- |
| `system_settings` | read | read |
| `users` | – | read own row |
| `analysis_history` | – | read and insert own rows |
| `feedback` | – | insert own rows |
| `transactions` | – | read own rows |
| `user_usage`, `promo_codes` | – | – |

So a plan, account status, quota or price can never be set from the browser, promo codes cannot be listed with the public key,
and neither role holds UPDATE, DELETE or TRUNCATE on any table. Profile edits such as a display name belong in a backend
endpoint. The keep-alive workflow relies on the visitor's read access to `system_settings`.

Databases created before these rules must run three files from `supabase/migrations/` once in the Supabase SQL editor:
`drop_users_update_policy.sql`, `drop_promo_codes_public_policy.sql` and `restrict_browser_privileges.sql`
(`revoke_users_write_grants.sql` is an earlier, narrower step that the last file includes). Each is safe to run again, and
re-running `supabase/schema.sql` applies all of them.

**Billing currency** — the pricing page starts in USD and switches to NGN only for visitors located in Nigeria, or when the
visitor picks NGN. The selected currency is what Paystack is asked to charge (USD in cents, NGN in kobo), priced on the server.
USD has to be enabled on the Paystack merchant account; until it is, USD checkouts are declined with a message that offers NGN.

**GitHub repositories** — the verifier lists the connected account's repositories (most recently updated first). Sign-in asks
GitHub for no repository scope, so only public repositories are listed until the user chooses *Include private repositories*,
which requests the `repo` scope. Any public repository can still be entered manually as `owner/repo`.

**Post-deploy verification**

| Check | Expected |
| --- | --- |
| `GET /api/health` | `status: healthy` and every entry under `integrations` that you configured is `true`. |
| `GET /api/supabase/health` | `healthy: true`. If it reports `HTTP 403 … 42501`, the tables exist but lack grants — run `supabase/grants.sql`. If it reports a missing table, re-run `supabase/schema.sql`. |
| Open the site | Redirects to the Supabase sign-in screen; `/admin` requires the `ADMIN_EMAIL` account. |

Note: pricing, limits and promo codes are stored in Supabase
(`system_settings`, `promo_codes`), so admin changes survive serverless cold starts.

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
   - `ADMIN_EMAIL`: Administrator email authorized to access /admin

### API surface (after the audit)

| Endpoint | Auth | Purpose |
| --- | --- | --- |
| `POST /api/analyze-ticket` | Supabase JWT (optional, used for quota) | Gemini file-impact prediction + quota + history. |
| `GET /api/history` | Supabase JWT | Server-side analysis history. |
| `GET /api/user/sync` | Supabase JWT | Authoritative tier, status and monthly usage. |
| `DELETE /api/history/:id` | Supabase JWT (owner only) | Delete one record (UUID or ticket key). |
| `POST /api/feedback` / `GET /api/feedback` | Supabase JWT | Accuracy feedback, scoped to the caller. |
| `POST /api/paystack/initialize` | public | Server-priced checkout (client amounts are ignored). |
| `GET /api/paystack/verify/:reference` | public | Verifies payment, rejects underpaid upgrades. |
| `POST /api/paystack/webhook` | HMAC signature | `charge.success` handling. |
| `/api/admin/*` | Supabase JWT + `ADMIN_EMAIL` | Admin portal API. |

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
