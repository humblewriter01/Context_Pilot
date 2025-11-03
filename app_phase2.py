from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import json
from openai import OpenAI

app = Flask(__name__)
CORS(app)

# Initialize OpenAI client
client = OpenAI(api_key=os.environ.get('OPENAI_API_KEY'))

def analyze_ticket_enhanced(ticket_text):
    """
    Enhanced analysis with categorized file predictions and confidence scores
    """
    prompt = f"""Act as a senior software engineer. Analyze this Jira ticket and identify the specific code files, components, and API endpoints that would need to be modified.

Consider:
1. Frontend components mentioned (look for UI elements, pages, components)
2. Backend services/APIs referenced
3. Database/models mentioned
4. Configuration files that might need updates

Return ONLY valid JSON with this exact structure (no markdown, no code blocks):
{{
  "frontend_files": ["path/to/Component.tsx", "pages/Dashboard.js"],
  "backend_files": ["api/controllers/userController.js", "services/authService.js"],
  "database_files": ["models/User.js", "migrations/add_user_field.sql"],
  "config_files": ["config/env.js", ".env.example"],
  "test_files": ["tests/user.test.js"],
  "confidence_score": 0.85,
  "reasoning": "Brief explanation of why these files were identified"
}}

If a category has no files, use an empty array []. Confidence score should be 0.0 to 1.0.

Ticket: {ticket_text}"""

    response = client.chat.completions.create(
        model="gpt-4o",  # Using GPT-4o for better analysis
        messages=[
            {
                "role": "system",
                "content": "You are a senior software engineer with expertise in analyzing requirements and mapping them to code changes. Return only valid JSON, no markdown formatting."
            },
            {
                "role": "user",
                "content": prompt
            }
        ],
        temperature=0.2,  # Lower for consistency
        max_tokens=800
    )

    ai_response = response.choices[0].message.content.strip()
    
    # Clean up response
    ai_response = ai_response.replace('```json', '').replace('```', '').strip()
    
    return json.loads(ai_response)

@app.route('/analyze', methods=['POST'])
def analyze_ticket():
    """
    Analyze a Jira ticket with enhanced categorization
    """
    try:
        data = request.get_json()
        
        if not data or 'ticket_text' not in data:
            return jsonify({'error': 'Missing ticket_text'}), 400
        
        ticket_text = data['ticket_text']
        ticket_key = data.get('ticket_key', 'Unknown')
        
        if not ticket_text or len(ticket_text.strip()) < 10:
            return jsonify({'error': 'Ticket text too short'}), 400
        
        # Get enhanced analysis
        result = analyze_ticket_enhanced(ticket_text)
        
        # Add metadata
        result['ticket_key'] = ticket_key
        
        # Calculate total files
        total_files = (
            len(result.get('frontend_files', [])) +
            len(result.get('backend_files', [])) +
            len(result.get('database_files', [])) +
            len(result.get('config_files', [])) +
            len(result.get('test_files', []))
        )
        result['total_files'] = total_files
        
        return jsonify(result), 200
        
    except json.JSONDecodeError as e:
        print(f"JSON parsing error: {e}")
        return jsonify({
            'error': 'Failed to parse AI response',
            'frontend_files': [],
            'backend_files': [],
            'database_files': [],
            'config_files': [],
            'test_files': [],
            'confidence_score': 0.0
        }), 500
    
    except Exception as e:
        print(f"Error: {str(e)}")
        return jsonify({
            'error': f'Internal error: {str(e)}',
            'frontend_files': [],
            'backend_files': [],
            'database_files': [],
            'config_files': [],
            'test_files': [],
            'confidence_score': 0.0
        }), 500

@app.route('/analyze/github-verify', methods=['POST'])
def verify_with_github():
    """
    Verify predicted files against GitHub repository (Phase 2)
    """
    try:
        data = request.get_json()
        
        predicted_files = data.get('predicted_files', [])
        repo_name = data.get('repo_name')
        github_token = data.get('github_token')
        
        if not all([predicted_files, repo_name, github_token]):
            return jsonify({'error': 'Missing required fields'}), 400
        
        # Import GitHub library
        from github import Github, GithubException
        
        # Initialize GitHub client
        g = Github(github_token)
        repo = g.get_repo(repo_name)
        
        verified_files = []
        missing_files = []
        
        for file_path in predicted_files:
            try:
                # Try to get the file from the repo
                repo.get_contents(file_path)
                verified_files.append({
                    'path': file_path,
                    'exists': True,
                    'url': f"https://github.com/{repo_name}/blob/main/{file_path}"
                })
            except GithubException:
                missing_files.append({
                    'path': file_path,
                    'exists': False,
                    'suggestion': f"File may not exist or path may be incorrect"
                })
        
        return jsonify({
            'verified_files': verified_files,
            'missing_files': missing_files,
            'verification_rate': len(verified_files) / len(predicted_files) if predicted_files else 0
        }), 200
        
    except Exception as e:
        print(f"GitHub verification error: {str(e)}")
        return jsonify({
            'error': f'GitHub verification failed: {str(e)}'
        }), 500

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy',
        'service': 'Jira Ticket Analyzer API',
        'version': '2.0.0',
        'features': ['enhanced_analysis', 'github_verification']
    }), 200

if __name__ == '__main__':
    if not os.environ.get('OPENAI_API_KEY'):
        print("WARNING: OPENAI_API_KEY not set!")
    
    print("\n🚀 Starting Jira Ticket Analyzer API (Phase 2)")
    print("📍 Server: http://localhost:5000")
    print("📊 Enhanced features: file categorization, confidence scores")
    print("🔗 GitHub verification: /analyze/github-verify\n")
    
    app.run(host='0.0.0.0', port=5000, debug=True)
