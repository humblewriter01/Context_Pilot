# Jira Ticket Analyzer - Complete Setup Guide

This guide covers all three phases: MVP, Enhanced Features, and Production-Ready.

## 📋 Prerequisites

- Python 3.9+
- Node.js (for testing)
- PostgreSQL 14+ (for Phase 3)
- Firebase account (for Phase 3)
- OpenAI API key
- GitHub account (for Phase 2 verification)
- Chrome browser

---

## 🎯 Phase 1: MVP Setup

### 1. Backend Setup

```bash
# Create project directory
mkdir jira-analyzer
cd jira-analyzer

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set environment variables
export OPENAI_API_KEY='your-openai-key-here'

# Run the server
python app.py
```

Server will start on `http://localhost:5000`

### 2. Chrome Extension Setup

```bash
# Create extension directory
mkdir chrome-extension
cd chrome-extension

# Copy these files into the directory:
# - manifest.json
# - content.js
# - styles.css
# - popup.html

# Create icons directory
mkdir icons
# Add placeholder 16x16, 48x48, 128x128 PNG icons
```

**Load Extension in Chrome:**
1. Open Chrome → `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select your `chrome-extension` folder

### 3. Test Phase 1

1. Navigate to any Jira ticket (e.g., `https://yourcompany.atlassian.net/browse/PROJ-123`)
2. Look for "Analyze Files" button
3. Click it - should see AI-powered predictions

---

## 🚀 Phase 2: Enhanced Features

### 1. Upgrade Backend

```bash
# Use the enhanced backend
cp app_phase2.py app.py

# Test with enhanced features
python app.py
```

### 2. Update Chrome Extension

Replace `content.js` and `styles.css` with Phase 2 versions:
- `content_phase2.js` → `content.js`
- `styles_phase2.css` → `styles.css`

Reload extension in Chrome.

### 3. GitHub Integration (Optional)

```bash
# Install PyGithub
pip install PyGithub

# Set GitHub token
export GITHUB_TOKEN='your-github-token-here'

# Test GitHub verification
python github_verifier.py
```

**Using GitHub Verification:**

```python
from github_verifier import GitHubVerifier

verifier = GitHubVerifier(github_token='your-token')
result = verifier.verify_files(
    repo_name='owner/repo',
    file_paths=['src/app.js', 'api/routes.py']
)

print(f"Verified: {len(result['verified_files'])}")
print(f"Missing: {len(result['missing_files'])}")
```

---

## 🔐 Phase 3: Production Ready

### 1. Firebase Setup

**Create Firebase Project:**
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create new project
3. Enable Authentication → Google Sign-In
4. Go to Project Settings → Service Accounts
5. Generate new private key → Save as `firebase-credentials.json`

**Update Extension Configuration:**
- Copy your Firebase config from Firebase Console
- Update `firebase-auth.js` with your config

### 2. PostgreSQL Database Setup

```bash
# Install PostgreSQL
# Ubuntu/Debian: sudo apt-get install postgresql
# macOS: brew install postgresql

# Create database
createdb jira_analyzer

# Run schema
psql jira_analyzer < schema.sql

# Verify tables created
psql jira_analyzer -c "\dt"
```

**Environment Variables:**
```bash
export DB_HOST='localhost'
export DB_NAME='jira_analyzer'
export DB_USER='postgres'
export DB_PASSWORD='your-password'
export FIREBASE_CREDENTIALS_PATH='./firebase-credentials.json'
```

### 3. Run Production Backend

```bash
# Install Phase 3 dependencies
pip install -r requirements_phase3.txt

# Use Phase 3 backend
cp app_phase3.py app.py

# Run with production server
gunicorn -w 4 -b 0.0.0.0:5000 app:app
```

### 4. Update Chrome Extension for Auth

**Update `manifest.json`:**
```json
{
  "permissions": [
    "activeTab",
    "storage",
    "identity"
  ],
  "content_scripts": [
    {
      "matches": ["*://*.atlassian.net/browse/*"],
      "js": ["firebase-app.js", "firebase-auth-bundle.js", "firebase-auth.js", "content.js"],
      "css": ["styles.css"]
    }
  ]
}
```

**Add Firebase CDN to extension:**
Download Firebase JS SDKs and include them, or use the CDN URLs in your HTML files.

### 5. Testing Phase 3

**Test Authentication:**
1. Open extension popup
2. Click "Sign in with Google"
3. Complete OAuth flow
4. Verify user created in database

**Test Usage Limits:**
```sql
-- Check user's usage
SELECT * FROM user_stats WHERE email = 'your-email@example.com';

-- Manually adjust usage for testing
UPDATE usage 
SET tickets_processed_this_month = 4 
WHERE user_id = 1 AND month_year = TO_CHAR(CURRENT_DATE, 'YYYY-MM');
```

**Test Feedback System:**
```bash
curl -X POST http://localhost:5000/feedback \
  -H "Authorization: Bearer YOUR_FIREBASE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "analysis_id": 1,
    "was_accurate": true,
    "accuracy_rating": 4,
    "user_comment": "Very helpful!"
  }'
```

---

## 📊 Database Management

### Useful Queries

```sql
-- Get all users
SELECT * FROM users ORDER BY created_at DESC;

-- Check monthly usage
SELECT 
    u.email,
    u.subscription_tier,
    usg.tickets_processed_this_month,
    sp.monthly_ticket_limit
FROM users u
LEFT JOIN usage usg ON u.id = usg.user_id 
    AND usg.month_year = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
JOIN subscription_plans sp ON u.subscription_tier = sp.tier;

-- Feedback analytics
SELECT 
    was_accurate,
    AVG(accuracy_rating) as avg_rating,
    COUNT(*) as count
FROM feedback
GROUP BY was_accurate;

-- Top predicted files
SELECT 
    jsonb_array_elements_text(predicted_files->'frontend_files') as file,
    COUNT(*) as frequency
FROM analysis_history
GROUP BY file
ORDER BY frequency DESC
LIMIT 10;
```

### Reset User Usage (for testing)

```sql
-- Reset specific user's monthly usage
DELETE FROM usage WHERE user_id = 1 AND month_year = TO_CHAR(CURRENT_DATE, 'YYYY-MM');

-- Upgrade user to Pro
UPDATE users SET subscription_tier = 'pro' WHERE id = 1;
```

---

## 🔧 Configuration Files

### .env file (create this)

```env
# OpenAI
OPENAI_API_KEY=sk-...your-key-here

# Database
DB_HOST=localhost
DB_NAME=jira_analyzer
DB_USER=postgres
DB_PASSWORD=your-password

# Firebase
FIREBASE_CREDENTIALS_PATH=./firebase-credentials.json

# GitHub (optional)
GITHUB_TOKEN=ghp_...your-token

# Flask
FLASK_ENV=development
FLASK_DEBUG=True
```

### Load .env automatically

```python
# Add to top of app.py
from dotenv import load_dotenv
load_dotenv()
```

---

## 🚢 Deployment

### Deploy to Production

**Backend (using Heroku):**
```bash
# Create Procfile
echo "web: gunicorn app:app" > Procfile

# Create runtime.txt
echo "python-3.11.0" > runtime.txt

# Deploy
heroku create jira-analyzer-api
heroku addons:create heroku-postgresql:hobby-dev
heroku config:set OPENAI_API_KEY=your-key
git push heroku main
```

**Database Migration:**
```bash
heroku pg:psql < schema.sql
```

**Update Extension API URL:**
```javascript
// In content.js
const API_URL = 'https://jira-analyzer-api.herokuapp.com/analyze';
```

### Publish Chrome Extension

1. Create `.zip` of extension folder
2. Go to [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole)
3. Pay one-time $5 developer fee
4. Upload zip and fill out store listing
5. Submit for review

---

## 🐛 Troubleshooting

### Common Issues

**"API error: 401"**
- Check Firebase token is valid
- Verify `firebase-credentials.json` is correct
- Check Authorization header format

**"Monthly ticket limit reached"**
```sql
-- Check current usage
SELECT * FROM usage WHERE user_id = YOUR_USER_ID;

-- Reset for testing
DELETE FROM usage WHERE user_id = YOUR_USER_ID;
```

**Extension button not appearing**
- Check console for errors (`F12` → Console)
- Verify you're on a Jira ticket page (`/browse/` in URL)
- Try reloading the page
- Check if content script is injecting

**Database connection failed**
- Verify PostgreSQL is running: `pg_isready`
- Check connection string
- Ensure database exists: `psql -l`

**GitHub rate limit exceeded**
- Wait 1 hour for reset
- Use authenticated requests (include token)
- Check remaining: `curl https://api.github.com/rate_limit`

---

## 📈 Monitoring & Analytics

### Add Logging

```python
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)

# Use in code
logger.info(f"Analysis completed for ticket {ticket_key}")
logger.error(f"Analysis failed: {error}")
```

### Track Metrics

```sql
-- Daily analysis count
SELECT 
    DATE(created_at) as date,
    COUNT(*) as analyses
FROM analysis_history
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Average confidence by tier
SELECT 
    u.subscription_tier,
    AVG(ah.confidence_score) as avg_confidence,
    COUNT(*) as total_analyses
FROM analysis_history ah
JOIN users u ON ah.user_id = u.id
GROUP BY u.subscription_tier;
```

---

## 🎓 Next Steps

1. **Add more AI models** - Allow users to choose between GPT-4, Claude, etc.
2. **Webhook integration** - Automatically analyze tickets when created
3. **Team features** - Share analyses across team members
4. **Custom training** - Fine-tune on your codebase
5. **VS Code extension** - Integrate with IDEs
6. **Slack bot** - Get analysis in Slack

---

## 📝 License

MIT License - Feel free to use and modify for your projects!

## 🤝 Contributing

Found a bug or want to contribute? Issues and PRs welcome!

---

## 💡 Tips for Success

1. **Start with Phase 1** - Get the MVP working first
2. **Test thoroughly** - Try different types of tickets
3. **Collect feedback** - Use the feedback system to improve
4. **Monitor costs** - OpenAI API can add up, set spending limits
5. **Iterate** - Use real usage data to improve prompts and features

Happy coding! 🚀
