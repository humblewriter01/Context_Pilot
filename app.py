from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import json
from openai import OpenAI

app = Flask(__name__)
CORS(app)  # Enable CORS for Chrome extension

# Initialize OpenAI client
client = OpenAI(api_key=os.environ.get('OPENAI_API_KEY'))

@app.route('/analyze', methods=['POST'])
def analyze_ticket():
    """
    Analyze a Jira ticket and predict which files need modification
    """
    try:
        # Get request data
        data = request.get_json()
        
        if not data or 'ticket_text' not in data:
            return jsonify({
                'error': 'Missing ticket_text in request body'
            }), 400
        
        ticket_text = data['ticket_text']
        ticket_key = data.get('ticket_key', 'Unknown')
        
        # Validate ticket text
        if not ticket_text or len(ticket_text.strip()) < 10:
            return jsonify({
                'error': 'Ticket text is too short or empty'
            }), 400
        
        # Create the AI prompt
        prompt = f"""Analyze this software development ticket and return ONLY a JSON array of the most likely code files and components that need modification. 

Be specific and realistic - include file extensions and reasonable paths based on common project structures.

Format your response as valid JSON: {{"files": ["path/to/file1.js", "components/ComponentName.tsx", "api/endpoint.py"]}}

Ticket: {ticket_text}"""
        
        # Call OpenAI API
        response = client.chat.completions.create(
            model="gpt-4o-mini",  # Using GPT-4 mini for cost efficiency
            messages=[
                {
                    "role": "system", 
                    "content": "You are a senior software engineer analyzing Jira tickets. Return only valid JSON with a 'files' array. No markdown, no explanations, just JSON."
                },
                {
                    "role": "user", 
                    "content": prompt
                }
            ],
            temperature=0.3,  # Lower temperature for more consistent results
            max_tokens=500
        )
        
        # Extract the response
        ai_response = response.choices[0].message.content.strip()
        
        # Clean up the response (remove markdown code blocks if present)
        if ai_response.startswith('```json'):
            ai_response = ai_response[7:]  # Remove ```json
        if ai_response.startswith('```'):
            ai_response = ai_response[3:]  # Remove ```
        if ai_response.endswith('```'):
            ai_response = ai_response[:-3]  # Remove trailing ```
        ai_response = ai_response.strip()
        
        # Parse JSON response
        try:
            result = json.loads(ai_response)
            
            # Ensure it has the expected structure
            if 'files' not in result:
                result = {'files': []}
            
            # Add metadata
            result['ticket_key'] = ticket_key
            result['timestamp'] = data.get('timestamp')
            
            return jsonify(result), 200
            
        except json.JSONDecodeError as e:
            print(f"JSON parsing error: {e}")
            print(f"AI Response: {ai_response}")
            return jsonify({
                'error': 'Failed to parse AI response',
                'files': [],
                'raw_response': ai_response
            }), 500
    
    except Exception as e:
        print(f"Error analyzing ticket: {str(e)}")
        return jsonify({
            'error': f'Internal server error: {str(e)}',
            'files': []
        }), 500

@app.route('/health', methods=['GET'])
def health_check():
    """
    Health check endpoint
    """
    return jsonify({
        'status': 'healthy',
        'service': 'Jira Ticket Analyzer API',
        'version': '1.0.0'
    }), 200

@app.errorhandler(404)
def not_found(e):
    return jsonify({
        'error': 'Endpoint not found'
    }), 404

@app.errorhandler(500)
def internal_error(e):
    return jsonify({
        'error': 'Internal server error'
    }), 500

if __name__ == '__main__':
    # Check for OpenAI API key
    if not os.environ.get('OPENAI_API_KEY'):
        print("WARNING: OPENAI_API_KEY environment variable not set!")
        print("Set it with: export OPENAI_API_KEY='your-key-here'")
    
    # Run the Flask app
    app.run(
        host='0.0.0.0',
        port=5000,
        debug=True
)
