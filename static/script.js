// ===== GLOBALS =====
let questions = [];
let currentQ = 0;
let answers = [];
let userName = '';

// Ability test state
let abilityTest = null;
let abilityAnswers = {};

// ===== DOM REFS =====
const homeScreen = document.getElementById('homeScreen');
const onboardingScreen = document.getElementById('onboardingScreen');
const dashboardScreen = document.getElementById('dashboardScreen');

const questionText = document.getElementById('questionText');
const questionNum = document.getElementById('questionNum');
const stepDisplay = document.getElementById('stepDisplay');
const progressFill = document.getElementById('progressFill');
const answerInput = document.getElementById('answerInput');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');

const userNameDisplay = document.getElementById('userNameDisplay');

// Format text markdown
function formatMarkdown(text) {
    if (!text) return '';
    let html = text;
    html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/^\s*[-*] (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, '<ul>$1</ul>');
    html = html.replace(/^\s*\d+\.\s(.+)$/gm, '<li>$1</li>');
    html = html.replace(/\n/g, '<br>');
    html = html.replace(/<br>\s*(<h[23]>)/g, '$1');
    html = html.replace(/(<\/h[23]>)\s*<br>/g, '$1');
    html = html.replace(/<br>\s*(<ul>)/g, '$1');
    html = html.replace(/(<\/ul>)\s*<br>/g, '$1');
    return html;
}

// ===== HOME =====
function startOnboarding() {
    homeScreen.classList.remove('active');
    onboardingScreen.classList.add('active');
    loadQuestions();
}

// ===== UPLOAD USER DATA =====
function triggerUpload() {
    document.getElementById('uploadInput').click();
}

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.txt')) {
        alert('Please upload a .txt file only.');
        event.target.value = '';
        return;
    }

    const statusEl = document.getElementById('uploadStatus');
    statusEl.style.display = 'block';
    statusEl.textContent = '⏳ Reading and analyzing your data...';
    statusEl.style.color = '#666';

    const formData = new FormData();
    formData.append('file', file);

    try {
        const res = await fetch('/api/upload-user', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();

        if (data.error) {
            statusEl.textContent = '❌ ' + data.error;
            statusEl.style.color = '#D94A38';
            event.target.value = '';
            return;
        }

        statusEl.textContent = '✅ Profile loaded! Taking you to dashboard...';
        statusEl.style.color = '#2C7A2C';

        userName = data.name;
        userNameDisplay.textContent = userName;

        setTimeout(() => {
            homeScreen.classList.remove('active');
            onboardingScreen.classList.remove('active');
            dashboardScreen.classList.add('active');
            const chatMessages = document.getElementById('chatMessages');
            chatMessages.innerHTML = `
                <div class="message message-bot">
                    <div class="message-avatar">🧠</div>
                    <div class="message-content">
                        <p>Hey ${userName} — I've gone through the data you uploaded. I understand your background now. What would you like to talk about first?</p>
                        <span class="message-time">just now</span>
                    </div>
                </div>
            `;
            statusEl.style.display = 'none';
            event.target.value = '';
        }, 900);

    } catch (e) {
        statusEl.textContent = '❌ Upload failed: ' + e.message;
        statusEl.style.color = '#D94A38';
        event.target.value = '';
    }
}

// ===== DOWNLOAD USER DATA =====
function downloadUserData() {
    const a = document.createElement('a');
    a.href = '/api/download-user-data';
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// ===== ONBOARDING =====
async function loadQuestions() {
    try {
        const res = await fetch('/api/questions');
        const data = await res.json();
        questions = data.questions;
        answers = new Array(questions.length).fill('');
        currentQ = 0;
        showQuestion();
    } catch (e) {
        alert('Something went wrong loading questions. Please refresh.');
    }
}

function showQuestion() {
    questionText.textContent = questions[currentQ];
    questionNum.textContent = currentQ + 1;
    stepDisplay.textContent = `${currentQ + 1} / ${questions.length}`;
    answerInput.value = answers[currentQ] || '';

    const progress = ((currentQ + 1) / questions.length) * 100;
    progressFill.style.width = progress + '%';

    prevBtn.style.display = currentQ === 0 ? 'none' : 'inline-block';
    nextBtn.textContent = currentQ === questions.length - 1 ? 'finish →' : 'next →';
}

function nextQuestion() {
    answers[currentQ] = answerInput.value.trim();

    if (currentQ === questions.length - 1) {
        if (answers.some(a => a === '')) {
            alert('Please answer all questions before finishing.');
            return;
        }
        saveUserData();
        return;
    }

    currentQ++;
    showQuestion();
}

function prevQuestion() {
    answers[currentQ] = answerInput.value.trim();
    currentQ--;
    showQuestion();
}

async function saveUserData() {
    answers[currentQ] = answerInput.value.trim();

    try {
        const res = await fetch('/api/save-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ answers })
        });

        const data = await res.json();
        if (data.success) {
            userName = data.name;
            userNameDisplay.textContent = userName;
            onboardingScreen.classList.remove('active');
            dashboardScreen.classList.add('active');

            const chatMessages = document.getElementById('chatMessages');
            chatMessages.innerHTML = `
                <div class="message message-bot">
                    <div class="message-avatar">🧠</div>
                    <div class="message-content">
                        <p>Hey ${userName} — good to see you. I've looked over your answers. What would you like to talk about first?</p>
                        <span class="message-time">just now</span>
                    </div>
                </div>
            `;
        } else {
            alert('Error saving data. Please try again.');
        }
    } catch (e) {
        alert('Network error. Please try again.');
    }
}

// ===== DASHBOARD =====
function switchTab(tab) {
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.querySelector(`.nav-item[data-tab="${tab}"]`).classList.add('active');

    document.querySelectorAll('.tab-panel').forEach(el => el.classList.remove('active'));
    document.getElementById(`tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`).classList.add('active');

    if (tab === 'community') {
        loadMyShares();
    }
}

function logout() {
    if (confirm('Leave your session? Your data is saved.')) {
        dashboardScreen.classList.remove('active');
        homeScreen.classList.add('active');
        currentQ = 0;
        answers = [];
        abilityTest = null;
        abilityAnswers = {};
        document.getElementById('chatMessages').innerHTML = '';
        document.getElementById('youtubeGrid').innerHTML = '';
        document.getElementById('analysisGrid').innerHTML = '';
        document.getElementById('planContent').innerHTML = '';
        document.getElementById('reportContent').innerHTML = '';
        document.getElementById('abilityTestArea').innerHTML = '';
        document.getElementById('shareResult').innerHTML = '';
        document.getElementById('mySharesSection').innerHTML = '';
        document.getElementById('linkedinPreview').innerHTML = '';
    }
}

// ===== CHAT =====
async function sendMessage() {
    const input = document.getElementById('chatInput');
    const msg = input.value.trim();
    if (!msg) return;

    input.value = '';
    const chatMessages = document.getElementById('chatMessages');

    chatMessages.innerHTML += `
        <div class="message message-user">
            <div class="message-avatar">👤</div>
            <div class="message-content">
                <p>${msg.replace(/</g, '&lt;')}</p>
                <span class="message-time">just now</span>
            </div>
        </div>
    `;
    chatMessages.scrollTop = chatMessages.scrollHeight;

    const typingId = 'typing-' + Date.now();
    chatMessages.innerHTML += `
        <div class="message message-bot" id="${typingId}">
            <div class="message-avatar">🧠</div>
            <div class="message-content">
                <p style="color:#888;">typing...</p>
            </div>
        </div>
    `;
    chatMessages.scrollTop = chatMessages.scrollHeight;

    try {
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: msg })
        });

        const data = await res.json();
        document.getElementById(typingId)?.remove();

        if (data.error) {
            chatMessages.innerHTML += `
                <div class="message message-bot">
                    <div class="message-avatar">🧠</div>
                    <div class="message-content">
                        <p>⚠️ ${data.error}</p>
                        <span class="message-time">just now</span>
                    </div>
                </div>
            `;
        } else {
            chatMessages.innerHTML += `
                <div class="message message-bot">
                    <div class="message-avatar">🧠</div>
                    <div class="message-content">
                        <div>${formatMarkdown(data.response)}</div>
                        <span class="message-time">${data.timestamp || 'just now'}</span>
                    </div>
                </div>
            `;
        }
        chatMessages.scrollTop = chatMessages.scrollHeight;
    } catch (e) {
        document.getElementById(typingId)?.remove();
        chatMessages.innerHTML += `
            <div class="message message-bot">
                <div class="message-avatar">🧠</div>
                <div class="message-content">
                    <p>⚠️ Something went wrong. Please try again.</p>
                    <span class="message-time">just now</span>
                </div>
            </div>
        `;
    }
}

// ===== YOUTUBE =====
async function loadYoutube() {
    const grid = document.getElementById('youtubeGrid');
    grid.innerHTML = `<div class="loading-indicator">Analyzing your profile & finding 5 personalized videos...</div>`;

    try {
        const res = await fetch('/api/youtube', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });

        const data = await res.json();
        grid.innerHTML = '';

        if (data.error) {
            grid.innerHTML = `<p style="color:#888;">${data.error}</p>`;
            return;
        }

        if (!data.videos || data.videos.length === 0) {
            grid.innerHTML = `<p style="color:#888;">No videos found. Try again later.</p>`;
            return;
        }

        data.videos.forEach(v => {
            const categoryClass = v.category === 'Technical' ? 'cat-technical'
                : v.category === 'Soft Skill' ? 'cat-soft'
                : 'cat-personal';

            grid.innerHTML += `
                <div class="video-card">
                    <div class="video-category ${categoryClass}">${v.category || 'Video'}</div>
                    <img class="video-thumbnail" src="${v.thumbnail}" alt="${v.title}" loading="lazy" onerror="this.src='https://img.youtube.com/vi/rfscVS0vtbw/mqdefault.jpg'">
                    <div class="video-info">
                        <h4>${v.title}</h4>
                        ${v.reason ? `<p class="video-reason">💡 ${v.reason}</p>` : ''}
                        <a class="video-link" href="${v.url}" target="_blank" rel="noopener">Watch →</a>
                    </div>
                </div>
            `;
        });
    } catch (e) {
        grid.innerHTML = `<p style="color:#888;">Couldn't load videos. Please try again.</p>`;
    }
}

// ===== ANALYSIS =====
async function loadAnalysis() {
    const grid = document.getElementById('analysisGrid');
    grid.innerHTML = `<div class="loading-indicator">Analyzing your profile...</div>`;

    try {
        const res = await fetch('/api/analysis');
        const data = await res.json();
        grid.innerHTML = '';

        if (data.error) {
            grid.innerHTML = `<p style="color:#888;">${data.error}</p>`;
            return;
        }

        let strengthsHtml = '';
        if (data.strengths && data.strengths.length > 0) {
            data.strengths.forEach(s => {
                strengthsHtml += `
                    <div class="analysis-item">
                        <h4>${s.name}</h4>
                        <p>${s.description}</p>
                        <div class="advice">→ ${s.advice}</div>
                    </div>
                `;
            });
        }

        let weaknessesHtml = '';
        if (data.weaknesses && data.weaknesses.length > 0) {
            data.weaknesses.forEach(w => {
                weaknessesHtml += `
                    <div class="analysis-item">
                        <h4>${w.name}</h4>
                        <p>${w.description}</p>
                        <div class="advice">→ ${w.advice}</div>
                    </div>
                `;
            });
        }

        grid.innerHTML = `
            <div class="analysis-col analysis-col-strengths">
                <h3>Where you shine</h3>
                ${strengthsHtml}
            </div>
            <div class="analysis-col analysis-col-weaknesses">
                <h3>Where to grow</h3>
                ${weaknessesHtml}
            </div>
        `;
    } catch (e) {
        grid.innerHTML = `<p style="color:#888;">Couldn't load analysis. Please try again.</p>`;
    }
}

// ===== PLAN =====
async function loadPlan() {
    const content = document.getElementById('planContent');
    content.innerHTML = `<div class="loading-indicator">Building your plan...</div>`;

    try {
        const res = await fetch('/api/future-plan');
        const data = await res.json();

        if (data.error) {
            content.innerHTML = `<p style="color:#888;">${data.error}</p>`;
            return;
        }

        content.innerHTML = formatMarkdown(data.plan) || 'No plan generated yet.';
    } catch (e) {
        content.innerHTML = `<p style="color:#888;">Couldn't load plan. Please try again.</p>`;
    }
}

// ===== REPORT =====
async function loadReport() {
    const content = document.getElementById('reportContent');
    content.innerHTML = `<div class="loading-indicator">Generating your report...</div>`;

    try {
        const res = await fetch('/api/report');
        const data = await res.json();

        if (data.error) {
            content.innerHTML = `<p style="color:#888;">${data.error}</p>`;
            return;
        }

        content.innerHTML = formatMarkdown(data.report) || 'No report generated yet.';
        document.getElementById('downloadReportBtn').style.display = 'inline-block';
    } catch (e) {
        content.innerHTML = `<p style="color:#888;">Couldn't load report. Please try again.</p>`;
    }
}

// ===== DOWNLOAD REPORT AS PDF =====
function downloadReportPDF() {
    const btn = document.getElementById('downloadReportBtn');
    const originalText = btn.textContent;
    btn.textContent = '⏳ Preparing PDF...';
    btn.disabled = true;

    const a = document.createElement('a');
    a.href = '/api/download-report';
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(() => {
        btn.textContent = originalText;
        btn.disabled = false;
    }, 3000);
}

// ===== ABILITY TEST =====
async function loadAbilityTest() {
    const area = document.getElementById('abilityTestArea');
    area.innerHTML = `<div class="loading-indicator">Generating your personalized ability test...</div>`;

    try {
        const res = await fetch('/api/ability-test/generate');
        const data = await res.json();

        if (data.error) {
            area.innerHTML = `<p style="color:#888;">${data.error}</p>`;
            return;
        }

        abilityTest = data;
        abilityAnswers = {};

        renderAbilityTest();
    } catch (e) {
        area.innerHTML = `<p style="color:#888;">Couldn't generate test. Please try again.</p>`;
    }
}

function renderAbilityTest() {
    const area = document.getElementById('abilityTestArea');
    if (!abilityTest || !abilityTest.questions) {
        area.innerHTML = `<p style="color:#888;">No test loaded.</p>`;
        return;
    }

    let html = `
        <div class="ability-test-header">
            <h3>${abilityTest.test_title || 'Your Personalized Ability Test'}</h3>
            <p class="test-meta">Skills tested: ${(abilityTest.skills_tested || []).join(' · ')}</p>
            <p class="test-meta">15 questions · Personalized to your profile</p>
        </div>
    `;

    abilityTest.questions.forEach((q, idx) => {
        html += `
            <div class="quiz-question" id="quiz-q-${q.id}">
                <div class="quiz-q-header">
                    <span class="quiz-q-num">Q${idx + 1}</span>
                    <span class="quiz-difficulty difficulty-${q.difficulty || 'medium'}">${q.difficulty || 'medium'}</span>
                    <span class="quiz-skill">${q.skill || ''}</span>
                </div>
                <p class="quiz-q-text">${q.question}</p>
                <div class="quiz-options">
        `;
        Object.entries(q.options || {}).forEach(([key, val]) => {
            html += `
                <label class="quiz-option">
                    <input type="radio" name="q_${q.id}" value="${key}" onchange="recordAnswer('${q.id}', '${key}')">
                    <span class="quiz-option-key">${key}</span>
                    <span class="quiz-option-text">${val}</span>
                </label>
            `;
        });
        html += `
                </div>
            </div>
        `;
    });

    html += `
        <div class="quiz-actions">
            <button class="btn-primary" id="submitQuizBtn" onclick="submitAbilityTest()">Submit Test →</button>
        </div>
        <div id="abilityResultArea"></div>
    `;

    area.innerHTML = html;
}

function recordAnswer(qid, val) {
    abilityAnswers[String(qid)] = val;
}

async function submitAbilityTest() {
    if (!abilityTest) return;
    const total = abilityTest.questions.length;
    const answered = Object.keys(abilityAnswers).length;

    if (answered < total) {
        if (!confirm(`You've answered ${answered} of ${total} questions. Submit anyway?`)) return;
    }

    const submitBtn = document.getElementById('submitQuizBtn');
    submitBtn.textContent = 'Evaluating...';
    submitBtn.disabled = true;

    const resultArea = document.getElementById('abilityResultArea');
    resultArea.innerHTML = `<div class="loading-indicator">Analyzing your answers...</div>`;

    try {
        const res = await fetch('/api/ability-test/evaluate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ test: abilityTest, answers: abilityAnswers })
        });

        const data = await res.json();

        if (data.error) {
            resultArea.innerHTML = `<p style="color:#888;">${data.error}</p>`;
            submitBtn.textContent = 'Submit Test →';
            submitBtn.disabled = false;
            return;
        }

        let skillHtml = '';
        Object.entries(data.per_skill || {}).forEach(([skill, v]) => {
            const pct = Math.round((v.correct / v.total) * 100);
            skillHtml += `
                <div class="skill-bar">
                    <span class="skill-name">${skill}</span>
                    <div class="skill-bar-track">
                        <div class="skill-bar-fill" style="width:${pct}%; background:${pct >= 70 ? '#2C7A2C' : pct >= 40 ? '#E67E22' : '#D94A38'}"></div>
                    </div>
                    <span class="skill-score">${v.correct}/${v.total}</span>
                </div>
            `;
        });

        let reviewHtml = '';
        (data.details || []).forEach(d => {
            reviewHtml += `
                <div class="review-item ${d.is_correct ? 'review-correct' : 'review-wrong'}">
                    <div class="review-header">
                        <span class="review-badge">${d.is_correct ? '✓' : '✗'}</span>
                        <span class="review-skill">${d.skill}</span>
                    </div>
                    <p class="review-q">${d.question}</p>
                    <p class="review-ans">Your answer: <b>${d.user_answer || '—'}</b> · Correct: <b>${d.correct_answer}</b></p>
                    ${d.explanation ? `<p class="review-expl">💡 ${d.explanation}</p>` : ''}
                </div>
            `;
        });

        resultArea.innerHTML = `
            <div class="quiz-result-header">
                <div class="score-circle" style="--pct:${data.percentage}">
                    <span class="score-num">${data.percentage}%</span>
                </div>
                <h3>You scored ${data.score} / ${data.total}</h3>
                <p class="score-sub">Here's your personalized analysis</p>
            </div>

            <div class="skill-breakdown">
                <h4>Skill Breakdown</h4>
                ${skillHtml}
            </div>

            <div class="personal-analysis">
                ${formatMarkdown(data.analysis)}
            </div>

            <details class="review-details">
                <summary> See full question-by-question review</summary>
                <div class="review-list">${reviewHtml}</div>
            </details>
        `;

        submitBtn.textContent = 'Retake Test →';
        submitBtn.disabled = false;
        submitBtn.onclick = () => {
            abilityTest = null;
            abilityAnswers = {};
            loadAbilityTest();
        };

    } catch (e) {
        resultArea.innerHTML = `<p style="color:#888;">Couldn't evaluate. Please try again.</p>`;
        submitBtn.textContent = 'Submit Test →';
        submitBtn.disabled = false;
    }
}


// ============================================================
// FEATURE: COMMUNITY SHARING
// ============================================================
async function shareRoadmap() {
    const resultArea = document.getElementById('shareResult');
    resultArea.innerHTML = `<div class="loading-indicator">Generating your shareable roadmap...</div>`;

    const planContent = document.getElementById('planContent');
    let roadmapText = '';
    if (planContent && planContent.innerText.trim().length > 100) {
        roadmapText = planContent.innerText;
    } else {
        try {
            const res = await fetch('/api/future-plan');
            const data = await res.json();
            if (data.error) {
                resultArea.innerHTML = `<p style="color:#888;">${data.error}</p>`;
                return;
            }
            roadmapText = data.plan;
            planContent.innerHTML = formatMarkdown(data.plan);
        } catch (e) {
            resultArea.innerHTML = `<p style="color:#888;">Could not generate roadmap. Please try again.</p>`;
            return;
        }
    }

    try {
        const res = await fetch('/api/community/share', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roadmap: roadmapText })
        });
        const data = await res.json();

        if (data.error) {
            resultArea.innerHTML = `<p style="color:#888;">${data.error}</p>`;
            return;
        }

        const shareMessage =
`🚀 Check out my Career Roadmap on CareerGenie!

📌 Share ID: ${data.share_id}
📊 ${data.user_name} — ${data.tagline}

Want to see my personalized career roadmap?
📧 Email us at ${data.company_email} with my Share ID to request access.

---
CareerGenie — AI-Powered Career Mentorship
by NeuroSoul PK`;

        resultArea.innerHTML = `
            <div class="share-card">
                <div class="share-badge">✓ Roadmap shared</div>
                <div class="share-id-block">
                    <span class="share-id-label">Share ID</span>
                    <span class="share-id-value">${data.share_id}</span>
                </div>
                <p class="share-tagline">"${data.tagline}"</p>

                <div class="share-message-box">
                    <label class="share-message-label">Ready-to-send message:</label>
                    <textarea id="shareMessageText" class="share-message-textarea" readonly>${shareMessage}</textarea>
                </div>

                <div class="share-actions">
                    <button class="btn-primary" onclick="copyShareMessage()">📋 Copy message</button>
                    <a class="btn-secondary" href="/api/community/download/${data.share_id}" download>⬇ Download .txt</a>
                    <button class="btn-secondary" onclick="copyShareId('${data.share_id}')">Copy Share ID</button>
                </div>

                <p class="share-note">
                    💡 Send this message via WhatsApp, email, or LinkedIn.
                    Anyone with your Share ID can email <b>${data.company_email}</b> to request access.
                </p>
            </div>
        `;

        loadMyShares();
    } catch (e) {
        resultArea.innerHTML = `<p style="color:#888;">Sharing failed. Please try again.</p>`;
    }
}

function copyShareMessage() {
    const ta = document.getElementById('shareMessageText');
    if (!ta) return;
    ta.select();
    document.execCommand('copy');
    window.getSelection().removeAllRanges();
    showToast('✅ Message copied to clipboard!');
}

function copyShareId(id) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(id).then(() => {
            showToast('✅ Share ID copied: ' + id);
        }).catch(() => {
            fallbackCopy(id);
        });
    } else {
        fallbackCopy(id);
    }
}

function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); showToast('✅ Copied: ' + text); }
    catch(e) { showToast('Copy failed'); }
    document.body.removeChild(ta);
}

async function loadMyShares() {
    const section = document.getElementById('mySharesSection');
    if (!section) return;

    try {
        const res = await fetch('/api/community/my-shares');
        const data = await res.json();
        const shares = data.shares || [];

        if (shares.length === 0) {
            section.innerHTML = '';
            return;
        }

        let html = `<h3 class="my-shares-title">📌 My shared roadmaps</h3><div class="my-shares-list">`;
        shares.forEach(s => {
            html += `
                <div class="my-share-item">
                    <div>
                        <span class="my-share-id">${s.share_id}</span>
                        <span class="my-share-date">${s.created_at || ''}</span>
                    </div>
                    <p class="my-share-tagline">${s.tagline || ''}</p>
                    <div class="my-share-actions">
                        <button class="btn-mini" onclick="copyShareId('${s.share_id}')">Copy ID</button>
                        <a class="btn-mini" href="/api/community/download/${s.share_id}" download>Download</a>
                    </div>
                </div>
            `;
        });
        html += `</div>`;
        section.innerHTML = html;
    } catch (e) {
        section.innerHTML = '';
    }
}

function showToast(msg) {
    let toast = document.getElementById('cgToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'cgToast';
        toast.className = 'cg-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toast.classList.remove('show'), 2400);
}


// ============================================================
// FEATURE: LINKEDIN IMPORT
// ============================================================
async function importLinkedInUrl() {
    const input = document.getElementById('linkedinUrlInput');
    const url = (input.value || '').trim();
    const status = document.getElementById('linkedinStatus');

    if (!url) {
        status.style.display = 'block';
        status.style.color = '#D94A38';
        status.textContent = '❌ Please enter your LinkedIn profile URL.';
        return;
    }

    status.style.display = 'block';
    status.style.color = '#666';
    status.textContent = '⏳ Importing and analyzing your LinkedIn profile...';

    try {
        const res = await fetch('/api/linkedin/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
        const data = await res.json();

        if (data.error) {
            status.style.color = '#D94A38';
            status.textContent = '❌ ' + data.error;
            return;
        }

        status.style.color = '#2C7A2C';
        status.textContent = '✅ LinkedIn profile imported successfully!';
        renderLinkedInPreview(data.data);

    } catch (e) {
        status.style.color = '#D94A38';
        status.textContent = '❌ Import failed. Please try again.';
    }
}

async function handleLinkedInPdf(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
        alert('Please upload a PDF file only.');
        event.target.value = '';
        return;
    }

    const status = document.getElementById('linkedinStatus');
    status.style.display = 'block';
    status.style.color = '#666';
    status.textContent = '⏳ Reading your LinkedIn PDF and analyzing...';

    const fd = new FormData();
    fd.append('file', file);

    try {
        const res = await fetch('/api/linkedin/import', {
            method: 'POST',
            body: fd
        });
        const data = await res.json();

        if (data.error) {
            status.style.color = '#D94A38';
            status.textContent = '❌ ' + data.error;
            event.target.value = '';
            return;
        }

        status.style.color = '#2C7A2C';
        status.textContent = '✅ LinkedIn profile imported successfully!';
        renderLinkedInPreview(data.data);
        event.target.value = '';
    } catch (e) {
        status.style.color = '#D94A38';
        status.textContent = '❌ Upload failed. Please try again.';
        event.target.value = '';
    }
}

function renderLinkedInPreview(d) {
    const box = document.getElementById('linkedinPreview');
    if (!d) { box.innerHTML = ''; return; }

    let html = `<div class="linkedin-card">`;
    html += `<h3>${d.name || 'Your Profile'}</h3>`;
    if (d.headline) html += `<p class="li-headline">${d.headline}</p>`;
    if (d.location) html += `<p class="li-meta">📍 ${d.location}</p>`;

    if (d.summary) {
        html += `<div class="li-section"><h4>Summary</h4><p>${d.summary}</p></div>`;
    }
    if (d.experience && d.experience.length) {
        html += `<div class="li-section"><h4>Experience</h4>`;
        d.experience.forEach(e => {
            html += `<div class="li-entry"><b>${e.title || ''}</b> — ${e.company || ''}<br><span class="li-dur">${e.duration || ''}</span>`;
            if (e.description) html += `<p>${e.description}</p>`;
            html += `</div>`;
        });
        html += `</div>`;
    }
    if (d.education && d.education.length) {
        html += `<div class="li-section"><h4>Education</h4>`;
        d.education.forEach(e => {
            html += `<div class="li-entry"><b>${e.degree || ''}</b> — ${e.institution || ''}<br><span class="li-dur">${e.duration || ''}</span></div>`;
        });
        html += `</div>`;
    }
    if (d.skills && d.skills.length) {
        html += `<div class="li-section"><h4>Skills</h4><p class="li-skills">${d.skills.join(' · ')}</p></div>`;
    }
    if (d.certifications && d.certifications.length) {
        html += `<div class="li-section"><h4>Certifications</h4><ul>`;
        d.certifications.forEach(c => html += `<li>${c}</li>`);
        html += `</ul></div>`;
    }
    if (d.merged_insights) {
        html += `<div class="li-section li-insights"><h4>💡 Merged Insights</h4><p>${d.merged_insights}</p></div>`;
    }
    html += `</div>`;

    box.innerHTML = html;
}


// ============================================================
// FEATURE: RESUME BUILDER (PDF) — With Pre-flight Form
// ============================================================
async function prefillResumeForm() {
    const btn = document.querySelector('#tabResume .btn-secondary');
    const origText = btn.textContent;
    btn.textContent = '⏳ Reading profile...';
    btn.disabled = true;

    try {
        const res = await fetch('/api/resume/prefill');
        const data = await res.json();

        if (data.error) {
            showToast('❌ ' + data.error);
            btn.textContent = origText;
            btn.disabled = false;
            return;
        }

        const d = data.data || {};
        if (d.email)       document.getElementById('rf_email').value = d.email;
        if (d.phone)       document.getElementById('rf_phone').value = d.phone;
        if (d.location)    document.getElementById('rf_location').value = d.location;
        if (d.linkedin)    document.getElementById('rf_linkedin').value = d.linkedin;
        if (d.github)      document.getElementById('rf_github').value = d.github;
        if (d.portfolio)   document.getElementById('rf_portfolio').value = d.portfolio;
        if (d.years)       document.getElementById('rf_years').value = d.years;
        if (d.target_role) document.getElementById('rf_target_role').value = d.target_role;
        if (d.skills)      document.getElementById('rf_skills').value = d.skills;
        if (d.tools)       document.getElementById('rf_tools').value = d.tools;
        if (d.experience)  document.getElementById('rf_experience').value = d.experience;
        if (d.projects)    document.getElementById('rf_projects').value = d.projects;
        if (d.education)   document.getElementById('rf_education').value = d.education;
        if (d.certifications) document.getElementById('rf_certifications').value = d.certifications;
        if (d.achievements)   document.getElementById('rf_achievements').value = d.achievements;

        showToast('✅ Form auto-filled from your profile!');
    } catch (e) {
        showToast('❌ Could not auto-fill. Please fill manually.');
    }

    btn.textContent = origText;
    btn.disabled = false;
}

async function generateResumePDF() {
    const btn = document.getElementById('generateResumeBtn');
    const status = document.getElementById('resumeStatus');

    // Collect form data
    const formData = {
        email:          (document.getElementById('rf_email').value || '').trim(),
        phone:          (document.getElementById('rf_phone').value || '').trim(),
        location:       (document.getElementById('rf_location').value || '').trim(),
        linkedin:       (document.getElementById('rf_linkedin').value || '').trim(),
        github:         (document.getElementById('rf_github').value || '').trim(),
        portfolio:      (document.getElementById('rf_portfolio').value || '').trim(),
        years:          (document.getElementById('rf_years').value || '').trim(),
        target_role:    (document.getElementById('rf_target_role').value || '').trim(),
        skills:         (document.getElementById('rf_skills').value || '').trim(),
        tools:          (document.getElementById('rf_tools').value || '').trim(),
        experience:     (document.getElementById('rf_experience').value || '').trim(),
        projects:       (document.getElementById('rf_projects').value || '').trim(),
        education:      (document.getElementById('rf_education').value || '').trim(),
        certifications: (document.getElementById('rf_certifications').value || '').trim(),
        achievements:   (document.getElementById('rf_achievements').value || '').trim()
    };

    // Validate mandatory
    if (!formData.email || !formData.target_role) {
        status.style.display = 'block';
        status.style.color = '#D94A38';
        status.textContent = '❌ Please fill Email and Target Role — they are required for a resume.';
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
    }

    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        status.style.display = 'block';
        status.style.color = '#D94A38';
        status.textContent = '❌ Please enter a valid email address.';
        return;
    }

    btn.textContent = '⏳ Generating your resume...';
    btn.disabled = true;
    status.style.display = 'block';
    status.style.color = '#666';
    status.textContent = '⏳ AI is writing your resume and building the PDF. This may take 20-40 seconds. Please wait...';

    try {
        const res = await fetch('/api/resume/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ form: formData })
        });

        const contentType = res.headers.get('Content-Type') || '';
        if (!res.ok || contentType.includes('application/json')) {
            let errMsg = 'Resume generation failed. Please try again.';
            try {
                const errData = await res.json();
                if (errData && errData.error) errMsg = errData.error;
            } catch (_) { /* ignore */ }

            status.style.color = '#D94A38';
            status.textContent = '❌ ' + errMsg;
            btn.textContent = 'Generate my resume →';
            btn.disabled = false;
            return;
        }

        const blob = await res.blob();

        if (!blob || blob.size < 500) {
            status.style.color = '#D94A38';
            status.textContent = '❌ Generated PDF looks empty. Please try again.';
            btn.textContent = 'Generate my resume →';
            btn.disabled = false;
            return;
        }

        let filename = 'Resume.pdf';
        const cd = res.headers.get('Content-Disposition') || '';
        const m = cd.match(/filename="?([^"]+)"?/i);
        if (m && m[1]) filename = m[1];

        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => window.URL.revokeObjectURL(url), 2000);

        status.style.color = '#2C7A2C';
        status.textContent = `✅ Resume downloaded: ${filename}`;
        btn.textContent = 'Generate again →';
        btn.disabled = false;

    } catch (e) {
        console.error('Resume error:', e);
        status.style.color = '#D94A38';
        status.textContent = '❌ Network error: ' + (e.message || 'Unknown error');
        btn.textContent = 'Generate my resume →';
        btn.disabled = false;
    }
}