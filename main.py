from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, field_validator
from typing import Optional, List
import sqlite3
import json
import secrets
from datetime import datetime, timedelta
import calendar as cal_lib
from datetime import date as date_type

app = FastAPI(title="ParrotDiag API", version="1.0.0")

# Exception handler personnalisé pour les erreurs de validation
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Retourner un message d'erreur lisible pour les erreurs de validation Pydantic"""
    errors = []
    for error in exc.errors():
        field = error['loc'][-1] if error['loc'] else 'unknown'
        msg = error['msg']
        errors.append(f"{field}: {msg}")
    
    error_detail = " | ".join(errors)
    print(f"❌ Validation Error: {error_detail}")
    
    try:
        body = await request.body()
        body_str = body.decode('utf-8') if body else "empty"
        print(f"   Body reçu: {body_str}")
    except Exception as e:
        print(f"   Erreur lecture body: {str(e)}")
    
    return JSONResponse(
        status_code=400,
        content={"detail": f"Erreur de validation: {error_detail}"}
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ======== MODELES ========

class UserLogin(BaseModel):
    email: str
    password: str

class UserRegister(BaseModel):
    full_name: str
    email: str
    password: str
    role: str
    sex: str

class DoctorProfileCreate(BaseModel):
    user_id: int
    full_name: str
    age: int
    specialty: str
    location: str
    diplomas: str
    consultation_price: float
    experience: str
    bio: str
    phone: Optional[str] = None
    address: Optional[str] = None
    profile_photo: Optional[str] = None

class AppointmentCreate(BaseModel):
    patient_id: int
    doctor_id: int
    date: str
    time: str
    reason: str
    type: str = "consultation"

class MessageCreate(BaseModel):
    sender_id: int
    receiver_id: int
    content: str

class MedicalRecordCreate(BaseModel):
    patient_id: int
    doctor_id: int
    appointment_id: Optional[int] = None
    date: str
    blood_pressure: Optional[str] = None
    heart_rate: Optional[int] = None
    temperature: Optional[float] = None
    oxygen_saturation: Optional[int] = None
    weight: Optional[float] = None
    height: Optional[int] = None
    reason: Optional[str] = None
    history: Optional[str] = None
    examination: Optional[str] = None
    diagnosis: str
    secondary_diagnosis: Optional[str] = None
    medications: Optional[List[dict]] = None
    instructions: Optional[str] = None
    exams: Optional[List[dict]] = None
    notes: Optional[str] = None

class PatientProfileCreate(BaseModel):
    user_id: int
    full_name: str
    email: str
    birth_date: str
    age: Optional[int] = None
    sex: str
    marital_status: str
    phone: str
    address: str
    city: str
    zip_code: Optional[str] = None
    blood_type: Optional[str] = None
    allergies: Optional[str] = None
    current_medications: Optional[str] = None
    medical_history: Optional[str] = None
    emergency_contact: Optional[dict] = None
    profile_photo: Optional[str] = None

class SymptomAnalysisRequest(BaseModel):
    symptomes: str
    conversation_id: Optional[str] = None
    lang: str = "fr"
    include_recommendations: bool = True
    include_emergency: bool = True

class PrescriptionCreate(BaseModel):
    patient_id: int
    doctor_id: int
    appointment_id: Optional[int] = None
    date: str
    expiry_date: Optional[str] = None
    diagnosis: str
    medications: List[dict]
    instructions: str
    notes: Optional[str] = None
    is_active: bool = True

class PrescriptionUpdate(BaseModel):
    is_active: Optional[bool] = None
    status: Optional[str] = None

class DoctorAvailabilitySet(BaseModel):
    doctor_id: int
    date: str
    max_patients: int = 5
    is_open: bool = True
    notes: str = ""
    
    @field_validator('date', mode='before')
    @classmethod
    def validate_date(cls, v):
        """Valider et nettoyer le format de la date"""
        print(f"🔍 Validateur date - Valeur reçue: {v} (type: {type(v).__name__})")
        
        if v is None or v == "":
            return ""  # Laisser le backend valider le vide plutôt que de lever une erreur
        
        # Convertir en string si nécessaire
        date_str = str(v).strip()
        
        if not date_str:
            return ""  # Laisser passer les chaînes vides aussi
        
        # Vérifier le format YYYY-MM-DD
        import re
        if not re.match(r'^\d{4}-\d{2}-\d{2}$', date_str):
            print(f"❌ Format de date invalide: '{date_str}'")
            raise ValueError(f"Format de date invalide: '{date_str}'. Format attendu: YYYY-MM-DD (ex: 2026-03-15)")
        
        return date_str
        
        # Vérifier que c'est une date valide
        try:
            datetime.strptime(date_str, '%Y-%m-%d')
        except ValueError as e:
            raise ValueError(f"Date invalide: {date_str} ({str(e)})")
        
        return date_str
    
    @field_validator('max_patients', mode='before')
    @classmethod
    def validate_max_patients(cls, v):
        """Valider max_patients"""
        if v is None:
            return 5
        
        try:
            max_p = int(v)
            if max_p < 1:
                raise ValueError("max_patients doit être >= 1")
            return max_p
        except (ValueError, TypeError):
            raise ValueError(f"max_patients doit être un nombre entier, reçu: {v}")
    
    @field_validator('notes', mode='before')
    @classmethod
    def validate_notes(cls, v):
        """Valider notes"""
        if v is None:
            return ""
        return str(v).strip()

# ======== UTILITAIRES ========

def get_db():
    conn = sqlite3.connect('patients.db')
    conn.row_factory = sqlite3.Row
    return conn


def _compute_available_slots(start: str, end: str, slot_min: int,
                              date_str: str, doctor_id: int, cursor) -> list:
    """Calcule les créneaux libres d'une journée en soustrayant les RDV déjà pris."""
    try:
        t     = datetime.strptime(start, "%H:%M")
        end_t = datetime.strptime(end,   "%H:%M")
        delta = timedelta(minutes=int(slot_min))

        cursor.execute("""
            SELECT time FROM appointments
            WHERE doctor_id = ? AND date = ?
              AND status IN ('confirmed', 'pending')
        """, (doctor_id, date_str))
        booked = {row['time'][:5] for row in cursor.fetchall()}

        slots = []
        while t < end_t:
            s = t.strftime("%H:%M")
            if s not in booked:
                slots.append(s)
            t += delta
        return slots
    except Exception as e:
        print(f"_compute_available_slots error: {e}")
        return []


# ======== AUTH ========

@app.post("/register")
def register(user: UserRegister):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id FROM users WHERE email = ?", (user.email,))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="Email deja utilise")
        cursor.execute(
            "INSERT INTO users (full_name,email,password,role,sex) VALUES (?,?,?,?,?)",
            (user.full_name, user.email, user.password, user.role, user.sex)
        )
        uid = cursor.lastrowid
        conn.commit()
        return {"success": True, "user_id": uid, "message": "Compte cree avec succes"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.post("/login")
def login(user: UserLogin):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT id,full_name,email,role,sex,phone,address,specialty,profile_photo
            FROM users WHERE email=? AND password=?
        """, (user.email, user.password))
        db_user = cursor.fetchone()
        if not db_user:
            raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
        user_data = dict(db_user)
        token = secrets.token_hex(32)
        cursor.execute("INSERT INTO tokens (user_id,token) VALUES (?,?)", (user_data['id'], token))
        if user_data['role'] == 'doctor':
            cursor.execute("SELECT * FROM doctor_profiles WHERE user_id=?", (user_data['id'],))
            p = cursor.fetchone()
            if p:
                user_data['profile'] = dict(p)
        conn.commit()
        return {"success": True, "token": token, "user": user_data}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ======== MEDECINS ========

@app.post("/doctors/profile")
def create_doctor_profile(profile: DoctorProfileCreate):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM users WHERE id=? AND role='doctor'", (profile.user_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Medecin non trouve")
        cursor.execute("""
            INSERT OR REPLACE INTO doctor_profiles
            (user_id,full_name,age,specialty,location,diplomas,
             consultation_price,experience,bio,phone,address,profile_photo)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
        """, (profile.user_id, profile.full_name, profile.age, profile.specialty,
              profile.location, profile.diplomas, profile.consultation_price,
              profile.experience, profile.bio, profile.phone, profile.address,
              profile.profile_photo))
        cursor.execute(
            "UPDATE users SET full_name=?,specialty=?,phone=?,address=? WHERE id=?",
            (profile.full_name, profile.specialty, profile.phone, profile.address, profile.user_id)
        )
        conn.commit()
        return {"success": True, "message": "Profil medecin enregistre avec succes"}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.get("/doctors/approved")
def get_approved_doctors():
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT u.id as user_id, u.full_name, u.email, u.sex, u.phone, u.address,
                dp.specialty, dp.location, dp.diplomas, dp.consultation_price,
                dp.experience, dp.bio, dp.profile_photo, dp.rating, dp.patient_count,
                (SELECT COUNT(*) FROM appointments WHERE doctor_id=u.id AND status='completed') as total_consultations,
                (SELECT COUNT(DISTINCT patient_id) FROM appointments WHERE doctor_id=u.id) as total_patients,
                COALESCE((SELECT AVG(rating) FROM reviews WHERE doctor_id=u.id),4.5) as avg_rating
            FROM users u
            LEFT JOIN doctor_profiles dp ON u.id=dp.user_id
            WHERE u.role='doctor'
            ORDER BY dp.rating DESC, dp.patient_count DESC
        """)
        doctors = []
        for row in cursor.fetchall():
            d = dict(row)
            names = (d.get('full_name') or '').split()
            d['initials'] = ''.join([n[0].upper() for n in names if n])[:2]
            d['available'] = True
            doctors.append(d)
        return doctors
    except Exception as e:
        print(f"get_approved_doctors error: {e}")
        return []
    finally:
        conn.close()


@app.get("/doctors/{doctor_id}/profile")
def get_doctor_profile(doctor_id: int):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT dp.*, u.email,
                (SELECT COUNT(*) FROM appointments WHERE doctor_id=dp.user_id AND status='completed') as total_consultations,
                (SELECT COUNT(DISTINCT patient_id) FROM appointments WHERE doctor_id=dp.user_id) as total_patients
            FROM doctor_profiles dp
            JOIN users u ON dp.user_id=u.id
            WHERE dp.user_id=?
        """, (doctor_id,))
        profile = cursor.fetchone()
        if not profile:
            cursor.execute(
                "SELECT id,full_name,email,specialty,phone,address FROM users WHERE id=? AND role='doctor'",
                (doctor_id,)
            )
            user = cursor.fetchone()
            if user:
                data = dict(user)
                data.update({'age': None, 'location': None, 'diplomas': None,
                             'consultation_price': None, 'experience': 'Non specifie',
                             'bio': None, 'profile_photo': None,
                             'rating': 4.5, 'patient_count': 0, 'total_consultations': 0})
                return data
            raise HTTPException(status_code=404, detail="Medecin non trouve")
        return dict(profile)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ======== PATIENTS (vue medecin) ========

@app.get("/doctors/{doctor_id}/patients")
def get_doctor_patients(doctor_id: int):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT DISTINCT u.id, u.full_name, u.email, u.sex, u.phone, u.address,
                MAX(a.date) as last_visit,
                COUNT(a.id) as total_appointments,
                SUM(CASE WHEN a.status='completed' THEN 1 ELSE 0 END) as completed_appointments,
                (SELECT reason FROM appointments WHERE patient_id=u.id AND doctor_id=?
                 ORDER BY date DESC,time DESC LIMIT 1) as last_reason,
                (SELECT status FROM appointments WHERE patient_id=u.id AND doctor_id=?
                 ORDER BY date DESC,time DESC LIMIT 1) as last_status
            FROM users u
            JOIN appointments a ON u.id=a.patient_id
            WHERE a.doctor_id=? AND u.role='patient'
            GROUP BY u.id
            ORDER BY last_visit DESC
        """, (doctor_id, doctor_id, doctor_id))
        return [dict(r) for r in cursor.fetchall()]
    except Exception as e:
        print(f"get_doctor_patients error: {e}")
        return []
    finally:
        conn.close()


@app.get("/doctors/{doctor_id}/patients/recent")
def get_recent_patients(doctor_id: int, limit: int = 5):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT DISTINCT u.id, u.full_name, u.sex,
                MAX(a.date) as last_visit,
                a.reason as last_reason,
                a.status as last_status
            FROM users u
            JOIN appointments a ON u.id=a.patient_id
            WHERE a.doctor_id=? AND u.role='patient'
            GROUP BY u.id
            ORDER BY last_visit DESC
            LIMIT ?
        """, (doctor_id, limit))
        return [dict(r) for r in cursor.fetchall()]
    except Exception as e:
        print(f"get_recent_patients error: {e}")
        return []
    finally:
        conn.close()


@app.get("/doctors/{doctor_id}/patients/{patient_id}/profile")
def get_patient_profile_for_doctor(doctor_id: int, patient_id: int):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id FROM users WHERE id=? AND role='doctor'", (doctor_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Medecin non trouve")
        cursor.execute(
            "SELECT id,full_name,email,sex,phone,address FROM users WHERE id=? AND role='patient'",
            (patient_id,)
        )
        patient = cursor.fetchone()
        if not patient:
            raise HTTPException(status_code=404, detail="Patient non trouve")
        return dict(patient)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ======== RENDEZ-VOUS ========

@app.post("/appointments")
def create_appointment(appointment: AppointmentCreate):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id,full_name FROM users WHERE id=? AND role='patient'", (appointment.patient_id,))
        patient = cursor.fetchone()
        if not patient:
            raise HTTPException(status_code=404, detail="Patient non trouve")

        cursor.execute("SELECT id,full_name FROM users WHERE id=? AND role='doctor'", (appointment.doctor_id,))
        doctor = cursor.fetchone()
        if not doctor:
            raise HTTPException(status_code=404, detail="Medecin non trouve")

        cursor.execute("""
            SELECT * FROM appointments
            WHERE doctor_id=? AND date=? AND time=?
              AND status IN ('pending','confirmed')
        """, (appointment.doctor_id, appointment.date, appointment.time))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="Ce creneau n'est pas disponible")

        cursor.execute("""
            INSERT INTO appointments (patient_id,doctor_id,date,time,reason,type,status)
            VALUES (?,?,?,?,?,?,'pending')
        """, (appointment.patient_id, appointment.doctor_id, appointment.date,
              appointment.time, appointment.reason, appointment.type))
        apt_id = cursor.lastrowid

        cursor.execute(
            "INSERT INTO notifications (user_id,title,message,type) VALUES (?,?,?,?)",
            (appointment.doctor_id,
             "Nouvelle demande de rendez-vous",
             f"{patient['full_name']} a demande un rendez-vous le {appointment.date} a {appointment.time}",
             "appointment_request")
        )
        cursor.execute(
            "INSERT INTO notifications (user_id,title,message,type) VALUES (?,?,?,?)",
            (appointment.patient_id,
             "Demande de rendez-vous envoyee",
             f"Votre demande pour le {appointment.date} a {appointment.time} a ete envoyee a {doctor['full_name']}",
             "appointment_confirmation")
        )
        conn.commit()
        return {"success": True, "appointment_id": apt_id,
                "message": "Demande de rendez-vous creee avec succes"}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.get("/appointments/{appointment_id}")
def get_appointment(appointment_id: int):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT a.*, u.full_name as patient_name, u.phone as patient_phone,
                d.full_name as doctor_name
            FROM appointments a
            JOIN users u ON a.patient_id=u.id
            JOIN users d ON a.doctor_id=d.id
            WHERE a.id=?
        """, (appointment_id,))
        apt = cursor.fetchone()
        if not apt:
            raise HTTPException(status_code=404, detail="Rendez-vous non trouve")
        return dict(apt)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.get("/doctors/{doctor_id}/appointments/today")
def get_today_appointments(doctor_id: int):
    conn = get_db()
    cursor = conn.cursor()
    try:
        today = datetime.now().strftime('%Y-%m-%d')
        cursor.execute("""
            SELECT a.*, u.full_name as patient_name, u.phone as patient_phone
            FROM appointments a
            JOIN users u ON a.patient_id=u.id
            WHERE a.doctor_id=? AND a.date=?
            ORDER BY a.time ASC
        """, (doctor_id, today))
        return [dict(r) for r in cursor.fetchall()]
    except Exception as e:
        print(f"get_today_appointments error: {e}")
        return []
    finally:
        conn.close()


@app.get("/doctors/{doctor_id}/appointments")
def get_doctor_appointments(
    doctor_id: int,
    status: Optional[str] = None,
    patient_id: Optional[int] = None,
    date: Optional[str] = None
):
    conn = get_db()
    cursor = conn.cursor()
    try:
        q = """
            SELECT a.*, u.full_name as patient_name,
                u.phone as patient_phone, u.sex as patient_sex
            FROM appointments a
            JOIN users u ON a.patient_id=u.id
            WHERE a.doctor_id=?
        """
        p = [doctor_id]
        if status:     q += " AND a.status=?";     p.append(status)
        if patient_id: q += " AND a.patient_id=?"; p.append(patient_id)
        if date:       q += " AND a.date=?";       p.append(date)
        q += " ORDER BY a.date DESC, a.time ASC"
        cursor.execute(q, p)
        return [dict(r) for r in cursor.fetchall()]
    except Exception as e:
        print(f"get_doctor_appointments error: {e}")
        return []
    finally:
        conn.close()


@app.get("/patients/{patient_id}/appointments")
def get_patient_appointments(patient_id: int):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT a.*, u.full_name as doctor_name, u.specialty,
                dp.profile_photo, dp.address as doctor_address, dp.phone as doctor_phone
            FROM appointments a
            JOIN users u ON a.doctor_id=u.id
            LEFT JOIN doctor_profiles dp ON a.doctor_id=dp.user_id
            WHERE a.patient_id=?
            ORDER BY a.date DESC, a.time DESC
        """, (patient_id,))
        return [dict(r) for r in cursor.fetchall()]
    except Exception as e:
        print(f"get_patient_appointments error: {e}")
        return []
    finally:
        conn.close()


@app.put("/appointments/{appointment_id}/status")
def update_appointment_status(appointment_id: int, data: dict):
    conn = get_db()
    cursor = conn.cursor()
    try:
        status = data.get('status')
        if status not in ['confirmed', 'cancelled', 'completed']:
            raise HTTPException(status_code=400, detail="Statut invalide")

        cursor.execute("SELECT * FROM appointments WHERE id=?", (appointment_id,))
        apt = cursor.fetchone()
        if not apt:
            raise HTTPException(status_code=404, detail="Rendez-vous non trouve")
        apt = dict(apt)

        cursor.execute(
            "UPDATE appointments SET status=?,updated_at=datetime('now','localtime') WHERE id=?",
            (status, appointment_id)
        )

        cursor.execute("SELECT full_name FROM users WHERE id=?", (apt['patient_id'],))
        patient = cursor.fetchone()
        cursor.execute("SELECT full_name FROM users WHERE id=?", (apt['doctor_id'],))
        doctor = cursor.fetchone()

        notif_map = {
            'confirmed': ("Rendez-vous confirme",
                          f"Votre rendez-vous avec {doctor['full_name']} le {apt['date']} a ete confirme",
                          "appointment_confirmed"),
            'cancelled': ("Rendez-vous annule",
                          f"Votre rendez-vous avec {doctor['full_name']} le {apt['date']} a ete annule",
                          "appointment_cancelled"),
            'completed': ("Consultation terminee",
                          f"Votre consultation avec {doctor['full_name']} est terminee.",
                          "appointment_completed"),
        }
        if status in notif_map:
            title, msg, ntype = notif_map[status]
            cursor.execute(
                "INSERT INTO notifications (user_id,title,message,type) VALUES (?,?,?,?)",
                (apt['patient_id'], title, msg, ntype)
            )
        conn.commit()
        return {"success": True, "message": "Statut mis a jour"}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.post("/appointments/{appointment_id}/reschedule")
def reschedule_appointment(appointment_id: int, data: dict):
    conn = get_db()
    cursor = conn.cursor()
    try:
        new_date = data.get('new_date')
        new_time = data.get('new_time')
        reason   = data.get('reason', '')

        cursor.execute("SELECT * FROM appointments WHERE id=?", (appointment_id,))
        apt = cursor.fetchone()
        if not apt:
            raise HTTPException(status_code=404, detail="Rendez-vous non trouve")
        apt = dict(apt)

        cursor.execute("""
            UPDATE appointments
            SET status='rescheduled_pending', date=?, time=?,
                updated_at=datetime('now','localtime')
            WHERE id=?
        """, (new_date, new_time, appointment_id))

        cursor.execute("SELECT full_name FROM users WHERE id=?", (apt['doctor_id'],))
        doctor = cursor.fetchone()
        cursor.execute(
            "INSERT INTO notifications (user_id,title,message,type) VALUES (?,?,?,?)",
            (apt['patient_id'],
             "Proposition de reprogrammation",
             f"Le Dr. {doctor['full_name']} a propose une nouvelle date: {new_date} a {new_time}. Motif: {reason}",
             "appointment_rescheduled")
        )
        conn.commit()
        return {"success": True, "message": "Proposition de reprogrammation envoyee"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ======== DISPONIBILITES ========

@app.post("/doctors/availability/set")
def set_doctor_availability(data: DoctorAvailabilitySet):
    conn = get_db()
    cursor = conn.cursor()
    try:
        doctor_id    = data.doctor_id
        date         = data.date
        max_patients = data.max_patients
        is_open      = data.is_open
        notes        = data.notes or ""
        
        # Logging des données reçues
        print(f"\n📥 Données reçues pour /doctors/availability/set:")
        print(f"   doctor_id: {doctor_id} (type: {type(doctor_id).__name__})")
        print(f"   date: {date} (type: {type(date).__name__})")
        print(f"   max_patients: {max_patients} (type: {type(max_patients).__name__})")
        print(f"   is_open: {is_open} (type: {type(is_open).__name__})")
        print(f"   notes: {notes} (type: {type(notes).__name__})")

        # Validation des données requises
        if not doctor_id:
            raise HTTPException(status_code=400, detail="doctor_id manquant")
        if not date:
            raise HTTPException(status_code=400, detail="date manquante ou vide")
        if not isinstance(max_patients, int) or max_patients < 1:
            raise HTTPException(status_code=400, detail="max_patients doit être un entier >= 1")
        if not isinstance(is_open, bool):
            raise HTTPException(status_code=400, detail="is_open doit être un booléen")
        
        # Vérifier que le médecin existe
        cursor.execute("SELECT id FROM users WHERE id=? AND role='doctor'", (doctor_id,))
        if not cursor.fetchone():
            print(f"❌ Médecin {doctor_id} introuvable. Médecins disponibles:")
            cursor.execute("SELECT id FROM users WHERE role='doctor'")
            available = [row[0] for row in cursor.fetchall()]
            print(f"   IDs disponibles: {available}")
            raise HTTPException(status_code=401, detail=f"Votre session a expiré. Veuillez vous reconnecter (Médecin {doctor_id} introuvable)")

        # Insérer ou remplacer la disponibilité
        cursor.execute("""
            INSERT OR REPLACE INTO doctor_availabilities
            (doctor_id, date, max_patients, is_open, notes, created_at)
            VALUES (?, ?, ?, ?, ?, datetime('now','localtime'))
        """, (doctor_id, date, max_patients, 1 if is_open else 0, notes))
        conn.commit()

        # Récupérer et retourner la disponibilité mise à jour
        cursor.execute(
            "SELECT id, doctor_id, date, is_open, max_patients, notes, created_at FROM doctor_availabilities WHERE doctor_id=? AND date=?",
            (doctor_id, date)
        )
        result = cursor.fetchone()
        
        if result:
            availability = {
                "id": result['id'],
                "doctor_id": result['doctor_id'],
                "date": result['date'],
                "is_open": bool(result['is_open']),
                "max_patients": result['max_patients'],
                "notes": result['notes'],
                "created_at": result['created_at'],
                "current_patients": 0
            }
            return {
                "success": True,
                "message": f"✅ Disponibilité enregistrée pour le {date}",
                "availability": availability
            }
        else:
            raise HTTPException(status_code=500, detail="Erreur lors de la sauvegarde (résultat SQL vide)")
            
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        import traceback
        print(f"❌ Erreur set_doctor_availability: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Erreur serveur: {str(e)}")
    finally:
        conn.close()


@app.get("/doctors/{doctor_id}/availability")
def get_doctor_availability(doctor_id: int, year: int = None, month: int = None):
    conn = get_db()
    cursor = conn.cursor()
    try:
        if not year or not month:
            now = datetime.now(); year = now.year; month = now.month

        first_day    = date_type(year, month, 1)
        last_day_num = cal_lib.monthrange(year, month)[1]
        last_day     = date_type(year, month, last_day_num)
        first_str    = first_day.strftime('%Y-%m-%d')
        last_str     = last_day.strftime('%Y-%m-%d')

        cursor.execute("""
            SELECT * FROM doctor_availabilities
            WHERE doctor_id=? AND date>=? AND date<=?
            ORDER BY date
        """, (doctor_id, first_str, last_str))

        availabilities = []
        for row in cursor.fetchall():
            a = dict(row)
            a['is_open'] = bool(a['is_open'])
            availabilities.append(a)

        cursor.execute("""
            SELECT date, COUNT(*) as count FROM appointments
            WHERE doctor_id=? AND date>=? AND date<=? AND status='confirmed'
            GROUP BY date
        """, (doctor_id, first_str, last_str))
        by_date = {r['date']: r['count'] for r in cursor.fetchall()}

        for a in availabilities:
            a['current_patients'] = by_date.get(a['date'], 0)

        return {"doctor_id": doctor_id, "year": year, "month": month,
                "availabilities": availabilities}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.get("/doctors/{doctor_id}/working-hours")
def get_doctor_working_hours(doctor_id: int):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "SELECT * FROM doctor_working_hours WHERE doctor_id=? ORDER BY day_of_week",
            (doctor_id,)
        )
        return {"doctor_id": doctor_id, "working_hours": [dict(r) for r in cursor.fetchall()]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.post("/doctors/working-hours/set")
def set_doctor_working_hours(data: dict):
    conn = get_db()
    cursor = conn.cursor()
    try:
        wh_list = data.get('working_hours', [])
        for wh in wh_list:
            cursor.execute("""
                INSERT OR REPLACE INTO doctor_working_hours
                (doctor_id,day_of_week,start_time,end_time,slot_duration,is_working_day,created_at)
                VALUES (?,?,?,?,?,1,datetime('now','localtime'))
            """, (wh['doctor_id'], wh['day_of_week'], wh['start_time'],
                  wh['end_time'], wh['slot_duration']))
        conn.commit()
        return {"success": True,
                "message": f"Horaires configures pour {len(wh_list)} jours",
                "count": len(wh_list)}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ======== CALENDRIER PATIENT (NOUVEAU) ========

@app.get("/doctors/{doctor_id}/calendar/{month}/{year}")
def get_doctor_calendar(doctor_id: int, month: int, year: int):
    """
    Retourne pour chaque jour du mois le statut de disponibilite :
      green  = disponible (creneaux libres)
      orange = ferme (weekend par defaut ou configure manuellement)
      red    = complet (max_patients atteint)
      gray   = date passee
    Prend en compte les disponibilites configurees par le medecin.
    """
    conn = get_db()
    cursor = conn.cursor()
    try:
        last_day_num = cal_lib.monthrange(year, month)[1]
        first_str    = f"{year}-{month:02d}-01"
        last_str     = f"{year}-{month:02d}-{last_day_num:02d}"
        today        = date_type.today()

        # 1 — Disponibilites configurees manuellement par le medecin
        cursor.execute("""
            SELECT date, is_open, max_patients, notes
            FROM doctor_availabilities
            WHERE doctor_id=? AND date>=? AND date<=?
        """, (doctor_id, first_str, last_str))
        avail_map = {}
        for row in cursor.fetchall():
            avail_map[row['date']] = {
                'is_open':      bool(row['is_open']),
                'max_patients': row['max_patients'] or 5,
                'notes':        row['notes'] or ''
            }

        # 2 — RDV deja reserves (confirmed + pending)
        cursor.execute("""
            SELECT date, COUNT(*) as cnt
            FROM appointments
            WHERE doctor_id=? AND date>=? AND date<=?
              AND status IN ('confirmed','pending')
            GROUP BY date
        """, (doctor_id, first_str, last_str))
        booked_map = {r['date']: r['cnt'] for r in cursor.fetchall()}

        # 3 — Horaires habituels du medecin (0=lundi … 6=dimanche)
        cursor.execute("""
            SELECT day_of_week, start_time, end_time, slot_duration
            FROM doctor_working_hours
            WHERE doctor_id=?
        """, (doctor_id,))
        working_hours = {}
        for row in cursor.fetchall():
            working_hours[row['day_of_week']] = {
                'start': row['start_time'],
                'end':   row['end_time'],
                'slot':  row['slot_duration'] or 30
            }

        # 4 — Construire le resultat jour par jour
        result = {}
        for day_num in range(1, last_day_num + 1):
            d        = date_type(year, month, day_num)
            date_str = d.strftime('%Y-%m-%d')
            dow      = d.weekday()   # 0=lundi … 6=dimanche
            is_past  = d < today
            is_wknd  = dow >= 5      # Samedi(5) ou Dimanche(6)
            booked   = booked_map.get(date_str, 0)

            # Date passee — toujours grise
            if is_past:
                result[date_str] = {
                    "color": "gray", "is_available": False,
                    "available_slots": 0, "message": "Date passee"
                }
                continue

            # --- Configuration manuelle du medecin (priorite absolue) ---
            if date_str in avail_map:
                cfg = avail_map[date_str]

                if not cfg['is_open']:
                    # Jour ferme manuellement → orange
                    result[date_str] = {
                        "color": "orange", "is_available": False,
                        "available_slots": 0,
                        "message": cfg['notes'] or "Jour ferme"
                    }
                    continue

                max_p = cfg['max_patients']
                if booked >= max_p:
                    # Complet → rouge
                    result[date_str] = {
                        "color": "red", "is_available": False,
                        "available_slots": 0,
                        "message": f"Complet ({booked}/{max_p})"
                    }
                else:
                    # Disponible → vert
                    wh    = working_hours.get(dow, {'start': '09:00', 'end': '18:00', 'slot': 30})
                    slots = _compute_available_slots(
                        wh['start'], wh['end'], wh['slot'], date_str, doctor_id, cursor
                    )
                    result[date_str] = {
                        "color": "green", "is_available": True,
                        "available_slots": len(slots),
                        "message": f"{len(slots)} creneau(x) disponible(s)"
                    }
                continue

            # --- Pas de configuration manuelle : regles par defaut ---
            if is_wknd:
                # Weekend → orange (ferme par defaut)
                result[date_str] = {
                    "color": "orange", "is_available": False,
                    "available_slots": 0, "message": "Week-end (ferme)"
                }
            else:
                wh    = working_hours.get(dow, {'start': '09:00', 'end': '18:00', 'slot': 30})
                max_p = 10  # capacite par defaut si non configuree
                if booked >= max_p:
                    result[date_str] = {
                        "color": "red", "is_available": False,
                        "available_slots": 0, "message": "Complet"
                    }
                else:
                    slots = _compute_available_slots(
                        wh['start'], wh['end'], wh['slot'], date_str, doctor_id, cursor
                    )
                    result[date_str] = {
                        "color": "green", "is_available": True,
                        "available_slots": len(slots),
                        "message": f"{len(slots)} creneau(x) disponible(s)"
                    }

        return result

    except Exception as e:
        print(f"get_doctor_calendar error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ======== CRENEAUX DISPONIBLES PATIENT (NOUVEAU) ========

@app.get("/doctors/{doctor_id}/available-slots/{date_str}")
def get_available_slots(doctor_id: int, date_str: str):
    """Retourne la liste des créneaux horaires libres pour un medecin a une date donnee."""
    conn = get_db()
    cursor = conn.cursor()
    try:
        d   = date_type.fromisoformat(date_str)
        dow = d.weekday()   # 0=lundi … 6=dimanche

        # Verifier la config manuelle du medecin
        cursor.execute("""
            SELECT is_open, max_patients, notes
            FROM doctor_availabilities
            WHERE doctor_id=? AND date=?
        """, (doctor_id, date_str))
        avail = cursor.fetchone()

        if avail and not bool(avail['is_open']):
            return {"date": date_str, "available_slots": [], "available_count": 0,
                    "message": avail['notes'] or "Jour ferme"}

        # Weekend sans config → ferme
        if dow >= 5 and not avail:
            return {"date": date_str, "available_slots": [], "available_count": 0,
                    "message": "Week-end (ferme)"}

        # Horaires du medecin
        cursor.execute("""
            SELECT start_time, end_time, slot_duration
            FROM doctor_working_hours
            WHERE doctor_id=? AND day_of_week=?
        """, (doctor_id, dow))
        wh = cursor.fetchone()

        start = wh['start_time']    if wh else '09:00'
        end   = wh['end_time']      if wh else '18:00'
        slot  = wh['slot_duration'] if wh else 30

        slots = _compute_available_slots(start, end, slot, date_str, doctor_id, cursor)

        return {
            "date":             date_str,
            "available_slots":  slots,
            "available_count":  len(slots),
            "message":          f"{len(slots)} creneau(x) disponible(s)"
        }
    except Exception as e:
        print(f"get_available_slots error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ======== STATISTIQUES ========

@app.get("/doctors/{doctor_id}/stats")
def get_doctor_stats(doctor_id: int):
    conn = get_db()
    cursor = conn.cursor()
    try:
        today = datetime.now().strftime('%Y-%m-%d')
        fdom  = datetime.now().replace(day=1).strftime('%Y-%m-%d')

        def scalar(q, *args):
            cursor.execute(q, args)
            r = cursor.fetchone()
            return r[0] if r else 0

        return {
            "total_patients":           scalar("SELECT COUNT(DISTINCT patient_id) FROM appointments WHERE doctor_id=?", doctor_id),
            "new_patients_this_month":  scalar("SELECT COUNT(DISTINCT patient_id) FROM appointments WHERE doctor_id=? AND date>=?", doctor_id, fdom),
            "today_appointments":       scalar("SELECT COUNT(*) FROM appointments WHERE doctor_id=? AND date=?", doctor_id, today),
            "pending_appointments":     scalar("SELECT COUNT(*) FROM appointments WHERE doctor_id=? AND status='pending'", doctor_id),
            "total_consultations":      scalar("SELECT COUNT(*) FROM appointments WHERE doctor_id=? AND status='completed'", doctor_id),
            "consultations_this_month": scalar("SELECT COUNT(*) FROM appointments WHERE doctor_id=? AND status='completed' AND date>=?", doctor_id, fdom),
            "unread_notifications":     scalar("SELECT COUNT(*) FROM notifications WHERE user_id=? AND is_read=0", doctor_id),
            "ai_analyses": 0,
            "ai_accuracy": 95
        }
    except Exception as e:
        print(f"stats error: {e}")
        return {"total_patients": 0, "new_patients_this_month": 0, "today_appointments": 0,
                "pending_appointments": 0, "total_consultations": 0, "consultations_this_month": 0,
                "unread_notifications": 0, "ai_analyses": 0, "ai_accuracy": 95}
    finally:
        conn.close()


# ======== NOTIFICATIONS ========

@app.get("/users/{user_id}/notifications")
def get_user_notifications(user_id: int, unread_only: bool = False):
    conn = get_db()
    cursor = conn.cursor()
    try:
        q = "SELECT * FROM notifications WHERE user_id=?"
        p = [user_id]
        if unread_only:
            q += " AND is_read=0"
        q += " ORDER BY created_at DESC LIMIT 50"
        cursor.execute(q, p)
        return [dict(r) for r in cursor.fetchall()]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.get("/users/{user_id}/notifications/unread-count")
def get_unread_notifications_count(user_id: int):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "SELECT COUNT(*) as count FROM notifications WHERE user_id=? AND is_read=0",
            (user_id,)
        )
        return {"count": cursor.fetchone()['count']}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.post("/notifications/{notification_id}/read")
def mark_notification_read(notification_id: int):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE notifications SET is_read=1 WHERE id=?", (notification_id,))
        conn.commit()
        return {"success": True}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.post("/notifications/mark-all-read")
def mark_all_notifications_read(user_id: int):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE notifications SET is_read=1 WHERE user_id=?", (user_id,))
        conn.commit()
        return {"success": True, "message": "Toutes les notifications sont marquees comme lues"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ======== MESSAGERIE ========

@app.post("/messages")
def send_message(message: MessageCreate):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO messages (sender_id,receiver_id,content) VALUES (?,?,?)",
            (message.sender_id, message.receiver_id, message.content)
        )
        mid = cursor.lastrowid
        cursor.execute(
            "INSERT INTO notifications (user_id,title,message,type) VALUES (?,?,?,?)",
            (message.receiver_id, "Nouveau message", "Vous avez recu un nouveau message", "message")
        )
        conn.commit()
        return {"success": True, "message_id": mid, "created_at": datetime.now().isoformat()}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.get("/messages/{user_id}/{other_id}")
def get_messages(user_id: int, other_id: int):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT * FROM messages
            WHERE (sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?)
            ORDER BY created_at ASC
        """, (user_id, other_id, other_id, user_id))
        msgs = [dict(r) for r in cursor.fetchall()]
        cursor.execute(
            "UPDATE messages SET is_read=1 WHERE sender_id=? AND receiver_id=? AND is_read=0",
            (other_id, user_id)
        )
        conn.commit()
        return msgs
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.get("/doctors/{doctor_id}/conversations")
def get_doctor_conversations(doctor_id: int):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT DISTINCT u.id as patient_id, u.full_name as patient_name,
                (SELECT content FROM messages
                 WHERE (sender_id=u.id AND receiver_id=?) OR (sender_id=? AND receiver_id=u.id)
                 ORDER BY created_at DESC LIMIT 1) as last_message,
                (SELECT created_at FROM messages
                 WHERE (sender_id=u.id AND receiver_id=?) OR (sender_id=? AND receiver_id=u.id)
                 ORDER BY created_at DESC LIMIT 1) as last_message_time,
                (SELECT COUNT(*) FROM messages
                 WHERE sender_id=u.id AND receiver_id=? AND is_read=0) as unread_count
            FROM users u
            WHERE EXISTS (
                SELECT 1 FROM messages
                WHERE (sender_id=u.id AND receiver_id=?) OR (sender_id=? AND receiver_id=u.id)
            )
            ORDER BY last_message_time DESC
        """, (doctor_id, doctor_id, doctor_id, doctor_id, doctor_id, doctor_id, doctor_id))
        return [dict(r) for r in cursor.fetchall()]
    except Exception as e:
        print(f"conversations error: {e}")
        return []
    finally:
        conn.close()


# ======== DOSSIER MEDICAL ========

@app.post("/medical-records")
def create_medical_record(record: MedicalRecordCreate):
    conn = get_db()
    cursor = conn.cursor()
    try:
        meds_j = json.dumps(record.medications, ensure_ascii=False) if record.medications else None
        exms_j = json.dumps(record.exams,       ensure_ascii=False) if record.exams       else None

        cursor.execute("""
            INSERT INTO medical_records
            (patient_id,doctor_id,appointment_id,date,blood_pressure,heart_rate,temperature,
             oxygen_saturation,weight,height,reason,history,examination,diagnosis,
             secondary_diagnosis,medications,instructions,exams,notes)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (record.patient_id, record.doctor_id, record.appointment_id, record.date,
              record.blood_pressure, record.heart_rate, record.temperature,
              record.oxygen_saturation, record.weight, record.height,
              record.reason, record.history, record.examination,
              record.diagnosis, record.secondary_diagnosis,
              meds_j, record.instructions, exms_j, record.notes))
        rid = cursor.lastrowid

        if record.appointment_id:
            cursor.execute(
                "UPDATE appointments SET status='completed' WHERE id=?",
                (record.appointment_id,)
            )
        conn.commit()
        return {"success": True, "record_id": rid, "message": "Dossier medical cree avec succes"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.get("/patients/{patient_id}/medical-records")
def get_patient_medical_records(patient_id: int):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT mr.*, u.full_name as doctor_name
            FROM medical_records mr
            JOIN users u ON mr.doctor_id=u.id
            WHERE mr.patient_id=?
            ORDER BY mr.date DESC, mr.created_at DESC
        """, (patient_id,))
        records = []
        for row in cursor.fetchall():
            r = dict(row)
            for f in ('medications', 'exams'):
                if r.get(f):
                    try:    r[f] = json.loads(r[f])
                    except: r[f] = []
            records.append(r)
        return records
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ======== PROFIL PATIENT ========

@app.post("/patients/profile")
def create_patient_profile(profile: PatientProfileCreate):
    conn = get_db()
    cursor = conn.cursor()
    try:
        emg_j = json.dumps(profile.emergency_contact, ensure_ascii=False) \
                if profile.emergency_contact else None
        cursor.execute("""
            INSERT OR REPLACE INTO patient_profiles
            (user_id,full_name,birth_date,age,sex,marital_status,phone,address,city,zip_code,
             blood_type,allergies,current_medications,medical_history,emergency_contact,profile_photo)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (profile.user_id, profile.full_name, profile.birth_date, profile.age,
              profile.sex, profile.marital_status, profile.phone, profile.address,
              profile.city, profile.zip_code, profile.blood_type, profile.allergies,
              profile.current_medications, profile.medical_history, emg_j, profile.profile_photo))
        cursor.execute(
            "UPDATE users SET full_name=?,phone=?,address=?,profile_photo=? WHERE id=?",
            (profile.full_name, profile.phone, profile.address, profile.profile_photo, profile.user_id)
        )
        conn.commit()
        return {"success": True, "message": "Profil patient enregistre avec succes"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.get("/patients/{patient_id}/profile")
def get_patient_profile(patient_id: int):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM patient_profiles WHERE user_id=?", (patient_id,))
        profile = cursor.fetchone()
        if not profile:
            cursor.execute(
                "SELECT id,full_name,email,phone,address FROM users WHERE id=? AND role='patient'",
                (patient_id,)
            )
            user = cursor.fetchone()
            if user:
                return dict(user)
            raise HTTPException(status_code=404, detail="Patient non trouve")
        data = dict(profile)
        if data.get('emergency_contact'):
            try:    data['emergency_contact'] = json.loads(data['emergency_contact'])
            except: data['emergency_contact'] = None
        return data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ======== ORDONNANCES ========

@app.post("/prescriptions")
def create_prescription(prescription: PrescriptionCreate):
    conn = get_db()
    cursor = conn.cursor()
    try:
        meds_j = json.dumps(prescription.medications, ensure_ascii=False)
        if not prescription.expiry_date:
            prescription.expiry_date = (datetime.now() + timedelta(days=365)).strftime('%Y-%m-%d')
        rx_num = f"ORD-{datetime.now().strftime('%Y%m')}-{secrets.token_hex(4).upper()}"

        cursor.execute("""
            INSERT INTO prescriptions
            (prescription_number,patient_id,doctor_id,appointment_id,date,expiry_date,
             diagnosis,medications,instructions,notes,is_active,status,pdf_generated)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (rx_num, prescription.patient_id, prescription.doctor_id,
              prescription.appointment_id, prescription.date, prescription.expiry_date,
              prescription.diagnosis, meds_j, prescription.instructions, prescription.notes,
              1 if prescription.is_active else 0,
              'active' if prescription.is_active else 'inactive', 0))
        pid = cursor.lastrowid

        cursor.execute(
            "INSERT INTO notifications (user_id,title,message,type) VALUES (?,?,?,?)",
            (prescription.patient_id,
             "Nouvelle ordonnance disponible",
             f"Une nouvelle ordonnance a ete creee. Numero: {rx_num}",
             "prescription")
        )
        conn.commit()
        return {"success": True, "prescription_id": pid,
                "prescription_number": rx_num, "message": "Ordonnance creee avec succes"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.get("/patients/{patient_id}/prescriptions")
def get_patient_prescriptions(patient_id: int, status: Optional[str] = None):
    conn = get_db()
    cursor = conn.cursor()
    try:
        q = """
            SELECT p.*, u.full_name as doctor_name, dp.specialty, dp.profile_photo
            FROM prescriptions p
            JOIN users u ON p.doctor_id=u.id
            LEFT JOIN doctor_profiles dp ON p.doctor_id=dp.user_id
            WHERE p.patient_id=?
        """
        params = [patient_id]
        if status:
            q += " AND p.status=?"
            params.append(status)
        q += " ORDER BY p.date DESC"
        cursor.execute(q, params)
        result = []
        for row in cursor.fetchall():
            p = dict(row)
            if p.get('medications'):
                try:    p['medications'] = json.loads(p['medications'])
                except: p['medications'] = []
            result.append(p)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.get("/prescriptions/{prescription_id}")
def get_prescription(prescription_id: int):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT p.*,
                doc.full_name as doctor_name, doc.specialty as doctor_specialty,
                doc.phone as doctor_phone, doc.address as doctor_address,
                pat.full_name as patient_name, pat.birth_date as patient_birth_date,
                pat.phone as patient_phone, pat.address as patient_address
            FROM prescriptions p
            JOIN users doc ON p.doctor_id=doc.id
            LEFT JOIN patient_profiles pat ON p.patient_id=pat.user_id
            WHERE p.id=?
        """, (prescription_id,))
        pres = cursor.fetchone()
        if not pres:
            raise HTTPException(status_code=404, detail="Ordonnance non trouvee")
        data = dict(pres)
        if data.get('medications'):
            try:    data['medications'] = json.loads(data['medications'])
            except: data['medications'] = []
        return data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.put("/prescriptions/{prescription_id}/status")
def update_prescription_status(prescription_id: int, update: PrescriptionUpdate):
    conn = get_db()
    cursor = conn.cursor()
    try:
        updates = []
        params  = []
        if update.is_active is not None:
            updates.append("is_active=?")
            params.append(1 if update.is_active else 0)
        if update.status is not None:
            updates.append("status=?")
            params.append(update.status)
        if not updates:
            raise HTTPException(status_code=400, detail="Aucune mise a jour specifiee")
        updates.append("updated_at=datetime('now','localtime')")
        params.append(prescription_id)
        cursor.execute(f"UPDATE prescriptions SET {', '.join(updates)} WHERE id=?", params)
        conn.commit()
        return {"success": True, "message": "Statut de l'ordonnance mis a jour"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.post("/prescriptions/{prescription_id}/pdf-generated")
def mark_pdf_generated(prescription_id: int):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            UPDATE prescriptions
            SET pdf_generated=1, pdf_generated_at=datetime('now','localtime')
            WHERE id=?
        """, (prescription_id,))
        conn.commit()
        return {"success": True}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ======== ANALYSE SYMPTOMES ========

@app.post("/analyze")
async def analyze_symptoms(request: SymptomAnalysisRequest):
    try:
        s        = request.symptomes.lower()
        maladies = []

        if "fièvre" in s and "toux" in s:
            maladies.append({"maladie": "Infection respiratoire aiguë", "probabilite": 0.75,
                             "specialite": "Pneumologie", "urgence": False})
        if "douleur" in s and "poitrine" in s:
            maladies.append({"maladie": "Douleur thoracique - A investiguer", "probabilite": 0.85,
                             "specialite": "Cardiologie", "urgence": True})
        if "migraine" in s or "mal de tête" in s:
            maladies.append({"maladie": "Cephalee tensionnelle", "probabilite": 0.65,
                             "specialite": "Neurologie", "urgence": False})
        if "nausée" in s or "vomissement" in s:
            maladies.append({"maladie": "Gastro-enterite possible", "probabilite": 0.7,
                             "specialite": "Gastro-enterologie", "urgence": False})
        if not maladies:
            maladies.append({"maladie": "Symptomes non specifiques", "probabilite": 0.5,
                             "specialite": "Medecine generale", "urgence": False})

        diag = max(maladies, key=lambda x: x["probabilite"])
        recs = [
            "Consultez un medecin pour un diagnostic precis",
            "Reposez-vous et hydratez-vous",
            "Surveillez l'evolution des symptomes",
            "Evitez l'automédication"
        ]
        if diag["urgence"]:
            recs.insert(0, "CONSULTATION URGENTE RECOMMANDEE")

        urgence_abs = any(m in s for m in [
            "poitrine", "etouffe", "inconscience", "convulsion",
            "saignement abondant", "brulure grave", "traumatisme cranien"
        ])
        if urgence_abs:
            recs.insert(0, "APPELEZ LE 15 IMMEDIATEMENT")

        return {
            "success":          True,
            "maladie":          diag["maladie"],
            "probabilite":      diag["probabilite"],
            "specialite":       diag["specialite"],
            "recommandations":  recs,
            "urgence":          diag["urgence"] or urgence_abs,
            "urgence_absolue":  urgence_abs,
            "conversation_id":  request.conversation_id,
            "timestamp":        datetime.now().isoformat()
        }
    except Exception as e:
        return {
            "success": False, "maladie": "Erreur d'analyse", "probabilite": 0.5,
            "specialite": "Medecine generale", "recommandations": ["Veuillez reessayer"],
            "urgence": False, "urgence_absolue": False,
            "conversation_id": request.conversation_id,
            "timestamp": datetime.now().isoformat()
        }


# ======== SANTE & ROOT ========

@app.get("/health")
def health_check():
    return {"status": "healthy", "timestamp": datetime.now().isoformat(), "database": "connected"}
@app.get("/")
def root():
    return {
        "message": "ParrotDiag API v1.0.0",
        "endpoints_nouveaux": [
            "GET /doctors/{id}/calendar/{month}/{year}  — calendrier disponibilites",
            "GET /doctors/{id}/available-slots/{date}   — creneaux libres"
        ]
    }
# ======== DEMARRAGE ========

if __name__ == "__main__":
    import uvicorn
    print("\n" + "=" * 60)
    print("ParrotDiag API")
    print("=" * 60)
    print("API  : http://127.0.0.1:8000")
    print("Docs : http://127.0.0.1:8000/docs")
    print("\nComptes de test:")
    print("  patient@test.com / password123")
    print("  sophie.martin@test.com / password123")
    print("  sofia.errachedy@test.com / password123")
    print("  ilina@test.com / password123")
    print("=" * 60 + "\n")
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)