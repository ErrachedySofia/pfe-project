import sqlite3

conn = sqlite3.connect('patients.db')
cursor = conn.cursor()

# Vérifier la table doctor_availabilities
cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='doctor_availabilities'")
result = cursor.fetchone()

if result:
    print("✅ Table doctor_availabilities existe!")
    print("Structure SQL:")
    print(result[0])
else:
    print("❌ Table doctor_availabilities NOT FOUND")

# Afficher tous les noms de colonnes
cursor.execute("PRAGMA table_info(doctor_availabilities)")
columns = cursor.fetchall()
print("\nColonnes:")
for col in columns:
    print(f"  - {col[1]}: {col[2]}")

conn.close()
