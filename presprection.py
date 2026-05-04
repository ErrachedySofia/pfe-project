import requests
import json

# Test de création d'ordonnance
url = "http://127.0.0.1:8000/prescriptions"
data = {
    "patient_id": 1,  # Jean Dupont
    "doctor_id": 2,    # Dr. Sophie Martin
    "date": "2024-01-15",
    "expiry_date": "2025-01-15",
    "diagnosis": "Test diagnostic",
    "medications": [
        {
            "name": "Paracétamol",
            "dosage": "500mg",
            "frequency": "3x/jour",
            "duration": "5 jours"
        }
    ],
    "instructions": "Prendre après les repas",
    "is_active": True
}

response = requests.post(url, json=data)
print(response.json())