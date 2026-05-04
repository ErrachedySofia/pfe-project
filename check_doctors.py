import sqlite3

conn = sqlite3.connect('patients.db')
cursor = conn.cursor()

# Voir tous les utilisateurs
print("=" * 60)
print("TOUS LES UTILISATEURS DANS LA BASE")
print("=" * 60)

cursor.execute("SELECT id, full_name, role FROM users ORDER BY id")
users = cursor.fetchall()

for user_id, full_name, role in users:
    print(f"ID: {user_id:2} | {full_name:30} | Role: {role}")

print("\n" + "=" * 60)
print("MEDECINS DISPONIBLES")
print("=" * 60)

cursor.execute("SELECT u.id, u.full_name, dp.specialty FROM users u LEFT JOIN doctor_profiles dp ON u.id = dp.user_id WHERE u.role='doctor'")
doctors = cursor.fetchall()

for doc_id, full_name, specialty in doctors:
    print(f"ID: {doc_id:2} | {full_name:30} | Spécialité: {specialty}")

conn.close()
