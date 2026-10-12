from flask import Flask, render_template, request, jsonify, session, send_file
from google import genai
import os
import json
import re
from datetime import datetime, timedelta
from dotenv import load_dotenv
import requests
from bs4 import BeautifulSoup
import uuid
from io import BytesIO

# PDF generation
try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
    PDF_AVAILABLE = True
except ImportError:
    PDF_AVAILABLE = False
    print("⚠️ reportlab not installed. Run: pip install reportlab")

load_dotenv()

os.makedirs('data/users', exist_ok=True)
os.makedirs('data/uploads', exist_ok=True)

app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY', 'default_secret_key_careergenie')
app.config['SESSION_PERMANENT'] = True
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=7)

# ============================================================
# Gemini Client Setup
# ============================================================
client = None
try:
    api_key = os.getenv('GEMINI_API_KEY')
    if not api_key:
        print("❌ API Key missing in .env file!")
    else:
        client = genai.Client(api_key=api_key)
        print("✅ Gemini configured successfully with Google GenAI SDK")
except Exception as e:
    print(f"❌ Gemini configuration error: {e}")


CANDIDATE_MODELS = [
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
]


def get_working_models():
    if client is None:
        return CANDIDATE_MODELS
    try:
        available_models = []
        for m in client.models.list():
            name = m.name.replace('models/', '') if hasattr(m, 'name') else str(m)
            if 'live' in name.lower() or 'native-audio' in name.lower():
                continue
            if any(x in name.lower() for x in ['embedding', 'aqa', 'tts', 'image', 'omni', 'lyria', 'deep-research']):
                continue
            if 'exp' in name.lower():
                continue
            if 'flash' in name.lower() or 'pro' in name.lower():
                available_models.append(name)
        if available_models:
            return available_models
    except Exception as e:
        print(f"⚠️ Could not dynamically list models: {e}")
    return CANDIDATE_MODELS


def generate_content_with_fallback(prompt):
    if client is None:
        raise Exception("Gemini client is not initialized. Check your API key.")
    models_to_try = get_working_models()
    last_exception = None
    for model_name in models_to_try:
        if 'live' in model_name.lower() or 'native-audio' in model_name.lower():
            continue
        try:
            print(f"🔄 Trying model: {model_name}...")
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
            )
            if response and response.text:
                print(f"✅ Success with model: {model_name}")
                return response.text
        except Exception as e:
            print(f"⚠️ Failed with model {model_name}: {str(e)}")
            last_exception = e
    raise Exception(f"All models failed. Last error: {str(last_exception)}")


def generate_json_with_fallback(prompt):
    """Generate content and parse as JSON robustly."""
    text = generate_content_with_fallback(prompt)
    try:
        return json.loads(text)
    except Exception:
        pass
    match = re.search(r'\{.*\}', text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except Exception:
            pass
    match = re.search(r'\[.*\]', text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except Exception:
            pass
    raise Exception("Could not parse JSON response")


# ============================================================
# Onboarding Questions
# ============================================================
QUESTIONS = [
    "What's your full name?",
    "What do you currently do? (Job/Student/Other)",
    "How many years of experience do you have?",
    "What are your top 3 skills? (comma separated)",
    "What do you enjoy doing the most?",
    "Where do you see yourself in 5 years?",
    "What's the biggest challenge in your career?",
    "What kind of learning works best for you?",
    "Which industry excites you the most?",
    "Is there anything else you'd like to share?"
]


def extract_topic_from_profile(user_data):
    keywords = []
    for line in user_data.split('\n'):
        line = line.strip()
        if '→' in line:
            clean = line.split('→', 1)[-1].strip()
            if clean and len(clean) > 3:
                keywords.append(clean)
    for kw in keywords:
        low = kw.lower()
        if low in ['student', 'job', 'other', 'none', 'n/a']:
            continue
        words = kw.split()
        return ' '.join(words[:4])
    return "career skills"


# ============================================================
# Routes
# ============================================================
@app.route('/')
def home():
    return render_template('index.html')


@app.route('/api/questions', methods=['GET'])
def get_questions():
    return jsonify({'questions': QUESTIONS})


@app.route('/api/save-user', methods=['POST'])
def save_user():
    data = request.json or {}
    answers = data.get('answers', [])

    if not answers or len(answers) < 10:
        return jsonify({'error': 'All questions must be answered'}), 400

    user_name = answers[0].strip().replace(' ', '_').lower()
    user_id = str(uuid.uuid4())[:6]
    filename = f"data/users/{user_name}_{user_id}.txt"

    os.makedirs('data/users', exist_ok=True)

    with open(filename, 'w', encoding='utf-8') as f:
        f.write("=" * 60 + "\n")
        f.write("CAREERGENIE USER PROFILE\n")
        f.write("=" * 60 + "\n\n")
        f.write(f"User ID: {user_id}\n")
        f.write(f"Name: {answers[0]}\n")
        f.write(f"Generated: {datetime.now().strftime('%B %d, %Y at %I:%M %p')}\n\n")
        f.write("-" * 60 + "\n")
        f.write("ASSESSMENT RESPONSES\n")
        f.write("-" * 60 + "\n\n")
        for i, q in enumerate(QUESTIONS):
            f.write(f"{i+1}. {q}\n")
            f.write(f"   → {answers[i]}\n\n")
        f.write("-" * 60 + "\n")
        f.write("END OF PROFILE\n")
        f.write("-" * 60)

    session.permanent = True
    session['user_file'] = filename
    session['user_name'] = answers[0]

    return jsonify({
        'success': True,
        'user_id': user_id,
        'name': answers[0],
        'message': 'Profile saved successfully'
    })


# ============================================================
# FEATURE: UPLOAD USER DATA (txt file)
# ============================================================
@app.route('/api/upload-user', methods=['POST'])
def upload_user():
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file uploaded'}), 400
        file = request.files['file']
        if not file.filename:
            return jsonify({'error': 'Empty filename'}), 400
        if not file.filename.lower().endswith('.txt'):
            return jsonify({'error': 'Only .txt files are allowed'}), 400

        content = file.read().decode('utf-8', errors='ignore').strip()
        if not content or len(content) < 20:
            return jsonify({'error': 'File is empty or too short'}), 400

        structure_prompt = f"""You are helping process a raw user data file for a career mentoring system.

RAW USER DATA:
\"\"\"
{content[:6000]}
\"\"\"

Extract and structure this information into a well-organized user profile. Use this EXACT format:

USER NAME: <extracted or "Unknown">

CORE PROFILE:
- Current Role/Status: <what they do>
- Experience Level: <years or level>
- Top Skills: <comma separated skills>
- Interests: <what they enjoy>
- 5-Year Goal: <their ambition>
- Biggest Challenge: <their current struggle>
- Learning Style: <preferred learning>
- Target Industry: <industry>
- Additional Notes: <anything else relevant>

DETAILED BACKGROUND:
<Write a detailed 3-4 paragraph summary of who this person is, their journey so far, their goals, and their challenges. Be specific and use their actual information.>

Return ONLY the structured profile. No preamble, no explanations.
"""

        structured = generate_content_with_fallback(structure_prompt)

        name_match = re.search(r'USER NAME:\s*(.+)', structured)
        user_name_raw = name_match.group(1).strip() if name_match else "Uploaded User"
        if user_name_raw.lower() in ['unknown', 'n/a', '']:
            user_name_raw = "Uploaded User"

        safe_name = re.sub(r'[^\w\s]', '', user_name_raw).strip().replace(' ', '_').lower() or "uploaded_user"
        user_id = str(uuid.uuid4())[:6]
        filename = f"data/users/{safe_name}_{user_id}.txt"

        with open(filename, 'w', encoding='utf-8') as f:
            f.write("=" * 60 + "\n")
            f.write("CAREERGENIE USER PROFILE (UPLOADED)\n")
            f.write("=" * 60 + "\n\n")
            f.write(f"User ID: {user_id}\n")
            f.write(f"Source: Uploaded file\n")
            f.write(f"Generated: {datetime.now().strftime('%B %d, %Y at %I:%M %p')}\n\n")
            f.write("-" * 60 + "\n")
            f.write("STRUCTURED PROFILE\n")
            f.write("-" * 60 + "\n\n")
            f.write(structured)
            f.write("\n\n" + "-" * 60 + "\n")
            f.write("ORIGINAL UPLOADED CONTENT\n")
            f.write("-" * 60 + "\n\n")
            f.write(content)
            f.write("\n\n" + "-" * 60 + "\n")
            f.write("END OF PROFILE\n")
            f.write("-" * 60)

        session.permanent = True
        session['user_file'] = filename
        session['user_name'] = user_name_raw

        return jsonify({
            'success': True,
            'user_id': user_id,
            'name': user_name_raw,
            'message': 'Profile uploaded and processed successfully'
        })
    except Exception as e:
        print(f"❌ Upload error: {e}")
        return jsonify({'error': f'Upload failed: {str(e)}'}), 500


# ============================================================
# FEATURE: DOWNLOAD USER DATA (generated .txt profile)
# ============================================================
@app.route('/api/download-user-data', methods=['GET'])
def download_user_data():
    try:
        filename = session.get('user_file')
        if not filename or not os.path.exists(filename):
            return jsonify({'error': 'No profile found. Please complete onboarding first.'}), 400

        user_name = session.get('user_name', 'User')
        safe_name = re.sub(r'[^\w]', '_', user_name)

        with open(filename, 'r', encoding='utf-8') as f:
            content = f.read()

        buffer = BytesIO()
        buffer.write(content.encode('utf-8'))
        buffer.seek(0)

        download_name = f"CareerGenie_Profile_{safe_name}_{datetime.now().strftime('%Y%m%d')}.txt"

        return send_file(
            buffer,
            as_attachment=True,
            download_name=download_name,
            mimetype='text/plain'
        )

    except Exception as e:
        print(f"❌ Download error: {str(e)}")
        return jsonify({'error': f'Download failed: {str(e)}'}), 500


# ============================================================
# FEATURE 1: AI CHATBOT
# ============================================================
@app.route('/api/chat', methods=['POST'])
def chat():
    try:
        data = request.json or {}
        message = data.get('message', '').strip()
        filename = session.get('user_file')

        if not message:
            return jsonify({'error': 'Message cannot be empty'}), 400
        if not filename or not os.path.exists(filename):
            return jsonify({'error': 'Please complete onboarding first'}), 400

        with open(filename, 'r', encoding='utf-8') as f:
            user_data = f.read()

        user_name = session.get('user_name', 'there')

        system_prompt = f"""You are "Genie", an intelligent AI Career Mentor, Life Guide, and supportive Big Brother for {user_name}.

You are not a robotic assistant and you should never sound like one. You genuinely care about {user_name}'s future, career, skills, ambitions, problems, and personal growth. Your goal is not just to answer questions — it's to understand the person behind the question and help them make better decisions over time.

Here is everything you currently know about the user:

{user_data}

## YOUR CORE PERSONALITY
You are: a supportive older brother, an intelligent career strategist, a practical mentor, a brutally honest but kind advisor, a curious listener, a motivating friend.

You are warm, friendly, intelligent, emotionally aware, and practical. Make the user feel: "This AI actually knows me, remembers my goals, understands my situation, and genuinely wants me to succeed."

Never sound overly formal, corporate, robotic, or like a generic motivational chatbot. Do not give empty motivational lines.

## LANGUAGE STYLE
Speak naturally in whatever feels most comfortable — English, Roman Urdu, or a natural mix. Match the user's style.

## INTELLIGENCE AND PERSONALIZATION
Before giving advice, consider: their current skills, career goals, age/experience, financial situation (if known), available time, education, strengths, weaknesses, past decisions, long-term ambitions, previous conversations.

Always connect advice to the user's actual situation. Never give generic advice when profile information is available.

## ADVICE QUALITY
Advice must be specific, actionable, realistic, personalized, honest. Whenever possible, provide: what the situation is, what you recommend, why, and the next practical action.

## BE HONEST
Never blindly agree. If the user is making a weak decision, respectfully challenge them. Help the user think better, not just validate them.

## RESPONSE LENGTH
Keep responses concise and conversational by default. However, if the user asks for career planning, major life decisions, roadmaps, comparisons, or detailed strategy — then provide structured and deeper guidance.

## YOUR ULTIMATE GOAL
Help {user_name} build a meaningful and successful career while understanding their unique situation.

Every response should feel personal, intelligent, human, and genuinely useful. You are Genie. You don't just answer questions — you understand the person asking them.
"""

        full_prompt = f"{system_prompt}\n\n{user_name}'s question: {message}"

        response_text = generate_content_with_fallback(full_prompt)

        return jsonify({
            'response': response_text,
            'timestamp': datetime.now().strftime('%I:%M %p')
        })

    except Exception as e:
        print(f"❌ Chat error: {str(e)}")
        return jsonify({'error': f'Error: {str(e)}'}), 500


# ============================================================
# FEATURE 2: YOUTUBE SUGGESTIONS - 5 Personalized videos
# ============================================================
@app.route('/api/youtube', methods=['POST'])
def youtube_suggestions():
    try:
        filename = session.get('user_file')
        if not filename or not os.path.exists(filename):
            return jsonify({'error': 'Please complete onboarding first'}), 400

        with open(filename, 'r', encoding='utf-8') as f:
            user_data = f.read()

        plan_prompt = f"""Analyze this user's profile carefully:

{user_data}

Generate exactly 5 highly specific YouTube search queries for THIS person:

- 2 queries for TECHNICAL skills they specifically need (based on their current skills, gaps, and target role)
- 2 queries for SOFT skills they specifically need (based on their personality, challenges, and goals)
- 1 query that is FULLY PERSONALIZED — combining their unique combination of interests, goals, and situation

Return ONLY valid JSON in this exact format:
{{
  "technical": [
    {{"query": "specific tech skill search query", "reason": "why this for them"}},
    {{"query": "specific tech skill search query", "reason": "why this for them"}}
  ],
  "soft": [
    {{"query": "specific soft skill search query", "reason": "why this for them"}},
    {{"query": "specific soft skill search query", "reason": "why this for them"}}
  ],
  "personalized": {{
    "query": "fully personalized search query combining their unique profile",
    "reason": "why this specifically for them"
  }}
}}

Make queries specific and searchable. Use their actual skills, interests, and goals. No generic queries.
"""

        try:
            plan = generate_json_with_fallback(plan_prompt)
        except Exception as e:
            print(f"⚠️ Plan generation failed, using fallback: {e}")
            fallback_topic = extract_topic_from_profile(user_data)
            plan = {
                "technical": [
                    {"query": f"{fallback_topic} tutorial 2026", "reason": "Core technical skill"},
                    {"query": f"{fallback_topic} advanced project", "reason": "Advanced application"}
                ],
                "soft": [
                    {"query": "communication skills for professionals", "reason": "Essential soft skill"},
                    {"query": "time management productivity", "reason": "Better execution"}
                ],
                "personalized": {
                    "query": f"{fallback_topic} career roadmap",
                    "reason": "Personalized growth path"
                }
            }

        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                          '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }

        def search_youtube(query):
            try:
                url = f"https://www.youtube.com/results?search_query={requests.utils.quote(query)}"
                response = requests.get(url, headers=headers, timeout=8)
                soup = BeautifulSoup(response.text, 'html.parser')

                videos = []
                for link in soup.find_all('a', href=True):
                    if '/watch?v=' in link['href']:
                        video_id = link['href'].split('=')[1].split('&')[0]
                        title = link.get('title', '') or link.get_text(strip=True)
                        if title and len(title) > 15:
                            videos.append({
                                'id': video_id,
                                'title': title,
                                'url': f"https://www.youtube.com/watch?v={video_id}",
                                'thumbnail': f"https://img.youtube.com/vi/{video_id}/mqdefault.jpg"
                            })
                        if len(videos) >= 5:
                            break

                query_words = [w.lower() for w in re.sub(r'[^\w\s]', '', query).split() if len(w) > 3]
                if query_words:
                    relevant = [v for v in videos if any(w in v['title'].lower() for w in query_words)]
                    if relevant:
                        videos = relevant

                return videos[0] if videos else None
            except Exception as e:
                print(f"⚠️ Search failed for '{query}': {e}")
                return None

        results = []

        tasks = []
        for item in plan.get('technical', [])[:2]:
            tasks.append((item.get('query', ''), item.get('reason', ''), 'Technical'))
        for item in plan.get('soft', [])[:2]:
            tasks.append((item.get('query', ''), item.get('reason', ''), 'Soft Skill'))
        p = plan.get('personalized', {})
        if p:
            tasks.append((p.get('query', ''), p.get('reason', ''), 'Personalized'))

        for query, reason, category in tasks:
            if not query:
                continue
            vid = search_youtube(query)
            if vid:
                vid['category'] = category
                vid['reason'] = reason
                vid['query'] = query
                results.append(vid)
            else:
                results.append({
                    'id': str(uuid.uuid4())[:8],
                    'title': f"{query.title()}",
                    'url': f"https://www.youtube.com/results?search_query={requests.utils.quote(query)}",
                    'thumbnail': 'https://img.youtube.com/vi/rfscVS0vtbw/mqdefault.jpg',
                    'category': category,
                    'reason': reason,
                    'query': query
                })

        return jsonify({'videos': results, 'count': len(results)})

    except Exception as e:
        print(f"❌ YouTube error: {str(e)}")
        return jsonify({'error': str(e)}), 500


# ============================================================
# FEATURE 3: ANALYSIS
# ============================================================
@app.route('/api/analysis', methods=['GET'])
def analysis():
    try:
        filename = session.get('user_file')
        if not filename or not os.path.exists(filename):
            return jsonify({'error': 'No profile found'}), 400

        with open(filename, 'r', encoding='utf-8') as f:
            user_data = f.read()

        prompt = f"""
        Analyze this person's profile and identify their key strengths and weaknesses.
        PROFILE:
        {user_data}

        Return ONLY valid JSON in this exact format:
        {{
            "strengths": [
                {{"name": "Strength Name", "description": "What makes this a strength", "advice": "How to leverage it"}}
            ],
            "weaknesses": [
                {{"name": "Weakness Name", "description": "What makes this challenging", "advice": "How to improve it"}}
            ]
        }}
        """

        data = generate_json_with_fallback(prompt)
        return jsonify(data)

    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ============================================================
# FEATURE 4: FUTURE PLAN
# ============================================================
@app.route('/api/future-plan', methods=['GET'])
def future_plan():
    try:
        filename = session.get('user_file')
        if not filename or not os.path.exists(filename):
            return jsonify({'error': 'No profile found'}), 400

        with open(filename, 'r', encoding='utf-8') as f:
            user_data = f.read()

        prompt = f"""Create a highly personalized, practical 6-month career plan for this person.

PROFILE:
{user_data}

Requirements:
- Use markdown headings (## for month titles, ### for sub-sections)
- Be specific to their skills, goals, and challenges
- Include concrete monthly milestones
- Include weekly time commitments
- Include specific projects/actions
- Reference their actual profile details
- End with measurable success metrics

Format beautifully with proper heading structure.
"""
        plan_text = generate_content_with_fallback(prompt)
        return jsonify({'plan': plan_text})

    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ============================================================
# FEATURE 5: REPORT
# ============================================================
@app.route('/api/report', methods=['GET'])
def report():
    try:
        filename = session.get('user_file')
        if not filename or not os.path.exists(filename):
            return jsonify({'error': 'No profile found'}), 400

        with open(filename, 'r', encoding='utf-8') as f:
            user_data = f.read()

        prompt = f"""Create a comprehensive, beautifully formatted career report for this person.

PROFILE:
{user_data}

Structure the report with these sections using markdown (## for main headings, ### for sub):

## Executive Summary
## Profile Overview
## Key Strengths
## Areas for Growth
## 6-Month Career Roadmap
## Learning Resources & Recommendations
## Action Plan (Next 30 Days)
## Long-Term Vision (2-5 Years)
## Final Mentor Notes

Requirements:
- Personalized to their actual profile
- Specific and actionable
- Reference their unique skills, goals, challenges
- Structured with clear headings
- Professional and warm tone
- No generic filler content
"""
        report_text = generate_content_with_fallback(prompt)
        return jsonify({'report': report_text})

    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ============================================================
# FEATURE: DOWNLOAD REPORT AS PDF
# ============================================================
@app.route('/api/download-report', methods=['GET'])
def download_report():
    try:
        if not PDF_AVAILABLE:
            return jsonify({'error': 'PDF generation not available. Install reportlab.'}), 500

        filename = session.get('user_file')
        if not filename or not os.path.exists(filename):
            return jsonify({'error': 'No profile found'}), 400

        with open(filename, 'r', encoding='utf-8') as f:
            user_data = f.read()

        user_name = session.get('user_name', 'User')

        report_prompt = f"""Create a comprehensive, beautifully structured career report for this person.

PROFILE:
{user_data}

Structure with these sections (use ## for main headings, ### for subsections):

## Executive Summary
A 3-4 sentence personalized summary of who they are, where they stand, and where they're headed.

## Profile Overview
Detailed overview: current role, experience, skills, interests, goals, challenges.

## Key Strengths
5-7 specific strengths with why they matter for this person.

## Areas for Growth
5-7 specific areas with actionable improvement advice.

## 6-Month Career Roadmap
Month-by-month plan with:
### Month 1: <specific title>
### Month 2: <specific title>
... (through Month 6)

## Technical Skills to Build
Specific technical skills they should learn, with why and how.

## Soft Skills to Develop
Specific soft skills they should develop, with why and how.

## Recommended Learning Resources
Specific courses, YouTube topics, books — personalized to them.

## 30-Day Action Plan
### Week 1
### Week 2
### Week 3
### Week 4

## Long-Term Vision (2-5 Years)
Realistic path for their goals.

## Final Mentor Notes
A warm, personal closing message from their mentor.

Be extremely specific and personalized. No generic filler.
Use markdown formatting with ## and ### headings, **bold**, and - bullets.
"""

        report_text = generate_content_with_fallback(report_prompt)

        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=0.75*inch,
            leftMargin=0.75*inch,
            topMargin=0.75*inch,
            bottomMargin=0.75*inch,
            title=f"CareerGenie Report - {user_name}"
        )

        styles = getSampleStyleSheet()

        title_style = ParagraphStyle(
            'CustomTitle', parent=styles['Title'],
            fontName='Helvetica-Bold', fontSize=26, leading=32,
            textColor=colors.HexColor('#1A1A2E'), alignment=TA_CENTER,
            spaceAfter=8
        )
        subtitle_style = ParagraphStyle(
            'CustomSubtitle', parent=styles['Normal'],
            fontName='Helvetica-Oblique', fontSize=12, leading=16,
            textColor=colors.HexColor('#D94A38'), alignment=TA_CENTER,
            spaceAfter=24
        )
        h1_style = ParagraphStyle(
            'CustomH1', parent=styles['Heading1'],
            fontName='Helvetica-Bold', fontSize=18, leading=22,
            textColor=colors.HexColor('#1A1A2E'),
            spaceBefore=18, spaceAfter=8,
            borderPadding=(0, 0, 6, 0),
            borderWidth=0, backColor=None
        )
        h2_style = ParagraphStyle(
            'CustomH2', parent=styles['Heading2'],
            fontName='Helvetica-Bold', fontSize=14, leading=18,
            textColor=colors.HexColor('#D94A38'),
            spaceBefore=12, spaceAfter=6
        )
        body_style = ParagraphStyle(
            'CustomBody', parent=styles['BodyText'],
            fontName='Helvetica', fontSize=10.5, leading=15,
            textColor=colors.HexColor('#333333'),
            alignment=TA_JUSTIFY, spaceAfter=8
        )
        bullet_style = ParagraphStyle(
            'CustomBullet', parent=body_style,
            leftIndent=18, bulletIndent=6, spaceAfter=4
        )

        story = []

        story.append(Paragraph("CareerGenie", title_style))
        story.append(Paragraph(f"Personalized Career Report for <b>{user_name}</b>", subtitle_style))
        story.append(Paragraph(
            f"<i>Generated on {datetime.now().strftime('%B %d, %Y at %I:%M %p')}</i>",
            ParagraphStyle('meta', parent=body_style, alignment=TA_CENTER,
                           textColor=colors.HexColor('#888888'), fontSize=9)
        ))
        story.append(Spacer(1, 20))

        divider = Table([['']], colWidths=[7*inch], rowHeights=[2])
        divider.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#D94A38')),
            ('LINEBELOW', (0, 0), (-1, -1), 0, colors.white),
        ]))
        story.append(divider)
        story.append(Spacer(1, 20))

        lines = report_text.split('\n')
        for raw_line in lines:
            line = raw_line.rstrip()
            if not line.strip():
                story.append(Spacer(1, 4))
                continue

            if line.startswith('## '):
                text = line[3:].strip()
                text = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', text)
                story.append(Paragraph(text, h1_style))
            elif line.startswith('### '):
                text = line[4:].strip()
                text = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', text)
                story.append(Paragraph(text, h2_style))
            elif line.startswith('# '):
                text = line[2:].strip()
                story.append(Paragraph(text, h1_style))
            elif line.startswith('- ') or line.startswith('* '):
                text = line[2:].strip()
                text = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', text)
                text = re.sub(r'\*(.+?)\*', r'<i>\1</i>', text)
                story.append(Paragraph(f"• {text}", bullet_style))
            elif re.match(r'^\d+\.\s', line):
                text = re.sub(r'^\d+\.\s', '', line)
                text = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', text)
                story.append(Paragraph(f"• {text}", bullet_style))
            else:
                text = line
                text = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', text)
                text = re.sub(r'\*(.+?)\*', r'<i>\1</i>', text)
                story.append(Paragraph(text, body_style))

        story.append(Spacer(1, 24))
        story.append(divider)
        story.append(Spacer(1, 12))
        story.append(Paragraph(
            "<i>This report was generated by CareerGenie using AI analysis of your personal profile. "
            "Use it as a guide, not as an absolute prescription. Your mentor Genie is always available "
            "for follow-up conversations.</i>",
            ParagraphStyle('footer', parent=body_style, alignment=TA_CENTER,
                           textColor=colors.HexColor('#888888'), fontSize=9)
        ))

        doc.build(story)
        buffer.seek(0)

        safe_name = re.sub(r'[^\w]', '_', user_name)
        download_name = f"CareerGenie_Report_{safe_name}_{datetime.now().strftime('%Y%m%d')}.pdf"

        return send_file(
            buffer,
            as_attachment=True,
            download_name=download_name,
            mimetype='application/pdf'
        )

    except Exception as e:
        print(f"❌ PDF error: {str(e)}")
        return jsonify({'error': f'PDF generation failed: {str(e)}'}), 500


# ============================================================
# FEATURE: ABILITY TEST
# ============================================================
@app.route('/api/ability-test/generate', methods=['GET'])
def generate_ability_test():
    try:
        filename = session.get('user_file')
        if not filename or not os.path.exists(filename):
            return jsonify({'error': 'No profile found'}), 400

        with open(filename, 'r', encoding='utf-8') as f:
            user_data = f.read()

        prompt = f"""Analyze this user's profile carefully:

{user_data}

Create a personalized 15-question ability test to assess their TECHNICAL abilities based on their claimed skills, target role, and experience level.

Requirements:
- 15 multiple-choice questions (4 options each, A/B/C/D)
- Questions must be SPECIFIC to their skill set (e.g., if they claim Python, ask Python-specific questions at their level; if they claim marketing, ask marketing-specific questions)
- Difficulty should match their claimed experience level
- Cover a mix of: fundamentals, practical application, problem-solving, and best practices
- Each question must test real understanding, not trivia
- Include a mix of easy (5), medium (6), hard (4) difficulty

Return ONLY valid JSON in this exact format:
{{
  "test_title": "Personalized Ability Test for <their domain>",
  "skills_tested": ["skill1", "skill2", "skill3"],
  "questions": [
    {{
      "id": 1,
      "question": "Question text here?",
      "options": {{"A": "option 1", "B": "option 2", "C": "option 3", "D": "option 4"}},
      "correct": "B",
      "difficulty": "easy",
      "skill": "which skill this tests",
      "explanation": "Why the correct answer is correct"
    }}
  ]
}}

Generate exactly 15 questions. Make them genuinely personalized to this person's profile.
"""

        test_data = generate_json_with_fallback(prompt)
        return jsonify(test_data)

    except Exception as e:
        print(f"❌ Ability test generation error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/ability-test/evaluate', methods=['POST'])
def evaluate_ability_test():
    try:
        data = request.json or {}
        test_data = data.get('test', {})
        user_answers = data.get('answers', {})

        if not test_data or not user_answers:
            return jsonify({'error': 'Missing test or answers'}), 400

        filename = session.get('user_file')
        if not filename or not os.path.exists(filename):
            return jsonify({'error': 'No profile found'}), 400

        with open(filename, 'r', encoding='utf-8') as f:
            user_data = f.read()

        questions = test_data.get('questions', [])
        correct_count = 0
        wrong_count = 0
        per_skill = {}

        results_detail = []
        for q in questions:
            qid = str(q.get('id'))
            correct = q.get('correct', '').upper()
            user_ans = (user_answers.get(qid) or '').upper()
            is_correct = (user_ans == correct)
            if is_correct:
                correct_count += 1
            else:
                wrong_count += 1
            skill = q.get('skill', 'General')
            if skill not in per_skill:
                per_skill[skill] = {'correct': 0, 'total': 0}
            per_skill[skill]['total'] += 1
            if is_correct:
                per_skill[skill]['correct'] += 1

            results_detail.append({
                'id': qid,
                'question': q.get('question'),
                'user_answer': user_ans,
                'correct_answer': correct,
                'is_correct': is_correct,
                'skill': skill,
                'explanation': q.get('explanation', '')
            })

        total = len(questions)
        score_pct = round((correct_count / total) * 100) if total else 0

        analysis_prompt = f"""You are Genie, a warm and honest AI career mentor.

USER PROFILE:
{user_data}

TEST RESULTS:
- Score: {correct_count}/{total} ({score_pct}%)
- Skills tested: {list(per_skill.keys())}
- Per-skill breakdown: {json.dumps(per_skill)}

QUESTION-BY-QUESTION RESULTS:
{json.dumps([{'skill': r['skill'], 'correct': r['is_correct'], 'question': r['question'][:100]} for r in results_detail], indent=2)}

Write a personalized, honest, mentor-style analysis of this result. Do NOT be generic. Reference the actual skills and results.

Structure it as:

## Overall Assessment
A 2-3 sentence honest summary of where they stand. Mention their actual percentage and what it really means for their level.

## Skill-by-Skill Breakdown
For each tested skill, a short paragraph on their performance and what it means.

## What This Reveals
2-4 insights about their actual technical level vs. their claims/goals.

## Priority Areas to Improve
Specific, actionable. Reference exact skills they struggled with.

## Strengths to Lean On
Specific skills where they showed genuine strength.

## Your Personalized 30-Day Plan
A short, specific plan to close the gaps revealed by this test.

## A Message From Your Mentor
A warm, honest, personal closing message. Speak directly to them. Use Roman Urdu/English mix naturally if that fits.

Use markdown (## headings, ** bold **, - bullets).
"""

        analysis_text = generate_content_with_fallback(analysis_prompt)

        return jsonify({
            'score': correct_count,
            'total': total,
            'percentage': score_pct,
            'per_skill': per_skill,
            'details': results_detail,
            'analysis': analysis_text
        })

    except Exception as e:
        print(f"❌ Ability test eval error: {e}")
        return jsonify({'error': str(e)}), 500


# ============================================================
# RUN
# ============================================================
if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)