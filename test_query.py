import sqlite3

conn = sqlite3.connect('patients.db')
conn.row_factory = sqlite3.Row
c = conn.cursor()

print("=" * 80)
print("DIAGNOSTIC PROBLÈME MÉDECINS")
print("=" * 80)

# Tester les données
print("\n--- USERS ---")
c.execute("SELECT id, full_name, role FROM users ORDER BY id")
for row in c.fetchall():
    print(f"User ID {row['id']:2} | {row['full_name']:30} | Role: '{row['role']}'")

print("\n--- DOCTORS (Table) ---")
c.execute("SELECT user_id, specialty, approved FROM doctors ORDER BY user_id")
doctors = c.fetchall()
print(f"Total rows in doctors table: {len(doctors)}")
for row in doctors:
    print(f"Doctor user_id {row['user_id']:2} | Specialty: {row['specialty']:30} | Approved: {row['approved']}")

print("\n--- TEST JOIN DIRECT ---")
c.execute("""
    SELECT u.id, u.full_name, d.user_id, d.specialty
    FROM users u 
    LEFT JOIN doctors d ON u.id = d.user_id
    WHERE u.role = 'doctor'
""")
join_result = c.fetchall()
print(f"LEFT JOIN results: {len(join_result)}")
for row in join_result:
    print(f"  User {row['id']} ({row['full_name']}) | Doctor user_id: {row['user_id']} | Specialty: {row['specialty']}")

conn.close()
