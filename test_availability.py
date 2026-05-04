#!/usr/bin/env python3
"""Script de test pour l'endpoint /doctors/availability/set"""

import requests
import json
from datetime import datetime, timedelta

API_URL = "http://127.0.0.1:8000"

# Test 1: Login et récupération du token
print("🧪 TEST 1: Connexion du médecin")
print("-" * 50)

login_data = {
    "email": "sophie.martin@test.com",
    "password": "password123"
}

login_response = requests.post(f"{API_URL}/login", json=login_data)
print(f"Status: {login_response.status_code}")

if login_response.status_code == 200:
    login_json = login_response.json()
    token = login_json['token']
    doctor_id = login_json['user']['id']
    print(f"✅ Connexion réussie!")
    print(f"   Token: {token[:20]}...")
    print(f"   Doctor ID: {doctor_id}")
    print()
    
    # Test 2: Enregistrement d'une disponibilité
    print("🧪 TEST 2: Enregistrement d'une disponibilité")
    print("-" * 50)
    
    tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
    
    availability_data = {
        "doctor_id": doctor_id,
        "date": tomorrow,
        "max_patients": 10,
        "is_open": True,
        "notes": "Test d'enregistrement"
    }
    
    print(f"Données envoyées: {json.dumps(availability_data, indent=2)}")
    print()
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    response = requests.post(
        f"{API_URL}/doctors/availability/set",
        json=availability_data,
        headers=headers
    )
    
    print(f"Status: {response.status_code}")
    print(f"Response: {response.text}")
    print()
    
    if response.status_code == 200:
        print("✅ Disponibilité enregistrée avec succès!")
        
        # Test 3: Charger les disponibilités
        print()
        print("🧪 TEST 3: Chargement des disponibilités")
        print("-" * 50)
        
        now = datetime.now()
        year = now.year
        month = now.month
        
        get_response = requests.get(
            f"{API_URL}/doctors/{doctor_id}/availability?year={year}&month={month}",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        print(f"Status: {get_response.status_code}")
        
        if get_response.status_code == 200:
            get_json = get_response.json()
            availabilities = get_json.get('availabilities', [])
            print(f"✅ {len(availabilities)} disponibilités trouvées")
            
            # Chercher la disponibilité qu'on vient d'ajouter
            found = False
            for avail in availabilities:
                if avail['date'] == tomorrow:
                    found = True
                    print(f"\n✅ Disponibilité du {tomorrow} trouvée!")
                    print(f"   - is_open: {avail['is_open']}")
                    print(f"   - max_patients: {avail['max_patients']}")
                    print(f"   - notes: {avail['notes']}")
                    break
            
            if not found:
                print(f"\n❌ La disponibilité du {tomorrow} n'a pas été trouvée!")
        else:
            print(f"❌ Erreur lors du chargement: {get_response.text}")
    else:
        print(f"❌ Erreur lors de l'enregistrement: {response.text}")
else:
    print(f"❌ Erreur de connexion: {login_response.text}")

print("\n" + "=" * 50)
print("Tests terminés!")
