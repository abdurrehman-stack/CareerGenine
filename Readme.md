Submission for Bano Qabil AI Hackathon

Project Name: CareerGenie
Tagline: AI-Powered Career Mentorship & Roadmap Generator

Overview:
CareerGenie empowers students and professionals by transforming onboarding assessments into actionable career roadmaps, real-time strength/weakness analysis, tailored learning recommendations, and an interactive AI mentor named Genie.

Key Features:
 Dynamic AI Mentor (Genie) with tailored context-awareness
 6-Month Personalised Career Roadmap & SWAT Analysis
 Web-Scraped YouTube Learning Resource Aggregator
 Auto-Healing Multi-Model Gemini Fallback System for 100% Uptime
 Lightweight Flask Backend with modular JSON/TXT user profile persistence


CareerGenie is an intelligent career mentoring web application designed to analyze user profiles, provide personalized career advice, map out 6-month growth roadmaps, evaluate strengths/weaknesses, and aggregate curated learning resources.

 Tech Stack & Features

Backend: Python / Flask
AI Model: Google Gemini API (google-genai SDK with auto-healing dynamic model fallback)
Web Scraping: BeautifulSoup4 & Requests (for dynamic YouTube roadmap recommendations)
Environment Management: python-dotenv

 Project Structure

careergenie/
│
├── app.py                  # Main Flask backend & Gemini API routing
├── .env.example            # Sample environment template (DO NOT commit actual .env)
├── requirements.txt        # Project dependencies
├── templates/
│   └── index.html          # Web UI interface
└── data/
    └── users/              # Generated user profile files