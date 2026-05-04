// ══════════════════════════════════════════════════════════════
// MEDASSIST — APPLICATION MÉDICALE IA
// Système expert hybride avec gestion de compte
// ══════════════════════════════════════════════════════════════

// ─── AUTH CHECK ───
(function checkAuth() {
    const token = localStorage.getItem('authToken');
    const userStr = localStorage.getItem('currentUser');
    if (!token || !userStr) {
        window.location.href = 'connexionpage.html';
    }
})();

// ─── CONFIG ───
const API_BASE = 'http://127.0.0.1:8001';
const esc = t => {
    if (!t) return '';
    const d = document.createElement('div');
    d.textContent = String(t);
    return d.innerHTML;
};

// ─── STATE ───
let tags = [];
let consultations = [];
let currentUser = null;

// ══════════════════════════════════════════════════════════════
// KNOWLEDGE BASE (for local sidebar display)
// ══════════════════════════════════════════════════════════════
const KNOWLEDGE_BASE = {
    "Respiratoire": {
        icon: "\uD83E\uDEC1",
        symptoms: ["toux sèche", "toux grasse", "essoufflement", "sifflement", "douleur thoracique", "expectorations"],
    },
    "Digestif": {
        icon: "\uD83E\uDEC3",
        symptoms: ["nausées", "vomissements", "douleur abdominale", "diarrhée", "constipation", "ballonnements", "brûlures d'estomac"],
    },
    "Neurologique": {
        icon: "\uD83E\uDDE0",
        symptoms: ["céphalées", "migraine", "vertiges", "nausées", "vision floue", "engourdissement", "confusion"],
    },
    "Musculo-squelettique": {
        icon: "\uD83E\uDDB4",
        symptoms: ["douleur dorsale", "lombalgie", "arthralgie", "myalgie", "raideur articulaire", "courbatures"],
    },
    "Cardiaque": {
        icon: "\u2764\uFE0F",
        symptoms: ["palpitations", "douleur poitrine", "essoufflement effort", "syncope", "fatigue cardiaque"],
    },
    "Général / Infectieux": {
        icon: "\uD83C\uDF21\uFE0F",
        symptoms: ["fièvre", "frissons", "fatigue", "sueurs nocturnes", "perte de poids", "asthénie", "mal de gorge"],
    }
};

// ══════════════════════════════════════════════════════════════
// INITIALIZATION
// ══════════════════════════════════════════════════════════════
function init() {
    loadUser();
    renderKnowledgeBase();
    loadHistory();
    updateSuggestions();
    setupDropdown();
}

function loadUser() {
    try {
        currentUser = JSON.parse(localStorage.getItem('currentUser'));
        if (currentUser) {
            const initials = currentUser.full_name
                .split(' ')
                .map(n => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2);
            document.getElementById('userAvatarSm').textContent = initials;
            document.getElementById('userNameShort').textContent = currentUser.full_name.split(' ')[0];
            document.getElementById('ddUserName').textContent = currentUser.full_name;
            document.getElementById('ddUserEmail').textContent = currentUser.email;
            const roleMap = { patient: 'Patient', doctor: 'Médecin', admin: 'Admin' };
            document.getElementById('ddUserRole').textContent = roleMap[currentUser.role] || currentUser.role;

            // Pre-fill age/sex if available
            if (currentUser.sex) {
                const sexSel = document.getElementById('patient-sex');
                if (sexSel) sexSel.value = currentUser.sex.toLowerCase();
            }
        }
    } catch (e) {
        console.error('Error loading user:', e);
    }
}

function setupDropdown() {
    const btn = document.getElementById('userMenuBtn');
    const dd = document.getElementById('userDropdown');
    btn.addEventListener('click', e => {
        e.stopPropagation();
        dd.classList.toggle('open');
    });
    document.addEventListener('click', () => dd.classList.remove('open'));
}

function logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    window.location.href = 'connexionpage.html';
}

// ══════════════════════════════════════════════════════════════
// KNOWLEDGE BASE SIDEBAR
// ══════════════════════════════════════════════════════════════
function renderKnowledgeBase() {
    const container = document.getElementById('kb-categories');
    container.innerHTML = '';
    for (const [cat, data] of Object.entries(KNOWLEDGE_BASE)) {
        const div = document.createElement('div');
        div.className = 'kb-category';
        div.innerHTML =
            '<div class="kb-cat-name">' + esc(data.icon) + ' ' + esc(cat) + '</div>' +
            '<div class="kb-symptoms">' +
            data.symptoms.map(s =>
                '<span class="kb-chip" onclick="addTagFromKB(\'' + esc(s).replace(/'/g, "\\'") + '\')">' + esc(s) + '</span>'
            ).join('') +
            '</div>';
        container.appendChild(div);
    }
}

// ══════════════════════════════════════════════════════════════
// TAG INPUT
// ══════════════════════════════════════════════════════════════
function focusTagInput() {
    document.getElementById('tag-input').focus();
}

function handleTagInput(e) {
    const input = e.target;
    if ((e.key === 'Enter' || e.key === ',') && input.value.trim()) {
        e.preventDefault();
        addTag(input.value.trim());
        input.value = '';
        updateSuggestions();
    } else if (e.key === 'Backspace' && input.value === '' && tags.length > 0) {
        removeTag(tags.length - 1);
    }
}

function addTag(text) {
    const clean = text.toLowerCase().replace(/,$/, '').trim();
    if (!clean || tags.includes(clean)) return;
    tags.push(clean);
    renderTags();
}

function addTagFromKB(sym) {
    addTag(sym);
    showToast('\u2713 "' + sym + '" ajouté');
}

function removeTag(idx) {
    tags.splice(idx, 1);
    renderTags();
}

function renderTags() {
    const container = document.getElementById('tag-container');
    const input = document.getElementById('tag-input');
    container.innerHTML = '';
    tags.forEach((t, i) => {
        const span = document.createElement('span');
        span.className = 'tag';
        span.innerHTML = esc(t) + '<button onclick="removeTag(' + i + ')">\u00D7</button>';
        container.appendChild(span);
    });
    container.appendChild(input);
    input.focus();
}

const COMMON_SUGGESTIONS = [
    "fièvre", "toux", "fatigue", "maux de tête", "douleur abdominale",
    "nausées", "essoufflement", "vertiges", "douleur dorsale",
    "palpitations", "diarrhée", "vomissements", "frissons", "courbatures"
];

function updateSuggestions() {
    const wrap = document.getElementById('suggestions-wrap');
    const val = document.getElementById('tag-input').value.toLowerCase();
    if (!val) {
        wrap.innerHTML = COMMON_SUGGESTIONS.filter(s => !tags.includes(s)).slice(0, 8).map(s =>
            '<span class="suggestion-chip" onclick="addTagFromInput(\'' + esc(s).replace(/'/g, "\\'") + '\')">' + esc(s) + '</span>'
        ).join('');
        return;
    }
    const all = Object.values(KNOWLEDGE_BASE).flatMap(d => d.symptoms);
    const matches = [...new Set(all)].filter(s => s.includes(val) && !tags.includes(s));
    wrap.innerHTML = matches.slice(0, 6).map(s =>
        '<span class="suggestion-chip" onclick="addTagFromInput(\'' + esc(s).replace(/'/g, "\\'") + '\')">' + esc(s) + '</span>'
    ).join('');
}

function addTagFromInput(s) {
    addTag(s);
    document.getElementById('tag-input').value = '';
    updateSuggestions();
}

// ══════════════════════════════════════════════════════════════
// VOICE INPUT
// ══════════════════════════════════════════════════════════════
function startVoiceInput() {
    if (!('SpeechRecognition' in window) && !('webkitSpeechRecognition' in window)) {
        showToast('\u26A0\uFE0F Reconnaissance vocale non supportée');
        return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const r = new SR();
    r.lang = 'fr-FR';
    r.interimResults = false;
    const btn = document.getElementById('voiceBtn');
    r.onstart = () => {
        btn.classList.add('recording');
        btn.innerHTML = '<i class="fas fa-microphone-slash"></i> Écoute...';
        showToast('\uD83C\uDF99\uFE0F Parlez maintenant...');
    };
    r.onresult = e => {
        const transcript = e.results[0][0].transcript;
        // Add words as tags or put in free text
        const freeText = document.getElementById('free-text');
        freeText.value = (freeText.value ? freeText.value + '. ' : '') + transcript;
        showToast('\u2705 Transcription réussie');
    };
    r.onerror = e => showToast('\u274C Erreur micro : ' + e.error);
    r.onend = () => {
        btn.classList.remove('recording');
        btn.innerHTML = '<i class="fas fa-microphone"></i> Dictée vocale';
    };
    r.start();
}

// ══════════════════════════════════════════════════════════════
// SYMPTOM ANALYSIS — calls backend /analyze/knowledge
// ══════════════════════════════════════════════════════════════
async function analyzeSymptoms() {
    const freeText = document.getElementById('free-text').value.trim();
    const symptomText = tags.length > 0 ? tags.join(', ') : '';
    const combined = [symptomText, freeText].filter(Boolean).join('. ');

    if (!combined) {
        showToast('\u26A0\uFE0F Veuillez saisir au moins un symptôme');
        return;
    }

    let fullDesc = combined;

    document.getElementById('loading-bar').classList.add('active');
    document.getElementById('result-output').innerHTML = '';
    document.getElementById('analyze-btn').disabled = true;

    try {
        const res = await fetch(API_BASE + '/analyze/knowledge', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('authToken')
            },
            body: JSON.stringify({
                symptomes: fullDesc,
                patient_id: currentUser ? currentUser.id : null,
                conversation_id: Date.now().toString(),
                lang: 'fr',
                include_recommendations: true,
                include_emergency: true
            })
        });

        document.getElementById('loading-bar').classList.remove('active');

        if (res.ok) {
            const data = await res.json();
            if (data.success) {
                renderResults(data, { symptoms: combined });
                // Save to local history
                saveToLocalHistory(data, { symptoms: combined });
            } else {
                showError(data.message || 'Analyse échouée');
            }
        } else {
            let errMsg = 'Erreur serveur (code ' + res.status + ')';
            try { const ed = await res.json(); errMsg = ed.detail || errMsg; } catch {}
            showError(errMsg);
        }
    } catch (err) {
        document.getElementById('loading-bar').classList.remove('active');
        showError('Serveur inaccessible. Vérifiez que le backend tourne sur le port 8001.');
    }

    document.getElementById('analyze-btn').disabled = false;
}

function showError(msg) {
    document.getElementById('result-output').innerHTML =
        '<div class="result-card"><div class="result-body" style="text-align:center;padding:2rem;">' +
        '<i class="fas fa-exclamation-circle" style="font-size:2rem;color:var(--red-soft);margin-bottom:1rem;display:block;"></i>' +
        '<p style="color:var(--red-soft);font-weight:500;">' + esc(msg) + '</p></div></div>';
}

// ══════════════════════════════════════════════════════════════
// RENDER RESULTS
// ══════════════════════════════════════════════════════════════
function renderResults(data, meta) {
    const isUrgent = data.urgence;
    const isAbsolute = data.urgence_absolue;
    const sev = isAbsolute ? 'high' : (isUrgent ? 'med' : 'low');
    const severityLabel = { low: 'Bénin', med: 'Modéré', high: 'Sérieux' };
    const severityClass = { low: 'severity-low', med: 'severity-med', high: 'severity-high' };
    const severityIcon = { low: '\uD83D\uDFE2', med: '\uD83D\uDFE1', high: '\uD83D\uDD34' };

    const pct = Math.round((data.probabilite || 0.5) * 100);

    // Main hypothesis
    let hypothesesHTML = '<div class="hypothesis-card">' +
        '<div class="hyp-name">' + esc(data.maladie) + '</div>' +
        '<div class="hyp-probability">' +
        '<div class="prob-bar"><div class="prob-fill" style="width:' + pct + '%"></div></div>' +
        '<span class="prob-pct">' + pct + '%</span></div>' +
        '<span class="severity-badge ' + severityClass[sev] + '" style="font-size:0.7rem;padding:2px 8px;">' +
        severityIcon[sev] + ' ' + severityLabel[sev] + '</span>' +
        '<p class="hyp-desc" style="margin-top:7px;">Spécialité : ' + esc(data.specialite) + '</p>' +
        '</div>';

    // Specialists
    const specialistIcon = {
        'Pneumologie': '\uD83E\uDEC1', 'Cardiologie': '\u2764\uFE0F',
        'Neurologie': '\uD83E\uDDE0', 'Gastro-enterologie': '\uD83C\uDFE5',
        'Rhumatologie': '\uD83E\uDDB4', 'Medecine generale': '\uD83D\uDC68\u200D\u2695\uFE0F',
    };
    let specialistsHTML = '<span class="specialist-tag">' +
        '<span class="specialist-icon">' + (specialistIcon[data.specialite] || '\uD83D\uDC68\u200D\u2695\uFE0F') + '</span>' +
        esc(data.specialite) +
        '<span class="specialist-priority ' + (isUrgent ? 'prio-urgent' : 'prio-normal') + '">' +
        (isUrgent ? 'Urgent' : 'Conseillé') + '</span></span>';

    // Recommendations
    const recoHTML = (data.recommandations || []).map(r =>
        '<li class="reco-item"><span class="reco-icon">\uD83D\uDCA1</span> ' + esc(r) + '</li>'
    ).join('');

    // Urgency
    const urgencyHTML = (isAbsolute || isUrgent) ?
        '<div style="background:rgba(201,123,123,0.1);border:1.5px solid rgba(201,123,123,0.3);border-radius:10px;padding:12px 16px;margin-bottom:1.5rem;font-size:0.85rem;color:#7a3030;line-height:1.6;">' +
        '\u26A0\uFE0F <strong>' + (isAbsolute ? 'URGENCE ABSOLUE — Appelez le 15 immédiatement' : 'Consultation urgente recommandée') + '</strong>' +
        (data.urgence_detail && data.urgence_detail.message ? '<br>' + esc(data.urgence_detail.message) : '') +
        '</div>' : '';

    // Model info
    const modelInfo = data.model_utilise ? '<div style="font-size:0.75rem;color:var(--text-light);margin-top:4px;">Modèle : ' + esc(data.model_utilise) + '</div>' : '';
    const fiabilite = data.fiabilite ? '<div style="font-size:0.75rem;color:var(--text-light);">Fiabilité : ' + esc(data.fiabilite) + '</div>' : '';

    const html =
        '<div class="result-card">' +
        '<div class="result-header">' +
        '<div><h2>Résultats de l\'analyse</h2>' +
        modelInfo + fiabilite + '</div>' +
        '<span class="severity-badge ' + severityClass[sev] + '">' + severityIcon[sev] + ' ' + severityLabel[sev] + '</span>' +
        '</div>' +
        '<div class="result-body">' +
        urgencyHTML +
        '<div class="section-label">\uD83D\uDD0D Diagnostic</div>' +
        '<div class="hypotheses-grid">' + hypothesesHTML + '</div>' +
        '<div class="specialists-section">' +
        '<div class="section-label">\uD83D\uDC68\u200D\u2695\uFE0F Spécialistes recommandés</div>' +
        '<div class="specialists-list">' + specialistsHTML + '</div>' +
        '</div>' +
        '<div><div class="section-label">\uD83D\uDCDD Recommandations</div>' +
        '<ul class="reco-list">' + recoHTML + '</ul></div>' +
        '<div style="margin-top:1.5rem;padding-top:1.25rem;border-top:1px solid var(--beige-warm);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">' +
        '<span style="font-size:0.75rem;color:var(--text-light);">Analyse du ' + new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) + '</span>' +
        '<div style="font-size:0.72rem;color:var(--text-light);font-style:italic;">\u26A0\uFE0F ' + esc(data.avertissement || 'Cet outil est une aide à la décision uniquement.') + '</div>' +
        '</div></div></div>';

    document.getElementById('result-output').innerHTML = html;
    document.getElementById('result-output').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ══════════════════════════════════════════════════════════════
// HISTORY — Local + API
// ══════════════════════════════════════════════════════════════
function saveToLocalHistory(data, meta) {
    const entry = {
        id: Date.now(),
        date: new Date().toISOString(),
        symptoms: meta.symptoms,
        maladie: data.maladie,
        probabilite: data.probabilite,
        specialite: data.specialite,
        recommandations: data.recommandations || [],
        urgence: data.urgence || false,
        fiabilite: data.fiabilite || '',
        model_utilise: data.model_utilise || '',
        alternatives: (data.alternatives || []).slice(0, 3),
    };
    consultations.unshift(entry);
    if (consultations.length > 100) consultations.pop();
    localStorage.setItem('medassist_history', JSON.stringify(consultations));
    updateStats();
}

async function loadHistory() {
    // Load local
    consultations = JSON.parse(localStorage.getItem('medassist_history') || '[]');

    // Load from API if logged in
    if (currentUser && currentUser.id) {
        try {
            const res = await fetch(API_BASE + '/patients/' + currentUser.id + '/consultations-ia', {
                headers: { 'Authorization': 'Bearer ' + localStorage.getItem('authToken') }
            });
            if (res.ok) {
                const data = await res.json();
                if (data.consultations && data.consultations.length) {
                    // Merge API consultations with local ones (avoid duplicates)
                    const localIds = new Set(consultations.map(c => c.id));
                    data.consultations.forEach(c => {
                        const apiEntry = {
                            id: 'api_' + c.id,
                            date: c.created_at,
                            symptoms: c.symptomes || '',
                            maladie: c.maladie_diagnostiquee || c.maladie_predite || '',
                            probabilite: c.confidence || c.probabilite || 0.5,
                            specialite: c.specialite_recommandee || c.specialite || '',
                            recommandations: [],
                            urgence: (c.urgence_niveau || 0) >= 2,
                            intensity: '5',
                        };
                        if (c.recommandations) {
                            try { apiEntry.recommandations = JSON.parse(c.recommandations); } catch {}
                        }
                        if (!localIds.has(apiEntry.id)) {
                            consultations.push(apiEntry);
                        }
                    });
                    // Sort by date desc
                    consultations.sort((a, b) => new Date(b.date) - new Date(a.date));
                }
            }
        } catch (err) {
            console.warn('Could not load history from API:', err.message);
        }
    }

    updateStats();
}

function updateStats() {
    document.getElementById('stat-total').textContent = consultations.length;
    if (consultations.length > 0) {
        const last = new Date(consultations[0].date);
        document.getElementById('stat-last').textContent =
            last.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    }
}

function renderHistory() {
    const container = document.getElementById('history-content');
    if (consultations.length === 0) {
        container.innerHTML =
            '<div class="history-empty">' +
            '<div class="empty-icon">\uD83D\uDCCB</div>' +
            '<p>Aucune consultation enregistrée pour le moment.<br>Effectuez votre première évaluation !</p></div>';
        return;
    }
    const items = consultations.map((c, i) => {
        const date = new Date(c.date);
        const dateStr = date.toLocaleDateString('fr-FR', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
        const pct = Math.round((c.probabilite || 0.5) * 100);
        const sevIcon = c.urgence ? '\uD83D\uDD34' : '\uD83D\uDFE2';
        return '<div class="history-item" onclick="openHistoryItem(' + i + ')">' +
            '<div>' +
            '<div class="history-date">' + esc(dateStr) + '</div>' +
            '<div class="history-symptoms">' + sevIcon + ' ' + esc(c.symptoms || c.maladie) + '</div>' +
            '<div class="history-hypothesis">Hypothèse principale : <strong>' + esc(c.maladie) + '</strong> (' + pct + '%) \u00B7 ' + esc(c.specialite) + '</div>' +
            '</div>' +
            '<span class="history-arrow">\u203A</span></div>';
    }).join('');
    container.innerHTML = '<div class="history-list">' + items + '</div>';
}

function openHistoryItem(idx) {
    const c = consultations[idx];
    if (!c) return;
    const date = new Date(c.date).toLocaleDateString('fr-FR', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
    const pct = Math.round((c.probabilite || 0.5) * 100);

    let altHTML = '';
    if (c.alternatives && c.alternatives.length) {
        altHTML = '<div style="margin-bottom:1.25rem;">' +
            '<div class="section-label">\uD83D\uDD0D Diagnostics alternatifs</div>' +
            c.alternatives.map(a => {
                const aPct = Math.round((a.probabilite || 0.5) * 100);
                return '<div style="background:var(--beige);border-radius:8px;padding:8px 12px;margin-bottom:6px;">' +
                    '<strong>' + esc(a.maladie) + '</strong> \u2014 ' + aPct + '% \u2014 <em>' + esc(a.specialite) + '</em></div>';
            }).join('') + '</div>';
    }

    const html =
        '<p style="font-size:0.82rem;color:var(--text-light);margin-bottom:1.25rem;">' + esc(date) + '</p>' +
        '<div style="margin-bottom:1.25rem;">' +
        '<div class="section-label" style="margin-bottom:8px;">Symptômes</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:6px;">' +
        (c.symptoms || '').split(/[,.]/).filter(Boolean).map(s =>
            '<span class="tag">' + esc(s.trim()) + '</span>'
        ).join('') + '</div></div>' +
        '<div style="background:var(--sage-mist);border:1.5px solid var(--sage-pale);border-radius:12px;padding:1rem;margin-bottom:1.25rem;">' +
        '<div style="font-size:1.1rem;font-weight:600;margin-bottom:4px;">' + esc(c.maladie) + '</div>' +
        '<div style="color:var(--sage);font-weight:600;">Probabilité : ' + pct + '%</div>' +
        '<div class="prob-bar" style="margin-top:8px;height:5px;background:var(--beige-warm);border-radius:3px;overflow:hidden;">' +
        '<div class="prob-fill" style="width:' + pct + '%;height:100%;background:linear-gradient(to right,var(--sage),var(--sage-light));border-radius:3px;"></div></div>' +
        (c.urgence ? '<div style="margin-top:8px;color:#7a3030;font-weight:600;"><i class="fas fa-exclamation-triangle"></i> Consultation urgente recommandée</div>' : '') +
        (c.fiabilite ? '<div style="margin-top:4px;font-size:0.78rem;color:var(--text-light);">Fiabilité : ' + esc(c.fiabilite) + '</div>' : '') +
        (c.model_utilise ? '<div style="font-size:0.78rem;color:var(--text-light);">Modèle : ' + esc(c.model_utilise) + '</div>' : '') +
        '</div>' +
        '<div style="margin-bottom:1rem;">' +
        '<div class="section-label" style="margin-bottom:6px;">Spécialité recommandée</div>' +
        '<div style="padding:8px 14px;background:var(--beige);border-radius:10px;font-weight:500;">' + esc(c.specialite) + '</div></div>' +
        altHTML +
        '<div style="margin-bottom:1.25rem;">' +
        '<div class="section-label" style="margin-bottom:6px;">Recommandations</div>' +
        '<ul class="reco-list" style="background:var(--beige);border-radius:10px;padding:12px;">' +
        (c.recommandations || []).map(r =>
            '<li class="reco-item"><span class="reco-icon">\uD83D\uDCA1</span> ' + esc(r) + '</li>'
        ).join('') + '</ul></div>' +
        '<div style="text-align:right;padding-top:1rem;border-top:1px solid var(--beige-warm);">' +
        '<button class="btn-save" style="color:var(--red-soft);border-color:rgba(201,123,123,0.3);" onclick="deleteConsultation(' + idx + ')">' +
        '\uD83D\uDDD1\uFE0F Supprimer</button></div>';

    document.getElementById('modal-content').innerHTML = html;
    document.getElementById('modal-overlay').classList.add('open');
}

function deleteConsultation(idx) {
    consultations.splice(idx, 1);
    localStorage.setItem('medassist_history', JSON.stringify(consultations));
    closeModalBtn();
    renderHistory();
    updateStats();
    showToast('\uD83D\uDDD1\uFE0F Consultation supprimée');
}

// ══════════════════════════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════════════════════════
function showPage(name) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('page-' + name).classList.add('active');
    document.getElementById('nav-' + name).classList.add('active');
    if (name === 'history') renderHistory();
}

// ══════════════════════════════════════════════════════════════
// MODAL
// ══════════════════════════════════════════════════════════════
function closeModal(e) {
    if (e.target === document.getElementById('modal-overlay')) closeModalBtn();
}
function closeModalBtn() {
    document.getElementById('modal-overlay').classList.remove('open');
}

// ══════════════════════════════════════════════════════════════
// TOAST
// ══════════════════════════════════════════════════════════════
function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2800);
}

// ══════════════════════════════════════════════════════════════
// BOOT
// ══════════════════════════════════════════════════════════════
init();
