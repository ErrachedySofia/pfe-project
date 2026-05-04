import sqlite3
import os
import json
import secrets
from datetime import datetime, timedelta

def reset_database():
    """Réinitialise complètement la base de données"""
    
    db_path = 'patients.db'
    
    # Supprimer l'ancienne base si elle existe
    if os.path.exists(db_path):
        os.remove(db_path)
        print(f"🗑️  Ancienne base de données supprimée")
    
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    print("📝 Création des tables...")
    
    # ===== TABLE USERS =====
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            full_name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL,
            sex TEXT,
            phone TEXT,
            address TEXT,
            specialty TEXT,
            profile_photo TEXT,
            created_at TEXT DEFAULT (datetime('now','localtime')),
            updated_at TEXT DEFAULT (datetime('now','localtime'))
        )
    """)
    
    # ===== TABLE DOCTOR_PROFILES =====
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS doctor_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER UNIQUE,
            full_name TEXT,
            age INTEGER,
            specialty TEXT,
            location TEXT,
            diplomas TEXT,
            consultation_price REAL DEFAULT 0,
            experience TEXT,
            bio TEXT,
            profile_photo TEXT,
            phone TEXT,
            address TEXT,
            rating REAL DEFAULT 4.5,
            patient_count INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now','localtime')),
            updated_at TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    """)
    
    # ===== TABLE PATIENT_PROFILES =====
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS patient_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER UNIQUE,
            full_name TEXT,
            birth_date TEXT,
            age INTEGER,
            sex TEXT,
            marital_status TEXT,
            phone TEXT,
            address TEXT,
            city TEXT,
            zip_code TEXT,
            blood_type TEXT,
            allergies TEXT,
            current_medications TEXT,
            medical_history TEXT,
            emergency_contact TEXT,
            profile_photo TEXT,
            created_at TEXT DEFAULT (datetime('now','localtime')),
            updated_at TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    """)
    
    # ===== TABLE APPOINTMENTS =====
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS appointments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id INTEGER NOT NULL,
            doctor_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            time TEXT NOT NULL,
            reason TEXT,
            type TEXT,
            status TEXT DEFAULT 'pending',
            created_at TEXT DEFAULT (datetime('now','localtime')),
            updated_at TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (patient_id) REFERENCES users (id),
            FOREIGN KEY (doctor_id) REFERENCES users (id)
        )
    """)
    
    # ===== TABLE NOTIFICATIONS =====
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            type TEXT,
            is_read INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    """)
    
    # ===== TABLE MESSAGES =====
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender_id INTEGER NOT NULL,
            receiver_id INTEGER NOT NULL,
            content TEXT NOT NULL,
            is_read INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (sender_id) REFERENCES users (id),
            FOREIGN KEY (receiver_id) REFERENCES users (id)
        )
    """)
    
    # ===== TABLE REVIEWS =====
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            doctor_id INTEGER NOT NULL,
            patient_id INTEGER NOT NULL,
            rating REAL NOT NULL,
            comment TEXT,
            created_at TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (doctor_id) REFERENCES users (id),
            FOREIGN KEY (patient_id) REFERENCES users (id)
        )
    """)
    
    # ===== TABLE MEDICAL_RECORDS =====
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS medical_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id INTEGER NOT NULL,
            doctor_id INTEGER NOT NULL,
            appointment_id INTEGER,
            date TEXT NOT NULL,
            blood_pressure TEXT,
            heart_rate INTEGER,
            temperature REAL,
            oxygen_saturation INTEGER,
            weight REAL,
            height INTEGER,
            reason TEXT,
            history TEXT,
            examination TEXT,
            diagnosis TEXT,
            secondary_diagnosis TEXT,
            medications TEXT,
            instructions TEXT,
            exams TEXT,
            notes TEXT,
            created_at TEXT DEFAULT (datetime('now','localtime')),
            updated_at TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (patient_id) REFERENCES users (id),
            FOREIGN KEY (doctor_id) REFERENCES users (id),
            FOREIGN KEY (appointment_id) REFERENCES appointments (id)
        )
    """)
    
    # ===== TABLE PRESCRIPTIONS =====
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS prescriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            prescription_number TEXT UNIQUE NOT NULL,
            patient_id INTEGER NOT NULL,
            doctor_id INTEGER NOT NULL,
            appointment_id INTEGER,
            date TEXT NOT NULL,
            expiry_date TEXT NOT NULL,
            diagnosis TEXT NOT NULL,
            medications TEXT NOT NULL,
            instructions TEXT,
            notes TEXT,
            is_active INTEGER DEFAULT 1,
            status TEXT DEFAULT 'active',
            pdf_generated INTEGER DEFAULT 0,
            pdf_generated_at TEXT,
            created_at TEXT DEFAULT (datetime('now','localtime')),
            updated_at TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (patient_id) REFERENCES users (id),
            FOREIGN KEY (doctor_id) REFERENCES users (id),
            FOREIGN KEY (appointment_id) REFERENCES appointments (id)
        )
    """)
    
    # ===== TABLE TOKENS =====
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token TEXT UNIQUE NOT NULL,
            created_at TEXT DEFAULT (datetime('now','localtime')),
            expires_at TEXT DEFAULT (datetime('now', '+7 days')),
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    """)
    
    # ===== TABLE DOCTOR_WORKING_HOURS =====
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS doctor_working_hours (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            doctor_id INTEGER NOT NULL,
            day_of_week INTEGER NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            slot_duration INTEGER DEFAULT 30,
            is_working_day INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (doctor_id) REFERENCES users (id) ON DELETE CASCADE,
            UNIQUE(doctor_id, day_of_week)
        )
    """)
    
    # ===== TABLE DOCTOR_AVAILABILITIES =====
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS doctor_availabilities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            doctor_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            is_open INTEGER DEFAULT 1,
            max_patients INTEGER DEFAULT 5,
            notes TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (doctor_id) REFERENCES users (id) ON DELETE CASCADE,
            UNIQUE(doctor_id, date)
        )
    """)
    
    # ===== TABLE AI_CONSULTATIONS =====
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS ai_consultations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id INTEGER NOT NULL,
            symptomes TEXT NOT NULL,
            maladie_diagnostiquee TEXT NOT NULL,
            confidence REAL,
            incertitude REAL,
            specialite_recommandee TEXT,
            recommandations TEXT,
            urgence_niveau INTEGER DEFAULT 1,
            conversation_id TEXT,
            feedback_patient TEXT,
            has_booked_appointment INTEGER DEFAULT 0,
            appointment_id INTEGER,
            created_at TEXT DEFAULT (datetime('now','localtime')),
            updated_at TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (patient_id) REFERENCES users (id) ON DELETE CASCADE,
            FOREIGN KEY (appointment_id) REFERENCES appointments (id) ON DELETE SET NULL
        )
    """)
    
    print("✅ Tables créées avec succès !")
    
    # ===== INSERTION DES UTILISATEURS DE TEST =====
    print("👤 Création des utilisateurs de test...")
    
    # 1. Patient test
    cursor.execute("""
        INSERT INTO users (full_name, email, password, role, sex, phone, address)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, ('Jean Dupont', 'patient@test.com', 'password123', 'patient', 'male', '0612345678', 'Paris'))
    
    patient_id = cursor.lastrowid
    
    # 2. Médecin - Dr. Sophie Martin
    cursor.execute("""
        INSERT INTO users (full_name, email, password, role, sex, specialty, phone, address)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, ('Dr. Sophie Martin', 'sophie.martin@test.com', 'password123', 'doctor', 'female', 'Cardiologue', '0623456789', 'Lyon'))
    
    doctor_id1 = cursor.lastrowid
    
    cursor.execute("""
        INSERT INTO doctor_profiles 
        (user_id, full_name, age, specialty, location, diplomas, consultation_price, experience, bio, phone, address, rating, patient_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        doctor_id1,
        'Dr. Sophie Martin',
        45,
        'Cardiologue',
        'Lyon',
        'Doctorat en Médecine - Université Lyon 1\nDiplôme de Cardiologie - Paris',
        80.00,
        '15 ans d\'expérience',
        'Spécialiste des maladies cardiovasculaires',
        '0623456789',
        '15 Rue de la République, Lyon',
        4.8,
        127
    ))
    
    # 3. Médecin - Dr. Sofía Errachedy
    cursor.execute("""
        INSERT INTO users (full_name, email, password, role, sex, specialty, phone, address)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, ('Dr. Sofía Errachedy', 'sofia.errachedy@test.com', 'password123', 'doctor', 'female', 'Généraliste', '0612345678', 'Casablanca'))
    
    doctor_id2 = cursor.lastrowid
    
    cursor.execute("""
        INSERT INTO doctor_profiles 
        (user_id, full_name, age, specialty, location, diplomas, consultation_price, experience, bio, phone, address, rating, patient_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        doctor_id2,
        'Dr. Sofía Errachedy',
        35,
        'Généraliste',
        'Casablanca',
        'Doctorat en Médecine - Université Hassan II\nDiplôme de Médecine Générale',
        60.00,
        '8 ans d\'expérience',
        'Médecin généraliste passionnée par la prévention',
        '0612345678',
        '45 Boulevard Mohammed V, Casablanca',
        4.9,
        89
    ))
    
    # 4. Médecin - Dr. ilina
    cursor.execute("""
        INSERT INTO users (full_name, email, password, role, sex, specialty, phone, address)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, ('Dr. ilina', 'ilina@test.com', 'password123', 'doctor', 'female', 'Neurologue', '0612345678', 'Rabat'))
    
    doctor_id3 = cursor.lastrowid
    
    cursor.execute("""
        INSERT INTO doctor_profiles 
        (user_id, full_name, age, specialty, location, diplomas, consultation_price, experience, bio, phone, address, rating, patient_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        doctor_id3,
        'Dr. ilina',
        35,
        'Neurologue',
        'Rabat',
        'Doctorat en Médecine - Université Mohammed V\nDiplôme de Neurologie - Paris',
        120.00,
        '10 ans d\'expérience',
        'Neurologue spécialisée dans les troubles du sommeil',
        '0612345678',
        '12 Avenue Hassan II, Rabat',
        4.9,
        56
    ))
    
    print(f"✅ {4} utilisateurs créés (1 patient, 3 médecins)")
    
    # ===== INSERTION DES HORAIRES DE TRAVAIL =====
    print("⏰ Création des horaires de travail...")
    
    # Créer des horaires pour chaque médecin (lundi à vendredi)
    for doctor_id in [doctor_id1, doctor_id2, doctor_id3]:
        # Lundi à Vendredi (0-4)
        for day_of_week in range(5):
            cursor.execute("""
                INSERT INTO doctor_working_hours (doctor_id, day_of_week, start_time, end_time, slot_duration, is_working_day)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (doctor_id, day_of_week, '09:00', '18:00', 30, 1))
    
    print("✅ Horaires de travail créés")
    
    # ===== CRÉATION DES PROFILS PATIENTS =====
    cursor.execute("""
        INSERT INTO patient_profiles 
        (user_id, full_name, birth_date, age, sex, marital_status, phone, address, city, blood_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        patient_id,
        'Jean Dupont',
        '1985-06-15',
        38,
        'male',
        'Marié(e)',
        '0612345678',
        '15 Rue de Paris',
        'Paris',
        'A+'
    ))
    
    print("✅ Profil patient créé")
    
    # ===== CRÉATION DES RENDEZ-VOUS DE TEST =====
    now = datetime.now()
    today = now.strftime('%Y-%m-%d')
    tomorrow = (now + timedelta(days=1)).strftime('%Y-%m-%d')
    next_week = (now + timedelta(days=7)).strftime('%Y-%m-%d')
    
    # Rendez-vous aujourd'hui (confirmé)
    cursor.execute("""
        INSERT INTO appointments (patient_id, doctor_id, date, time, reason, type, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (patient_id, doctor_id1, today, '10:00', 'Consultation de routine', 'consultation', 'confirmed'))
    
    # Rendez-vous aujourd'hui (en attente)
    cursor.execute("""
        INSERT INTO appointments (patient_id, doctor_id, date, time, reason, type, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (patient_id, doctor_id2, today, '14:30', 'Suivi médical', 'followup', 'pending'))
    
    # Rendez-vous demain (confirmé)
    cursor.execute("""
        INSERT INTO appointments (patient_id, doctor_id, date, time, reason, type, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (patient_id, doctor_id3, tomorrow, '09:00', 'Nouvelle consultation', 'consultation', 'confirmed'))
    
    # Rendez-vous la semaine prochaine (en attente)
    cursor.execute("""
        INSERT INTO appointments (patient_id, doctor_id, date, time, reason, type, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (patient_id, doctor_id1, next_week, '11:30', 'Consultation de contrôle', 'followup', 'pending'))
    
    # Rendez-vous passé (terminé)
    cursor.execute("""
        INSERT INTO appointments (patient_id, doctor_id, date, time, reason, type, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (patient_id, doctor_id2, '2026-02-15', '15:00', 'Douleur thoracique', 'consultation', 'completed'))
    
    print(f"✅ {5} rendez-vous créés")
    
    # ===== CRÉATION DES DISPONIBILITÉS DE TEST =====
    print("📅 Création des disponibilités de test...")
    
    # Créer quelques disponibilités pour les médecins
    for doctor_id in [doctor_id1, doctor_id2, doctor_id3]:
        # Journée normale (ouverte)
        cursor.execute("""
            INSERT INTO doctor_availabilities (doctor_id, date, is_open, max_patients, notes)
            VALUES (?, ?, ?, ?, ?)
        """, (doctor_id, today, 1, 5, 'Journée normale'))
        
        # Journée chargée (bientôt complète)
        cursor.execute("""
            INSERT INTO doctor_availabilities (doctor_id, date, is_open, max_patients, notes)
            VALUES (?, ?, ?, ?, ?)
        """, (doctor_id, tomorrow, 1, 3, 'Disponibilités limitées'))
        
        # Journée fermée
        next_month = (now.replace(day=1) + timedelta(days=32)).replace(day=15)
        closed_day = next_month.strftime('%Y-%m-%d')
        cursor.execute("""
            INSERT INTO doctor_availabilities (doctor_id, date, is_open, max_patients, notes)
            VALUES (?, ?, ?, ?, ?)
        """, (doctor_id, closed_day, 0, 0, 'Congés'))
    
    print("✅ Disponibilités créées")
    
    # ===== CRÉATION DES NOTIFICATIONS DE TEST =====
    for doc_id in [doctor_id1, doctor_id2, doctor_id3]:
        cursor.execute("""
            INSERT INTO notifications (user_id, title, message, type, is_read)
            VALUES (?, ?, ?, ?, ?)
        """, (
            doc_id,
            "📅 Nouvelle demande de rendez-vous",
            f"Jean Dupont a demandé un rendez-vous pour le {next_week}",
            "appointment_request",
            0
        ))
    
    cursor.execute("""
        INSERT INTO notifications (user_id, title, message, type, is_read)
        VALUES (?, ?, ?, ?, ?)
    """, (
        patient_id,
        "✅ Rendez-vous confirmé",
        "Votre rendez-vous avec Dr. Sophie Martin est confirmé pour aujourd'hui à 10:00",
        "appointment_confirmed",
        0
    ))
    
    print("✅ Notifications créées")
    
    conn.commit()
    
    # Vérification
    cursor.execute("SELECT COUNT(*) FROM users")
    users_count = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM doctor_profiles")
    doctors_count = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM appointments")
    appointments_count = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM doctor_availabilities")
    availabilities_count = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM doctor_working_hours")
    working_hours_count = cursor.fetchone()[0]
    
    conn.close()
    
    print("\n" + "="*50)
    print("✅ BASE DE DONNÉES RÉINITIALISÉE AVEC SUCCÈS !")
    print("="*50)
    print(f"📊 Statistiques :")
    print(f"   - {users_count} utilisateurs")
    print(f"   - {doctors_count} profils médecins")
    print(f"   - {appointments_count} rendez-vous")
    print(f"   - {availabilities_count} disponibilités")
    print(f"   - {working_hours_count} horaires de travail")
    print("\n📝 Identifiants de test :")
    print(f"   Patient : patient@test.com / password123")
    print(f"   Dr. Sophie Martin (Cardiologue) : sophie.martin@test.com / password123")
    print(f"   Dr. Sofía Errachedy (Généraliste) : sofia.errachedy@test.com / password123")
    print(f"   Dr. ilina (Neurologue) : ilina@test.com / password123")
    print("="*50)

if __name__ == "__main__":
    reset_database()