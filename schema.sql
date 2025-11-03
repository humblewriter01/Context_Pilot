-- Jira Ticket Analyzer Database Schema (Phase 3)

-- Users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    firebase_uid VARCHAR(128) UNIQUE NOT NULL,
    email VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    subscription_tier VARCHAR(50) NOT NULL DEFAULT 'free',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    
    CONSTRAINT subscription_tier_check CHECK (
        subscription_tier IN ('free', 'pro', 'enterprise')
    )
);

-- Usage tracking table
CREATE TABLE usage (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tickets_processed_this_month INTEGER DEFAULT 0,
    month_year VARCHAR(7) NOT NULL, -- Format: YYYY-MM
    last_processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(user_id, month_year)
);

-- Analysis history table
CREATE TABLE analysis_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ticket_key VARCHAR(50) NOT NULL,
    ticket_text TEXT NOT NULL,
    predicted_files JSONB, -- Stores the categorized file predictions
    confidence_score DECIMAL(3, 2),
    processing_time_ms INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_user_ticket (user_id, ticket_key),
    INDEX idx_created_at (created_at)
);

-- Feedback table for improving accuracy
CREATE TABLE feedback (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    analysis_id INTEGER REFERENCES analysis_history(id) ON DELETE CASCADE,
    ticket_key VARCHAR(50) NOT NULL,
    ticket_text TEXT,
    predicted_files JSONB,
    was_accurate BOOLEAN NOT NULL,
    accuracy_rating INTEGER CHECK (accuracy_rating BETWEEN 1 AND 5),
    missing_files TEXT[], -- Files that should have been predicted
    incorrect_files TEXT[], -- Files that were incorrectly predicted
    user_comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_accuracy (was_accurate),
    INDEX idx_user_feedback (user_id, created_at)
);

-- GitHub integration settings (optional)
CREATE TABLE github_integrations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    repo_name VARCHAR(255) NOT NULL,
    github_token_encrypted TEXT, -- Encrypted token
    default_branch VARCHAR(100) DEFAULT 'main',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_verified_at TIMESTAMP,
    
    UNIQUE(user_id, repo_name)
);

-- Subscription plans reference table
CREATE TABLE subscription_plans (
    tier VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    monthly_ticket_limit INTEGER NOT NULL,
    price_usd DECIMAL(10, 2) NOT NULL,
    features JSONB,
    
    CONSTRAINT tier_check CHECK (tier IN ('free', 'pro', 'enterprise'))
);

-- Insert default subscription plans
INSERT INTO subscription_plans (tier, name, monthly_ticket_limit, price_usd, features) VALUES
('free', 'Free Tier', 5, 0.00, '{
    "analysis": true,
    "github_verification": false,
    "history_retention_days": 7,
    "support": "community"
}'::jsonb),
('pro', 'Pro', 100, 9.99, '{
    "analysis": true,
    "github_verification": true,
    "history_retention_days": 90,
    "support": "email",
    "priority_processing": true
}'::jsonb),
('enterprise', 'Enterprise', -1, 49.99, '{
    "analysis": true,
    "github_verification": true,
    "history_retention_days": 365,
    "support": "priority",
    "priority_processing": true,
    "custom_models": true,
    "team_features": true
}'::jsonb);

-- Indexes for better query performance
CREATE INDEX idx_users_firebase_uid ON users(firebase_uid);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_usage_month ON usage(month_year);
CREATE INDEX idx_analysis_user_date ON analysis_history(user_id, created_at DESC);
CREATE INDEX idx_feedback_rating ON feedback(accuracy_rating);

-- View for user statistics
CREATE VIEW user_stats AS
SELECT 
    u.id,
    u.email,
    u.subscription_tier,
    COUNT(DISTINCT ah.id) as total_analyses,
    COALESCE(usg.tickets_processed_this_month, 0) as current_month_usage,
    sp.monthly_ticket_limit,
    AVG(ah.confidence_score) as avg_confidence_score,
    COUNT(DISTINCT f.id) as feedback_count,
    AVG(CASE WHEN f.was_accurate THEN 1.0 ELSE 0.0 END) as accuracy_rate
FROM users u
LEFT JOIN analysis_history ah ON u.id = ah.user_id
LEFT JOIN usage usg ON u.id = usg.user_id 
    AND usg.month_year = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
LEFT JOIN subscription_plans sp ON u.subscription_tier = sp.tier
LEFT JOIN feedback f ON u.id = f.user_id
GROUP BY u.id, u.email, u.subscription_tier, 
         usg.tickets_processed_this_month, sp.monthly_ticket_limit;

-- Function to check if user can analyze more tickets
CREATE OR REPLACE FUNCTION can_analyze_ticket(p_user_id INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
    v_tier VARCHAR(50);
    v_limit INTEGER;
    v_current_usage INTEGER;
BEGIN
    -- Get user's subscription tier and limit
    SELECT u.subscription_tier, sp.monthly_ticket_limit
    INTO v_tier, v_limit
    FROM users u
    JOIN subscription_plans sp ON u.subscription_tier = sp.tier
    WHERE u.id = p_user_id;
    
    -- Enterprise has unlimited (-1)
    IF v_limit = -1 THEN
        RETURN TRUE;
    END IF;
    
    -- Get current month's usage
    SELECT COALESCE(tickets_processed_this_month, 0)
    INTO v_current_usage
    FROM usage
    WHERE user_id = p_user_id 
    AND month_year = TO_CHAR(CURRENT_DATE, 'YYYY-MM');
    
    -- Check if under limit
    RETURN COALESCE(v_current_usage, 0) < v_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to increment usage counter
CREATE OR REPLACE FUNCTION increment_usage(p_user_id INTEGER)
RETURNS VOID AS $$
DECLARE
    v_current_month VARCHAR(7);
BEGIN
    v_current_month := TO_CHAR(CURRENT_DATE, 'YYYY-MM');
    
    INSERT INTO usage (user_id, month_year, tickets_processed_this_month, last_processed_at)
    VALUES (p_user_id, v_current_month, 1, CURRENT_TIMESTAMP)
    ON CONFLICT (user_id, month_year)
    DO UPDATE SET
        tickets_processed_this_month = usage.tickets_processed_this_month + 1,
        last_processed_at = CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE users IS 'Stores user account information from Firebase authentication';
COMMENT ON TABLE usage IS 'Tracks monthly ticket analysis usage per user';
COMMENT ON TABLE analysis_history IS 'Stores all ticket analysis results for audit and history';
COMMENT ON TABLE feedback IS 'User feedback on analysis accuracy for improving the AI model';
COMMENT ON TABLE github_integrations IS 'GitHub repository connections for file verification';
COMMENT ON COLUMN users.subscription_tier IS 'User subscription level: free (5/month), pro (100/month), enterprise (unlimited)';
COMMENT ON FUNCTION can_analyze_ticket IS 'Checks if user has remaining tickets in their monthly quota';
