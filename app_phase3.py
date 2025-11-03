from flask import Flask, request, jsonify, g
from flask_cors import CORS
import os
import json
import time
from datetime import datetime
from openai import OpenAI
import psycopg2
from psycopg2.extras import RealDictCursor
from functools import wraps
import firebase_admin
from firebase_admin import credentials, auth

app = Flask(__name__)
CORS(app)

# Initialize OpenAI
client = OpenAI(api_key=os.environ.get('OPENAI_API_KEY'))

# Initialize Firebase Admin SDK
cred = credentials.Certificate(os.environ.get('FIREBASE_CREDENTIALS_PATH', 'firebase-credentials.json'))
firebase_admin.initialize_app(cred)

# Database connection
def get_db():
    """Get database connection"""
    if 'db' not in g:
        g.db = psycopg2.connect(
            host=os.environ.get('DB_HOST', 'localhost'),
            database=os.environ.get('DB_NAME', 'jira_analyzer'),
            user=os.environ.get('DB_USER', 'postgres'),
            password=os.environ.get('DB_PASSWORD', ''),
            cursor_factory=RealDictCursor
        )
    return g.db

@app.teardown_appcontext
def close_db(error):
    """Close database connection"""
    db = g.pop('db', None)
    if db is not None:
        db.close()

# Authentication decorator
def require_auth(f):
    """Decorator to require Firebase authentication"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get('Authorization')
        
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({'error': 'Missing or invalid authorization header'}), 401
        
        id_token = auth_header.split('Bearer ')[1]
        
        try:
            # Verify Firebase ID token
            decoded_token = auth.verify_id_token(id_token)
            g.user_id = decoded_token['uid']
            g.user_email = decoded_token.get('email')
            
            # Get or create user in database
            db = get_db()
            cursor = db.cursor()
            
            cursor.execute("""
                INSERT INTO users (firebase_uid, email, last_login_at)
                VALUES (%s, %s, NOW())
                ON CONFLICT (firebase_uid)
                DO UPDATE SET last_login_at = NOW()
                RETURNING id, subscription_tier
            """, (g.user_id, g.user_email))
            
            user = cursor.fetchone()
            db.commit()
            
            g.db_user_id = user['id']
            g.subscription_tier = user['subscription_tier']
            
            return f(*args, **kwargs)
            
        except auth.InvalidIdTokenError:
            return jsonify({'error': 'Invalid authentication token'}), 401
        except Exception as e:
            print(f"Auth error: {e}")
            return jsonify({'error': 'Authentication failed'}), 401
    
    return decorated_function

def check_usage_limit():
    """Check if user can analyze more tickets this month"""
    db = get_db()
    cursor = db.cursor()
    
    cursor.execute("""
        SELECT can_analyze_ticket(%s) as can_analyze
    """, (g.db_user_id,))
    
    result = cursor.fetchone()
    return result['can_analyze']

def increment_usage_counter():
    """Increment user's usage counter"""
    db = get_db()
    cursor = db.cursor()
    
    cursor.execute("""
        SELECT increment_usage(%s)
    """, (g.db_user_id,))
    
    db.commit()

# ===== Authentication Endpoints =====

@app.route('/auth/register', methods=['POST'])
@require_auth
def register_user():
    """Register or update user information"""
    try:
        data = request.get_json()
        
        db = get_db()
        cursor = db.cursor()
        
        cursor.execute("""
            UPDATE users
            SET display_name = %s, updated_at = NOW()
            WHERE firebase_uid = %s
            RETURNING id, email, subscription_tier, created_at
        """, (
            data.get('display_name'),
            g.user_id
        ))
        
        user = cursor.fetchone()
        db.commit()
        
        return jsonify({
            'success': True,
            'user': dict(user)
        }), 200
        
    except Exception as e:
        print(f"Registration error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/usage/check', methods=['GET'])
@require_auth
def check_usage():
    """Check user's usage limits and remaining tickets"""
    try:
        db = get_db()
        cursor = db.cursor()
        
        # Get usage stats
        cursor.execute("""
            SELECT 
                u.subscription_tier,
                sp.monthly_ticket_limit,
                COALESCE(usg.tickets_processed_this_month, 0) as used_tickets,
                can_analyze_ticket(u.id) as can_analyze
            FROM users u
            JOIN subscription_plans sp ON u.subscription_tier = sp.tier
            LEFT JOIN usage usg ON u.id = usg.user_id 
                AND usg.month_year = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
            WHERE u.id = %s
        """, (g.db_user_id,))
        
        stats = cursor.fetchone()
        
        remaining = (stats['monthly_ticket_limit'] - stats['used_tickets'] 
                    if stats['monthly_ticket_limit'] != -1 else -1)
        
        return jsonify({
            'can_analyze': stats['can_analyze'],
            'subscription_tier': stats['subscription_tier'],
            'monthly_limit': stats['monthly_ticket_limit'],
            'used_tickets': stats['used_tickets'],
            'remaining_tickets': remaining
        }), 200
        
    except Exception as e:
        print(f"Usage check error: {e}")
        return jsonify({'error': str(e)}), 500

# ===== Analysis Endpoints =====

@app.route('/analyze', methods=['POST'])
@require_auth
def analyze_ticket():
    """Analyze a Jira ticket with authentication and usage tracking"""
    start_time = time.time()
    
    try:
        # Check usage limit
        if not check_usage_limit():
            db = get_db()
            cursor = db.cursor()
            cursor.execute("""
                SELECT sp.monthly_ticket_limit, sp.name
                FROM users u
                JOIN subscription_plans sp ON u.subscription_tier = sp.tier
                WHERE u.id = %s
            """, (g.db_user_id,))
            plan = cursor.fetchone()
            
            return jsonify({
                'error': 'Monthly ticket limit reached',
                'limit': plan['monthly_ticket_limit'],
                'plan': plan['name'],
                'upgrade_required': True
            }), 429
        
        data = request.get_json()
        
        if not data or 'ticket_text' not in data:
            return jsonify({'error': 'Missing ticket_text'}), 400
        
        ticket_text = data['ticket_text']
        ticket_key = data.get('ticket_key', 'Unknown')
        
        if len(ticket_text.strip()) < 10:
            return jsonify({'error': 'Ticket text too short'}), 400
        
        # Perform AI analysis
        result = analyze_ticket_enhanced(ticket_text)
        
        # Calculate processing time
        processing_time = int((time.time() - start_time) * 1000)
        result['processing_time_ms'] = processing_time
        
        # Save to database
        db = get_db()
        cursor = db.cursor()
        
        cursor.execute("""
            INSERT INTO analysis_history 
            (user_id, ticket_key, ticket_text, predicted_files, confidence_score, processing_time_ms)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id
        """, (
            g.db_user_id,
            ticket_key,
            ticket_text,
            json.dumps(result),
            result.get('confidence_score'),
            processing_time
        ))
        
        analysis_id = cursor.fetchone()['id']
        result['analysis_id'] = analysis_id
        
        # Increment usage counter
        increment_usage_counter()
        
        db.commit()
        
        # Add user context to response
        result['ticket_key'] = ticket_key
        result['user_tier'] = g.subscription_tier
        
        return jsonify(result), 200
        
    except Exception as e:
        print(f"Analysis error: {e}")
        return jsonify({
            'error': f'Analysis failed: {str(e)}',
            'frontend_files': [],
            'backend_files': [],
            'database_files': [],
            'config_files': [],
            'test_files': [],
            'confidence_score': 0.0
        }), 500

def analyze_ticket_enhanced(ticket_text):
    """Enhanced AI analysis with categorization"""
    prompt = f"""Act as a senior software engineer. Analyze this Jira ticket and identify specific code files, components, and API endpoints that need modification.

Consider:
1. Frontend components (UI elements, pages, components)
2. Backend services/APIs
3. Database/models
4. Configuration files

Return ONLY valid JSON (no markdown):
{{
  "frontend_files": ["path/to/Component.tsx"],
  "backend_files": ["api/controllers/controller.js"],
  "database_files": ["models/Model.js"],
  "config_files": ["config/app.js"],
  "test_files": ["tests/test.js"],
  "confidence_score": 0.85,
  "reasoning": "Brief explanation"
}}

Ticket: {ticket_text}"""

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "You are a senior software engineer. Return only valid JSON, no markdown."},
            {"role": "user", "content": prompt}
        ],
        temperature=0.2,
        max_tokens=800
    )

    ai_response = response.choices[0].message.content.strip()
    ai_response = ai_response.replace('```json', '').replace('```', '').strip()
    
    result = json.loads(ai_response)
    
    # Calculate total files
    total_files = sum([
        len(result.get('frontend_files', [])),
        len(result.get('backend_files', [])),
        len(result.get('database_files', [])),
        len(result.get('config_files', [])),
        len(result.get('test_files', []))
    ])
    result['total_files'] = total_files
    
    return result

# ===== Feedback Endpoints =====

@app.route('/feedback', methods=['POST'])
@require_auth
def submit_feedback():
    """Submit feedback on analysis accuracy"""
    try:
        data = request.get_json()
        
        required_fields = ['analysis_id', 'was_accurate']
        if not all(field in data for field in required_fields):
            return jsonify({'error': 'Missing required fields'}), 400
        
        db = get_db()
        cursor = db.cursor()
        
        cursor.execute("""
            INSERT INTO feedback 
            (user_id, analysis_id, ticket_key, was_accurate, accuracy_rating, 
             missing_files, incorrect_files, user_comment)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
        """, (
            g.db_user_id,
            data['analysis_id'],
            data.get('ticket_key'),
            data['was_accurate'],
            data.get('accuracy_rating'),
            data.get('missing_files', []),
            data.get('incorrect_files', []),
            data.get('user_comment')
        ))
        
        feedback_id = cursor.fetchone()['id']
        db.commit()
        
        return jsonify({
            'success': True,
            'feedback_id': feedback_id,
            'message': 'Thank you for your feedback!'
        }), 200
        
    except Exception as e:
        print(f"Feedback error: {e}")
        return jsonify({'error': str(e)}), 500

# ===== User Dashboard Endpoints =====

@app.route('/user/stats', methods=['GET'])
@require_auth
def get_user_stats():
    """Get user statistics and analysis history"""
    try:
        db = get_db()
        cursor = db.cursor()
        
        cursor.execute("""
            SELECT * FROM user_stats WHERE id = %s
        """, (g.db_user_id,))
        
        stats = cursor.fetchone()
        
        # Get recent analyses
        cursor.execute("""
            SELECT ticket_key, confidence_score, created_at, processing_time_ms
            FROM analysis_history
            WHERE user_id = %s
            ORDER BY created_at DESC
            LIMIT 10
        """, (g.db_user_id,))
        
        recent_analyses = cursor.fetchall()
        
        return jsonify({
            'stats': dict(stats) if stats else {},
            'recent_analyses': [dict(a) for a in recent_analyses]
        }), 200
        
    except Exception as e:
        print(f"Stats error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy',
        'service': 'Jira Ticket Analyzer API',
        'version': '3.0.0',
        'features': ['authentication', 'usage_tracking', 'feedback', 'enhanced_analysis']
    }), 200

if __name__ == '__main__':
    if not os.environ.get('OPENAI_API_KEY'):
        print("WARNING: OPENAI_API_KEY not set!")
    
    print("\n🚀 Starting Jira Ticket Analyzer API (Phase 3)")
    print("📍 Server: http://localhost:5000")
    print("🔐 Authentication: Firebase")
    print("💾 Database: PostgreSQL")
    print("📊 Features: Auth, Usage Tracking, Feedback\n")
    
    app.run(host='0.0.0.0', port=5000, debug=True)
