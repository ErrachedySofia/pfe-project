const API_URL = "http://127.0.0.1:8000";

// ========================================
// UTILS
// ========================================
const $ = selector => document.querySelector(selector);
const $$ = selector => document.querySelectorAll(selector);

// ========================================
// VARIABLES GLOBALES
// ========================================
let allDoctors = [];
let filteredDoctors = [];

// Calendar booking state
let calCurrentMonth = new Date().getMonth();
let calCurrentYear = new Date().getFullYear();
let calDoctorId = null;
let calDoctorData = {};
let calSelectedDate = null;
let calSelectedTime = null;

// ========================================
// GESTION DES MODALES
// ========================================
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

function initModals() {
    const openModalBtn = document.getElementById('openModal');
    const reviewModal = document.getElementById('reviewModal');
    const closeModalBtn = reviewModal?.querySelector('.modal-close');
    
    if (openModalBtn && reviewModal) {
        openModalBtn.addEventListener('click', (e) => {
            e.preventDefault();
            openModal('reviewModal');
        });
    }
    
    if (closeModalBtn && reviewModal) {
        closeModalBtn.addEventListener('click', () => {
            closeModal('reviewModal');
        });
    }
    
    const modals = document.querySelectorAll('.modal-overlay');
    modals.forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal(modal.id);
            }
        });
    });
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const openModals = document.querySelectorAll('.modal-overlay[style*="display: flex"]');
            openModals.forEach(modal => closeModal(modal.id));
        }
    });
}

// ========================================
// GESTION DU THÈME
// ========================================
function initTheme() {
    const themeToggle = document.getElementById('themeToggle');
    const savedTheme = localStorage.getItem('parrotTheme') || 'light';
    
    document.documentElement.setAttribute('data-theme', savedTheme);
    
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'light' ? 'dark' : 'light';
            
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('parrotTheme', newTheme);
            
            showNotification(`Thème ${newTheme === 'light' ? 'clair' : 'sombre'} activé`, 'success');
        });
    }
}

// ========================================
// GESTION DE LA LANGUE
// ========================================
const translations = {
    en: {
        nav_home: "Home",
        nav_assess: "Assess My Symptoms",
        nav_reco: "Activity",
        nav_about: "About",
        btn_signup: "Sign up",
        btn_login: "Login",
        hero_badge: "AI-Powered Health Platform",
        hero_title: "Evaluate your <em>symptoms</em><br>in seconds.",
        hero_sub: "Our intelligent platform helps you understand your health instantly. Get personalized recommendations and take control of your wellbeing from home.",
        feat_1: "Quick symptom analysis in seconds",
        feat_2: "Personalized health recommendations",
        feat_3: "Track your health history",
        feat_4: "Secure & private data handling",
        cta_start: "Get Started Now",
        cta_learn: "How it works",
        card_heart: "Heart Rate",
        card_track: "Track History",
        card_track_sub: "12 consults",
        card_ai: "AI Doctor",
        card_ai_sub: "Online",
        feat_label: "What We Do",
        feat_heading: "Intelligent tools for <em>your health</em>",
        feat_sub: "Designed to help you understand your health quickly, reliably, and privately.",
        fc_title1: "Intelligent Symptom Analysis",
        fc_desc1: "AI-powered analysis to help identify potential health issues in seconds with clinical accuracy.",
        fc_tag1: "AI Analysis",
        fc_title2: "Reliable Medical Hypotheses",
        fc_desc2: "Based on millions of medical cases and clinical data.",
        fc_title3: "Consultation History",
        fc_desc3: "Track previous consultations and follow up easily for continuity of care.",
        doc_label: "Our Network",
        doc_heading: "Recommended by <em>our AI</em>",
        doc_sub: "Qualified doctors, evaluated by the community",
        loading_docs: "Loading doctors...",
        how_label: "Process",
        how_heading: "How It <em>Works</em>",
        how_sub: "A simple, fast and intelligent process powered by medical-grade AI. Four steps to understanding your health.",
        stat1: "Accuracy rate",
        stat2: "Avg. diagnosis",
        step1_title: "Enter Your Symptoms",
        step1_desc: "Describe what you're feeling in natural language — no medical jargon needed.",
        step2_title: "AI Analyzes Instantly",
        step2_desc: "The system interprets your symptoms using advanced medical AI trained on millions of cases.",
        step3_title: "Receive Hypotheses",
        step3_desc: "Get possible conditions and clearly explained next steps tailored to you.",
        step4_title: "Consult a Specialist",
        step4_desc: "The AI guides you toward the right doctor or specialty when needed.",
        rev_label: "Testimonials",
        rev_heading: "Honest Feedback from <em>our Clients</em>",
        rev_sub: "Share your experience with our community. Your feedback helps others make the best choice.",
        btn_review: "Add Your Review",
        stat_reviews: "Client Reviews",
        stat_rating: "Average Rating",
        footer_tagline: "Revolutionizing healthcare with AI-powered preliminary diagnosis.",
        footer_quick: "Quick Links",
        footer_contact: "Contact",
        footer_newsletter: "Newsletter",
        footer_news_sub: "Stay updated with health tips and news.",
        footer_copy: "© 2025 ParrotDiag. All rights reserved.",
        privacy: "Privacy Policy",
        terms: "Terms of Service",
        modal_review_title: "Add Your Review",
        form_name: "Your name *",
        form_email: "Email (optional)",
        form_rating: "Rating *",
        form_comment: "Comment *",
        btn_cancel: "Cancel",
        btn_publish: "Publish",
        modal_profile_title: "Complete My Profile",
        upload_photo: "Choose Photo",
        photo_hint: "JPG, PNG (max 2MB)",
        full_name: "Full Name *",
        email: "Email *",
        phone: "Phone *",
        birthdate: "Date of Birth *",
        sex: "Sex *",
        male: "Male",
        female: "Female",
        blood_type: "Blood Type",
        city: "City *",
        zip: "Postal Code",
        address: "Address *",
        medical_info: "Medical Information",
        allergies: "Known Allergies",
        medications: "Current Medications",
        history: "Medical History",
        consent: "I agree that my medical data is stored securely and used only for consultations.",
        btn_save: "Save Profile",
        email_ph: "your@email.com"
    },
    fr: {
        nav_home: "Accueil",
        nav_assess: "Évaluer mes symptômes",
        nav_reco: "les activités",
        nav_about: "À propos",
        btn_signup: "S'inscrire",
        btn_login: "Se connecter",
        hero_badge: "Plateforme Santé IA",
        hero_title: "Évaluez vos <em>symptômes</em><br>en quelques secondes.",
        hero_sub: "Notre plateforme intelligente vous aide à comprendre instantanément votre santé. Obtenez des recommandations personnalisées depuis chez vous.",
        feat_1: "Analyse rapide des symptômes",
        feat_2: "Recommandations personnalisées",
        feat_3: "Suivi de votre historique",
        feat_4: "Traitement sécurisé des données",
        cta_start: "Commencer",
        cta_learn: "Comment ça marche",
        card_heart: "Fréquence cardiaque",
        card_track: "Historique",
        card_track_sub: "12 consultations",
        card_ai: "Docteur IA",
        card_ai_sub: "En ligne",
        feat_label: "Notre Mission",
        feat_heading: "Des outils intelligents pour <em>votre santé</em>",
        feat_sub: "Conçus pour vous aider à comprendre votre santé rapidement, de façon fiable et privée.",
        fc_title1: "Analyse intelligente des symptômes",
        fc_desc1: "Analyse par IA pour identifier les problèmes de santé potentiels en quelques secondes avec une précision clinique.",
        fc_tag1: "Analyse IA",
        fc_title2: "Hypothèses médicales fiables",
        fc_desc2: "Basé sur des millions de cas médicaux et de données cliniques.",
        fc_title3: "Historique des consultations",
        fc_desc3: "Suivez vos consultations précédentes pour une continuité des soins.",
        doc_label: "Notre Réseau",
        doc_heading: "Recommandés par <em>notre IA</em>",
        doc_sub: "Médecins qualifiés, évalués par la communauté",
        loading_docs: "Chargement des médecins...",
        how_label: "Processus",
        how_heading: "Comment ça <em>marche</em>",
        how_sub: "Un processus simple, rapide et intelligent alimenté par une IA de qualité médicale.",
        stat1: "Taux de précision",
        stat2: "Diagnostic moyen",
        step1_title: "Entrez vos symptômes",
        step1_desc: "Décrivez ce que vous ressentez en langage naturel - pas besoin de jargon médical.",
        step2_title: "L'IA analyse instantanément",
        step2_desc: "Le système interprète vos symptômes grâce à une IA médicale avancée entraînée sur des millions de cas.",
        step3_title: "Recevez des hypothèses",
        step3_desc: "Obtenez les conditions possibles et les prochaines étapes clairement expliquées.",
        step4_title: "Consultez un spécialiste",
        step4_desc: "L'IA vous guide vers le bon médecin ou la bonne spécialité si nécessaire.",
        rev_label: "Témoignages",
        rev_heading: "Avis honnêtes de <em>nos clients</em>",
        rev_sub: "Partagez votre expérience avec notre communauté. Votre avis aide les autres à faire le meilleur choix.",
        btn_review: "Ajouter un avis",
        stat_reviews: "Avis clients",
        stat_rating: "Note moyenne",
        footer_tagline: "Révolutionner les soins de santé avec un diagnostic préliminaire par IA.",
        footer_quick: "Liens rapides",
        footer_contact: "Contact",
        footer_newsletter: "Newsletter",
        footer_news_sub: "Restez informé des conseils santé et actualités.",
        footer_copy: "© 2025 ParrotDiag. Tous droits réservés.",
        privacy: "Politique de confidentialité",
        terms: "Conditions d'utilisation",
        modal_review_title: "Ajouter votre avis",
        form_name: "Votre nom *",
        form_email: "Email (optionnel)",
        form_rating: "Note *",
        form_comment: "Commentaire *",
        btn_cancel: "Annuler",
        btn_publish: "Publier",
        modal_profile_title: "Compléter mon profil",
        upload_photo: "Choisir une photo",
        photo_hint: "JPG, PNG (max 2Mo)",
        full_name: "Nom complet *",
        email: "Email *",
        phone: "Téléphone *",
        birthdate: "Date de naissance *",
        sex: "Sexe *",
        male: "Homme",
        female: "Femme",
        blood_type: "Groupe sanguin",
        city: "Ville *",
        zip: "Code postal",
        address: "Adresse *",
        medical_info: "Informations médicales",
        allergies: "Allergies connues",
        medications: "Médicaments actuels",
        history: "Antécédents médicaux",
        consent: "J'accepte que mes données médicales soient stockées en toute sécurité et utilisées uniquement pour les consultations.",
        btn_save: "Enregistrer le profil",
        email_ph: "votre@email.com"
    },
    ar: {
        nav_home: "الرئيسية",
        nav_assess: "تقييم الأعراض",
        nav_reco: "التوصيات",
        nav_about: "حول",
        btn_signup: "اشتراك",
        btn_login: "تسجيل الدخول",
        hero_badge: "منصة صحية بالذكاء الاصطناعي",
        hero_title: "قيّم <em>أعراضك</em><br>في ثوان",
        hero_sub: "منصتنا الذكية تساعدك على فهم صحتك فوراً. احصل على توصيات مخصصة وتحكم في صحتك من المنزل.",
        feat_1: "تحليل سريع للأعراض",
        feat_2: "توصيات صحية مخصصة",
        feat_3: "تتبع تاريخك الصحي",
        feat_4: "معالجة آمنة للبيانات",
        cta_start: "ابدأ الآن",
        cta_learn: "كيف يعمل",
        card_heart: "معدل ضربات القلب",
        card_track: "السجل الطبي",
        card_track_sub: "12 استشارة",
        card_ai: "طبيب ذكاء اصطناعي",
        card_ai_sub: "متصل",
        feat_label: "ماذا نفعل",
        feat_heading: "أدوات ذكية <em>لصحتك</em>",
        feat_sub: "مصممة لمساعدتك على فهم صحتك بسرعة وموثوقية وخصوصية.",
        fc_title1: "تحليل ذكي للأعراض",
        fc_desc1: "تحليل بالذكاء الاصطناعي للمساعدة في تحديد المشكلات الصحية المحتملة في ثوان بدقة سريرية.",
        fc_tag1: "تحليل بالذكاء الاصطناعي",
        fc_title2: "فرضيات طبية موثوقة",
        fc_desc2: "بناءً على ملايين الحالات الطبية والبيانات السريرية.",
        fc_title3: "سجل الاستشارات",
        fc_desc3: "تتبع الاستشارات السابقة ومتابعتها بسهولة لاستمرارية الرعاية.",
        doc_label: "شبكتنا",
        doc_heading: "موصى به من <em>ذكائنا الاصطناعي</em>",
        doc_sub: "أطباء مؤهلون، بتقييم المجتمع",
        loading_docs: "جاري تحميل الأطباء...",
        how_label: "العملية",
        how_heading: "كيف <em>يعمل</em>",
        how_sub: "عملية بسيطة وسريعة وذكية مدعومة بالذكاء الاصطناعي الطبي.",
        stat1: "معدل الدقة",
        stat2: "متوسط التشخيص",
        step1_title: "أدخل أعراضك",
        step1_desc: "صف ما تشعر به بلغة طبيعية - لا حاجة للمصطلحات الطبية.",
        step2_title: "الذكاء الاصطناعي يحلل فوراً",
        step2_desc: "يقوم النظام بتفسير أعراضك باستخدام ذكاء اصطناعي طبي متقدم مدرب على ملايين الحالات.",
        step3_title: "تلقي الفرضيات",
        step3_desc: "احصل على الحالات المحتملة والخطوات التالية الموضحة بوضوح والمصممة خصيصاً لك.",
        step4_title: "استشر أخصائياً",
        step4_desc: "يرشدك الذكاء الاصطناعي إلى الطبيب المناسب أو التخصص عند الحاجة.",
        rev_label: "الشهادات",
        rev_heading: "تقييمات صادقة من <em>عملائنا</em>",
        rev_sub: "شارك تجربتك مع مجتمعنا. رأيك يساعد الآخرين على اتخاذ القرار الأفضل.",
        btn_review: "أضف تقييمك",
        stat_reviews: "تقييمات العملاء",
        stat_rating: "متوسط التقييم",
        footer_tagline: "نحدث الرعاية الصحية بالتشخيص الأولي بالذكاء الاصطناعي.",
        footer_quick: "روابط سريعة",
        footer_contact: "اتصل بنا",
        footer_newsletter: "النشرة البريدية",
        footer_news_sub: "ابق على اطلاع بنصائح الصحة والأخبار.",
        footer_copy: "© 2025 ببغاء للتشخيص. جميع الحقوق محفوظة.",
        privacy: "سياسة الخصوصية",
        terms: "شروط الخدمة",
        modal_review_title: "أضف تقييمك",
        form_name: "اسمك *",
        form_email: "البريد الإلكتروني (اختياري)",
        form_rating: "التقييم *",
        form_comment: "التعليق *",
        btn_cancel: "إلغاء",
        btn_publish: "نشر",
        modal_profile_title: "أكمل ملفي الشخصي",
        upload_photo: "اختر صورة",
        photo_hint: "JPG, PNG (2MB كحد أقصى)",
        full_name: "الاسم الكامل *",
        email: "البريد الإلكتروني *",
        phone: "الهاتف *",
        birthdate: "تاريخ الميلاد *",
        sex: "الجنس *",
        male: "ذكر",
        female: "أنثى",
        blood_type: "فصيلة الدم",
        city: "المدينة *",
        zip: "الرمز البريدي",
        address: "العنوان *",
        medical_info: "المعلومات الطبية",
        allergies: "الحساسية المعروفة",
        medications: "الأدوية الحالية",
        history: "التاريخ الطبي",
        consent: "أوافق على تخزين بياناتي الطبية بشكل آمن واستخدامها فقط للاستشارات.",
        btn_save: "حفظ الملف الشخصي",
        email_ph: "بريدك@email.com"
    },
    es: {
        nav_home: "Inicio",
        nav_assess: "Evaluar síntomas",
        nav_reco: "Recomendaciones",
        nav_about: "Acerca de",
        btn_signup: "Registrarse",
        btn_login: "Iniciar sesión",
        hero_badge: "Plataforma de Salud con IA",
        hero_title: "Evalúa tus <em>síntomas</em><br>en segundos.",
        hero_sub: "Nuestra plataforma inteligente te ayuda a entender tu salud al instante. Obtén recomendaciones personalizadas desde casa.",
        feat_1: "Análisis rápido de síntomas",
        feat_2: "Recomendaciones personalizadas",
        feat_3: "Seguimiento de historial",
        feat_4: "Manejo seguro de datos",
        cta_start: "Comenzar ahora",
        cta_learn: "Cómo funciona",
        card_heart: "Frecuencia cardíaca",
        card_track: "Historial",
        card_track_sub: "12 consultas",
        card_ai: "Doctor IA",
        card_ai_sub: "En línea",
        feat_label: "Qué hacemos",
        feat_heading: "Herramientas inteligentes para <em>tu salud</em>",
        feat_sub: "Diseñadas para ayudarte a entender tu salud rápida, confiable y privadamente.",
        fc_title1: "Análisis inteligente de síntomas",
        fc_desc1: "Análisis con IA para identificar posibles problemas de salud en segundos con precisión clínica.",
        fc_tag1: "Análisis IA",
        fc_title2: "Hipótesis médicas confiables",
        fc_desc2: "Basado en millones de casos médicos y datos clínicos.",
        fc_title3: "Historial de consultas",
        fc_desc3: "Seguimiento de consultas anteriores para continuidad de atención.",
        doc_label: "Nuestra Red",
        doc_heading: "Recomendados por <em>nuestra IA</em>",
        doc_sub: "Médicos calificados, evaluados por la comunidad",
        loading_docs: "Cargando médicos...",
        how_label: "Proceso",
        how_heading: "Cómo <em>funciona</em>",
        how_sub: "Un proceso simple, rápido e inteligente impulsado por IA de grado médico.",
        stat1: "Tasa de precisión",
        stat2: "Diagnóstico promedio",
        step1_title: "Ingresa tus síntomas",
        step1_desc: "Describe lo que sientes en lenguaje natural - sin necesidad de jerga médica.",
        step2_title: "IA analiza al instante",
        step2_desc: "El sistema interpreta tus síntomas usando IA médica avanzada entrenada en millones de casos.",
        step3_title: "Recibe hipótesis",
        step3_desc: "Obtén posibles condiciones y próximos pasos claramente explicados.",
        step4_title: "Consulta un especialista",
        step4_desc: "La IA te guía hacia el médico o especialidad adecuada cuando es necesario.",
        rev_label: "Testimonios",
        rev_heading: "Comentarios honestos de <em>nuestros clientes</em>",
        rev_sub: "Comparte tu experiencia con nuestra comunidad. Tu opinión ayuda a otros a elegir mejor.",
        btn_review: "Añadir reseña",
        stat_reviews: "Reseñas de clientes",
        stat_rating: "Calificación promedio",
        footer_tagline: "Revolucionando la salud con diagnóstico preliminar por IA.",
        footer_quick: "Enlaces rápidos",
        footer_contact: "Contacto",
        footer_newsletter: "Newsletter",
        footer_news_sub: "Mantente actualizado con consejos de salud y noticias.",
        footer_copy: "© 2025 ParrotDiag. Todos los derechos reservados.",
        privacy: "Política de privacidad",
        terms: "Términos de servicio",
        modal_review_title: "Añadir reseña",
        form_name: "Tu nombre *",
        form_email: "Email (opcional)",
        form_rating: "Calificación *",
        form_comment: "Comentario *",
        btn_cancel: "Cancelar",
        btn_publish: "Publicar",
        modal_profile_title: "Completar mi perfil",
        upload_photo: "Elegir foto",
        photo_hint: "JPG, PNG (máx 2MB)",
        full_name: "Nombre completo *",
        email: "Email *",
        phone: "Teléfono *",
        birthdate: "Fecha de nacimiento *",
        sex: "Sexo *",
        male: "Hombre",
        female: "Mujer",
        blood_type: "Tipo de sangre",
        city: "Ciudad *",
        zip: "Código postal",
        address: "Dirección *",
        medical_info: "Información médica",
        allergies: "Alergias conocidas",
        medications: "Medicamentos actuales",
        history: "Historial médico",
        consent: "Acepto que mis datos médicos se almacenen de forma segura y se utilicen solo para consultas.",
        btn_save: "Guardar perfil",
        email_ph: "tu@email.com"
    }
};

function initLanguage() {
    const langBtn = document.getElementById('langBtn');
    const langDropdown = document.getElementById('langDropdown');
    const langOptions = document.querySelectorAll('.lang-option');
    const currentFlag = document.getElementById('currentFlag');
    const currentLangLabel = document.getElementById('currentLangLabel');
    
    const savedLang = localStorage.getItem('language') || 'en';
    applyLanguage(savedLang);
    updateLanguageButton(savedLang);
    
    if (langBtn) {
        langBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            langDropdown.classList.toggle('open');
        });
    }
    
    langOptions.forEach(option => {
        option.addEventListener('click', () => {
            const lang = option.dataset.lang;
            const flag = option.dataset.flag;
            const label = option.dataset.label;
            
            localStorage.setItem('language', lang);
            applyLanguage(lang);
            
            if (currentFlag) currentFlag.textContent = flag;
            if (currentLangLabel) currentLangLabel.textContent = label;
            
            langDropdown.classList.remove('open');
        });
    });
    
    document.addEventListener('click', (e) => {
        if (!langBtn?.contains(e.target) && !langDropdown?.contains(e.target)) {
            langDropdown?.classList.remove('open');
        }
    });
}

function applyLanguage(lang) {
    if (!translations[lang]) {
        console.warn(`Langue ${lang} non trouvée, utilisation du français`);
        lang = 'fr';
    }
    
    const texts = translations[lang];
    
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        if (texts[key]) {
            element.innerHTML = texts[key];
        }
    });
    
    document.querySelectorAll('[data-i18n-ph]').forEach(element => {
        const key = element.getAttribute('data-i18n-ph');
        if (texts[key]) {
            element.placeholder = texts[key];
        }
    });
    
    document.documentElement.lang = lang;
    
    if (lang === 'ar') {
        document.documentElement.dir = 'rtl';
        document.body.style.textAlign = 'right';
    } else {
        document.documentElement.dir = 'ltr';
        document.body.style.textAlign = 'left';
    }
    
    console.log(`🌐 Langue changée: ${lang}`);
}

function updateLanguageButton(lang) {
    const currentFlag = document.getElementById('currentFlag');
    const currentLangLabel = document.getElementById('currentLangLabel');
    
    const langMap = {
        en: { flag: '🇬🇧', label: 'EN' },
        fr: { flag: '🇫🇷', label: 'FR' },
        ar: { flag: '🇲🇦', label: 'AR' },
        es: { flag: '🇪🇸', label: 'ES' }
    };
    
    if (currentFlag && langMap[lang]) {
        currentFlag.textContent = langMap[lang].flag;
    }
    
    if (currentLangLabel && langMap[lang]) {
        currentLangLabel.textContent = langMap[lang].label;
    }
}

// ========================================
// CHARGEMENT DES MÉDECINS DEPUIS LA BDD
// ========================================
async function loadDoctorsFromDatabase() {
    console.log("🔄 Chargement des médecins depuis la base de données...");
    
    const container = document.getElementById('doctorsGrid');
    if (!container) {
        console.error("❌ Container #doctorsGrid introuvable");
        return;
    }

    container.innerHTML = `
        <div class="loading-state">
            <div class="spinner"></div>
            <p data-i18n="loading_docs">Chargement des médecins...</p>
        </div>
    `;
    
    try {
        const response = await fetch(`${API_URL}/doctors/approved`);
        
        if (!response.ok) {
            throw new Error(`Erreur HTTP: ${response.status}`);
        }
        
        const doctors = await response.json();
        console.log(`✅ ${doctors.length} médecins chargés depuis la BDD`);
        
        allDoctors = doctors;
        filteredDoctors = [...doctors];
        
        if (doctors.length === 0) {
            container.innerHTML = `
                <div class="loading-state">
                    <p>Aucun médecin disponible pour le moment</p>
                </div>
            `;
        } else {
            displayDoctors(doctors);
        }
        
        updateDoctorsCounter();
        
    } catch (error) {
        console.error('❌ Erreur chargement médecins:', error);
        
        container.innerHTML = `
            <div class="loading-state">
                <i class="fas fa-exclamation-circle" style="font-size: 40px; color: #ef4444; margin-bottom: 16px;"></i>
                <p>Erreur de chargement des médecins</p>
                <button onclick="loadDoctorsFromDatabase()" class="btn-outline" style="margin-top: 16px;">
                    <i class="fas fa-sync-alt"></i> Réessayer
                </button>
            </div>
        `;
    }
}

// ========================================
// AFFICHAGE DES MÉDECINS
// ========================================
function displayDoctors(doctors) {
    console.log("📋 Affichage de", doctors.length, "médecins");
    
    const container = document.getElementById('doctorsGrid');
    
    if (!container) {
        console.error("❌ Container #doctorsGrid introuvable!");
        return;
    }
    
    if (!doctors || doctors.length === 0) {
        container.innerHTML = '<div class="loading-state">Aucun médecin disponible</div>';
        return;
    }
    
    let html = '';
    
    doctors.forEach(doctor => {
        const rating = doctor.avg_rating || doctor.rating || 4.5;
        let stars = '';
        for (let i = 1; i <= 5; i++) {
            if (i <= Math.floor(rating)) {
                stars += '<i class="fas fa-star" style="color: #fbbf24;"></i>';
            } else if (i === Math.ceil(rating) && !Number.isInteger(rating)) {
                stars += '<i class="fas fa-star-half-alt" style="color: #fbbf24;"></i>';
            } else {
                stars += '<i class="far fa-star" style="color: #fbbf24;"></i>';
            }
        }
        
        const specialtyIcon = getSpecialtyIcon(doctor.specialty);
        const initials = doctor.initials || getInitials(doctor.full_name);
        const price = doctor.consultation_price || 250;
        
        html += `
            <div class="doctor-card" data-doctor-id="${doctor.user_id}">
                <div class="doctor-avatar">
                    ${doctor.profile_photo 
                        ? `<img src="${doctor.profile_photo}" alt="${doctor.full_name}">` 
                        : `<span>${initials}</span>`
                    }
                </div>
                
                <h3>${doctor.full_name || 'Dr. Non renseigné'}</h3>
                
                <p class="doctor-specialty">
                    <i class="${specialtyIcon}"></i> ${doctor.specialty || 'Médecin généraliste'}
                </p>
                
                <p class="doctor-location">
                    <i class="fas fa-map-marker-alt"></i> ${doctor.location || 'Non renseigné'}
                </p>
                
                <div class="doctor-rating">
                    ${stars}
                    <span style="margin-left: 5px; font-size: 13px;">(${doctor.total_reviews || 0})</span>
                </div>
                
                <div class="doctor-price">
                    ${price} Dhs
                </div>
                
                <button class="btn-primary" onclick="showDoctorFullProfile(${doctor.user_id})">
                    <i class="fas fa-user-md"></i> Voir le profil
                </button>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// ========================================
// PROFIL DÉTAILLÉ DU MÉDECIN
// ========================================
async function showDoctorFullProfile(doctorUserId) {
    try {
        console.log(`📥 Chargement du profil médecin ${doctorUserId}...`);
        
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.id = 'doctorProfileModal';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-box" style="text-align: center; padding: 40px;">
                <div class="spinner" style="margin: 0 auto 20px;"></div>
                <p>Chargement du profil médecin...</p>
            </div>
        `;
        document.body.appendChild(modal);
        document.body.style.overflow = 'hidden';
        
        const response = await fetch(`${API_URL}/doctors/${doctorUserId}/profile`);
        
        if (!response.ok) {
            throw new Error('Erreur chargement médecin');
        }
        
        const doctor = await response.json();
        
        document.body.removeChild(modal);
        displayDoctorProfileModal(doctor);
        
    } catch (error) {
        console.error('❌ Erreur affichage profil:', error);
        
        const modal = document.getElementById('doctorProfileModal');
        if (modal) {
            document.body.removeChild(modal);
            document.body.style.overflow = 'auto';
        }
        
        showNotification('Erreur lors du chargement du profil médecin', 'error');
    }
}

function displayDoctorProfileModal(doctor) {
    console.log("📋 Affichage profil médecin:", doctor);
    
    const initials = getInitials(doctor.full_name);
    
    const rating = doctor.rating || 4.5;
    let stars = '';
    for (let i = 1; i <= 5; i++) {
        if (i <= Math.floor(rating)) {
            stars += '<i class="fas fa-star" style="color: #fbbf24;"></i>';
        } else if (i === Math.ceil(rating) && !Number.isInteger(rating)) {
            stars += '<i class="fas fa-star-half-alt" style="color: #fbbf24;"></i>';
        } else {
            stars += '<i class="far fa-star" style="color: #fbbf24;"></i>';
        }
    }
    
    const avatarContent = doctor.profile_photo 
        ? `<img src="${doctor.profile_photo}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`
        : `<span style="font-size: 48px;">${initials}</span>`;
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'doctorProfileModal';
    modal.style.display = 'flex';
    
    modal.innerHTML = `
        <div class="modal-box modal-box--large" style="max-width: 900px; padding: 0; overflow: hidden;">
            <button class="modal-close" onclick="closeDoctorProfileModal()">&times;</button>
            
            <div style="display: grid; grid-template-columns: 350px 1fr; max-height: 80vh; overflow-y: auto;">
                <div style="
                    background: linear-gradient(135deg, var(--accent), var(--accent-dark));
                    color: white;
                    padding: 40px 30px;
                    text-align: center;
                ">
                    <div style="
                        width: 140px;
                        height: 140px;
                        background: white;
                        border-radius: 50%;
                        margin: 0 auto 20px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 56px;
                        font-weight: bold;
                        color: var(--accent);
                        overflow: hidden;
                        border: 4px solid rgba(255,255,255,0.3);
                    ">
                        ${avatarContent}
                    </div>
                    
                    <h2 style="font-size: 26px; margin-bottom: 8px; color: white;">${doctor.full_name}</h2>
                    
                    <div style="
                        background: rgba(255,255,255,0.2);
                        display: inline-block;
                        padding: 8px 24px;
                        border-radius: 30px;
                        margin-bottom: 20px;
                        font-weight: 600;
                    ">
                        <i class="fas fa-stethoscope"></i> ${doctor.specialty || 'Médecin'}
                    </div>
                    
                    <div style="margin-bottom: 30px;">
                        <div style="display: flex; align-items: center; justify-content: center; gap: 5px; margin-bottom: 15px;">
                            <div style="display: flex; gap: 3px;">${stars}</div>
                            <span style="font-weight: 600; margin-left: 5px;">${rating.toFixed(1)}</span>
                        </div>
                        
                        <p style="margin-bottom: 10px;">
                            <i class="fas fa-map-marker-alt"></i> ${doctor.location || 'Non renseigné'}
                        </p>
                        
                        <p style="margin-bottom: 10px;">
                            <i class="fas fa-briefcase"></i> ${doctor.experience || 'Expérience non renseignée'}
                        </p>
                        
                        <p style="margin-bottom: 10px;">
                            <i class="fas fa-user-friends"></i> ${doctor.patient_count || 0} patients
                        </p>
                    </div>
                    
                    <div style="
                        background: rgba(255,255,255,0.1);
                        border-radius: 16px;
                        padding: 20px;
                        margin-bottom: 20px;
                    ">
                        <div style="font-size: 14px; opacity: 0.9; margin-bottom: 5px;">Prix de la consultation</div>
                        <div style="font-size: 36px; font-weight: 700;">${doctor.consultation_price || 250} Dhs</div>
                    </div>
                    
                    <button onclick="takeAppointment(${doctor.user_id})" style="
                        background: white;
                        color: var(--accent);
                        border: none;
                        padding: 16px 30px;
                        border-radius: 30px;
                        font-size: 16px;
                        font-weight: 700;
                        cursor: pointer;
                        width: 100%;
                        transition: all 0.3s;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 10px;
                    "
                    onmouseover="this.style.background='#eaf6f2'; this.style.transform='translateY(-2px)'"
                    onmouseout="this.style.background='white'; this.style.transform='translateY(0)'"
                    >
                        <i class="fas fa-calendar-check"></i> Prendre rendez-vous
                    </button>
                </div>
                
                <div style="padding: 40px; background: var(--bg-card);">
                    <h3 style="color: var(--text); margin-bottom: 20px; display: flex; align-items: center; gap: 10px;">
                        <i class="fas fa-graduation-cap" style="color: var(--accent);"></i> Diplômes et formation
                    </h3>
                    
                    <div style="
                        background: var(--bg-2);
                        padding: 20px;
                        border-radius: 12px;
                        margin-bottom: 30px;
                        white-space: pre-line;
                        line-height: 1.6;
                        color: var(--text);
                    ">
                        ${doctor.diplomas || 'Non renseigné'}
                    </div>
                    
                    <h3 style="color: var(--text); margin-bottom: 20px; display: flex; align-items: center; gap: 10px;">
                        <i class="fas fa-user-md" style="color: var(--accent);"></i> À propos
                    </h3>
                    
                    <div style="
                        background: var(--bg-2);
                        padding: 20px;
                        border-radius: 12px;
                        margin-bottom: 30px;
                        line-height: 1.6;
                        color: var(--text);
                    ">
                        ${doctor.bio || 'Aucune description disponible'}
                    </div>
                    
                    <h3 style="color: var(--text); margin-bottom: 20px; display: flex; align-items: center; gap: 10px;">
                        <i class="fas fa-phone-alt" style="color: var(--accent);"></i> Contact
                    </h3>
                    
                    <div style="
                        background: var(--bg-2);
                        padding: 20px;
                        border-radius: 12px;
                    ">
                        <p style="margin-bottom: 10px;">
                            <i class="fas fa-phone" style="color: var(--accent); width: 20px;"></i> 
                            ${doctor.phone || 'Non renseigné'}
                        </p>
                        <p style="margin-bottom: 10px;">
                            <i class="fas fa-envelope" style="color: var(--accent); width: 20px;"></i> 
                            ${doctor.email || 'Non renseigné'}
                        </p>
                        <p style="margin-bottom: 10px;">
                            <i class="fas fa-map-marker-alt" style="color: var(--accent); width: 20px;"></i> 
                            ${doctor.address || doctor.location || 'Non renseigné'}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
}

function closeDoctorProfileModal() {
    const modal = document.getElementById('doctorProfileModal');
    if (modal) {
        modal.remove();
        document.body.style.overflow = 'auto';
    }
}

// ========================================
// PRENDRE RENDEZ-VOUS
// ========================================
async function takeAppointment(doctorId) {
    const user = JSON.parse(localStorage.getItem('user'));
    
    if (!user) {
        showNotification('Veuillez vous connecter pour prendre un rendez-vous', 'error');
        setTimeout(() => {
            window.location.href = 'connexionpage.html';
        }, 2000);
        return;
    }
    
    if (user.role !== 'patient') {
        showNotification('Seuls les patients peuvent prendre rendez-vous', 'error');
        return;
    }
    
    closeDoctorProfileModal();
    openAppointmentBookingModal(doctorId);
}

// ========================================
// AVIS
// ========================================
function initReviews() {
    const starPicker = document.getElementById('starPicker');
    const ratingValue = document.getElementById('ratingValue');
    const reviewForm = document.getElementById('reviewForm');
    const reviewText = document.getElementById('reviewText');
    const charCount = document.getElementById('charCount');
    
    if (starPicker) {
        const stars = starPicker.querySelectorAll('span');
        
        stars.forEach(star => {
            star.addEventListener('click', function () {
                const val = parseInt(this.dataset.v);
                ratingValue.value = val;
                
                stars.forEach(s => s.classList.remove('lit'));
                for (let i = 5; i >= 6 - val; i--) {
                    if (stars[i]) stars[i].classList.add('lit');
                }
            });
            
            star.addEventListener('mouseover', function () {
                const val = parseInt(this.dataset.v);
                stars.forEach(s => s.classList.remove('hover'));
                for (let i = 5; i >= 6 - val; i--) {
                    if (stars[i]) stars[i].classList.add('hover');
                }
            });
            
            star.addEventListener('mouseout', function () {
                stars.forEach(s => s.classList.remove('hover'));
            });
        });
    }
    
    if (reviewText && charCount) {
        reviewText.addEventListener('input', function() {
            const count = this.value.length;
            charCount.textContent = count;
            
            if (count > 500) {
                this.value = this.value.substring(0, 500);
                charCount.textContent = 500;
            }
        });
    }
    
    if (reviewForm) {
        reviewForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const submitBtn = document.getElementById('submitReviewBtn');
            if (!submitBtn) return;
            
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Publication...';
            
            const name = document.getElementById('reviewName')?.value.trim();
            const rating = parseInt(document.getElementById('ratingValue')?.value);
            const text = document.getElementById('reviewText')?.value.trim();
            
            if (!rating) {
                showNotification('Veuillez sélectionner une note !', 'error');
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Publier';
                return;
            }
            
            if (!name || !text) {
                showNotification('Veuillez remplir tous les champs obligatoires', 'error');
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Publier';
                return;
            }
            
            setTimeout(() => {
                const newReview = createReviewCard(name, rating, text);
                
                const carousel = document.querySelector('.reviews-carousel');
                if (carousel) {
                    carousel.insertBefore(newReview, carousel.firstChild);
                    
                    newReview.style.animation = 'highlight 2s ease';
                    setTimeout(() => {
                        newReview.style.animation = '';
                    }, 2000);
                }
                
                reviewForm.reset();
                document.getElementById('reviewAvatarPreview').textContent = 'JD';
                if (charCount) charCount.textContent = '0';
                
                submitBtn.innerHTML = '<i class="fas fa-check"></i> Publié !';
                
                setTimeout(() => {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Publier';
                }, 2000);
                
                closeModal('reviewModal');
                
                showNotification('Merci pour votre avis !', 'success');
            }, 1500);
        });
    }
}

function createReviewCard(name, rating, text) {
    const reviewCard = document.createElement('div');
    reviewCard.className = 'review-card';
    
    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
    const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);
    const date = new Date().toLocaleDateString('fr-FR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    
    reviewCard.innerHTML = `
        <div class="review-stars">${stars}</div>
        <p class="review-body">"${text}"</p>
        <div class="review-author">
            <div class="review-avatar">${initials}</div>
            <div>
                <strong>${name}</strong>
                <span>${date}</span>
            </div>
        </div>
    `;
    
    return reviewCard;
}

function updateReviewInitials(name) {
    const preview = document.getElementById('reviewAvatarPreview');
    if (preview) {
        if (name && name.trim()) {
            const nameParts = name.trim().split(' ');
            let initials = nameParts[0].charAt(0).toUpperCase();
            if (nameParts.length > 1) {
                initials += nameParts[nameParts.length - 1].charAt(0).toUpperCase();
            } else {
                initials = nameParts[0].substring(0, 2).toUpperCase();
            }
            preview.textContent = initials;
        } else {
            preview.textContent = 'JD';
        }
    }
}

// ========================================
// NOTIFICATIONS
// ========================================
function showNotification(message, type = 'info') {
    const oldNotif = document.querySelector('.toast');
    if (oldNotif) oldNotif.remove();

    const notification = document.createElement('div');
    notification.className = `toast ${type}`;
    
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        info: 'fa-info-circle'
    };
    
    notification.innerHTML = `
        <i class="fas ${icons[type] || icons.info}"></i>
        <span>${message}</span>
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// ========================================
// AUTH (LOGIN / SIGNUP)
// ========================================
function initAuth() {
    const signupForm = document.getElementById("signupForm");
    const loginForm = document.getElementById("loginForm");

    async function submitForm(form, endpoint, successMsg) {
        form.addEventListener("submit", async e => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(form).entries());
            try {
                const res = await fetch(`${API_URL}/${endpoint}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(data)
                });
                const result = await res.json();
                if(res.ok){
                    showNotification(successMsg, 'success');
                    if (endpoint === 'login') {
                        localStorage.setItem('user', JSON.stringify(result.user));
                        localStorage.setItem('token', result.token);
                        loadUserHeader();
                        
                        if (result.user.role === 'doctor') {
                            window.location.href = 'doctor-dashboard.html';
                        } else {
                            window.location.href = 'index.html';
                        }
                    }
                    document.getElementById("loginTab")?.click();
                } else {
                    showNotification(result.detail || "Erreur réseau", 'error');
                }
            } catch(err){ 
                console.error(err); 
                showNotification("Erreur réseau", 'error');
            }
        });
    }

    if(signupForm) submitForm(signupForm, "register", "Compte créé ! Connectez-vous.");
    if(loginForm) submitForm(loginForm, "login", "Connecté !");
}

// ========================================
// HEADER UTILISATEUR
// ========================================
function loadUserHeader() {
    const userProfile = document.getElementById("userProfile");
    const authButtons = document.getElementById("authButtons");
    
    const user = JSON.parse(localStorage.getItem("user"));
    
    console.log("👤 Chargement du header pour:", user);

    if (!user || !user.id) {
        console.log("👤 Aucun utilisateur connecté");
        if (userProfile) userProfile.style.display = "none";
        if (authButtons) authButtons.style.display = "flex";
        return;
    }

    if (authButtons) authButtons.style.display = "none";
    if (userProfile) userProfile.style.display = "block";

    let initials = "JD";
    if (user.full_name) {
        const nameParts = user.full_name.trim().split(' ');
        if (nameParts.length >= 2) {
            initials = (nameParts[0][0] + nameParts[nameParts.length-1][0]).toUpperCase();
        } else if (nameParts.length === 1) {
            initials = nameParts[0].substring(0, 2).toUpperCase();
        }
    } else if (user.email) {
        initials = user.email.substring(0, 2).toUpperCase();
    }

    const photoHTML = user.profile_photo 
        ? `<img src="${user.profile_photo}" alt="Photo de profil" class="profile-photo">`
        : `<div class="profile-initials">${initials}</div>`;

    userProfile.innerHTML = `
        <div class="profile-menu" id="profileMenu">
            <div class="profile-trigger" id="profileTrigger">
                <div class="profile-avatar">
                    ${photoHTML}
                </div>
                <span class="profile-name">${user.full_name ? user.full_name.split(' ')[0] : 'Utilisateur'}</span>
                <i class="fas fa-chevron-down"></i>
            </div>
            
            <div class="profile-dropdown" id="profileDropdown">
                <div class="dropdown-header">
                    <div class="dropdown-avatar">
                        ${photoHTML}
                    </div>
                    <div class="dropdown-info">
                        <div class="dropdown-name">${user.full_name || 'Utilisateur'}</div>
                        <div class="dropdown-email">${user.email || ''}</div>
                        <span class="dropdown-role">${user.role === 'doctor' ? 'Médecin' : 'Patient'}</span>
                    </div>
                </div>
                
                <div class="dropdown-divider"></div>
                
                <a href="#" class="dropdown-item" id="profileLink">
                    <i class="fas fa-user"></i>
                    <span>Mon profil</span>
                </a>
                
                <a href="#" class="dropdown-item" id="appointmentsLink">
                    <i class="fas fa-calendar-check"></i>
                    <span>Mes rendez-vous</span>
                </a>
                
                <a href="#" class="dropdown-item" id="settingsLink">
                    <i class="fas fa-cog"></i>
                    <span>Paramètres</span>
                </a>
                
                <div class="dropdown-divider"></div>
                
                <a href="#" class="dropdown-item logout" id="logoutLink">
                    <i class="fas fa-sign-out-alt"></i>
                    <span>Déconnexion</span>
                </a>
            </div>
        </div>
    `;

    initProfileDropdown();
}

function initProfileDropdown() {
    const profileMenu = document.getElementById('profileMenu');
    const profileTrigger = document.getElementById('profileTrigger');
    
    if (!profileTrigger || !profileMenu) return;
    
    profileTrigger.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        profileMenu.classList.toggle('active');
    });
    
    document.addEventListener('click', function(e) {
        if (!profileMenu.contains(e.target)) {
            profileMenu.classList.remove('active');
        }
    });
    
    const logoutLink = document.getElementById('logoutLink');
    if (logoutLink) {
        logoutLink.addEventListener('click', function(e) {
            e.preventDefault();
            logout();
        });
    }
    
    const profileLink = document.getElementById('profileLink');
    if (profileLink) {
        profileLink.addEventListener('click', function(e) {
            e.preventDefault();
            const user = JSON.parse(localStorage.getItem('user'));
            if (user?.role === 'doctor') {
                window.location.href = 'doctor-dashboard.html';
            } else {
                openModal('patientProfileModal');
            }
            profileMenu.classList.remove('active');
        });
    }
    
    const appointmentsLink = document.getElementById('appointmentsLink');
    if (appointmentsLink) {
        appointmentsLink.addEventListener('click', function(e) {
            e.preventDefault();
            window.location.href = 'patients.html';
            profileMenu.classList.remove('active');
        });
    }
    
    const settingsLink = document.getElementById('settingsLink');
    if (settingsLink) {
        settingsLink.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            profileMenu.classList.remove('active');
            showSettings();
        });
    }
}

function logout() {
    localStorage.clear();
    sessionStorage.clear();
    showNotification('Déconnexion réussie', 'success');
    setTimeout(() => {
        window.location.href = 'index.html';
    }, 1000);
}

// ========================================
// FONCTIONS UTILITAIRES
// ========================================
function getInitials(name) {
    if (!name) return 'DR';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
}

function getSpecialtyIcon(specialty) {
    if (!specialty) return 'fa-solid fa-stethoscope';
    specialty = specialty.toLowerCase();
    if (specialty.includes('cardio')) return 'fa-solid fa-heart-pulse';
    if (specialty.includes('neuro')) return 'fa-solid fa-brain';
    if (specialty.includes('pédiat') || specialty.includes('enfant')) return 'fa-solid fa-child';
    if (specialty.includes('général')) return 'fa-solid fa-stethoscope';
    if (specialty.includes('dermato')) return 'fa-solid fa-allergies';
    if (specialty.includes('ophtalmo')) return 'fa-solid fa-eye';
    if (specialty.includes('gynéco')) return 'fa-solid fa-venus';
    return 'fa-solid fa-stethoscope';
}

function updateDoctorsCounter() {
    const counter = document.getElementById('doctorsCount');
    if (counter) counter.textContent = allDoctors.length;
}

// ========================================
// CONVERSION FICHIER EN BASE64
// ========================================
function convertFileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

// ========================================
// SAUVEGARDE DU PROFIL (CORRIGÉ)
// ========================================
async function saveProfileSettings() {
    const user = JSON.parse(localStorage.getItem('user'));
    
    if (!user || !user.id) {
        showNotification('Utilisateur non connecté', 'error');
        return;
    }
    
    // Récupérer les données du formulaire
    const fullName = document.getElementById('settingsFullName')?.value;
    const email = document.getElementById('settingsEmail')?.value;
    const phone = document.getElementById('settingsPhone')?.value;
    const address = document.getElementById('settingsAddress')?.value;
    
    // Récupérer la photo si elle existe
    const photoInput = document.getElementById('patientPhoto');
    let photoBase64 = document.getElementById('patientPhotoBase64')?.value;
    
    // Si un nouveau fichier photo est sélectionné
    if (photoInput && photoInput.files && photoInput.files[0]) {
        try {
            photoBase64 = await convertFileToBase64(photoInput.files[0]);
        } catch (error) {
            console.error('Erreur conversion photo:', error);
            showNotification('Erreur lors du traitement de la photo', 'error');
            return;
        }
    }
    
    // Préparer les données à envoyer
    const updateData = {
        full_name: fullName || user.full_name,
        email: email || user.email,
        phone: phone || user.phone,
        address: address || user.address
    };
    
    // Ajouter la photo si elle existe
    if (photoBase64) {
        updateData.profile_photo = photoBase64;
    }
    
    console.log('📤 Envoi des données de mise à jour:', updateData);
    
    // Afficher le loader
    showLoading('Mise à jour du profil...');
    
    try {
        const token = localStorage.getItem('token');
        
        const response = await fetch(`${API_URL}/users/${user.id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token ? `Bearer ${token}` : ''
            },
            body: JSON.stringify(updateData)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            // Mettre à jour le localStorage
            const updatedUser = {
                ...user,
                ...updateData
            };
            
            localStorage.setItem('user', JSON.stringify(updatedUser));
            
            hideLoading();
            showNotification('✅ Profil mis à jour avec succès !', 'success');
            
            // Mettre à jour l'affichage du header
            loadUserHeader();
            
            // Fermer le modal des paramètres
            setTimeout(() => {
                closeSettingsModal();
            }, 1500);
            
        } else {
            hideLoading();
            showNotification(result.detail || 'Erreur lors de la mise à jour', 'error');
        }
        
    } catch (error) {
        console.error('❌ Erreur mise à jour profil:', error);
        hideLoading();
        showNotification('Erreur de connexion au serveur', 'error');
    }
}

// ========================================
// APERÇU DE LA PHOTO (AMÉLIORÉ)
// ========================================
function previewPatientPhoto(input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        
        // Vérifier la taille du fichier (max 2MB)
        if (file.size > 2 * 1024 * 1024) {
            showNotification('La photo ne doit pas dépasser 2MB', 'error');
            input.value = '';
            return;
        }
        
        // Vérifier le type de fichier
        if (!file.type.match('image.*')) {
            showNotification('Veuillez sélectionner une image valide', 'error');
            input.value = '';
            return;
        }
        
        const reader = new FileReader();
        
        reader.onload = function(e) {
            const preview = document.getElementById('patientPhotoPreview');
            if (preview) {
                preview.innerHTML = `<img src="${e.target.result}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
            }
            
            // Sauvegarder dans le champ caché
            const photoBase64 = document.getElementById('patientPhotoBase64');
            if (photoBase64) {
                photoBase64.value = e.target.result;
            }
            
            // Afficher un message de succès
            showNotification('Photo chargée avec succès', 'success');
        };
        
        reader.onerror = function() {
            showNotification('Erreur lors du chargement de la photo', 'error');
        };
        
        reader.readAsDataURL(file);
    }
}

// ========================================
// PARAMÈTRES
// ========================================
function showSettings() {
    console.log("🚀 Ouverture des paramètres");
    
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) {
        showNotification("Veuillez vous connecter d'abord", 'error');
        window.location.href = 'connexionpage.html';
        return;
    }

    const settingsModal = document.createElement('div');
    settingsModal.className = 'modal-overlay';
    settingsModal.id = 'settingsModal';
    settingsModal.style.display = 'flex';
    
    settingsModal.innerHTML = `
        <div class="modal-box modal-box--large">
            <button class="modal-close" onclick="closeSettingsModal()">&times;</button>
            <h2><i class="fas fa-cog"></i> Paramètres</h2>
            
            <div style="display: grid; grid-template-columns: 200px 1fr; gap: 30px; margin-top: 20px;">
                <div style="border-right: 1px solid var(--border); padding-right: 20px;">
                    <div class="settings-tabs" style="display: flex; flex-direction: column; gap: 5px;">
                        <button class="settings-tab active" data-tab="profile" style="
                            padding: 12px 16px;
                            border: none;
                            background: var(--accent-light);
                            text-align: left;
                            border-radius: 8px;
                            cursor: pointer;
                            color: var(--accent);
                            font-weight: 500;
                        ">
                            <i class="fas fa-user"></i> Profil
                        </button>
                        <button class="settings-tab" data-tab="notifications" style="
                            padding: 12px 16px;
                            border: none;
                            background: none;
                            text-align: left;
                            border-radius: 8px;
                            cursor: pointer;
                            color: var(--text-2);
                            font-weight: 500;
                        ">
                            <i class="fas fa-bell"></i> Notifications
                        </button>
                        <button class="settings-tab" data-tab="security" style="
                            padding: 12px 16px;
                            border: none;
                            background: none;
                            text-align: left;
                            border-radius: 8px;
                            cursor: pointer;
                            color: var(--text-2);
                            font-weight: 500;
                        ">
                            <i class="fas fa-lock"></i> Sécurité
                        </button>
                        <button class="settings-tab" data-tab="appearance" style="
                            padding: 12px 16px;
                            border: none;
                            background: none;
                            text-align: left;
                            border-radius: 8px;
                            cursor: pointer;
                            color: var(--text-2);
                            font-weight: 500;
                        ">
                            <i class="fas fa-palette"></i> Apparence
                        </button>
                    </div>
                </div>

                <div class="settings-content">
                    <div class="settings-pane active" id="tab-profile">
                        <h3>Informations personnelles</h3>
                        
                        <div class="settings-form" style="margin-top: 20px;">
                            <div class="form-field">
                                <label>Photo de profil</label>
                                <div class="profile-photo-row" style="display: flex; align-items: center; gap: 15px; margin-bottom: 15px;">
                                    <div class="photo-preview-circle" id="patientPhotoPreview" style="width: 60px; height: 60px; border-radius: 50%; overflow: hidden; background: var(--bg-2); display: flex; align-items: center; justify-content: center;">
                                        ${user.profile_photo ? 
                                            `<img src="${user.profile_photo}" style="width: 100%; height: 100%; object-fit: cover;">` : 
                                            `<div id="patientPhotoInitials">${getInitials(user.full_name || user.email)}</div>`
                                        }
                                    </div>
                                    <div>
                                        <label for="patientPhoto" class="btn-outline" style="cursor:pointer; display:inline-block; margin-bottom:8px;">
                                            <i class="fas fa-camera"></i> Changer la photo
                                        </label>
                                        <input type="file" id="patientPhoto" accept="image/*" onchange="previewPatientPhoto(this)" style="display:none;">
                                        <input type="hidden" id="patientPhotoBase64" value="${user.profile_photo || ''}">
                                        <p style="font-size:12px; opacity:0.6;">JPG, PNG (max 2MB)</p>
                                    </div>
                                </div>
                            </div>

                            <div class="form-field">
                                <label>Nom complet</label>
                                <input type="text" id="settingsFullName" class="form-control" value="${user.full_name || ''}">
                            </div>

                            <div class="form-field">
                                <label>Email</label>
                                <input type="email" id="settingsEmail" class="form-control" value="${user.email || ''}">
                            </div>

                            <div class="form-field">
                                <label>Téléphone</label>
                                <input type="tel" id="settingsPhone" class="form-control" value="${user.phone || ''}">
                            </div>

                            <div class="form-field">
                                <label>Adresse</label>
                                <input type="text" id="settingsAddress" class="form-control" value="${user.address || ''}">
                            </div>

                            <button class="btn-primary" onclick="saveProfileSettings()" style="margin-top: 10px;">
                                <i class="fas fa-save"></i> Enregistrer
                            </button>
                        </div>
                    </div>

                    <div class="settings-pane" id="tab-notifications" style="display: none;">
                        <h3>Préférences de notifications</h3>
                        
                        <div style="margin-top: 20px;">
                            <div class="form-field" style="display: flex; align-items: center; justify-content: space-between;">
                                <label>Notifications par email</label>
                                <input type="checkbox" id="notifEmail" checked style="width: auto;">
                            </div>

                            <div class="form-field" style="display: flex; align-items: center; justify-content: space-between;">
                                <label>Rappels de rendez-vous</label>
                                <input type="checkbox" id="notifAppointments" checked style="width: auto;">
                            </div>

                            <div class="form-field" style="display: flex; align-items: center; justify-content: space-between;">
                                <label>Newsletter</label>
                                <input type="checkbox" id="notifNewsletter" style="width: auto;">
                            </div>

                            <button class="btn-primary" onclick="saveNotificationSettings()" style="margin-top: 20px;">
                                <i class="fas fa-save"></i> Enregistrer
                            </button>
                        </div>
                    </div>

                    <div class="settings-pane" id="tab-security" style="display: none;">
                        <h3>Sécurité</h3>
                        
                        <div style="margin-top: 20px;">
                            <h4>Changer le mot de passe</h4>
                            
                            <div class="form-field">
                                <label>Mot de passe actuel</label>
                                <input type="password" id="currentPassword" class="form-control">
                            </div>

                            <div class="form-field">
                                <label>Nouveau mot de passe</label>
                                <input type="password" id="newPassword" class="form-control">
                            </div>

                            <div class="form-field">
                                <label>Confirmer le mot de passe</label>
                                <input type="password" id="confirmPassword" class="form-control">
                            </div>

                            <button class="btn-primary" onclick="changePassword()">
                                <i class="fas fa-key"></i> Changer le mot de passe
                            </button>
                        </div>
                    </div>

                    <div class="settings-pane" id="tab-appearance" style="display: none;">
                        <h3>Apparence</h3>
                        
                        <div style="margin-top: 20px;">
                            <h4>Thème</h4>
                            <div style="display: flex; gap: 20px; margin-top: 10px;">
                                <div onclick="setTheme('light')" style="cursor: pointer; text-align: center;">
                                    <div style="width: 60px; height: 60px; background: #f5f5f5; border-radius: 12px; border: 2px solid ${getCurrentTheme() === 'light' ? 'var(--accent)' : 'transparent'};"></div>
                                    <span style="font-size: 12px;">Clair</span>
                                </div>
                                <div onclick="setTheme('dark')" style="cursor: pointer; text-align: center;">
                                    <div style="width: 60px; height: 60px; background: #1a1a1a; border-radius: 12px; border: 2px solid ${getCurrentTheme() === 'dark' ? 'var(--accent)' : 'transparent'};"></div>
                                    <span style="font-size: 12px;">Sombre</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="modal-actions" style="margin-top: 30px; border-top: 1px solid var(--border); padding-top: 20px;">
                <button class="btn-outline" onclick="closeSettingsModal()">Fermer</button>
            </div>
        </div>
    `;

    document.body.appendChild(settingsModal);
    document.body.style.overflow = 'hidden';
    
    initSettingsTabs();
}

function getCurrentTheme() {
    return document.documentElement.getAttribute('data-theme') || 'light';
}

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('parrotTheme', theme);
    
    const options = document.querySelectorAll('[onclick^="setTheme"]');
    options.forEach(opt => {
        const div = opt.querySelector('div');
        if (div) {
            div.style.border = '2px solid transparent';
        }
    });
    
    const selectedOption = Array.from(options).find(opt => opt.getAttribute('onclick').includes(theme));
    if (selectedOption) {
        const div = selectedOption.querySelector('div');
        if (div) {
            div.style.border = '2px solid var(--accent)';
        }
    }
    
    showNotification(`Thème ${theme === 'light' ? 'clair' : 'sombre'} activé`, 'success');
}

function initSettingsTabs() {
    const tabs = document.querySelectorAll('.settings-tab');
    const panes = document.querySelectorAll('.settings-pane');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => {
                t.style.background = 'none';
                t.style.color = 'var(--text-2)';
            });
            tab.style.background = 'var(--accent-light)';
            tab.style.color = 'var(--accent)';

            panes.forEach(p => p.style.display = 'none');
            const tabId = `tab-${tab.dataset.tab}`;
            document.getElementById(tabId).style.display = 'block';
        });
    });
}

function closeSettingsModal() {
    const modal = document.getElementById('settingsModal');
    if (modal) {
        modal.remove();
        document.body.style.overflow = 'auto';
    }
}

function saveNotificationSettings() {
    const settings = {
        email: document.getElementById('notifEmail')?.checked,
        appointments: document.getElementById('notifAppointments')?.checked,
        newsletter: document.getElementById('notifNewsletter')?.checked
    };
    
    localStorage.setItem('notification_settings', JSON.stringify(settings));
    showNotification('Préférences de notifications sauvegardées', 'success');
}

function changePassword() {
    const current = document.getElementById('currentPassword')?.value;
    const newPass = document.getElementById('newPassword')?.value;
    const confirm = document.getElementById('confirmPassword')?.value;

    if (!current || !newPass || !confirm) {
        showNotification('Veuillez remplir tous les champs', 'error');
        return;
    }

    if (newPass !== confirm) {
        showNotification('Les mots de passe ne correspondent pas', 'error');
        return;
    }

    if (newPass.length < 6) {
        showNotification('Le mot de passe doit contenir au moins 6 caractères', 'error');
        return;
    }

    showNotification('Mot de passe modifié avec succès !', 'success');
    
    document.getElementById('currentPassword').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';
}

// ========================================
// PROFIL PATIENT
// ========================================
function previewPatientPhoto(input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        
        // Vérifier la taille du fichier (max 2MB)
        if (file.size > 2 * 1024 * 1024) {
            showNotification('La photo ne doit pas dépasser 2MB', 'error');
            input.value = '';
            return;
        }
        
        // Vérifier le type de fichier
        if (!file.type.match('image.*')) {
            showNotification('Veuillez sélectionner une image valide', 'error');
            input.value = '';
            return;
        }
        
        const reader = new FileReader();
        
        reader.onload = function(e) {
            const preview = document.getElementById('patientPhotoPreview');
            if (preview) {
                preview.innerHTML = `<img src="${e.target.result}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
            }
            
            // Sauvegarder dans le champ caché
            const photoBase64 = document.getElementById('patientPhotoBase64');
            if (photoBase64) {
                photoBase64.value = e.target.result;
            }
            
            // Afficher un message de succès
            showNotification('Photo chargée avec succès', 'success');
        };
        
        reader.onerror = function() {
            showNotification('Erreur lors du chargement de la photo', 'error');
        };
        
        reader.readAsDataURL(file);
    }
}

// ========================================
// RENDEZ-VOUS (Patient Side)
// ========================================

/**
 * Book an appointment with a doctor
 * @param {number} doctorId - ID of the doctor
 * @param {string} date - Appointment date (YYYY-MM-DD)
 * @param {string} time - Appointment time (HH:MM)
 * @param {string} reason - Reason for appointment
 * @param {string} type - Type of consultation
 */
async function bookAppointment(doctorId, date, time, reason, type = 'consultation') {
    const user = JSON.parse(localStorage.getItem('user'));
    
    // Check if user is logged in
    if (!user) {
        showNotification('Veuillez vous connecter pour prendre un rendez-vous', 'error');
        setTimeout(() => {
            window.location.href = 'connexionpage.html';
        }, 2000);
        return false;
    }
    
    // Check if user is a patient
    if (user.role !== 'patient') {
        showNotification('Seuls les patients peuvent prendre rendez-vous', 'error');
        return false;
    }
    
    // Validate inputs
    if (!doctorId || !date || !time || !reason) {
        showNotification('Veuillez remplir tous les champs obligatoires', 'error');
        return false;
    }
    
    // Show loading
    showLoading('Création du rendez-vous...');
    
    try {
        const response = await fetch(`${API_URL}/appointments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                patient_id: user.id,
                doctor_id: doctorId,
                date: date,
                time: time,
                reason: reason,
                type: type
            })
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            hideLoading();
            showNotification('✅ Rendez-vous demandé avec succès ! Le médecin sera notifié.', 'success');
            
            // Create notification for doctor is handled by backend
            console.log('📅 Appointment created:', result);
            
            return true;
        } else {
            hideLoading();
            showNotification(result.detail || 'Erreur lors de la création du rendez-vous', 'error');
            return false;
        }
        
    } catch (error) {
        console.error('❌ Error booking appointment:', error);
        hideLoading();
        showNotification('Erreur de connexion au serveur', 'error');
        return false;
    }
}

/**
 * Get available time slots for a doctor on a specific date
 * @param {number} doctorId - ID of the doctor
 * @param {string} date - Date to check (YYYY-MM-DD)
 * @returns {Promise<Array>} - Array of available time slots
 */
async function getAvailableTimeSlots(doctorId, date) {
    console.log(`🔍 Récupération des créneaux pour Dr. ${doctorId} le ${date}`);
    
    try {
        const url = `${API_URL}/doctors/${doctorId}/appointments?date=${date}`;
        console.log('📡 URL appelée:', url);
        
        const response = await fetch(url);
        console.log('📡 Status réponse:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Erreur API - Status:', response.status);
            console.error('❌ Détails:', errorText);
            throw new Error(`Erreur ${response.status}: ${response.statusText}`);
        }
        
        const appointments = await response.json();
        console.log('📅 Rendez-vous reçus:', appointments);
        
        // Define all possible time slots (30 min intervals)
        const allTimeSlots = [
            '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
            '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00'
        ];
        
        // Get booked slots (pending or confirmed)
        const bookedSlots = appointments
            .filter(apt => apt.status === 'pending' || apt.status === 'confirmed')
            .map(apt => {
                // Ensure time is in HH:MM format
                const time = apt.time.substring(0, 5);
                console.log(`⏰ Créneau occupé: ${time} (${apt.status})`);
                return time;
            });
        
        console.log('🚫 Créneaux occupés:', bookedSlots);
        
        // Filter available slots
        const availableSlots = allTimeSlots.filter(slot => !bookedSlots.includes(slot));
        
        console.log('✅ Créneaux disponibles:', availableSlots);
        
        return availableSlots;
        
    } catch (error) {
        console.error('❌ Erreur détaillée:', error);
        showNotification('Erreur lors de la récupération des créneaux', 'error');
        return [];
    }
}

/**
 * Get patient's appointments
 * @param {number} patientId - ID of the patient
 * @returns {Promise<Array>} - Array of appointments
 */
async function getPatientAppointments(patientId) {
    try {
        const response = await fetch(`${API_URL}/patients/${patientId}/appointments`);
        
        if (!response.ok) {
            throw new Error('Erreur lors de la récupération des rendez-vous');
        }
        
        const appointments = await response.json();
        return appointments;
        
    } catch (error) {
        console.error('❌ Error getting patient appointments:', error);
        return [];
    }
}

/**
 * Cancel an appointment
 * @param {number} appointmentId - ID of the appointment
 * @returns {Promise<boolean>} - Success status
 */
async function cancelAppointment(appointmentId) {
    if (!confirm('Êtes-vous sûr de vouloir annuler ce rendez-vous ?')) {
        return false;
    }
    
    try {
        const response = await fetch(`${API_URL}/appointments/${appointmentId}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ status: 'cancelled' })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showNotification('Rendez-vous annulé avec succès', 'success');
            
            // Get user info for notification
            const user = JSON.parse(localStorage.getItem('user'));
            if (user && user.role === 'patient') {
                // Refresh appointments display if we're on the appointments page
                const appointmentsContainer = document.getElementById('patientAppointments');
                if (appointmentsContainer) {
                    await displayPatientAppointments(user.id);
                }
            }
            
            return true;
        } else {
            showNotification(result.detail || 'Erreur lors de l\'annulation', 'error');
            return false;
        }
        
    } catch (error) {
        console.error('❌ Error cancelling appointment:', error);
        showNotification('Erreur de connexion au serveur', 'error');
        return false;
    }
}

/**
 * Display patient's appointments in a container
 * @param {number} patientId - ID of the patient
 */
async function displayPatientAppointments(patientId) {
    const container = document.getElementById('patientAppointments');
    if (!container) return;
    
    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Chargement de vos rendez-vous...</p></div>';
    
    try {
        const appointments = await getPatientAppointments(patientId);
        
        if (!appointments || appointments.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-calendar-times"></i>
                    <h3>Aucun rendez-vous</h3>
                    <p>Vous n'avez pas encore de rendez-vous programmés.</p>
                    <button onclick="window.location.href='doctors.html'" class="btn-primary">
                        <i class="fas fa-calendar-plus"></i> Prendre rendez-vous
                    </button>
                </div>
            `;
            return;
        }
        
        let html = '<div class="appointments-list">';
        
        // Separate upcoming and past appointments
        const today = new Date().toISOString().split('T')[0];
        const upcoming = appointments.filter(apt => apt.date >= today && apt.status !== 'cancelled' && apt.status !== 'completed');
        const past = appointments.filter(apt => apt.date < today || apt.status === 'completed' || apt.status === 'cancelled');
        
        if (upcoming.length > 0) {
            html += '<h3 class="section-title">📅 Rendez-vous à venir</h3>';
            upcoming.forEach(apt => {
                html += renderAppointmentCard(apt);
            });
        }
        
        if (past.length > 0) {
            html += '<h3 class="section-title" style="margin-top: 30px;">📋 Historique</h3>';
            past.forEach(apt => {
                html += renderAppointmentCard(apt);
            });
        }
        
        html += '</div>';
        container.innerHTML = html;
        
    } catch (error) {
        console.error('❌ Error displaying appointments:', error);
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Erreur lors du chargement des rendez-vous</p>
                <button onclick="displayPatientAppointments(${patientId})" class="btn-outline">
                    <i class="fas fa-sync-alt"></i> Réessayer
                </button>
            </div>
        `;
    }
}

/**
 * Render a single appointment card
 * @param {Object} apt - Appointment object
 * @returns {string} - HTML string
 */
function renderAppointmentCard(apt) {
    const statusClasses = {
        'pending': 'badge-warning',
        'confirmed': 'badge-primary',
        'completed': 'badge-success',
        'cancelled': 'badge-danger',
        'rescheduled_pending': 'badge-info'
    };
    
    const statusTexts = {
        'pending': 'En attente',
        'confirmed': 'Confirmé',
        'completed': 'Terminé',
        'cancelled': 'Annulé',
        'rescheduled_pending': 'Reprogrammation en attente'
    };
    
    return `
        <div class="appointment-card ${apt.status}" data-id="${apt.id}">
            <div class="appointment-header">
                <div class="doctor-info">
                    <div class="doctor-avatar-small">
                        ${apt.profile_photo ? 
                            `<img src="${apt.profile_photo}" alt="${apt.doctor_name}">` : 
                            `<span>${getInitials(apt.doctor_name)}</span>`
                        }
                    </div>
                    <div>
                        <h4>${apt.doctor_name}</h4>
                        <p class="specialty">${apt.specialty || 'Médecin'}</p>
                    </div>
                </div>
                <span class="badge ${statusClasses[apt.status] || 'badge-info'}">
                    ${statusTexts[apt.status] || apt.status}
                </span>
            </div>
            
            <div class="appointment-details">
                <div class="detail-item">
                    <i class="fas fa-calendar"></i>
                    <span>${formatDate(apt.date)}</span>
                </div>
                <div class="detail-item">
                    <i class="fas fa-clock"></i>
                    <span>${apt.time.substring(0, 5)}</span>
                </div>
                <div class="detail-item">
                    <i class="fas fa-tag"></i>
                    <span>${getAppointmentTypeText(apt.type)}</span>
                </div>
                <div class="detail-item">
                    <i class="fas fa-map-marker-alt"></i>
                    <span>${apt.doctor_address || 'Adresse non renseignée'}</span>
                </div>
            </div>
            
            <div class="appointment-reason">
                <strong>Motif:</strong>
                <p>${apt.reason || 'Consultation'}</p>
            </div>
            
            <div class="appointment-actions">
                ${apt.status === 'pending' ? `
                    <button onclick="cancelAppointment(${apt.id})" class="btn-outline btn-sm">
                        <i class="fas fa-times"></i> Annuler
                    </button>
                ` : ''}
                ${apt.status === 'confirmed' ? `
                    <button onclick="showDoctorFullProfile(${apt.doctor_id})" class="btn-outline btn-sm">
                        <i class="fas fa-user-md"></i> Voir médecin
                    </button>
                    <button onclick="cancelAppointment(${apt.id})" class="btn-outline btn-sm">
                        <i class="fas fa-times"></i> Annuler
                    </button>
                ` : ''}
                ${apt.status === 'completed' ? `
                    <button onclick="viewMedicalRecord(${apt.id})" class="btn-primary btn-sm">
                        <i class="fas fa-file-medical"></i> Voir dossier
                    </button>
                ` : ''}
            </div>
        </div>
    `;
}

// Helper function for appointment type text
function getAppointmentTypeText(type) {
    const types = {
        'consultation': 'Consultation',
        'followup': 'Suivi',
        'emergency': 'Urgence',
        'teleconsultation': 'Téléconsultation'
    };
    return types[type] || type || 'Consultation';
}

/**
 * Open appointment booking modal with calendar view
 * @param {number} doctorId - ID of the doctor
 */
function openAppointmentBookingModal(doctorId) {
    console.log('📝 Ouverture du modal de réservation pour le médecin:', doctorId);
    
    fetch(`${API_URL}/doctors/${doctorId}/profile`)
        .then(response => {
            if (!response.ok) throw new Error(`Erreur HTTP ${response.status}`);
            return response.json();
        })
        .then(doctor => {
            // Fermer le modal du profil si ouvert
            const existingModal = document.getElementById('doctorProfileModal');
            if (existingModal) {
                existingModal.remove();
                document.body.style.overflow = 'auto';
            }
            // Remove previous booking modal if any
            const prev = document.getElementById('appointmentBookingModal');
            if (prev) prev.remove();

            // Reset calendar state
            const now = new Date();
            calDoctorId = doctorId;
            calCurrentMonth = now.getMonth();
            calCurrentYear = now.getFullYear();
            calSelectedDate = null;
            calSelectedTime = null;
            calDoctorData = {};
            
            const modal = document.createElement('div');
            modal.className = 'modal-overlay';
            modal.id = 'appointmentBookingModal';
            modal.style.display = 'flex';
            
            modal.innerHTML = `
                <div class="modal-box" style="max-width: 600px;">
                    <button class="modal-close" onclick="closeModal('appointmentBookingModal')">&times;</button>
                    <h2><i class="fas fa-calendar-plus" style="color: var(--accent);"></i> Prendre rendez-vous</h2>
                    
                    <div style="margin: 20px 0; padding: 15px; background: var(--bg-2); border-radius: 10px;">
                        <div style="display: flex; align-items: center; gap: 15px;">
                            <div style="width: 50px; height: 50px; border-radius: 10px; overflow: hidden;">
                                ${doctor.profile_photo ? 
                                    `<img src="${doctor.profile_photo}" alt="${doctor.full_name}" style="width: 100%; height: 100%; object-fit: cover;">` : 
                                    `<div style="width: 100%; height: 100%; background: linear-gradient(135deg, var(--accent), var(--accent-dark)); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold;">${getInitials(doctor.full_name)}</div>`
                                }
                            </div>
                            <div>
                                <h3 style="color: var(--text); margin-bottom: 5px;">${doctor.full_name}</h3>
                                <p style="color: var(--text-muted);"><i class="fas fa-stethoscope" style="margin-right: 5px;"></i>${doctor.specialty || 'Médecin'}</p>
                                ${doctor.consultation_price ? `<p style="color: var(--accent); font-size: 14px; margin-top: 5px;"><i class="fas fa-tag"></i> ${doctor.consultation_price} Dhs</p>` : ''}
                            </div>
                        </div>
                    </div>
                    
                    <form id="appointmentBookingForm">
                        <input type="hidden" id="bookingDoctorId" value="${doctorId}">
                        <input type="hidden" id="bookingDate" value="">
                        <input type="hidden" id="bookingTime" value="">
                        
                        <!-- Calendrier -->
                        <div style="margin-bottom: 20px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                                <button type="button" class="btn-outline" style="padding:6px 12px;border-radius:8px;cursor:pointer;" onclick="calPrevMonth()">
                                    <i class="fas fa-chevron-left"></i>
                                </button>
                                <h3 id="calMonthTitle" style="font-size: 16px; font-weight: 600; color: var(--text);"></h3>
                                <button type="button" class="btn-outline" style="padding:6px 12px;border-radius:8px;cursor:pointer;" onclick="calNextMonth()">
                                    <i class="fas fa-chevron-right"></i>
                                </button>
                            </div>
                            
                            <div id="calGrid" style="display:grid;grid-template-columns:repeat(7,1fr);gap:5px;margin-bottom:15px;"></div>
                            
                            <!-- Légende -->
                            <div style="display:flex;gap:15px;justify-content:center;padding:10px;background:var(--bg-2);border-radius:10px;">
                                <div style="display:flex;align-items:center;gap:5px;">
                                    <div style="width:12px;height:12px;border-radius:4px;background:#10b981;"></div>
                                    <span style="font-size:11px;color:var(--text-muted);">Disponible</span>
                                </div>
                                <div style="display:flex;align-items:center;gap:5px;">
                                    <div style="width:12px;height:12px;border-radius:4px;background:#f97316;"></div>
                                    <span style="font-size:11px;color:var(--text-muted);">Week-end</span>
                                </div>
                                <div style="display:flex;align-items:center;gap:5px;">
                                    <div style="width:12px;height:12px;border-radius:4px;background:#ef4444;"></div>
                                    <span style="font-size:11px;color:var(--text-muted);">Complet/Fermé</span>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Créneaux horaires -->
                        <div id="calSlotsContainer" style="display:none;padding:20px;background:var(--bg-2);border-radius:12px;margin-bottom:20px;"></div>
                        
                        <div class="form-field">
                            <label><i class="fas fa-tag"></i> Motif de la consultation *</label>
                            <select id="bookingReason" class="form-control" required>
                                <option value="">Sélectionnez un motif</option>
                                <option value="Consultation générale">Consultation générale</option>
                                <option value="Suivi médical">Suivi médical</option>
                                <option value="Douleur / Symptôme">Douleur / Symptôme</option>
                                <option value="Renouvellement ordonnance">Renouvellement ordonnance</option>
                                <option value="Résultats examens">Résultats examens</option>
                                <option value="Urgence">Urgence</option>
                            </select>
                        </div>
                        
                        <div class="form-field">
                            <label><i class="fas fa-comment"></i> Description (optionnelle)</label>
                            <textarea id="bookingDescription" class="form-control" rows="3" placeholder="Décrivez brièvement votre motif..."></textarea>
                        </div>
                        
                        <div class="form-field">
                            <label><i class="fas fa-video"></i> Type de consultation</label>
                            <select id="bookingType" class="form-control">
                                <option value="consultation">Consultation standard</option>
                                <option value="followup">Suivi</option>
                                <option value="teleconsultation">Téléconsultation</option>
                            </select>
                        </div>
                        
                        <div class="modal-actions" style="margin-top: 30px;">
                            <button type="button" class="btn-outline" onclick="closeModal('appointmentBookingModal')">
                                <i class="fas fa-times"></i> Annuler
                            </button>
                            <button type="submit" class="btn-primary" id="submitBookingBtn" disabled>
                                <i class="fas fa-paper-plane"></i> Confirmer la demande
                            </button>
                        </div>
                    </form>
                </div>
            `;
            
            document.body.appendChild(modal);
            document.body.style.overflow = 'hidden';
            
            // Load calendar data
            setTimeout(() => calLoadDoctorCalendar(), 100);
            
            // Handle form submission
            document.getElementById('appointmentBookingForm').addEventListener('submit', async function(e) {
                e.preventDefault();
                
                const dId = document.getElementById('bookingDoctorId').value;
                const date = document.getElementById('bookingDate').value;
                const time = document.getElementById('bookingTime').value;
                const reasonSelect = document.getElementById('bookingReason').value;
                const description = document.getElementById('bookingDescription').value;
                const type = document.getElementById('bookingType').value;
                
                if (!date) { showNotification('Veuillez sélectionner une date', 'error'); return; }
                if (!time) { showNotification('Veuillez sélectionner une heure', 'error'); return; }
                if (!reasonSelect) { showNotification('Veuillez sélectionner un motif', 'error'); return; }
                
                const fullReason = description ? `${reasonSelect} - ${description}` : reasonSelect;
                
                const submitBtn = document.getElementById('submitBookingBtn');
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Envoi en cours...';
                
                const success = await bookAppointment(dId, date, time, fullReason, type);
                
                if (success) {
                    setTimeout(() => closeModal('appointmentBookingModal'), 2000);
                } else {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Confirmer la demande';
                }
            });
        })
        .catch(error => {
            console.error('❌ Erreur chargement médecin:', error);
            showNotification('Erreur lors du chargement des informations du médecin', 'error');
        });
}

// ========================================
// CALENDAR BOOKING HELPERS
// ========================================

function _calBuildFallback(year, month) {
    const data = {};
    const today = new Date(); today.setHours(0,0,0,0);
    const days = new Date(year, month, 0).getDate();
    for (let day = 1; day <= days; day++) {
        const d = new Date(year, month - 1, day);
        const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const dow = d.getDay();
        const isPast = d < today;
        if (isPast) {
            data[dateStr] = { color:'gray', is_available:false, available_slots:0, message:'Date passée' };
        } else if (dow === 0 || dow === 6) {
            data[dateStr] = { color:'orange', is_available:false, available_slots:0, message:'Week-end (fermé)' };
        } else {
            data[dateStr] = { color:'green', is_available:true, available_slots:8, message:'Disponible' };
        }
    }
    return data;
}

async function calLoadDoctorCalendar() {
    if (!calDoctorId) return;
    const month = calCurrentMonth + 1;
    const year = calCurrentYear;

    const calEl = document.getElementById('calGrid');
    if (calEl) calEl.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted);"><i class="fas fa-spinner fa-spin" style="font-size:24px;"></i></div>';

    try {
        const url = `${API_URL}/doctors/${calDoctorId}/calendar/${month}/${year}`;
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            }
        });
        if (response.ok) {
            calDoctorData = await response.json();
        } else {
            calDoctorData = _calBuildFallback(year, month);
        }
    } catch (err) {
        calDoctorData = _calBuildFallback(year, month);
    }
    calRenderCalendar();
}

function calRenderCalendar() {
    const monthNames = ['Janvier','Février','Mars','Avril','Mai','Juin',
                        'Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
    const dayNames = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];

    const titleEl = document.getElementById('calMonthTitle');
    if (titleEl) titleEl.textContent = `${monthNames[calCurrentMonth]} ${calCurrentYear}`;

    const firstDay = new Date(calCurrentYear, calCurrentMonth, 1).getDay();
    const daysInMonth = new Date(calCurrentYear, calCurrentMonth + 1, 0).getDate();
    const firstDayIndex = firstDay === 0 ? 6 : firstDay - 1;

    let html = '';
    dayNames.forEach(d => { html += `<div class="cal-day-header">${d}</div>`; });
    for (let i = 0; i < firstDayIndex; i++) html += '<div class="cal-empty"></div>';

    const colorStyles = {
        green:  { bg: '#10b981', border: '#059669' },
        red:    { bg: '#ef4444', border: '#dc2626' },
        orange: { bg: '#f97316', border: '#ea580c' },
        gray:   { bg: '#d1d5db', border: '#9ca3af' }
    };

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${calCurrentYear}-${String(calCurrentMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const dayData = calDoctorData[dateStr] || { color:'gray', is_available:false, available_slots:0, message:'Non disponible' };
        const color = dayData.color || 'gray';
        const disabled = !dayData.is_available;
        const style = colorStyles[color] || colorStyles.gray;

        const isSelected = calSelectedDate === dateStr;
        const borderWidth = isSelected ? '3px' : '1px';
        const borderColorFinal = isSelected ? '#2fa37c' : style.border;
        const boxShadow = isSelected ? '0 0 12px rgba(47,163,124,0.4)' : 'none';

        const slotBadge = (color === 'green' && dayData.available_slots > 0)
            ? `<span class="cal-slot-badge">${dayData.available_slots}</span>` : '';

        const statusIcon = color === 'orange'
            ? `<span style="position:absolute;top:-5px;right:-5px;background:white;border-radius:50%;width:16px;height:16px;font-size:9px;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,0.2);">🔒</span>`
            : color === 'red'
            ? `<span style="position:absolute;top:-5px;right:-5px;background:white;color:#ef4444;border-radius:50%;width:16px;height:16px;font-size:10px;display:flex;align-items:center;justify-content:center;font-weight:bold;box-shadow:0 1px 3px rgba(0,0,0,0.2);">✕</span>`
            : '';

        html += `
            <button type="button"
                class="cal-day${!disabled ? ' clickable' : ''}"
                ${disabled ? 'disabled' : `onclick="calSelectDate('${dateStr}')"`}
                title="${dayData.message || ''}"
                style="background:${style.bg};border:${borderWidth} solid ${borderColorFinal};cursor:${disabled ? 'not-allowed' : 'pointer'};opacity:${disabled ? 0.65 : 1};box-shadow:${boxShadow};position:relative;transition:all 0.15s;">
                <span>${day}</span>
                ${slotBadge}
                ${statusIcon}
            </button>`;
    }

    const calEl = document.getElementById('calGrid');
    if (calEl) calEl.innerHTML = html;
}

function calSelectDate(dateStr) {
    calSelectedDate = dateStr;
    calSelectedTime = null;
    const submitBtn = document.getElementById('submitBookingBtn');
    if (submitBtn) submitBtn.disabled = true;
    document.getElementById('bookingDate').value = dateStr;
    document.getElementById('bookingTime').value = '';
    document.getElementById('calSlotsContainer').style.display = 'none';
    calRenderCalendar();
    calLoadSlots(dateStr);
}

async function calLoadSlots(dateStr) {
    const container = document.getElementById('calSlotsContainer');
    if (!container) return;
    container.style.display = 'block';
    container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Chargement...</div>';

    try {
        const url = `${API_URL}/doctors/${calDoctorId}/available-slots/${dateStr}`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        if (response.ok) {
            calRenderSlots(await response.json(), dateStr);
        } else {
            // Fallback: use getAvailableTimeSlots
            const slots = await getAvailableTimeSlots(calDoctorId, dateStr);
            calRenderSlots({ available_slots: slots, available_count: slots.length }, dateStr);
        }
    } catch (error) {
        // Fallback
        try {
            const slots = await getAvailableTimeSlots(calDoctorId, dateStr);
            calRenderSlots({ available_slots: slots, available_count: slots.length }, dateStr);
        } catch (e) {
            container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);">Erreur de connexion</div>';
        }
    }
}

function calRenderSlots(slotsData, dateStr) {
    const container = document.getElementById('calSlotsContainer');
    if (!container) return;

    const dateObj = new Date(dateStr + 'T00:00:00');
    const formattedDate = dateObj.toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' });

    let html = `
        <div style="margin-bottom:12px;">
            <h3 style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:4px;">
                Créneaux — ${formattedDate}
            </h3>
            <p style="font-size:12px;color:var(--text-muted);">
                ${slotsData.message || `${slotsData.available_count || 0} créneau(x) disponible(s)`}
            </p>
        </div>`;

    if (!slotsData.available_slots || slotsData.available_slots.length === 0) {
        html += `
            <div style="padding:30px;text-align:center;background:var(--bg-secondary, var(--bg-2));border-radius:12px;">
                <i class="fas fa-clock" style="font-size:28px;color:var(--text-muted);margin-bottom:10px;opacity:0.5;display:block;"></i>
                <p style="color:var(--text-muted);font-size:13px;">Aucun créneau disponible pour cette date</p>
            </div>`;
    } else {
        html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(85px,1fr));gap:8px;">';
        slotsData.available_slots.forEach(time => {
            const isSel = calSelectedTime === time;
            html += `
                <button type="button" class="cal-slot-btn" onclick="calSelectTime('${time}')"
                    style="padding:11px 6px;background:${isSel ? 'var(--accent, #10b981)' : 'var(--bg-card, white)'};border:2px solid var(--accent, #10b981);border-radius:8px;color:${isSel ? 'white' : 'var(--accent, #10b981)'};cursor:pointer;font-weight:600;font-size:13px;transition:all 0.15s;transform:${isSel ? 'translateY(-2px)' : 'none'};box-shadow:${isSel ? '0 4px 8px rgba(16,185,129,0.25)' : 'none'};">
                    ${time}
                </button>`;
        });
        html += '</div>';
    }

    container.innerHTML = html;
    container.style.display = 'block';
}

function calSelectTime(time) {
    calSelectedTime = time;
    document.getElementById('bookingTime').value = time;
    document.getElementById('submitBookingBtn').disabled = false;

    document.querySelectorAll('#calSlotsContainer .cal-slot-btn').forEach(btn => {
        const t = btn.textContent.trim();
        if (t === time) {
            btn.style.background = 'var(--accent, #10b981)';
            btn.style.color = 'white';
            btn.style.transform = 'translateY(-2px)';
            btn.style.boxShadow = '0 4px 8px rgba(16,185,129,0.25)';
        } else {
            btn.style.background = 'var(--bg-card, white)';
            btn.style.color = 'var(--accent, #10b981)';
            btn.style.transform = 'none';
            btn.style.boxShadow = 'none';
        }
    });
}

function calPrevMonth() {
    calCurrentMonth--;
    if (calCurrentMonth < 0) { calCurrentMonth = 11; calCurrentYear--; }
    calSelectedDate = null; calSelectedTime = null;
    document.getElementById('bookingDate').value = '';
    document.getElementById('bookingTime').value = '';
    document.getElementById('submitBookingBtn').disabled = true;
    document.getElementById('calSlotsContainer').style.display = 'none';
    calLoadDoctorCalendar();
}

function calNextMonth() {
    calCurrentMonth++;
    if (calCurrentMonth > 11) { calCurrentMonth = 0; calCurrentYear++; }
    calSelectedDate = null; calSelectedTime = null;
    document.getElementById('bookingDate').value = '';
    document.getElementById('bookingTime').value = '';
    document.getElementById('submitBookingBtn').disabled = true;
    document.getElementById('calSlotsContainer').style.display = 'none';
    calLoadDoctorCalendar();
}

// ========================================
// FONCTIONS UTILITAIRES MANQUANTES
// ========================================
function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

function showLoading(message = 'Chargement...') {
    // Vérifier si un loader existe déjà
    let loader = document.getElementById('globalLoader');
    if (!loader) {
        loader = document.createElement('div');
        loader.id = 'globalLoader';
        loader.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.7);
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            z-index: 10000;
            backdrop-filter: blur(5px);
        `;
        document.body.appendChild(loader);
    }
    
    loader.innerHTML = `
        <div class="spinner" style="width: 50px; height: 50px; border: 3px solid rgba(255,255,255,0.1); border-top-color: var(--accent); border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 20px;"></div>
        <p style="color: white; font-size: 14px;">${message}</p>
    `;
    
    loader.style.display = 'flex';
}

function hideLoading() {
    const loader = document.getElementById('globalLoader');
    if (loader) {
        loader.style.display = 'none';
    }
}

// Ajouter l'animation spin si elle n'existe pas
if (!document.querySelector('#spin-animation')) {
    const style = document.createElement('style');
    style.id = 'spin-animation';
    style.textContent = `
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(style);
}

// ========================================
// VIEW FUNCTIONS
// ========================================
function viewMedicalRecord(appointmentId) {
    showNotification('Fonctionnalité de dossier médical en cours de développement', 'info');
}

// ========================================
// MOBILE MENU
// ========================================
function initMobileMenu() {
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');
    const mobileNavOverlay = document.getElementById('mobileNavOverlay');
    
    if (mobileMenuToggle && mobileNavOverlay) {
        mobileMenuToggle.addEventListener('click', () => {
            mobileMenuToggle.classList.toggle('active');
            mobileNavOverlay.classList.toggle('active');
            document.body.style.overflow = mobileNavOverlay.classList.contains('active') ? 'hidden' : '';
        });
        
        // Close mobile menu when clicking on a link
        const mobileNavLinks = mobileNavOverlay.querySelectorAll('a');
        mobileNavLinks.forEach(link => {
            link.addEventListener('click', () => {
                mobileMenuToggle.classList.remove('active');
                mobileNavOverlay.classList.remove('active');
                document.body.style.overflow = '';
            });
        });
        
        // Close mobile menu on window resize
        window.addEventListener('resize', () => {
            if (window.innerWidth > 900) {
                mobileMenuToggle.classList.remove('active');
                mobileNavOverlay.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    }
}

// ========================================
// INITIALISATION
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 Initialisation de la page...");
    
    initTheme();
    initLanguage();
    initModals();
    initReviews();
    initAuth();
    loadUserHeader();
    initMobileMenu();
    
    loadDoctorsFromDatabase();
    
    const user = JSON.parse(localStorage.getItem('user'));
    if (user) {
        console.log(`👤 Utilisateur connecté: ${user.role}`);
    }
});

// Exposer les fonctions nécessaires globalement
window.openModal = openModal;
window.closeModal = closeModal;
window.updateReviewInitials = updateReviewInitials;
window.showSettings = showSettings;
window.closeSettingsModal = closeSettingsModal;
window.saveProfileSettings = saveProfileSettings;
window.saveNotificationSettings = saveNotificationSettings;
window.changePassword = changePassword;
window.setTheme = setTheme;
window.previewPatientPhoto = previewPatientPhoto;
window.showDoctorFullProfile = showDoctorFullProfile;
window.closeDoctorProfileModal = closeDoctorProfileModal;
window.takeAppointment = takeAppointment;
window.loadDoctorsFromDatabase = loadDoctorsFromDatabase;
window.showNotification = showNotification;
window.bookAppointment = bookAppointment;
window.getAvailableTimeSlots = getAvailableTimeSlots;
window.calSelectDate = calSelectDate;
window.calSelectTime = calSelectTime;
window.calPrevMonth = calPrevMonth;
window.calNextMonth = calNextMonth;
window.getPatientAppointments = getPatientAppointments;
window.cancelAppointment = cancelAppointment;
window.displayPatientAppointments = displayPatientAppointments;
window.viewMedicalRecord = viewMedicalRecord;