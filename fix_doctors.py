import sqlite3

conn = sqlite3.connect('patients.db')
c = conn.cursor()

print("=" * 80)
print("RÉPARATION: INSERTION DES MÉDECINS MANQUANTS")
print("=" * 80)

# Les IDs des docteurs qui existent dans users
doctors_to_add = [
    (2, 'Cardiologie', 'Casablanca', '12 ans', 350, 4.8, 245, 'Cardiologue'),
    (3, 'Médecine générale', 'Rabat', '8 ans', 200, 4.6, 180, 'Généraliste'),
    (4, 'Neurologie', 'Marrakech', '15 ans', 300, 4.9, 320, 'Neurologue'),
    (5, 'Médecine générale', 'Casablanca', '10 ans', 280, 4.5, 195, 'Généraliste'),
]

try:
    for user_id, specialty, location, experience, price, rating, patients, bio in doctors_to_add:
        c.execute("""
            INSERT INTO doctors 
            (user_id, specialty, location, experience, consultation_price, 
             available, approved, rating, patient_count, bio)
            VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?, ?)
        """, (user_id, specialty, location, experience, price, rating, patients, bio))
        print(f"✓ Inséré: Doctor_{user_id} ({specialty})")
    
    conn.commit()
    print(f"\n✅ {len(doctors_to_add)} médecins insérés avec succès!")
    
    # Vérifier
    c.execute("SELECT COUNT(*) FROM doctors")
    print(f"Total médecins en base: {c.fetchone()[0]}")
    
except Exception as e:
    print(f"❌ ERREUR: {e}")
    import traceback
    traceback.print_exc()
finally:
    conn.close()

print("=" * 80)
