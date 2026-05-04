"""
ParrotDiag — Backend FastAPI (TF-IDF + SVM)
============================================
Toutes les données médicales viennent de knowledge_recommendation.py
(UNIFIED_KNOWLEDGE). Ce fichier ne redéfinit aucune maladie, aucune
spécialité, aucune recommandation : il importe et utilise seulement.
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Any
import sqlite3
import hashlib
import json
import time
import logging
import os
from datetime import datetime, timedelta
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.svm import SVC
from sklearn.calibration import CalibratedClassifierCV
from sklearn.preprocessing import LabelEncoder
import warnings
import random

warnings.filterwarnings("ignore")

# ── Import unique depuis la source de vérité ──────────────────
from knowledge_recommendation import (
    UNIFIED_KNOWLEDGE,
    MEDICAL_DATASET,        # dérivé automatiquement
    KNOWLEDGE_BASE,         # dérivé automatiquement
    URGENCY_KEYWORDS,
    knowledge_based_recommendation,
    extract_symptoms,
    DifferentialDiagnosisAnalyzer,
    get_specialty,
    get_recommendations,
    get_urgence_base,
)

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s — %(levelname)s — %(message)s")
logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════
# MODÈLE ML — TF-IDF + SVM
# ══════════════════════════════════════════════════════════════

class MLMedicalSystem:
    """
    TF-IDF + SVM calibré.
    Les données d'entraînement viennent de MEDICAL_DATASET
    (dérivé de UNIFIED_KNOWLEDGE dans knowledge_recommendation.py).
    """

    def __init__(self):
        self.classes_ = list(MEDICAL_DATASET.keys())
        self.label_encoder = LabelEncoder()
        self.label_encoder.fit(self.classes_)
        self.trained = False

        self.vectorizer = TfidfVectorizer(
            max_features=5000,
            ngram_range=(1, 3),
            sublinear_tf=True,
            min_df=1,
        )
        base_svm = SVC(kernel="rbf", C=10.0, gamma="scale")
        self.classifier = CalibratedClassifierCV(base_svm, cv=3)
        self._train()

    def _train(self):
        logger.info("Entraînement TF-IDF + SVM depuis UNIFIED_KNOWLEDGE...")
        texts, labels = [], []
        for disease, phrases in MEDICAL_DATASET.items():
            for phrase in phrases:
                texts.append(phrase)
                labels.append(disease)

        X = self.vectorizer.fit_transform(texts)
        y = self.label_encoder.transform(labels)
        self.classifier.fit(X, y)
        self.trained = True
        logger.info(f"Modèle entraîné : {len(texts)} exemples, {len(self.classes_)} classes")

    def get_embedding(self, text: str) -> np.ndarray:
        return self.vectorizer.transform([text]).toarray()

    def predict_with_uncertainty(self, text: str):
        X = self.vectorizer.transform([text])
        proba = self.classifier.predict_proba(X)[0]
        class_names = [
            str(c) for c in self.label_encoder.inverse_transform(range(len(proba)))
        ]
        ranked = sorted(zip(class_names, proba), key=lambda x: x[1], reverse=True)
        best = ranked[0][0]
        confidence = min(0.98, max(0.3, float(ranked[0][1])))
        gap = ranked[0][1] - ranked[1][1] if len(ranked) > 1 else 0.5
        uncertainty = max(0.02, min(0.4, 0.4 - float(gap)))
        alternatives = [
            {"maladie": d, "probabilite": round(float(p), 4)}
            for d, p in ranked[1:4]
        ]
        return best, confidence, uncertainty, alternatives


logger.info("Initialisation MLMedicalSystem...")
nlp_system = MLMedicalSystem()
logger.info(f"Système ML opérationnel ({len(nlp_system.classes_)} maladies)")


# ══════════════════════════════════════════════════════════════
# FONCTIONS UTILITAIRES (utilisent UNIFIED_KNOWLEDGE via imports)
# ══════════════════════════════════════════════════════════════

def analyze_urgency(symptoms: str, disease: str, confidence: float) -> Dict:
    """Analyse le niveau d'urgence (0-3) basé sur UNIFIED_KNOWLEDGE."""
    symptoms_lower = symptoms.lower()
    level = get_urgence_base(disease)   # ← depuis UNIFIED_KNOWLEDGE

    for kw_level, keywords in URGENCY_KEYWORDS.items():
        for kw in keywords:
            if kw in symptoms_lower:
                level = max(level, kw_level)

    if confidence < 0.3 and level > 1:
        level = max(1, level - 1)

    messages = {
        0: "Consultation médicale conseillée",
        1: "Consultation médicale recommandée sous 24-48h",
        2: "Consultation urgente — Rendez-vous aux urgences rapidement",
        3: "URGENCE VITALE — Appelez le 15 (SAMU) IMMÉDIATEMENT",
    }
    labels = {0: "Non urgent", 1: "Urgence modérée",
               2: "Urgence élevée", 3: "URGENCE VITALE"}
    actions = {
        0: ["Prendre rendez-vous médecin", "Surveiller les symptômes"],
        1: ["Consulter un médecin sous 24-48h", "Surveiller l'évolution"],
        2: ["Se rendre aux urgences", "Appeler le médecin traitant"],
        3: ["Appeler le 15 immédiatement", "Ne pas déplacer le patient",
            "Rester avec le patient en attendant les secours"],
    }
    return {
        "niveau": level,
        "label": labels[level],
        "message": messages[level],
        "actions_recommandees": actions[level],
        "score": round(level / 3 * 100, 1),
    }


def calculate_reliability(confidence: float, uncertainty: float) -> str:
    if confidence > 0.8 and uncertainty < 0.1:
        return "Très élevée"
    elif confidence > 0.6 and uncertainty < 0.2:
        return "Élevée"
    elif confidence > 0.4 and uncertainty < 0.3:
        return "Modérée"
    return "Faible — consultation médicale fortement recommandée"


# ══════════════════════════════════════════════════════════════
# BASE DE DONNÉES SQLITE
# ══════════════════════════════════════════════════════════════

DB_PATH = "patients.db"


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _hash(pw: str) -> str:
    return hashlib.sha256(pw.encode()).hexdigest()


def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            full_name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT DEFAULT 'patient',
            phone TEXT,
            address TEXT,
            created_at TEXT DEFAULT (datetime('now','localtime'))
        );
        CREATE TABLE IF NOT EXISTS consultations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id INTEGER,
            session_id TEXT,
            symptomes TEXT NOT NULL,
            maladie_predite TEXT NOT NULL,
            specialite TEXT NOT NULL,
            probabilite REAL,
            incertitude REAL,
            urgence_niveau INTEGER,
            urgence_message TEXT,
            recommandations TEXT,
            model_used TEXT,
            alternatives TEXT,
            embedding TEXT,
            prediction_time_ms REAL,
            ip_address TEXT,
            created_at TEXT DEFAULT (datetime('now','localtime')),
            timestamp INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS doctors (
            user_id INTEGER PRIMARY KEY REFERENCES users(id),
            specialty TEXT,
            location TEXT,
            address TEXT,
            phone TEXT,
            diplomas TEXT,
            experience TEXT,
            bio TEXT,
            consultation_price REAL,
            available INTEGER DEFAULT 1,
            approved INTEGER DEFAULT 0,
            rating REAL DEFAULT 4.5,
            patient_count INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS appointments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id INTEGER NOT NULL REFERENCES users(id),
            doctor_id INTEGER NOT NULL REFERENCES users(id),
            date TEXT NOT NULL,
            time TEXT NOT NULL,
            reason TEXT,
            type TEXT DEFAULT 'consultation',
            status TEXT DEFAULT 'pending',
            created_at TEXT DEFAULT (datetime('now','localtime'))
        );
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id),
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            type TEXT DEFAULT 'info',
            is_read INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now','localtime'))
        );
        CREATE TABLE IF NOT EXISTS patient_profiles (
            user_id INTEGER PRIMARY KEY REFERENCES users(id),
            birth_date TEXT,
            age INTEGER,
            sex TEXT,
            blood_type TEXT,
            allergies TEXT,
            current_medications TEXT,
            medical_history TEXT,
            emergency_contact TEXT,
            city TEXT,
            zip_code TEXT
        );
    """)
    c.execute("SELECT COUNT(*) FROM users")
    if c.fetchone()[0] == 0:
        _seed_database(c)
    conn.commit()
    conn.close()
    logger.info("Base de données initialisée")


def _seed_database(c):
    c.execute(
        "INSERT INTO users (full_name, email, password_hash, role, phone) VALUES (?,?,?,'patient',?)",
        ("Ahmed Benali", "patient@test.ma", _hash("password123"), "+212 6 12 34 56 78")
    )
    pid = c.lastrowid
    c.execute(
        "INSERT INTO patient_profiles (user_id, age, sex, blood_type, city, allergies) VALUES (?,35,'M','A+','Casablanca','Pénicilline')",
        (pid,)
    )
    doctors = [
        ("Dr. Fatima Zahra Alaoui", "dr.alaoui@test.ma", "Cardiologie", "Casablanca", 350, "12 ans", 4.8, 245,
         "Spécialiste en cardiologie interventionnelle, CHU de Casablanca."),
        ("Dr. Karim Bensouda", "dr.bensouda@test.ma", "Neurologie", "Rabat", 300, "8 ans", 4.6, 180,
         "Neurologue spécialisé dans les migraines et les AVC."),
        ("Dr. Sara El Idrissi", "dr.elidrissi@test.ma", "Médecine générale", "Marrakech", 200, "15 ans", 4.9, 320,
         "Médecin généraliste, médecine familiale et urgences."),
        ("Dr. Youssef Tazi", "dr.tazi@test.ma", "Chirurgie digestive", "Fès", 400, "20 ans", 4.7, 410,
         "Chirurgien digestif, appendicites et pathologies abdominales."),
        ("Dr. Nadia Chraibi", "dr.chraibi@test.ma", "Pneumologie", "Casablanca", 280, "10 ans", 4.5, 195,
         "Pneumologue, asthme et infections respiratoires."),
        ("Dr. Mohammed Amine", "dr.amine@test.ma", "Endocrinologie", "Rabat", 320, "7 ans", 4.8, 260,
         "Endocrinologue, diabète et troubles métaboliques."),
        ("Dr. Leila Benkirane", "dr.benkirane@test.ma", "Psychiatrie", "Casablanca", 250, "14 ans", 4.6, 175,
         "Psychiatre, thérapies cognitivo-comportementales."),
        ("Dr. Hassan Berrada", "dr.berrada@test.ma", "Oncologie", "Rabat", 500, "18 ans", 4.9, 390,
         "Oncologue médical, cancers du sein et du poumon."),
        ("Dr. Imane Zouhairi", "dr.zouhairi@test.ma", "Allergologie", "Fès", 230, "6 ans", 4.7, 140,
         "Allergologue, allergies alimentaires et respiratoires."),
        ("Dr. Rachid Mossadeq", "dr.mossadeq@test.ma", "Urologie", "Casablanca", 350, "11 ans", 4.8, 285,
         "Urologue, infections urinaires et lithiase urinaire."),
        ("Dr. Amina Tazi", "dr.aminatazi@test.ma", "Cardiologie", "Tanger", 380, "9 ans", 4.7, 210,
         "Cardiologue, hypertension et insuffisance cardiaque."),
        ("Dr. Reda El Fassi", "dr.reda@test.ma", "Neurologie", "Agadir", 320, "5 ans", 4.5, 120,
         "Neurologue, migraines chroniques et épilepsies."),
    ]
    for name, email, spec, loc, price, exp, rating, patients, bio in doctors:
        c.execute("INSERT INTO users (full_name, email, password_hash, role) VALUES (?,?,?,'doctor')",
                  (name, email, _hash("password123")))
        did = c.lastrowid
        c.execute(
            "INSERT INTO doctors (user_id, specialty, location, experience, consultation_price, available, approved, rating, patient_count, bio) VALUES (?,?,?,?,?,1,1,?,?,?)",
            (did, spec, loc, exp, price, rating, patients, bio)
        )
    logger.info("Données de seed insérées")


def create_notification(conn, user_id: int, title: str, message: str, notif_type: str = "info"):
    conn.execute(
        "INSERT INTO notifications (user_id, title, message, type) VALUES (?,?,?,?)",
        (user_id, title, message, notif_type)
    )


# ══════════════════════════════════════════════════════════════
# MODÈLES PYDANTIC
# ══════════════════════════════════════════════════════════════

class AnalyzeRequest(BaseModel):
    symptomes: str = Field(..., min_length=3, max_length=2000)
    patient_id: Optional[int] = None
    session_id: Optional[str] = None
    conversation_id: Optional[str] = None
    lang: str = "fr"
    include_recommendations: bool = True
    include_emergency: bool = True
    confidence_threshold: float = Field(0.2, ge=0.0, le=1.0)

    @validator("symptomes")
    def clean(cls, v):
        return v.strip()


class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    full_name: str
    email: str
    password: str
    role: str = "patient"
    phone: Optional[str] = None


class AppointmentRequest(BaseModel):
    patient_id: int
    doctor_id: int
    date: str
    time: str
    reason: Optional[str] = "Consultation"
    type: Optional[str] = "consultation"


class AppointmentStatusRequest(BaseModel):
    status: str


class AIConsultationFeedback(BaseModel):
    feedback_patient: Optional[str] = None
    has_booked_appointment: bool = False
    appointment_id: Optional[int] = None


# ══════════════════════════════════════════════════════════════
# APPLICATION FASTAPI
# ══════════════════════════════════════════════════════════════

app = FastAPI(
    title="ParrotDiag — API ML",
    version="6.0",
    description="Backend ML (TF-IDF + SVM) — Source unique : UNIFIED_KNOWLEDGE"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)


# ══════════════════════════════════════════════════════════════
# AUTH
# ══════════════════════════════════════════════════════════════

@app.post("/login")
def login(req: LoginRequest):
    conn = get_db()
    row = conn.execute(
        "SELECT id, full_name, email, role, phone, address FROM users WHERE email=? AND password_hash=?",
        (req.email, _hash(req.password))
    ).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
    token = hashlib.md5(f"{row['id']}{row['email']}".encode()).hexdigest()
    return {"success": True, "token": f"pd_{token}",
            "user": dict(row)}


@app.post("/register")
def register(req: RegisterRequest):
    conn = get_db()
    try:
        conn.execute(
            "INSERT INTO users (full_name, email, password_hash, role, phone) VALUES (?,?,?,?,?)",
            (req.full_name, req.email, _hash(req.password), req.role, req.phone)
        )
        uid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        if req.role == "patient":
            conn.execute("INSERT INTO patient_profiles (user_id) VALUES (?)", (uid,))
        elif req.role == "doctor":
            conn.execute(
                "INSERT INTO doctors (user_id, specialty, location, approved) VALUES (?,?,?,1)",
                (uid, "Médecine générale", "Non spécifié")
            )
        conn.commit()
        token = hashlib.md5(f"{uid}{req.email}".encode()).hexdigest()
        return {"success": True, "token": f"pd_{token}",
                "user": {"id": uid, "full_name": req.full_name,
                         "email": req.email, "role": req.role}}
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="Email déjà utilisé")
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════
# MÉDECINS
# ══════════════════════════════════════════════════════════════

def _doctor_row_to_dict(r) -> Dict:
    return {
        "id": r["id"], "nom": r["full_name"], "specialite": r["specialty"],
        "email": r["email"], "telephone": r["phone"],
        "adresse": r["address"], "ville": r["location"],
        "experience": r["experience"], "prix_consultation": r["consultation_price"],
        "disponible": bool(r["available"]), "note": round(r["rating"] or 4.5, 1),
        "nb_patients": r["patient_count"] or 0, "bio": r["bio"],
    }


@app.get("/doctors/all")
def get_all_doctors():
    conn = get_db()
    rows = conn.execute("""
        SELECT u.id, u.full_name, u.email, u.phone,
               d.specialty, d.location, d.address, d.experience, d.bio,
               d.consultation_price, d.available, d.rating, d.patient_count
        FROM users u JOIN doctors d ON u.id = d.user_id
        WHERE u.role = 'doctor' ORDER BY d.rating DESC
    """).fetchall()
    conn.close()
    return {"success": True, "total": len(rows),
            "medecins": [_doctor_row_to_dict(r) for r in rows]}


@app.get("/doctors/approved")
def get_doctors_approved():
    return get_all_doctors()


@app.get("/doctors/by-specialty/{specialty}")
def get_doctors_by_specialty(specialty: str):
    conn = get_db()
    rows = conn.execute("""
        SELECT u.id, u.full_name, u.email, u.phone,
               d.specialty, d.location, d.address, d.experience, d.bio,
               d.consultation_price, d.available, d.rating, d.patient_count
        FROM users u JOIN doctors d ON u.id = d.user_id
        WHERE u.role = 'doctor' AND LOWER(d.specialty) LIKE LOWER(?)
        ORDER BY d.rating DESC
    """, (f"%{specialty}%",)).fetchall()
    conn.close()
    return {"success": True, "specialite": specialty, "total": len(rows),
            "medecins": [_doctor_row_to_dict(r) for r in rows]}


@app.get("/doctors/{doctor_id}")
def get_doctor(doctor_id: int):
    conn = get_db()
    row = conn.execute("""
        SELECT u.id, u.full_name, u.email, u.phone,
               d.specialty, d.location, d.address, d.diplomas,
               d.experience, d.bio, d.consultation_price, d.available,
               d.rating, d.patient_count
        FROM users u JOIN doctors d ON u.id = d.user_id
        WHERE u.id = ? AND u.role = 'doctor'
    """, (doctor_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Médecin non trouvé")
    return {"success": True, "medecin": _doctor_row_to_dict(row)}


# ══════════════════════════════════════════════════════════════
# ANALYSE ML
# ══════════════════════════════════════════════════════════════

@app.post("/analyze")
async def analyze(req: AnalyzeRequest, background_tasks: BackgroundTasks, request: Request):
    if not nlp_system.trained:
        raise HTTPException(status_code=503, detail="Système NLP non initialisé")

    t0 = time.time()
    disease, confidence, uncertainty, alternatives = nlp_system.predict_with_uncertainty(req.symptomes)
    embedding = nlp_system.get_embedding(req.symptomes).tolist()
    urgency = analyze_urgency(req.symptomes, disease, confidence)

    # get_specialty et get_recommendations viennent de UNIFIED_KNOWLEDGE
    specialty = get_specialty(disease)
    recommendations = get_recommendations(disease) if req.include_recommendations else []
    reliability = calculate_reliability(confidence, uncertainty)

    alt_list = [
        {"maladie": a["maladie"], "probabilite": a["probabilite"],
         "specialite": get_specialty(a["maladie"])}
        for a in alternatives
    ]

    detected = extract_symptoms(req.symptomes)
    diag_list = [
        {"maladie": disease, "probabilite": confidence, "symptomes_detectes": detected}
    ] + [{"maladie": a["maladie"], "probabilite": a["probabilite"],
          "symptomes_detectes": detected} for a in alt_list]
    analyzer = DifferentialDiagnosisAnalyzer()
    ambiguities = analyzer.detect_ambiguities(diag_list, detected)
    diff_report = analyzer.format_differential_report(ambiguities) if ambiguities else ""

    prediction_ms = round((time.time() - t0) * 1000, 2)

    background_tasks.add_task(
        _save_consultation, req.patient_id, req.session_id or req.conversation_id,
        req.symptomes, disease, confidence, uncertainty, urgency, recommendations,
        alt_list, embedding, prediction_ms,
        request.client.host if request.client else None
    )

    return {
        "success": True,
        "maladie": disease,
        "probabilite": round(confidence, 4),
        "incertitude": round(uncertainty, 4),
        "specialite": specialty,
        "urgence": urgency["niveau"] >= 2,
        "urgence_absolue": urgency["niveau"] >= 3,
        "recommandations": recommendations,
        "alternatives": alt_list[:3],
        "urgence_detail": urgency,
        "fiabilite": reliability,
        "diagnostic_differentiel": {
            "ambiguites": ambiguities,
            "rapport": diff_report,
            "nb_conflits": len(ambiguities),
        },
        "symptomes_detectes": detected,
        "model_utilise": "TF-IDF + SVM (UNIFIED_KNOWLEDGE)",
        "classes_disponibles": nlp_system.classes_,
        "prediction_ms": prediction_ms,
        "timestamp": datetime.now().isoformat(),
        "avertissement": (
            "Analyse par IA. Cet outil est une aide à la décision uniquement. "
            "Consultez toujours un professionnel de santé qualifié."
        ),
    }


# ══════════════════════════════════════════════════════════════
# ANALYSE PAR BASE DE CONNAISSANCES
# ══════════════════════════════════════════════════════════════

@app.post("/analyze/knowledge")
async def analyze_knowledge(req: AnalyzeRequest):
    t0 = time.time()

    patient_profile = None
    if req.patient_id:
        try:
            conn = get_db()
            row = conn.execute(
                "SELECT p.age, p.sex, p.allergies, p.current_medications, p.medical_history, p.city FROM patient_profiles p WHERE p.user_id = ?",
                (req.patient_id,)
            ).fetchone()
            conn.close()
            if row:
                patient_profile = dict(row)
        except Exception as e:
            logger.warning(f"Profil patient non chargé: {e}")

    result = knowledge_based_recommendation(
        symptom_text=req.symptomes,
        patient_profile=patient_profile,
        db_path=DB_PATH,
        top_diseases=5,
    )

    prediction_ms = round((time.time() - t0) * 1000, 2)

    if not result.get("success"):
        return {"success": False, "message": result.get("message", "Analyse impossible"),
                "prediction_ms": prediction_ms}

    diag = result["diagnostic_principal"]
    urgency = analyze_urgency(req.symptomes, diag["maladie"], diag["probabilite"])
    recommendations = get_recommendations(diag["maladie"]) if req.include_recommendations else []
    reliability = calculate_reliability(diag["probabilite"], 1.0 - diag["probabilite"])

    return {
        "success": True,
        "moteur": "knowledge-based (UNIFIED_KNOWLEDGE)",
        "maladie": diag["maladie"],
        "probabilite": diag["probabilite"],
        "symptomes_detectes": diag["symptomes_detectes"],
        "specialite": diag["specialite"],
        "urgence": urgency["niveau"] >= 2,
        "urgence_absolue": urgency["niveau"] >= 3,
        "urgence_detail": urgency,
        "fiabilite": reliability,
        "recommandations": recommendations,
        "alternatives": result["diagnostics_alternatifs"][:3],
        "diagnostic_differentiel": result.get("diagnostic_differentiel", {}),
        "conseils_personnalises": result["conseils_personnalises"],
        "prediction_ms": prediction_ms,
        "timestamp": datetime.now().isoformat(),
        "avertissement": "Analyse par système expert. Consultez toujours un professionnel de santé.",
    }


# ══════════════════════════════════════════════════════════════
# ENDPOINTS KNOWLEDGE (utilitaires)
# ══════════════════════════════════════════════════════════════

@app.get("/knowledge/symptoms")
def get_extracted_symptoms(text: str):
    symptoms = extract_symptoms(text)
    return {"success": True, "symptomes": symptoms, "count": len(symptoms)}


@app.get("/knowledge/overlaps")
def get_disease_overlaps(min_overlap: int = 2):
    analyzer = DifferentialDiagnosisAnalyzer()
    overlaps = analyzer.get_all_overlaps(min_overlap=min_overlap)
    return {"success": True, "nb_paires": len(overlaps), "chevauchements": overlaps}


@app.get("/knowledge/info")
def get_engine_info():
    return {
        "success": True,
        "moteur": "Système expert (UNIFIED_KNOWLEDGE)",
        "nb_maladies": len(UNIFIED_KNOWLEDGE),
        "maladies": list(UNIFIED_KNOWLEDGE.keys()),
        "source": "knowledge_recommendation.py — UNIFIED_KNOWLEDGE",
    }


@app.get("/knowledge/diseases")
def get_all_diseases():
    """Liste toutes les maladies avec leur spécialité et urgence de base."""
    return {
        "success": True,
        "maladies": [
            {
                "nom": disease,
                "specialite": data["specialite"],
                "urgence_base": data["urgence_base"],
                "nb_symptomes": len(data["symptomes"]),
                "nb_phrases_ml": len(data["phrases_entrainement"]),
            }
            for disease, data in UNIFIED_KNOWLEDGE.items()
        ]
    }


# ══════════════════════════════════════════════════════════════
# PATIENTS
# ══════════════════════════════════════════════════════════════

@app.get("/patients/{patient_id}/profile")
def get_patient_profile(patient_id: int):
    conn = get_db()
    row = conn.execute("""
        SELECT u.full_name, u.email, u.phone, u.address,
               p.birth_date, p.age, p.sex, p.blood_type, p.allergies,
               p.current_medications, p.city
        FROM users u LEFT JOIN patient_profiles p ON u.id = p.user_id
        WHERE u.id = ?
    """, (patient_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Patient non trouvé")
    return dict(row)


@app.get("/patients/{patient_id}/consultations")
def get_patient_consultations(patient_id: int):
    conn = get_db()
    rows = conn.execute("""
        SELECT id, symptomes, maladie_predite, specialite, probabilite,
               urgence_niveau, created_at
        FROM consultations WHERE patient_id = ?
        ORDER BY created_at DESC LIMIT 50
    """, (patient_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.get("/patients/{patient_id}/consultations-ia")
def get_patient_consultations_ia(patient_id: int):
    conn = get_db()
    rows = conn.execute("""
        SELECT id, symptomes, maladie_predite as maladie_diagnostiquee,
               specialite as specialite_recommandee, probabilite as confidence,
               incertitude, urgence_niveau, recommandations, created_at
        FROM consultations WHERE patient_id = ?
        ORDER BY created_at DESC LIMIT 50
    """, (patient_id,)).fetchall()
    conn.close()
    return {"consultations": [dict(r) for r in rows]}


@app.get("/patients/{patient_id}/ia-statistics")
def get_ia_statistics(patient_id: int):
    conn = get_db()
    total = conn.execute("SELECT COUNT(*) FROM consultations WHERE patient_id=?", (patient_id,)).fetchone()[0]
    urgent = conn.execute("SELECT COUNT(*) FROM consultations WHERE patient_id=? AND urgence_niveau>=2", (patient_id,)).fetchone()[0]
    avg_conf = conn.execute("SELECT AVG(probabilite) FROM consultations WHERE patient_id=?", (patient_id,)).fetchone()[0]
    specs = conn.execute("""
        SELECT specialite, COUNT(*) as count FROM consultations WHERE patient_id=?
        GROUP BY specialite ORDER BY count DESC LIMIT 5
    """, (patient_id,)).fetchall()
    conn.close()
    return {
        "total_consultations": total,
        "urgent_consultations": urgent,
        "average_confidence": round(avg_conf or 0, 4),
        "top_specialties": [dict(r) for r in specs],
    }


# ══════════════════════════════════════════════════════════════
# RENDEZ-VOUS
# ══════════════════════════════════════════════════════════════

@app.post("/appointments")
def create_appointment(req: AppointmentRequest):
    conn = get_db()
    try:
        conn.execute(
            "INSERT INTO appointments (patient_id, doctor_id, date, time, reason, type, status) VALUES (?,?,?,?,?,?,'pending')",
            (req.patient_id, req.doctor_id, req.date, req.time, req.reason, req.type)
        )
        apt_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        p = conn.execute("SELECT full_name FROM users WHERE id=?", (req.patient_id,)).fetchone()
        d = conn.execute("SELECT full_name FROM users WHERE id=?", (req.doctor_id,)).fetchone()
        pname = p["full_name"] if p else "Patient"
        dname = d["full_name"] if d else "Médecin"
        create_notification(conn, req.patient_id, "Demande de RDV envoyée",
                            f"Votre demande avec {dname} le {req.date} à {req.time} a été envoyée.")
        create_notification(conn, req.doctor_id, "Nouvelle demande de RDV",
                            f"{pname} demande un RDV le {req.date} à {req.time}.")
        conn.commit()
        return {"success": True, "appointment_id": apt_id,
                "message": f"Demande envoyée à {dname}"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.get("/patients/{patient_id}/appointments")
def get_patient_appointments(patient_id: int):
    conn = get_db()
    rows = conn.execute("""
        SELECT a.id, a.date, a.time, a.reason, a.type, a.status,
               u.full_name as doctor_name, d.specialty
        FROM appointments a
        JOIN users u ON a.doctor_id = u.id
        LEFT JOIN doctors d ON a.doctor_id = d.user_id
        WHERE a.patient_id = ? ORDER BY a.date DESC
    """, (patient_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.put("/appointments/{appointment_id}/status")
def update_appointment_status(appointment_id: int, req: AppointmentStatusRequest):
    if req.status not in {"confirmed", "cancelled", "completed", "pending"}:
        raise HTTPException(status_code=400, detail="Statut invalide")
    conn = get_db()
    try:
        conn.execute("UPDATE appointments SET status=? WHERE id=?", (req.status, appointment_id))
        conn.commit()
        return {"success": True, "message": f"Rendez-vous {req.status}"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════
# NOTIFICATIONS
# ══════════════════════════════════════════════════════════════

@app.get("/users/{user_id}/notifications")
def get_notifications(user_id: int):
    conn = get_db()
    rows = conn.execute("""
        SELECT id, title, message, type, is_read, created_at
        FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50
    """, (user_id,)).fetchall()
    conn.close()
    return [{"id": r["id"], "title": r["title"], "message": r["message"],
             "type": r["type"], "is_read": bool(r["is_read"]),
             "created_at": r["created_at"]} for r in rows]


@app.post("/notifications/{notif_id}/read")
def mark_notification_read(notif_id: int):
    conn = get_db()
    conn.execute("UPDATE notifications SET is_read=1 WHERE id=?", (notif_id,))
    conn.commit()
    conn.close()
    return {"success": True}


@app.post("/notifications/mark-all-read")
def mark_all_read(user_id: int):
    conn = get_db()
    conn.execute("UPDATE notifications SET is_read=1 WHERE user_id=?", (user_id,))
    conn.commit()
    conn.close()
    return {"success": True}


# ══════════════════════════════════════════════════════════════
# STATISTIQUES & SANTÉ
# ══════════════════════════════════════════════════════════════

@app.get("/stats")
def get_stats():
    conn = get_db()
    total = conn.execute("SELECT COUNT(*) FROM consultations").fetchone()[0]
    yesterday = int((datetime.now() - timedelta(days=1)).timestamp())
    last_24h = conn.execute(
        "SELECT COUNT(*) FROM consultations WHERE timestamp>?", (yesterday,)
    ).fetchone()[0]
    top = conn.execute("""
        SELECT maladie_predite, COUNT(*) as count FROM consultations
        GROUP BY maladie_predite ORDER BY count DESC LIMIT 10
    """).fetchall()
    total_doctors = conn.execute("SELECT COUNT(*) FROM doctors WHERE approved=1").fetchone()[0]
    conn.close()
    return {
        "success": True,
        "total_consultations": total,
        "consultations_24h": last_24h,
        "top_diseases": [{"maladie": r[0], "count": r[1]} for r in top],
        "total_doctors": total_doctors,
        "source_donnees": "UNIFIED_KNOWLEDGE (knowledge_recommendation.py)",
        "nlp_model": {
            "type": "TF-IDF + SVM",
            "trained": nlp_system.trained,
            "num_classes": len(nlp_system.classes_),
        },
    }


@app.get("/nlp/info")
def nlp_info():
    return {
        "success": True,
        "model_type": "TF-IDF + SVM",
        "trained": nlp_system.trained,
        "classes": nlp_system.classes_,
        "source": "UNIFIED_KNOWLEDGE — knowledge_recommendation.py",
        "n_classes": len(nlp_system.classes_),
        "total_phrases": sum(len(d["phrases_entrainement"]) for d in UNIFIED_KNOWLEDGE.values()),
    }


@app.get("/health")
def health():
    conn = get_db()
    total = conn.execute("SELECT COUNT(*) FROM consultations").fetchone()[0]
    total_doctors = conn.execute("SELECT COUNT(*) FROM doctors WHERE approved=1").fetchone()[0]
    conn.close()
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "nlp": {"trained": nlp_system.trained},
        "database": {"consultations": total, "medecins": total_doctors, "connected": True},
        "source_donnees": "UNIFIED_KNOWLEDGE",
    }


@app.get("/")
def root():
    return {
        "app": "ParrotDiag API",
        "version": "6.0",
        "source_donnees": "UNIFIED_KNOWLEDGE (knowledge_recommendation.py)",
        "nlp_model": {"type": "TF-IDF + SVM", "trained": nlp_system.trained,
                      "diseases": nlp_system.classes_},
        "endpoints": {
            "auth": "/login, /register",
            "analyse_ml": "/analyze",
            "analyse_kb": "/analyze/knowledge",
            "maladies": "/knowledge/diseases",
            "medecins": "/doctors/all",
            "rendez_vous": "/appointments",
        },
        "status": "operational",
    }


# ══════════════════════════════════════════════════════════════
# TÂCHE DE FOND
# ══════════════════════════════════════════════════════════════

def _save_consultation(patient_id, session_id, symptoms, disease, confidence,
                       uncertainty, urgency, recommendations, alternatives,
                       embedding, prediction_ms, ip):
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute("""
            INSERT INTO consultations (
                patient_id, session_id, symptomes, maladie_predite, specialite,
                probabilite, incertitude, urgence_niveau, urgence_message,
                recommandations, model_used, alternatives, embedding,
                prediction_time_ms, ip_address, timestamp
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            patient_id, session_id, symptoms, disease,
            get_specialty(disease),          # ← UNIFIED_KNOWLEDGE
            confidence, uncertainty,
            urgency["niveau"], urgency["message"],
            json.dumps(recommendations, ensure_ascii=False),
            "TF-IDF + SVM (UNIFIED_KNOWLEDGE)",
            json.dumps(alternatives, ensure_ascii=False),
            json.dumps(embedding),
            prediction_ms, ip,
            int(datetime.now().timestamp()),
        ))
        conn.commit()
    except Exception as e:
        logger.error(f"Erreur sauvegarde: {e}")
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════
# STARTUP
# ══════════════════════════════════════════════════════════════

@app.on_event("startup")
async def startup():
    logger.info("=" * 55)
    logger.info("ParrotDiag API v6.0 — Démarrage")
    logger.info(f"Source données : UNIFIED_KNOWLEDGE ({len(UNIFIED_KNOWLEDGE)} maladies)")
    logger.info(f"Maladies : {list(UNIFIED_KNOWLEDGE.keys())}")
    logger.info("=" * 55)
    init_db()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main_ia:app", host="127.0.0.1", port=8001, reload=False)