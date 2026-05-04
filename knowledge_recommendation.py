"""
ParrotDiag — knowledge_recommendation.py
=========================================
SOURCE UNIQUE DE VÉRITÉ pour toutes les données médicales.
Contient :
  - UNIFIED_KNOWLEDGE  : base complète (symptômes, spécialité, urgence, recommandations, phrases ML)
  - SYNERGY_RULES      : bonus si combinaisons de symptômes présentes ensemble
  - EXCLUSION_RULES    : pénalités si symptômes incompatibles
  - KNOWLEDGE_BASE     : alias dérivé automatiquement (symptôme → poids) pour le moteur KB
  - HybridMedicalDiagnosis : système hybride ML (TF-IDF+SVM) + règles pondérées
  - ModelConfig, DataGenerator
  - knowledge_based_recommendation() : fonction principale exportée vers main_ia.py
  - extract_symptoms(), DifferentialDiagnosisAnalyzer
"""

import re
import logging
import random
import pickle
import warnings
import sqlite3
from typing import List, Dict, Optional, Any, Tuple
from dataclasses import dataclass, field
from collections import defaultdict

import numpy as np
warnings.filterwarnings("ignore")

from sklearn.feature_extraction.text import TfidfVectorizer, CountVectorizer
from sklearn.svm import SVC
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import accuracy_score
from sklearn.preprocessing import LabelEncoder

logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════
# BASE DE CONNAISSANCES UNIFIÉE — SOURCE UNIQUE DE VÉRITÉ
# ══════════════════════════════════════════════════════════════

UNIFIED_KNOWLEDGE: Dict[str, Dict] = {

    "Grippe": {
        "symptomes": {
            "fièvre": 0.7, "toux": 0.6, "courbatures": 0.8, "frissons": 0.7,
            "fatigue": 0.5, "céphalées": 0.4, "rhinorrhée": 0.5, "myalgies": 0.8,
            "asthénie": 0.5, "mal de gorge": 0.4, "température élevée": 0.7,
            "nez qui coule": 0.5, "douleurs musculaires": 0.8, "épuisement": 0.5,
        },
        "specialite": "Médecine générale",
        "urgence_base": 1,
        "recommandations": [
            "Repos complet à domicile pendant 5-7 jours",
            "Hydratation abondante (eau, bouillons, tisanes)",
            "Paracétamol pour fièvre > 38.5°C (pas d'aspirine)",
            "Port de masque pour éviter la contagion",
            "Consulter si fièvre > 40°C ou persistante > 3 jours",
        ],
        "phrases_entrainement": [
            "fièvre élevée 39°C toux sèche courbatures intenses fatigue frissons céphalées",
            "syndrome grippal température 38.5°C myalgies céphalées asthénie rhinorrhée",
            "grippe avec complications respiratoires toux productive dyspnée expectorations",
            "état fébrile frissons violents courbatures généralisées anorexie malaise",
            "hyperthermie 40°C frissons toux non productive douleurs musculaires diffuses",
            "fièvre persistante 5 jours toux grasse expectorations claires fatigue",
            "courbatures intenses impossibilité se lever fièvre frissons malaise général",
            "j'ai de la fièvre et je tousse beaucoup je me sens faible",
            "température élevée frissons courbatures épuisement",
            "état grippal fatigue intense toux sèche nez qui coule",
        ],
    },

    "Rhume": {
        "symptomes": {
            "rhinorrhée": 0.8, "éternuements": 0.7, "nez qui coule": 0.8,
            "congestion nasale": 0.6, "mal de gorge": 0.5, "toux": 0.4,
            "fatigue légère": 0.3, "légère fièvre": 0.2,
        },
        "specialite": "Médecine générale",
        "urgence_base": 0,
        "recommandations": [
            "Repos et hydratation suffisante",
            "Sérum physiologique pour rincer le nez",
            "Paracétamol si douleurs ou fièvre légère",
            "Éviter la contagion : lavage des mains fréquent",
            "Consulter si symptômes > 10 jours ou aggravation",
        ],
        "phrases_entrainement": [
            "nez qui coule éternuements congestion nasale légère toux",
            "rhume commun rhinorrhée mal de gorge légère fatigue",
            "j'ai le nez qui coule et j'éternue beaucoup",
            "congestion nasale et mal de gorge",
            "éternuements fréquents et rhinorrhée",
        ],
    },

    "Angine": {
        "symptomes": {
            "mal de gorge": 0.9, "douleur en avalant": 0.8, "fièvre": 0.6,
            "ganglions": 0.7, "amygdales rouges": 0.8, "pus": 0.9,
            "odynophagie": 0.8, "dysphagie": 0.5,
        },
        "specialite": "ORL",
        "urgence_base": 1,
        "recommandations": [
            "Consultation médicale pour test rapide (TDR)",
            "Antibiotiques si angine bactérienne confirmée",
            "Antalgiques et antipyrétiques",
            "Hydratation et alimentation molle",
            "Repos vocal recommandé",
        ],
        "phrases_entrainement": [
            "mal de gorge intense douleur en avalant fièvre ganglions",
            "angine tonsillaire amygdales rouges pus odynophagie",
            "j'ai très mal à la gorge quand j'avale",
            "gorge rouge avec des points blancs et fièvre",
            "ganglions gonflés et mal de gorge intense",
        ],
    },

    "Bronchite": {
        "symptomes": {
            "toux": 0.9, "expectorations": 0.7, "fièvre": 0.5,
            "dyspnée": 0.4, "sifflements": 0.5, "fatigue": 0.4,
            "douleur thoracique": 0.3,
        },
        "specialite": "Pneumologie",
        "urgence_base": 1,
        "recommandations": [
            "Repos et hydratation abondante",
            "Antitussifs si toux sèche invalidante",
            "Antibiotiques uniquement si infection bactérienne",
            "Consulter si dyspnée, fièvre > 39°C ou crachat sanglant",
            "Arrêt tabac fortement recommandé",
        ],
        "phrases_entrainement": [
            "toux grasse expectorations bronchite fièvre modérée",
            "toux persistante dyspnée sifflements bronchique",
            "je tousse beaucoup avec des expectorations",
            "toux depuis 2 semaines avec des sifflements",
            "toux grasse et fatigue",
        ],
    },

    "Gastro-entérite": {
        "symptomes": {
            "diarrhée": 0.9, "vomissements": 0.8, "nausées": 0.7,
            "douleur abdominale": 0.6, "fièvre": 0.4, "déshydratation": 0.5,
            "crampes": 0.5,
        },
        "specialite": "Gastro-entérologie",
        "urgence_base": 1,
        "recommandations": [
            "Hydratation orale intensive (solutés de réhydratation)",
            "Régime BRAT (banane, riz, compote, toast)",
            "Éviter produits laitiers et aliments gras",
            "Lopéramide si diarrhée sans fièvre > 38.5°C",
            "Urgence si signes de déshydratation sévère",
        ],
        "phrases_entrainement": [
            "diarrhée vomissements nausées douleur abdominale gastro",
            "gastro-entérite virale crampes déshydratation fièvre",
            "j'ai la diarrhée et des vomissements",
            "nausées et douleurs abdominales avec diarrhée",
            "vomissements répétés et crampes abdominales",
        ],
    },

    "Migraine": {
        "symptomes": {
            "céphalée": 0.9, "douleur pulsatile": 0.8, "nausées": 0.6,
            "photophobie": 0.7, "phonophobie": 0.6, "aura": 0.5,
            "douleur unilatérale": 0.7,
        },
        "specialite": "Neurologie",
        "urgence_base": 1,
        "recommandations": [
            "Repos dans une pièce sombre et silencieuse",
            "Triptans si prescrits (à prendre tôt dans la crise)",
            "AINS (ibuprofène) en première intention",
            "Éviter déclencheurs identifiés (stress, alcool, manque sommeil)",
            "Consulter neurologue pour traitement de fond si crises fréquentes",
        ],
        "phrases_entrainement": [
            "céphalée pulsatile photophobie phonophobie nausées aura visuelle",
            "migraine ophtalmique troubles visuels vertiges scotomes scintillants",
            "hémicrânie vomissements intolérance lumière bruit alitement",
            "mal de tête violent côté droit nausées sensibilité lumière",
            "crise migraineuse avec aura visuelle éclairs zigzags",
            "douleur crânienne unilatérale intolérance au bruit",
        ],
    },

    "Allergie": {
        "symptomes": {
            "éternuements": 0.8, "rhinorrhée": 0.7, "yeux qui piquent": 0.7,
            "larmoiement": 0.6, "démangeaisons": 0.7, "urticaire": 0.8,
            "éruption cutanée": 0.6,
        },
        "specialite": "Allergologie",
        "urgence_base": 1,
        "recommandations": [
            "Identifier et éviter l'allergène responsable",
            "Antihistaminiques pour urticaire et rhinite",
            "Adrénaline auto-injectable si prescription (choc anaphylactique)",
            "Bilan allergologique pour identifier les allergènes",
            "Urgence si gonflement gorge ou difficultés respiratoires",
        ],
        "phrases_entrainement": [
            "choc anaphylactique urticaire généralisé dyspnée hypotension adrénaline",
            "rhinite allergique saisonnière pollens éternuements rhinorrhée",
            "asthme allergique chat acariens crise bronchospasme sifflements",
            "éruption cutanée démangeaisons gonflement allergie",
            "éternuements yeux rouges nez qui coule allergie",
        ],
    },

    "COVID-19": {
        "symptomes": {
            "fièvre": 0.6, "toux": 0.7, "fatigue": 0.6,
            "perte odorat": 0.8, "perte goût": 0.8,
            "dyspnée": 0.5, "céphalées": 0.4, "courbatures": 0.5,
        },
        "specialite": "Maladies infectieuses",
        "urgence_base": 2,
        "recommandations": [
            "Test antigénique ou PCR pour confirmation",
            "Isolement strict 7 jours minimum",
            "Surveillance de la saturation en oxygène",
            "Paracétamol pour fièvre et douleurs",
            "Urgence si saturation < 94% ou dyspnée intense",
        ],
        "phrases_entrainement": [
            "perte odorat perte goût fièvre toux COVID",
            "infection COVID-19 fatigue dyspnée courbatures",
            "toux sèche fatigue intense perte odorat",
            "fièvre toux et perte d'odorat",
            "difficultés respiratoires avec perte goût",
        ],
    },

    "Infarctus": {
        "symptomes": {
            "douleur thoracique": 0.9, "irradiation bras gauche": 0.8,
            "sueurs froides": 0.7, "oppression thoracique": 0.9,
            "nausées": 0.5, "dyspnée": 0.6, "angoisse": 0.5,
        },
        "specialite": "Cardiologie interventionnelle",
        "urgence_base": 3,
        "recommandations": [
            "URGENCE ABSOLUE — Appelez le 15 (SAMU) immédiatement",
            "Allonger le patient, ne pas lui faire d'effort",
            "Aspegic 500mg à mâcher si disponible",
            "Ne rien donner à manger ni à boire",
            "Pratiquer massage cardiaque si arrêt cardiaque",
        ],
        "phrases_entrainement": [
            "douleur thoracique constrictive irradiant bras gauche mâchoire sueurs",
            "infarctus du myocarde douleur rétrosternale intense oppression écrasante",
            "syndrome coronarien aigu sus-ST élévation troponine urgence",
            "douleur poitrine serrement bras gauche sueurs froides",
            "oppression thoracique irradiant mâchoire angoisse",
            "sensation d'écrasement thoracique essoufflement",
        ],
    },

    "Pneumonie": {
        "symptomes": {
            "fièvre": 0.7, "toux": 0.7, "expectorations": 0.6,
            "dyspnée": 0.7, "douleur thoracique": 0.5, "fatigue": 0.5,
            "crépitants": 0.8,
        },
        "specialite": "Pneumologie",
        "urgence_base": 2,
        "recommandations": [
            "Consultation médicale urgente pour antibiothérapie",
            "Repos et hydratation (2L d'eau par jour)",
            "Antipyrétiques si fièvre > 38.5°C",
            "Hospitalisation si saturation O2 < 94%",
            "Suivi radiologique à J15 pour contrôle",
        ],
        "phrases_entrainement": [
            "pneumonie lobaire aiguë fièvre 40°C point de côté expectorations",
            "pneumopathie communautaire condensation pulmonaire CRP élevée",
            "fièvre élevée difficultés respiratoires crachats jaunes pneumonie",
            "toux grasse fièvre point de côté essoufflement",
            "infection pulmonaire crépitants auscultation",
        ],
    },

    "Appendicite": {
        "symptomes": {
            "douleur fosse iliaque droite": 0.9, "fièvre": 0.6,
            "nausées": 0.6, "vomissements": 0.5, "défense abdominale": 0.8,
            "signe de Blumberg": 0.9, "anorexie": 0.5,
        },
        "specialite": "Chirurgie digestive",
        "urgence_base": 3,
        "recommandations": [
            "URGENCE CHIRURGICALE — Rendez-vous aux urgences",
            "Ne pas manger ni boire en attendant l'examen",
            "Ne pas prendre d'antalgiques puissants",
            "Bilan biologique et échographie en urgence",
            "Appendicectomie en urgence",
        ],
        "phrases_entrainement": [
            "appendicite aiguë douleur FID fièvre 38°C nausées vomissements",
            "douleur abdominale début périombilical puis migre FID défense",
            "douleur fosse iliaque droite signe de Blumberg positif",
            "douleur ventre droite bas nausées fièvre appendicite",
            "douleur aiguë bas ventre droit vomissements",
        ],
    },

    "AVC": {
        "symptomes": {
            "hémiplégie": 0.9, "aphasie": 0.8, "paralysie faciale": 0.8,
            "trouble vision": 0.7, "vertige brutal": 0.6,
            "dysarthrie": 0.7, "céphalée brutale": 0.6,
        },
        "specialite": "Neurologie vasculaire",
        "urgence_base": 3,
        "recommandations": [
            "URGENCE ABSOLUE — Appelez le 15 (SAMU) immédiatement",
            "Ne pas donner à manger ni à boire",
            "Allonger en position latérale de sécurité",
            "Thrombolyse possible si < 4h30",
            "IRM cérébrale en urgence",
        ],
        "phrases_entrainement": [
            "hémiplégie brutale déficit moteur hémicorporel droit urgence",
            "aphasie fluente trouble langage compréhension ischémie sylvienne",
            "paralysie soudaine d'un côté du corps urgence AVC",
            "difficulté soudaine à parler comprendre AVC",
            "visage paralysé d'un côté bouche déformée",
            "vertige intense avec trouble de l'équilibre AVC",
        ],
    },

    "Diabète": {
        "symptomes": {
            "polyurie": 0.8, "polydipsie": 0.8, "polyphagie": 0.6,
            "amaigrissement": 0.7, "fatigue": 0.5, "vision floue": 0.4,
            "infections fréquentes": 0.4,
        },
        "specialite": "Endocrinologie",
        "urgence_base": 1,
        "recommandations": [
            "Surveillance glycémique régulière",
            "Consultation endocrinologue",
            "Régime alimentaire adapté (faible index glycémique)",
            "Activité physique régulière (30 min/jour)",
            "Bilan annuel : fond d'œil, créatinine, HbA1c",
        ],
        "phrases_entrainement": [
            "diabète type 1 récent acidocétose polyurie polydipsie amaigrissement",
            "diabète type 2 déséquilibré HbA1c obésité complications",
            "soif excessive urines fréquentes fatigue diabète",
            "glycémie élevée polyurie polydipsie",
            "perte de poids inexpliquée faim constante fatigue",
        ],
    },

    "Cancer": {
        "symptomes": {
            "amaigrissement inexpliqué": 0.7, "fatigue": 0.6,
            "douleur nocturne": 0.7, "masse palpable": 0.8,
            "saignement anormal": 0.7, "adénopathie": 0.6,
        },
        "specialite": "Oncologie",
        "urgence_base": 2,
        "recommandations": [
            "Consultation spécialisée en oncologie urgente",
            "Bilan d'extension complet",
            "Biopsie pour confirmation diagnostique",
            "Prise en charge multidisciplinaire",
            "Soutien psychologique recommandé",
        ],
        "phrases_entrainement": [
            "tumeur pulmonaire nodule périphérique biopsie adénocarcinome métastases",
            "amaigrissement inexpliqué perte d'appétit fatigue cancer",
            "masse palpable qui grossit rapidement",
            "saignement anormal toux sang",
            "ganglion anormal indolore qui persiste",
        ],
    },

    "Dépression": {
        "symptomes": {
            "tristesse": 0.8, "anhédonie": 0.8, "fatigue": 0.6,
            "troubles sommeil": 0.6, "troubles appétit": 0.5,
            "idées noires": 0.9, "ralentissement": 0.6, "anxiété": 0.5,
        },
        "specialite": "Psychiatrie",
        "urgence_base": 1,
        "recommandations": [
            "Consultation psychiatrique ou psychologue",
            "Ne pas rester seul(e)",
            "Antidépresseurs si prescrit par un médecin",
            "Psychothérapie (TCC recommandée)",
            "Si idées suicidaires : appelez le 3114",
        ],
        "phrases_entrainement": [
            "épisode dépressif caractérisé humeur triste anhédonie insomnie",
            "dépression sévère idées suicidaires ralentissement psychomoteur",
            "tristesse profonde perte de plaisir fatigue dépression",
            "idées noires insomnie désespoir",
            "fatigue constante culpabilité anxiété dépression",
        ],
    },

    "Hypertension": {
        "symptomes": {
            "céphalées": 0.4, "vertiges": 0.3, "acouphènes": 0.3,
            "vision floue": 0.3, "épistaxis": 0.2, "bourdonnements": 0.3,
        },
        "specialite": "Cardiologie",
        "urgence_base": 1,
        "recommandations": [
            "Mesure tensionnelle régulière (automesure)",
            "Traitement antihypertenseur selon prescription",
            "Régime hyposodé (< 6g de sel/jour)",
            "Arrêt tabac, réduction alcool",
            "Urgence si PA > 180/110 avec symptômes",
        ],
        "phrases_entrainement": [
            "HTA maligne céphalées troubles visuels urgence hypertension",
            "crise hypertensive PA systolique supérieure 180 mmHg",
            "tension élevée maux de tête vertiges hypertension",
            "saignements de nez fréquents céphalées tension",
            "vision floue acouphènes hypertension",
        ],
    },

    "Asthme": {
        "symptomes": {
            "dyspnée": 0.8, "sifflements": 0.9, "toux": 0.7,
            "oppression thoracique": 0.7, "wheezing": 0.9,
            "expiration difficile": 0.8,
        },
        "specialite": "Pneumologie",
        "urgence_base": 2,
        "recommandations": [
            "Bronchodilatateur en première intention (salbutamol)",
            "Position assise penchée en avant",
            "Corticoïdes inhalés quotidiens si persistant",
            "Éviction des allergènes et déclencheurs",
            "Urgence si crise sévère ne répondant pas au traitement",
        ],
        "phrases_entrainement": [
            "crise d'asthme sévère wheezing dyspnée expiratoire",
            "asthme allergique rhinorrhée conjonctivite pollinose",
            "sifflements respiration essoufflement nuit asthme",
            "toux quinteuse wheezing oppression asthme",
            "crise dyspnée expiration difficile asthme",
        ],
    },

    "Infection urinaire": {
        "symptomes": {
            "brûlure mictionnelle": 0.9, "pollakiurie": 0.8,
            "urgence mictionnelle": 0.7, "douleur sus-pubienne": 0.6,
            "urines troubles": 0.7, "hématurie": 0.5, "fièvre": 0.3,
        },
        "specialite": "Urologie",
        "urgence_base": 1,
        "recommandations": [
            "ECBU en urgence (examen cytobactériologique des urines)",
            "Antibiothérapie selon antibiogramme",
            "Hydratation abondante (> 2L d'eau par jour)",
            "Consultation urgente si fièvre ou douleurs lombaires",
            "Ne pas retarder la miction",
        ],
        "phrases_entrainement": [
            "pyélonéphrite aiguë fièvre frissons douleur lombaire",
            "cystite récidivante brûlures mictionnelles pollakiurie",
            "brûlures urines envies fréquentes urgentes cystite",
            "urines troubles odeur forte douleur infection urinaire",
            "douleur bas ventre brûlures miction",
        ],
    },
}


# ══════════════════════════════════════════════════════════════
# ALIAS DÉRIVÉS AUTOMATIQUEMENT
# ══════════════════════════════════════════════════════════════

# Alias utilisé par le moteur de règles (symptôme → poids)
KNOWLEDGE_BASE: Dict[str, Dict[str, float]] = {
    disease: data["symptomes"]
    for disease, data in UNIFIED_KNOWLEDGE.items()
}

# Dataset ML (phrases d'entraînement) dérivé automatiquement
MEDICAL_DATASET: Dict[str, List[str]] = {
    disease: data["phrases_entrainement"]
    for disease, data in UNIFIED_KNOWLEDGE.items()
}

# Mapping spécialités dérivé automatiquement
SPECIALTY_MAPPING: Dict[str, str] = {
    disease: data["specialite"]
    for disease, data in UNIFIED_KNOWLEDGE.items()
}


# ══════════════════════════════════════════════════════════════
# RÈGLES DE SYNERGIE ET D'EXCLUSION
# ══════════════════════════════════════════════════════════════

SYNERGY_RULES: Dict[str, List[Dict]] = {
    "Grippe": [
        {"symptômes": ["fièvre", "courbatures", "fatigue"], "bonus": 0.3},
        {"symptômes": ["toux", "fièvre", "frissons"], "bonus": 0.25},
    ],
    "Migraine": [
        {"symptômes": ["céphalée", "nausées", "photophobie"], "bonus": 0.4},
        {"symptômes": ["douleur pulsatile", "douleur unilatérale", "aura"], "bonus": 0.5},
    ],
    "COVID-19": [
        {"symptômes": ["perte odorat", "perte goût", "fièvre"], "bonus": 0.6},
        {"symptômes": ["toux", "dyspnée", "fatigue"], "bonus": 0.3},
    ],
    "Gastro-entérite": [
        {"symptômes": ["diarrhée", "vomissements", "nausées"], "bonus": 0.4},
    ],
    "Infection urinaire": [
        {"symptômes": ["brûlure mictionnelle", "pollakiurie", "urines troubles"], "bonus": 0.5},
    ],
    "Infarctus": [
        {"symptômes": ["douleur thoracique", "irradiation bras gauche", "sueurs froides"], "bonus": 0.6},
    ],
    "AVC": [
        {"symptômes": ["hémiplégie", "aphasie", "paralysie faciale"], "bonus": 0.5},
    ],
    "Asthme": [
        {"symptômes": ["sifflements", "dyspnée", "expiration difficile"], "bonus": 0.4},
    ],
}

EXCLUSION_RULES: Dict[str, List[Dict]] = {
    "Grippe": [
        {"symptômes": ["éternuements", "yeux qui piquent"], "pénalité": 0.4},
    ],
    "Allergie": [
        {"symptômes": ["fièvre", "courbatures"], "pénalité": 0.5},
    ],
    "Migraine": [
        {"symptômes": ["diarrhée", "vomissements", "douleur abdominale"], "pénalité": 0.3},
    ],
    "Rhume": [
        {"symptômes": ["courbatures", "fièvre", "frissons"], "pénalité": 0.4},
    ],
}

# Mots-clés d'urgence (utilisés par analyze_urgency dans main_ia)
URGENCY_KEYWORDS: Dict[int, List[str]] = {
    3: ["infarctus", "arrêt cardiaque", "avc", "hémiplégie", "perte connaissance",
        "coma", "détresse respiratoire", "choc anaphylactique", "convulsions",
        "appendicite", "péritonite", "hémorragie", "urgence absolue", "inconscience",
        "arrêt respiratoire", "cyanose", "étouffement"],
    2: ["douleur thoracique", "dyspnée", "fièvre 40", "pneumonie",
        "acidocétose", "hypoglycémie sévère", "saturation",
        "vomissements sang", "confusion", "désorientation", "paralysie",
        "engourdissement soudain", "difficulté parler", "vertige brutal"],
    1: ["fièvre", "vomissements", "douleur", "infection", "essoufflement",
        "fatigue intense", "malaise", "céphalée", "nausée", "toux"],
}


# ══════════════════════════════════════════════════════════════
# FONCTIONS UTILITAIRES EXPORTÉES
# ══════════════════════════════════════════════════════════════

def get_specialty(disease: str) -> str:
    """Retourne la spécialité principale pour une maladie."""
    return UNIFIED_KNOWLEDGE.get(disease, {}).get("specialite", "Médecine générale")


def get_recommendations(disease: str) -> List[str]:
    """Retourne les recommandations pour une maladie."""
    return UNIFIED_KNOWLEDGE.get(disease, {}).get("recommandations", [
        "Consultez un médecin pour un diagnostic précis",
        "Repos et hydratation",
        "Surveillance des symptômes",
    ])


def get_urgence_base(disease: str) -> int:
    """Retourne le niveau d'urgence de base pour une maladie."""
    return UNIFIED_KNOWLEDGE.get(disease, {}).get("urgence_base", 0)


def extract_symptoms(text: str) -> List[str]:
    """
    Extrait les symptômes reconnus dans un texte libre.
    Compare avec le vocabulaire de KNOWLEDGE_BASE (dérivé de UNIFIED_KNOWLEDGE).
    """
    symptom_keywords = set()
    for disease_symptoms in KNOWLEDGE_BASE.values():
        symptom_keywords.update(disease_symptoms.keys())
    text_lower = text.lower()
    return [s for s in symptom_keywords if s in text_lower]


# ══════════════════════════════════════════════════════════════
# DIAGNOSTIC DIFFÉRENTIEL
# ══════════════════════════════════════════════════════════════

class DifferentialDiagnosisAnalyzer:
    """
    Analyse les cas où plusieurs maladies partagent les mêmes symptômes.
    Identifie les chevauchements et propose un rapport d'ambiguïté.
    """

    def __init__(self, ambiguity_threshold: float = 0.15):
        self.ambiguity_threshold = ambiguity_threshold
        self.knowledge_base = KNOWLEDGE_BASE

    def get_differential_diagnosis(self, symptoms: List[str]) -> List[Dict[str, Any]]:
        """Score chaque maladie selon les symptômes détectés."""
        results = []
        for disease, disease_symptoms in self.knowledge_base.items():
            matched = [s for s in symptoms if s in disease_symptoms]
            score = sum(disease_symptoms.get(s, 0) for s in matched)
            if score > 0:
                results.append({
                    "maladie": disease,
                    "probabilite": round(score, 4),
                    "symptomes_cles": matched,
                })
        total = sum(r["probabilite"] for r in results)
        if total > 0:
            for r in results:
                r["probabilite"] = round(r["probabilite"] / total, 4)
        results.sort(key=lambda x: x["probabilite"], reverse=True)
        return results

    def detect_ambiguities(self, diagnosis_list: List[Dict], symptoms: List[str]) -> List[Dict]:
        """Détecte les maladies proches en probabilité."""
        ambiguities = []
        if len(diagnosis_list) >= 2:
            p1 = diagnosis_list[0]["probabilite"]
            p2 = diagnosis_list[1]["probabilite"]
            if abs(p1 - p2) < self.ambiguity_threshold:
                ambiguities.append({
                    "maladie_1": diagnosis_list[0]["maladie"],
                    "prob_1": p1,
                    "maladie_2": diagnosis_list[1]["maladie"],
                    "prob_2": p2,
                    "difference": round(abs(p1 - p2), 4),
                })
        return ambiguities

    def format_differential_report(self, ambiguities: List[Dict]) -> str:
        if not ambiguities:
            return ""
        return "\n".join(
            f"Ambiguïté entre {a['maladie_1']} (p={a['prob_1']}) et {a['maladie_2']} (p={a['prob_2']})"
            for a in ambiguities
        )

    def get_all_overlaps(self, min_overlap: int = 2) -> List[Dict]:
        """Retourne toutes les paires de maladies partageant des symptômes."""
        diseases = list(self.knowledge_base.keys())
        overlaps = []
        for i in range(len(diseases)):
            for j in range(i + 1, len(diseases)):
                d1, d2 = diseases[i], diseases[j]
                shared = set(self.knowledge_base[d1].keys()) & set(self.knowledge_base[d2].keys())
                if len(shared) >= min_overlap:
                    overlaps.append({
                        "maladie_1": d1,
                        "maladie_2": d2,
                        "symptomes_communs": list(shared),
                        "nb_communs": len(shared),
                    })
        overlaps.sort(key=lambda x: x["nb_communs"], reverse=True)
        return overlaps


# ══════════════════════════════════════════════════════════════
# CONFIGURATION DU MODÈLE
# ══════════════════════════════════════════════════════════════

@dataclass
class ModelConfig:
    model_type: str = "svm"          # svm | random_forest | logistic
    vectorizer: str = "tfidf"        # tfidf | count
    max_features: int = 1000
    ngram_range: Tuple[int, int] = (1, 2)
    random_state: int = 42
    ml_weight: float = 0.6           # Poids ML dans la fusion hybride
    kb_weight: float = 0.4           # Poids KB dans la fusion hybride


# ══════════════════════════════════════════════════════════════
# SYSTÈME HYBRIDE ML + BASE DE CONNAISSANCES
# ══════════════════════════════════════════════════════════════

class HybridMedicalDiagnosis:
    """
    Système hybride combinant :
    - NLP (TF-IDF) + ML (SVM, Random Forest, Logistic Regression)
    - Base de connaissances expertes (règles pondérées depuis UNIFIED_KNOWLEDGE)
    """

    def __init__(self, config: Optional[ModelConfig] = None):
        self.config = config or ModelConfig()
        self.is_trained = False
        self.vectorizer = None
        self.classifier = None
        self.label_encoder = LabelEncoder()
        self.classes_: List[str] = []
        self.training_history: List[Dict] = []
        self._init_components()

    def _init_components(self):
        if self.config.vectorizer == "tfidf":
            self.vectorizer = TfidfVectorizer(
                max_features=self.config.max_features,
                ngram_range=self.config.ngram_range,
                lowercase=True,
            )
        else:
            self.vectorizer = CountVectorizer(
                max_features=self.config.max_features,
                ngram_range=self.config.ngram_range,
                lowercase=True,
            )

        if self.config.model_type == "svm":
            self.classifier = SVC(kernel="rbf", probability=True,
                                  random_state=self.config.random_state)
        elif self.config.model_type == "random_forest":
            self.classifier = RandomForestClassifier(n_estimators=100,
                                                     random_state=self.config.random_state)
        elif self.config.model_type == "logistic":
            self.classifier = LogisticRegression(max_iter=1000,
                                                 random_state=self.config.random_state)
        else:
            raise ValueError(f"Modèle inconnu: {self.config.model_type}")

    def train(self, texts: List[str], labels: List[str], test_size: float = 0.2) -> Dict:
        self.classes_ = sorted(set(labels))
        y = self.label_encoder.fit_transform(labels)
        X_train, X_test, y_train, y_test = train_test_split(
            texts, y, test_size=test_size,
            random_state=self.config.random_state, stratify=y
        )
        X_train_vec = self.vectorizer.fit_transform(X_train)
        X_test_vec = self.vectorizer.transform(X_test)
        self.classifier.fit(X_train_vec, y_train)
        y_pred = self.classifier.predict(X_test_vec)
        accuracy = accuracy_score(y_test, y_pred)
        cv = cross_val_score(self.classifier, X_train_vec, y_train, cv=5)
        self.is_trained = True
        metrics = {
            "accuracy": accuracy, "cv_mean": cv.mean(), "cv_std": cv.std(),
            "n_samples": len(texts), "n_classes": len(self.classes_),
        }
        self.training_history.append(metrics)
        return metrics

    def predict_ml(self, text: str) -> Dict[str, float]:
        if not self.is_trained:
            return {}
        X = self.vectorizer.transform([text])
        probs = (self.classifier.predict_proba(X)[0]
                 if hasattr(self.classifier, "predict_proba")
                 else self._fallback_proba(X))
        return {
            self.label_encoder.inverse_transform([i])[0]: float(p)
            for i, p in enumerate(probs)
        }

    def _fallback_proba(self, X) -> np.ndarray:
        probs = np.zeros(len(self.classes_))
        probs[self.classifier.predict(X)[0]] = 1.0
        return probs

    def predict_knowledge(self, text: str) -> Dict[str, float]:
        """Prédiction par règles pondérées depuis UNIFIED_KNOWLEDGE."""
        symptoms = extract_symptoms(text)
        diseases = self.classes_ if self.classes_ else list(KNOWLEDGE_BASE.keys())
        raw: Dict[str, float] = {}

        for disease in diseases:
            kb = KNOWLEDGE_BASE.get(disease, {})
            if not kb:
                raw[disease] = 0.0
                continue
            base = sum(kb.get(s, 0.0) for s in symptoms) / len(kb)
            synergy = self._apply_synergies(symptoms, disease)
            penalty = self._apply_exclusions(symptoms, disease)
            raw[disease] = max(0.0, base + synergy - penalty)

        total = sum(raw.values())
        if total > 0:
            return {k: v / total for k, v in raw.items()}
        n = len(raw) or 1
        return {k: 1.0 / n for k in raw}

    def _apply_synergies(self, symptoms: List[str], disease: str) -> float:
        bonus = 0.0
        syms = set(symptoms)
        for rule in SYNERGY_RULES.get(disease, []):
            req = set(rule["symptômes"])
            if req.issubset(syms):
                bonus += rule["bonus"]
            elif len(req & syms) >= 2:
                bonus += rule["bonus"] * 0.5
        return bonus

    def _apply_exclusions(self, symptoms: List[str], disease: str) -> float:
        penalty = 0.0
        syms = set(symptoms)
        for rule in EXCLUSION_RULES.get(disease, []):
            if set(rule["symptômes"]).issubset(syms):
                penalty += rule["pénalité"]
        return penalty

    def predict_hybrid(self, text: str) -> Dict[str, float]:
        ml = self.predict_ml(text)
        kb = self.predict_knowledge(text)
        if not ml:
            return kb
        all_d = set(ml) | set(kb)
        hybrid = {
            d: self.config.ml_weight * ml.get(d, 0.0) + self.config.kb_weight * kb.get(d, 0.0)
            for d in all_d
        }
        total = sum(hybrid.values())
        if total > 0:
            return {k: v / total for k, v in hybrid.items()}
        return hybrid

    def get_detailed_diagnosis(self, text: str, top_k: int = 5) -> Dict:
        if not self.is_trained:
            return {"success": False, "message": "Modèle non entraîné."}
        ml = self.predict_ml(text)
        kb = self.predict_knowledge(text)
        hybrid = self.predict_hybrid(text)
        ranked = sorted(hybrid.items(), key=lambda x: x[1], reverse=True)
        symptoms = extract_symptoms(text)
        results = [
            {
                "maladie": d,
                "probabilite_hybride": round(p, 4),
                "probabilite_ml": round(ml.get(d, 0), 4),
                "probabilite_knowledge": round(kb.get(d, 0), 4),
                "specialite": get_specialty(d),
                "symptomes_detectes": symptoms,
            }
            for d, p in ranked[:top_k]
        ]
        ambiguities = []
        if len(ranked) >= 2 and abs(ranked[0][1] - ranked[1][1]) < 0.15:
            ambiguities.append({
                "maladie_1": ranked[0][0], "prob_1": ranked[0][1],
                "maladie_2": ranked[1][0], "prob_2": ranked[1][1],
                "difference": abs(ranked[0][1] - ranked[1][1]),
            })
        return {
            "success": True,
            "diagnostic_principal": results[0] if results else None,
            "diagnostics_alternatifs": results[1:],
            "ambiguites": ambiguities,
            "meta": {
                "poids_ml": self.config.ml_weight,
                "poids_knowledge": self.config.kb_weight,
                "modele_ml": self.config.model_type,
            },
        }

    def save_model(self, path: str):
        with open(path, "wb") as f:
            pickle.dump({
                "vectorizer": self.vectorizer, "classifier": self.classifier,
                "label_encoder": self.label_encoder, "classes": self.classes_,
                "config": self.config, "training_history": self.training_history,
            }, f)

    def load_model(self, path: str):
        with open(path, "rb") as f:
            data = pickle.load(f)
        self.vectorizer = data["vectorizer"]
        self.classifier = data["classifier"]
        self.label_encoder = data["label_encoder"]
        self.classes_ = data["classes"]
        self.config = data["config"]
        self.training_history = data.get("training_history", [])
        self.is_trained = True


# ══════════════════════════════════════════════════════════════
# GÉNÉRATEUR DE DONNÉES SYNTHÉTIQUES
# ══════════════════════════════════════════════════════════════

class DataGenerator:
    """Génère des données d'entraînement à partir de UNIFIED_KNOWLEDGE."""

    def generate(self, n_samples: int = 1000) -> Tuple[List[str], List[str]]:
        texts, labels = [], []
        diseases = list(UNIFIED_KNOWLEDGE.keys())
        for _ in range(n_samples):
            disease = random.choice(diseases)
            phrases = UNIFIED_KNOWLEDGE[disease]["phrases_entrainement"]
            texts.append(random.choice(phrases))
            labels.append(disease)
        return texts, labels


# ══════════════════════════════════════════════════════════════
# CONSEILS PERSONNALISÉS
# ══════════════════════════════════════════════════════════════

def get_personalized_advice(disease: str, symptoms: List[str],
                            patient_profile: Optional[Dict] = None) -> List[str]:
    """Conseils personnalisés basés sur UNIFIED_KNOWLEDGE + profil patient."""
    advice = get_recommendations(disease).copy()

    if "fièvre" in symptoms or "température élevée" in symptoms:
        advice.append("Surveillez votre température toutes les 4 heures")

    if patient_profile:
        age = patient_profile.get("age")
        if age is not None:
            if age < 12:
                advice.insert(0, "Enfant — Consultez un pédiatre rapidement")
            elif age > 65:
                advice.insert(0, "Personne âgée — Consultation rapide recommandée")
        if patient_profile.get("allergies"):
            advice.append(
                f"Antécédents d'allergies ({patient_profile['allergies']}) — Signalez-le au médecin"
            )
        if patient_profile.get("current_medications"):
            advice.append("N'arrêtez pas vos traitements en cours sans avis médical")

    return advice


# ══════════════════════════════════════════════════════════════
# RECOMMANDATION DE MÉDECINS (SQLite)
# ══════════════════════════════════════════════════════════════

def get_doctor_recommendations(specialty: str, city: Optional[str] = None,
                               db_path: Optional[str] = None) -> List[Dict]:
    if not db_path:
        return []
    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        query = """
            SELECT u.id, u.full_name, u.phone,
                   d.specialty, d.location, d.address,
                   d.experience, d.consultation_price, d.available, d.rating, d.patient_count
            FROM users u
            JOIN doctors d ON u.id = d.user_id
            WHERE u.role = 'doctor' AND d.approved = 1
            AND LOWER(d.specialty) LIKE LOWER(?)
        """
        params = [f"%{specialty}%"]
        if city:
            query += " AND LOWER(d.location) LIKE LOWER(?)"
            params.append(f"%{city}%")
        query += " ORDER BY d.rating DESC LIMIT 5"
        c.execute(query, params)
        rows = c.fetchall()
        conn.close()
        return [
            {
                "id": r["id"], "nom": r["full_name"],
                "specialite": r["specialty"], "ville": r["location"],
                "telephone": r["phone"], "adresse": r["address"],
                "experience": r["experience"],
                "prix_consultation": r["consultation_price"],
                "note": round(r["rating"] or 4.5, 1),
                "disponible": bool(r["available"]),
                "nb_patients": r["patient_count"] or 0,
            }
            for r in rows
        ]
    except Exception:
        return []


# ══════════════════════════════════════════════════════════════
# FONCTION PRINCIPALE EXPORTÉE (appelée par main_ia.py)
# ══════════════════════════════════════════════════════════════

def knowledge_based_recommendation(
    symptom_text: str,
    patient_profile: Optional[Dict] = None,
    db_path: Optional[str] = None,
    top_diseases: int = 5,
) -> Dict:
    """
    Pipeline de recommandation basé sur UNIFIED_KNOWLEDGE.
    Retourne diagnostic principal, alternatives, conseils personnalisés et médecins.
    """
    symptoms = extract_symptoms(symptom_text)

    if not symptoms:
        return {
            "success": False,
            "message": "Aucun symptôme reconnu dans le texte",
            "diagnostic_principal": None,
            "diagnostics_alternatifs": [],
            "diagnostic_differentiel": {},
            "conseils_personnalises": ["Veuillez décrire plus précisément vos symptômes"],
        }

    analyzer = DifferentialDiagnosisAnalyzer()
    diff = analyzer.get_differential_diagnosis(symptoms)

    if not diff:
        return {
            "success": False,
            "message": "Aucune maladie correspondante trouvée",
            "diagnostic_principal": None,
            "diagnostics_alternatifs": [],
            "diagnostic_differentiel": {},
            "conseils_personnalises": ["Consultez un médecin pour une évaluation approfondie"],
        }

    main_d = diff[0]
    alternatives = diff[1:min(top_diseases, len(diff))]

    # Diagnostic différentiel
    diag_list = [{"maladie": d["maladie"], "probabilite": d["probabilite"],
                  "symptomes_detectes": symptoms} for d in diff[:3]]
    ambiguities = analyzer.detect_ambiguities(diag_list, symptoms)
    diff_report = analyzer.format_differential_report(ambiguities)

    specialty = get_specialty(main_d["maladie"])
    advice = get_personalized_advice(main_d["maladie"], symptoms, patient_profile)

    result: Dict = {
        "success": True,
        "diagnostic_principal": {
            "maladie": main_d["maladie"],
            "probabilite": main_d["probabilite"],
            "symptomes_detectes": symptoms,
            "specialite": specialty,
            "critere_orientation": "Basé sur les symptômes détectés (UNIFIED_KNOWLEDGE)",
            "symptomes_cles": main_d.get("symptomes_cles", []),
        },
        "diagnostics_alternatifs": [
            {
                "maladie": a["maladie"],
                "probabilite": a["probabilite"],
                "specialite": get_specialty(a["maladie"]),
                "symptomes_communs": a.get("symptomes_cles", []),
            }
            for a in alternatives
        ],
        "diagnostic_differentiel": {
            "ambiguites": ambiguities,
            "rapport": diff_report,
            "nb_conflits": len(ambiguities),
        },
        "conseils_personnalises": advice,
        "symptomes_detectes": symptoms,
        "nb_symptomes": len(symptoms),
    }

    if db_path:
        city = patient_profile.get("city") if patient_profile else None
        result["recommandations_medecins"] = get_doctor_recommendations(
            specialty, city, db_path
        )

    return result


# ══════════════════════════════════════════════════════════════
# DÉMO STANDALONE
# ══════════════════════════════════════════════════════════════

def main():
    print("=" * 60)
    print("PARROTDIAG — Système Hybride (UNIFIED_KNOWLEDGE)")
    print("=" * 60)

    generator = DataGenerator()
    texts, labels = generator.generate(n_samples=800)
    print(f"Données générées : {len(texts)} exemples, {len(set(labels))} classes")

    config = ModelConfig(model_type="svm", ml_weight=0.6, kb_weight=0.4)
    hybrid = HybridMedicalDiagnosis(config)
    metrics = hybrid.train(texts, labels)
    print(f"Accuracy : {metrics['accuracy']:.2%} | CV : {metrics['cv_mean']:.2%}")

    test_cases = [
        "J'ai mal à la tête, c'est pulsatile, sensible à la lumière, nausées",
        "Fièvre 39°C courbatures frissons toux sèche fatigue intense",
        "Douleur poitrine irradie bras gauche sueurs froides angoisse",
        "Brûlures en urinant envie fréquente urines troubles",
    ]

    for text in test_cases:
        r = hybrid.get_detailed_diagnosis(text, top_k=3)
        if r["success"] and r["diagnostic_principal"]:
            d = r["diagnostic_principal"]
            print(f"\n> {text[:60]}...")
            print(f"  Diagnostic : {d['maladie']} ({d['probabilite_hybride']:.1%})")
            print(f"  Spécialité : {d['specialite']}")


if __name__ == "__main__":
    main()