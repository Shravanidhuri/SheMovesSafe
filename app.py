import os
from flask import Flask, jsonify, request, send_from_directory
import random
import google.generativeai as genai

app = Flask(__name__, static_folder='.')

# --- CONFIGURATION ---
# Replace with your actual Gemini API key or set it as an environment variable
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "YOUR_GEMINI_API_KEY") 

if GEMINI_API_KEY != "YOUR_GEMINI_API_KEY":
    genai.configure(api_key=GEMINI_API_KEY)

# ... (omitted mock data) ...

# --- ROUTES ---

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('.', path)

@app.route('/api/get_routes', methods=['POST'])
def get_routes():
    data = request.json
    # In a real app, we'd use Google Maps Directions API here to get actual polylines
    # For this hackathon MVP, we generate mock paths based on start point
    # We ignore the actual text input for coords but use them to generate "variations"
    
    # Just for demo, use the global LOCATIONS or fallback
    # In a real app we would geocode the user's text input
    start_lat = LOCATIONS['start'][0]
    start_lng = LOCATIONS['start'][1]
    end_lat = LOCATIONS['end'][0]
    end_lng = LOCATIONS['end'][1]
    
    routes = generate_mock_routes(start_lat, start_lng, end_lat, end_lng)
    return jsonify({"routes": routes})

@app.route('/api/analyze_safety', methods=['POST'])
def analyze_safety():
    data = request.json
    route_id = data.get('route_id')
    features = data.get('features', [])
    safety_score = data.get('safety_score')
    
    prompt = f"""
    Act as a safety expert for a pedestrian navigation app.
    Analyze the following route attributes:
    - Safety Score: {safety_score}/100
    - Environmental Features: {', '.join(features)}
    
    Provide a concise (2-3 sentences) safety advice warning or recommendation for a user walking this route alone at night.
    """
    
    if GEMINI_API_KEY == "YOUR_GEMINI_API_KEY":
        # Fallback if no key provided
        advice = "Gemini API Key missing. Simulation: "
        if safety_score > 80:
            advice += "This route is well-lit and populated. It is the recommended choice for safety."
        elif safety_score < 50:
            advice += "Caution: This route has poor lighting and isolation. Avoid if traveling alone at night."
        else:
            advice += "Moderate risk. Stay alert and keep to main paths where possible."
        return jsonify({"analysis": advice})
    
    try:
        model = genai.GenerativeModel('gemini-pro')
        response = model.generate_content(prompt)
        return jsonify({"analysis": response.text})
    except Exception as e:
        return jsonify({"error": str(e), "analysis": "Could not analyze safety at this time."})

if __name__ == '__main__':
    app.run(debug=True)
