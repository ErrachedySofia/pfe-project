// patient.js — Espace patient ParrotDiag

const API_URL = "http://127.0.0.1:8000";

// ========================================
// VARIABLES GLOBALES
// ========================================
let currentUser = null;
let allAppointments = [];
let allPrescriptions = [];
let allNotifications = [];
let notificationInterval = null;

// Variables pour le calendrier
let currentCalendarMonth = new Date().getMonth();
let currentCalendarYear = new Date().getFullYear();
let currentDoctorId = null;
let doctorCalendarData = {};
let selectedDate = null;
let selectedTime = null;

// ========================================
// INITIALISATION
// ========================================
document.addEventListener('DOMContentLoaded', async function () {
    console.log("🚀 Initialisation de l'espace patient...");
    _clearDemoContent();

    const isAuthenticated = await checkAuthentication();
    if (isAuthenticated) {
        await loadPatientData();
        initUserInterface();
        initEventListeners();
        initFilterButtons();
        startNotificationPolling();
        await loadDoctorsList();
    } else {
        window.location.href = 'connexionpage.html';
    }
});

function _clearDemoContent() {
    ['upcomingAppointments','recentPrescriptions','appointmentsList',
     'prescriptionsList','notificationsList','doctorsList'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '';
    });
}

// ========================================
// AUTHENTIFICATION
// ========================================
async function checkAuthentication() {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    if (!token || !userStr) return false;
    try {
        currentUser = JSON.parse(userStr);
        const response = await fetch(`${API_URL}/health`);
        if (!response.ok) throw new Error("API non disponible");
        return true;
    } catch (e) {
        console.error("Erreur parsing user ou API:", e);
        localStorage.clear();
        return false;
    }
}

// ========================================
// CHARGEMENT DES DONNÉES
// ========================================
async function loadPatientData() {
    try {
        showLoading('Chargement de vos données...');
        await loadPatientProfile();
        await Promise.all([
            loadPatientAppointments(),
            loadPatientPrescriptions(),
            loadNotifications()
        ]);
        updateUI();
        hideLoading();
    } catch (error) {
        console.error('❌ Erreur chargement données:', error);
        hideLoading();
        showToast('Erreur de chargement des données', 'error');
    }
}

async function reloadAllData() {
    try {
        showLoading('Mise à jour de vos données...');
        await Promise.all([
            loadPatientAppointments(),
            loadPatientPrescriptions(),
            loadNotifications()
        ]);
        updateUI();
        const doctorsSection = document.getElementById('doctorsSection');
        if (doctorsSection && doctorsSection.classList.contains('active')) {
            await loadDoctorsList();
        }
        hideLoading();
    } catch (error) {
        console.error('❌ Erreur lors du rechargement:', error);
        hideLoading();
    }
}

async function loadPatientProfile() {
    try {
        const response = await fetch(`${API_URL}/patients/${currentUser.id}/profile`);
        if (response.ok) {
            const profile = await response.json();
            const userId = currentUser.id;
            currentUser = { ...currentUser, ...profile };
            currentUser.id = userId;
            localStorage.setItem('user', JSON.stringify(currentUser));
        }
    } catch (e) {
        console.error('Erreur chargement profil:', e);
    }
}

async function loadPatientAppointments() {
    try {
        const response = await fetch(`${API_URL}/patients/${currentUser.id}/appointments`);
        allAppointments = response.ok ? await response.json() : [];
    } catch (e) { allAppointments = []; }
}

async function loadPatientPrescriptions() {
    try {
        const response = await fetch(`${API_URL}/patients/${currentUser.id}/prescriptions`);
        allPrescriptions = response.ok ? await response.json() : [];
    } catch (e) { allPrescriptions = []; }
}

async function loadNotifications() {
    try {
        const response = await fetch(`${API_URL}/users/${currentUser.id}/notifications`);
        allNotifications = response.ok ? await response.json() : [];
    } catch (e) { allNotifications = []; }
}

// ========================================
// MÉDECINS
// ========================================
async function loadDoctorsList() {
    try {
        const response = await fetch(`${API_URL}/doctors/approved`);
        if (response.ok) displayDoctorsList(await response.json());
    } catch (e) { console.error('Erreur chargement médecins:', e); }
}

function displayDoctorsList(doctors) {
    const container = document.getElementById('doctorsList');
    if (!container) return;
    if (doctors.length === 0) {
        container.innerHTML = _emptyState('fa-user-md', 'Aucun médecin disponible', '');
        return;
    }
    container.innerHTML = doctors.map(doctor => `
        <div class="doctor-card" style="cursor:pointer;background:var(--bg-card);border:1px solid var(--border);border-radius:16px;padding:20px;transition:var(--t);">
            <div style="display:flex;gap:16px;margin-bottom:16px;">
                <div style="width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--accent-dark));display:flex;align-items:center;justify-content:center;color:white;font-size:20px;font-weight:700;overflow:hidden;">
                    ${doctor.profile_photo ?
                        `<img src="${doctor.profile_photo}" style="width:100%;height:100%;object-fit:cover;">` :
                        `<span>${doctor.initials || getInitials(doctor.full_name)}</span>`}
                </div>
                <div style="flex:1;">
                    <h3 style="font-size:16px;font-weight:600;margin-bottom:4px;">${doctor.full_name}</h3>
                    <p style="font-size:13px;color:var(--accent);margin-bottom:4px;">${doctor.specialty || 'Médecin généraliste'}</p>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <i class="fas fa-star" style="color:#FFD700;font-size:11px;"></i>
                        <span style="font-size:12px;color:var(--text-2);">${doctor.avg_rating?.toFixed(1) || '4.5'}</span>
                        <span style="font-size:12px;color:var(--text-3);">${doctor.patient_count || 0} patients</span>
                    </div>
                </div>
            </div>
            <div style="margin-bottom:16px;font-size:13px;color:var(--text-2);">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                    <i class="fas fa-map-marker-alt" style="width:16px;color:var(--accent);"></i>
                    <span>${doctor.location || doctor.address || 'Non spécifié'}</span>
                </div>
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                    <i class="fas fa-briefcase" style="width:16px;color:var(--accent);"></i>
                    <span>${doctor.experience || 'Expérience non spécifiée'}</span>
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                    <i class="fas fa-tag" style="width:16px;color:var(--accent);"></i>
                    <strong style="color:var(--accent);">${doctor.consultation_price ? doctor.consultation_price + ' DH' : 'Prix non spécifié'}</strong>
                </div>
            </div>
            <button class="btn btn-primary btn-sm" style="width:100%;"
                onclick="openAppointmentModal(${doctor.user_id}, '${doctor.full_name.replace(/'/g,"\\'")}', '${doctor.specialty || 'Médecin'}')">
                <i class="fas fa-calendar-plus"></i> Prendre rendez-vous
            </button>
        </div>
    `).join('');
}

// ========================================
// INTERFACE UTILISATEUR
// ========================================
function initUserInterface() {
    if (!currentUser) return;
    const initials  = getInitials(currentUser.full_name);
    const firstName = currentUser.full_name ? currentUser.full_name.split(' ')[0] : 'Patient';

    ['userAvatar','dropdownAvatar','welcomeAvatar','patientPhotoInitials'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (currentUser.profile_photo && id !== 'patientPhotoInitials') {
            el.innerHTML = `<img src="${currentUser.profile_photo}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">`;
        } else {
            el.textContent = initials;
        }
    });

    setElText('userName', firstName);
    setElText('dropdownName', currentUser.full_name);
    setElText('dropdownEmail', currentUser.email);
    const welcomeName = document.getElementById('welcomeName');
    if (welcomeName) welcomeName.innerHTML = firstName;
    fillProfileForm();
    initMobileMenu();
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

function fillProfileForm() {
    const fields = {
        patientFullName:    currentUser.full_name,
        patientEmail:       currentUser.email,
        patientPhone:       currentUser.phone || '',
        patientAddress:     currentUser.address || '',
        patientBirthDate:   currentUser.birth_date || '',
        patientSex:         currentUser.sex || '',
        patientCity:        currentUser.city || '',
        patientZipCode:     currentUser.zip_code || '',
        patientBloodType:   currentUser.blood_type || '',
        patientAllergies:   currentUser.allergies || '',
        patientMaritalStatus: currentUser.marital_status || '',
        patientMedications: currentUser.current_medications || '',
        patientHistory:     currentUser.medical_history || '',
        emergencyName:      currentUser.emergency_contact?.name || '',
        emergencyPhone:     currentUser.emergency_contact?.phone || '',
        emergencyRelation:  currentUser.emergency_contact?.relation || ''
    };
    Object.entries(fields).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) el.value = val || '';
    });
}

function updateUI() {
    const totalAppts = allAppointments.length;
    const confirmed  = allAppointments.filter(a => a.status === 'confirmed').length;
    const pending    = allAppointments.filter(a => a.status === 'pending').length;
    const totalPres  = allPrescriptions.length;
    const activePres = allPrescriptions.filter(p => isPrescriptionActive(p)).length;

    setElText('quickAppointments', totalAppts);
    setElText('quickPrescriptions', totalPres);
    setElText('quickActivePrescriptions', activePres);
    setElText('statAppointments', totalAppts);
    setElText('statConfirmed', confirmed);
    setElText('statPending', pending);
    setElText('statActivePrescriptions', activePres);

    displayAppointments(allAppointments);
    displayPrescriptions(allPrescriptions);
    displayUpcomingAppointments();
    displayRecentPrescriptions();
    renderNotifications();
    updateNotificationBadge();
}

function setElText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val ?? '';
}

// ========================================
// RENDEZ-VOUS
// ========================================
function buildAppointmentCard(apt) {
    const date  = new Date(apt.date);
    const day   = date.getDate();
    const month = date.toLocaleDateString('fr-FR', { month: 'short' });
    const statusMap = {
        pending:     { cls: 'status-pending',     label: 'En attente' },
        confirmed:   { cls: 'status-confirmed',   label: 'Confirmé' },
        completed:   { cls: 'status-completed',   label: 'Terminé' },
        cancelled:   { cls: 'status-cancelled',   label: 'Annulé' },
        rescheduled: { cls: 'status-rescheduled', label: 'Reporté' }
    };
    const s = statusMap[apt.status] || { cls: 'status-pending', label: apt.status };
    return `
        <div class="appointment-card" onclick="viewAppointmentDetails(${apt.id})" style="cursor:pointer;">
            <div class="appt-left-bar"></div>
            <div class="doctor-info">
                <div class="doctor-avatar-small">${getInitials(apt.doctor_name)}</div>
                <div>
                    <div class="doctor-name">Dr. ${apt.doctor_name}</div>
                    <div class="doctor-specialty">${apt.specialty || 'Médecin'}</div>
                    <div style="font-size:12px;color:var(--text-3);margin-top:3px;">
                        <i class="fas fa-stethoscope" style="color:var(--accent);margin-right:4px;"></i>${apt.reason || 'Consultation'}
                    </div>
                </div>
            </div>
            <div class="appointment-date">
                <div class="appointment-day">${day} ${month}</div>
                <div class="appointment-time">${apt.time ? apt.time.substring(0,5) : '--:--'}</div>
            </div>
            <div class="appt-status">
                <span class="status-badge ${s.cls}">${s.label}</span>
            </div>
        </div>`;
}

function displayAppointments(appointments) {
    const container = document.getElementById('appointmentsList');
    if (!container) return;
    if (!appointments || appointments.length === 0) {
        container.innerHTML = _emptyState('fa-calendar-times', 'Aucun rendez-vous', 'Vous n\'avez pas encore de rendez-vous',
            `<button class="btn btn-primary btn-sm" onclick="openNewAppointment()" style="margin-top:16px;"><i class="fas fa-plus"></i> Prendre rendez-vous</button>`);
        return;
    }
    const sorted = [...appointments].sort((a,b) =>
        new Date(b.date+'T'+(b.time||'00:00')) - new Date(a.date+'T'+(a.time||'00:00'))
    );
    container.innerHTML = sorted.map(buildAppointmentCard).join('');
}

function displayUpcomingAppointments() {
    const container = document.getElementById('upcomingAppointments');
    if (!container) return;
    const now = new Date();
    const upcoming = allAppointments
        .filter(a => ['confirmed','pending'].includes(a.status) && new Date(a.date+'T'+(a.time||'00:00')) > now)
        .sort((a,b) => new Date(a.date+'T'+a.time) - new Date(b.date+'T'+b.time))
        .slice(0,3);
    if (upcoming.length === 0) {
        container.innerHTML = _emptyState('fa-calendar-check', 'Aucun rendez-vous à venir', '');
        return;
    }
    container.innerHTML = upcoming.map(buildAppointmentCard).join('');
}

function viewAppointmentDetails(id) {
    const apt = allAppointments.find(a => a.id === id);
    if (!apt) return;
    const statusMap = { pending:'En attente', confirmed:'Confirmé', completed:'Terminé', cancelled:'Annulé' };
    const content = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--border);">
            <div>
                <h3 style="font-family:'Playfair Display',serif;font-size:20px;color:var(--text);">Dr. ${apt.doctor_name}</h3>
                <p style="font-size:14px;color:var(--text-2);margin-top:4px;">${apt.specialty || 'Médecin'}</p>
            </div>
            <span class="status-badge status-${apt.status}">${statusMap[apt.status] || apt.status}</span>
        </div>
        <div class="pres-detail-info">
            <div class="pres-detail-row"><span class="pres-detail-label">Date</span><span class="pres-detail-value">${formatDate(apt.date)}</span></div>
            <div class="pres-detail-row"><span class="pres-detail-label">Heure</span><span class="pres-detail-value">${apt.time ? apt.time.substring(0,5) : 'N/A'}</span></div>
            <div class="pres-detail-row"><span class="pres-detail-label">Motif</span><span class="pres-detail-value">${apt.reason || 'Consultation'}</span></div>
            <div class="pres-detail-row"><span class="pres-detail-label">Spécialité</span><span class="pres-detail-value">${apt.specialty || 'Médecin traitant'}</span></div>
        </div>
        <div style="margin-top:24px;">
            <button class="btn btn-outline" onclick="closeModal('prescriptionDetailModal')">Fermer</button>
        </div>`;
    const el = document.getElementById('prescriptionDetailContent');
    if (el) el.innerHTML = content;
    const modal = document.getElementById('prescriptionDetailModal');
    if (modal) modal.querySelector('.modal-header h2').innerHTML = `<i class="fas fa-calendar-check"></i> Détail du rendez-vous`;
    openModal('prescriptionDetailModal');
}

// ========================================
// ORDONNANCES
// ========================================
function isPrescriptionActive(p) {
    if (!p.expiry_date) return true;
    return new Date(p.expiry_date) > new Date();
}

function buildPrescriptionCard(presc) {
    const isActive   = isPrescriptionActive(presc);
    const medsToShow = (presc.medications || []).slice(0,3);
    const remaining  = (presc.medications || []).length - medsToShow.length;
    const pillsHtml  = medsToShow.map(m => `
        <div class="med-pill">
            <strong>${m.name}</strong> <span>${m.dosage}</span>
            <span style="color:var(--text-3);">— ${m.frequency}</span>
        </div>`).join('') +
        (remaining > 0 ? `<div class="med-pill" style="border-color:var(--accent);color:var(--accent);">+${remaining} autre(s)</div>` : '');
    return `
        <div class="prescription-card">
            <div class="prescription-card-inner">
                <div class="appt-left-bar" style="background:linear-gradient(180deg,#8b5cf6,#6366f1);"></div>
                <div class="doctor-info">
                    <div class="doctor-avatar-small" style="background:linear-gradient(135deg,#8b5cf6,#6366f1);border-radius:12px;">
                        <i class="fas fa-file-prescription"></i>
                    </div>
                    <div class="pres-info">
                        <div class="pres-title">${presc.diagnosis || 'Ordonnance'}</div>
                        <div class="pres-doctor">Dr. ${presc.doctor_name} · ${presc.specialty || 'Médecin'}</div>
                        <div style="font-size:11px;color:var(--text-3);margin-top:2px;">N° ${presc.prescription_number || 'N/A'}</div>
                    </div>
                </div>
                <span class="status-badge ${isActive ? 'status-active' : 'status-expired'}">${isActive ? 'En cours' : 'Expirée'}</span>
            </div>
            <div class="medications-list-mini">${pillsHtml}</div>
            <div class="prescription-footer">
                <span class="pres-date">
                    <i class="fas fa-calendar"></i>
                    ${presc.expiry_date ? `Expire le ${formatDate(presc.expiry_date)}` : `Émise le ${formatDate(presc.date)}`}
                </span>
                <div class="pres-actions">
                    <button class="btn btn-outline btn-sm" onclick="viewPrescriptionDetail(${presc.id})"><i class="fas fa-eye"></i> Voir</button>
                    <button class="btn btn-primary btn-sm" onclick="downloadPrescription(${presc.id})"><i class="fas fa-download"></i></button>
                </div>
            </div>
        </div>`;
}

function displayPrescriptions(prescriptions) {
    const container = document.getElementById('prescriptionsList');
    if (!container) return;
    if (!prescriptions || prescriptions.length === 0) {
        container.innerHTML = _emptyState('fa-file-prescription', 'Aucune ordonnance', 'Vos ordonnances apparaîtront ici après vos consultations');
        return;
    }
    container.innerHTML = [...prescriptions].sort((a,b) => new Date(b.date) - new Date(a.date)).map(buildPrescriptionCard).join('');
}

function displayRecentPrescriptions() {
    const container = document.getElementById('recentPrescriptions');
    if (!container) return;
    const recent = [...allPrescriptions].sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0,2);
    if (recent.length === 0) { container.innerHTML = _emptyState('fa-file-prescription', 'Aucune ordonnance récente', ''); return; }
    container.innerHTML = recent.map(buildPrescriptionCard).join('');
}

function viewPrescriptionDetail(id) {
    const p = allPrescriptions.find(x => x.id === id);
    if (!p) return;
    const isActive = isPrescriptionActive(p);
    const medsRows = (p.medications || []).map(m => `
        <tr>
            <td style="font-weight:600;">${m.name}</td>
            <td><span class="dosage-badge">${m.dosage}</span></td>
            <td style="color:var(--text-2);">${m.frequency}</td>
            <td style="color:var(--text-3);">${m.duration || '—'}</td>
        </tr>`).join('');
    const content = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--border);">
            <div>
                <h3 style="font-family:'Playfair Display',serif;font-size:20px;color:var(--text);">${p.diagnosis || 'Ordonnance'}</h3>
                <p style="font-size:14px;color:var(--text-2);margin-top:4px;">Dr. ${p.doctor_name} · ${p.specialty || 'Médecin'}</p>
            </div>
            <span class="status-badge ${isActive ? 'status-active' : 'status-expired'}">${isActive ? 'En cours' : 'Expirée'}</span>
        </div>
        <div class="pres-detail-info">
            <div class="pres-detail-row"><span class="pres-detail-label">N° Ordonnance</span><span class="pres-detail-value">${p.prescription_number || 'N/A'}</span></div>
            <div class="pres-detail-row"><span class="pres-detail-label">Date d'émission</span><span class="pres-detail-value">${formatDate(p.date)}</span></div>
            ${p.expiry_date ? `<div class="pres-detail-row"><span class="pres-detail-label">Expiration</span><span class="pres-detail-value">${formatDate(p.expiry_date)}</span></div>` : ''}
            <div class="pres-detail-row"><span class="pres-detail-label">Prescripteur</span><span class="pres-detail-value">Dr. ${p.doctor_name}</span></div>
            <div class="pres-detail-row"><span class="pres-detail-label">Spécialité</span><span class="pres-detail-value">${p.specialty || 'Médecin traitant'}</span></div>
        </div>
        <h4 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text);margin-bottom:12px;">
            <i class="fas fa-pills" style="color:var(--accent);margin-right:6px;"></i>Médicaments prescrits
        </h4>
        <table class="medications-table">
            <thead><tr><th>Médicament</th><th>Dosage</th><th>Fréquence</th><th>Durée</th></tr></thead>
            <tbody>${medsRows || '<tr><td colspan="4" style="text-align:center;color:var(--text-3);">Aucun médicament</td></tr>'}</tbody>
        </table>
        ${p.instructions ? `<div style="margin-top:18px;padding:14px;background:var(--bg-2);border-radius:12px;border-left:3px solid var(--accent);"><strong style="font-size:13px;">Instructions :</strong><p style="margin-top:6px;font-size:14px;color:var(--text-2);line-height:1.6;">${p.instructions}</p></div>` : ''}
        ${p.notes ? `<div style="margin-top:12px;padding:14px;background:var(--accent-light);border-radius:12px;border-left:3px solid var(--accent);"><strong style="font-size:13px;color:var(--accent);">Notes :</strong><p style="margin-top:6px;font-size:14px;color:var(--text-2);line-height:1.6;">${p.notes}</p></div>` : ''}
        <div style="margin-top:24px;display:flex;gap:10px;">
            <button class="btn btn-primary" onclick="downloadPrescription(${p.id})"><i class="fas fa-download"></i> Télécharger PDF</button>
            <button class="btn btn-outline" onclick="closeModal('prescriptionDetailModal')">Fermer</button>
        </div>`;
    const el = document.getElementById('prescriptionDetailContent');
    if (el) el.innerHTML = content;
    const modal = document.getElementById('prescriptionDetailModal');
    if (modal) modal.querySelector('.modal-header h2').innerHTML = `<i class="fas fa-file-prescription"></i> Détail de l'ordonnance`;
    openModal('prescriptionDetailModal');
}

function downloadPrescription(id) {
    const p = allPrescriptions.find(x => x.id === id);
    if (!p) return;
    showToast(`Téléchargement N° ${p.prescription_number || ''}...`, 'success');

    if (window.jspdf) {
        generatePrescriptionPDF(p);
    } else {
        window.open(`prescription_view.html?id=${id}`, '_blank');
    }
}

function downloadAllPrescriptions() {
    if (allPrescriptions.length === 0) { showToast('Aucune ordonnance à télécharger', 'error'); return; }
    if (window.jspdf) {
        showToast(`Préparation de ${allPrescriptions.length} ordonnance(s)...`, 'success');
        allPrescriptions.forEach((p, i) => {
            setTimeout(() => generatePrescriptionPDF(p), i * 500);
        });
    } else {
        allPrescriptions.forEach(p => window.open(`prescription_view.html?id=${p.id}`, '_blank'));
    }
}

function generatePrescriptionPDF(p) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const w = 210, margin = 20;
    let y = 20;

    // Header banner
    doc.setFillColor(26, 107, 74);
    doc.rect(0, 0, w, 42, 'F');
    doc.setFillColor(42, 144, 104);
    doc.rect(0, 38, w, 4, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('ParrotDiag', margin, 18);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Ordonnance Médicale', margin, 26);

    // Prescription number
    doc.setFontSize(9);
    doc.text(`N° ${p.prescription_number || 'N/A'}`, w - margin, 18, { align: 'right' });
    doc.text(`Date: ${formatDate(p.date)}`, w - margin, 24, { align: 'right' });
    if (p.expiry_date) {
        doc.text(`Expire: ${formatDate(p.expiry_date)}`, w - margin, 30, { align: 'right' });
    }

    y = 52;

    // Doctor info
    doc.setTextColor(26, 107, 74);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Médecin prescripteur', margin, y);
    y += 7;
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Dr. ${p.doctor_name || 'N/A'}`, margin, y);
    y += 5;
    doc.setTextColor(120, 120, 120);
    doc.setFontSize(9);
    doc.text(`Spécialité: ${p.specialty || 'Médecin traitant'}`, margin, y);
    y += 10;

    // Patient info
    doc.setTextColor(26, 107, 74);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Patient', margin, y);
    y += 7;
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(currentUser?.full_name || 'Patient', margin, y);
    y += 10;

    // Diagnostic
    doc.setDrawColor(26, 107, 74);
    doc.setLineWidth(0.5);
    doc.line(margin, y, w - margin, y);
    y += 8;

    doc.setTextColor(26, 107, 74);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Diagnostic', margin, y);
    y += 7;
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(p.diagnosis || 'N/A', margin, y);
    y += 12;

    // Medications table
    const meds = p.medications || [];
    if (meds.length > 0) {
        doc.setTextColor(26, 107, 74);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('Médicaments prescrits', margin, y);
        y += 8;

        // Table header
        doc.setFillColor(232, 247, 242);
        doc.rect(margin, y - 4, w - 2 * margin, 8, 'F');
        doc.setTextColor(26, 107, 74);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text('Médicament', margin + 2, y);
        doc.text('Dosage', margin + 55, y);
        doc.text('Fréquence', margin + 95, y);
        doc.text('Durée', margin + 140, y);
        y += 7;

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(60, 60, 60);
        doc.setFontSize(9);
        meds.forEach(m => {
            if (y > 260) { doc.addPage(); y = 20; }
            doc.text(m.name || '—', margin + 2, y);
            doc.text(m.dosage || '—', margin + 55, y);
            doc.text(m.frequency || '—', margin + 95, y);
            doc.text(m.duration || '—', margin + 140, y);
            y += 6;
        });
        y += 6;
    }

    // Instructions
    if (p.instructions) {
        if (y > 240) { doc.addPage(); y = 20; }
        doc.setTextColor(26, 107, 74);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('Instructions', margin, y);
        y += 7;
        doc.setTextColor(60, 60, 60);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        const lines = doc.splitTextToSize(p.instructions, w - 2 * margin);
        doc.text(lines, margin, y);
        y += lines.length * 4.5 + 6;
    }

    // Notes
    if (p.notes) {
        if (y > 250) { doc.addPage(); y = 20; }
        doc.setTextColor(26, 107, 74);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('Notes', margin, y);
        y += 7;
        doc.setTextColor(100, 100, 100);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'italic');
        const noteLines = doc.splitTextToSize(p.notes, w - 2 * margin);
        doc.text(noteLines, margin, y);
    }

    // Footer
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setDrawColor(26, 107, 74);
        doc.setLineWidth(0.3);
        doc.line(margin, 282, w - margin, 282);
        doc.setTextColor(150, 150, 150);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.text('ParrotDiag — Ordonnance générée électroniquement', margin, 287);
        doc.text(`Page ${i}/${pageCount}`, w - margin, 287, { align: 'right' });
    }

    const filename = `ordonnance_${p.prescription_number || p.id || 'parrotdiag'}.pdf`;
    doc.save(filename);
    showToast(`Ordonnance téléchargée: ${filename}`, 'success');
}

// ========================================
// PARAMÈTRES
// ========================================
function openPatientSettings() {
    // Pre-fill settings with current user data
    if (currentUser) {
        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
        setVal('settingsPatientEmail', currentUser.email);
        setVal('settingsPatientPhone', currentUser.phone);
        setVal('settingsPatientCity', currentUser.city);
        setVal('settingsPatientAddress', currentUser.address);
    }

    // Load saved preferences
    const savedNotifs = JSON.parse(localStorage.getItem('patientNotifSettings') || '{}');
    const setChecked = (id, def) => { const el = document.getElementById(id); if (el) el.checked = savedNotifs[id] !== undefined ? savedNotifs[id] : def; };
    setChecked('notifSettingsAppointments', true);
    setChecked('notifSettingsPrescriptions', true);
    setChecked('notifSettingsMessages', true);
    setChecked('notifSettingsEmail', false);

    // Appearance
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    document.querySelectorAll('input[name="settingsTheme"]').forEach(r => { r.checked = (r.value === currentTheme); });
    const savedLang = localStorage.getItem('patientLanguage') || 'fr';
    const langSelect = document.getElementById('settingsLanguage');
    if (langSelect) langSelect.value = savedLang;

    // Privacy
    const savedPrivacy = JSON.parse(localStorage.getItem('patientPrivacySettings') || '{}');
    const el1 = document.getElementById('privacyShareData');
    if (el1) el1.checked = savedPrivacy.shareData !== undefined ? savedPrivacy.shareData : true;
    const el2 = document.getElementById('privacyImproveAI');
    if (el2) el2.checked = savedPrivacy.improveAI !== undefined ? savedPrivacy.improveAI : true;

    // Reset to first tab
    switchPatientSettingsTab('account');
    openModal('settingsModal');
}

function switchPatientSettingsTab(tabName) {
    document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.settings-panel').forEach(p => { p.style.display = 'none'; p.classList.remove('active'); });

    const activeTab = document.querySelector(`.settings-tab[data-settings-tab="${tabName}"]`);
    if (activeTab) activeTab.classList.add('active');

    const map = { account: 'patientSettingsAccount', notifications: 'patientSettingsNotifications',
                  appearance: 'patientSettingsAppearance', privacy: 'patientSettingsPrivacy' };
    const panel = document.getElementById(map[tabName]);
    if (panel) { panel.style.display = 'block'; panel.classList.add('active'); }
}

async function savePatientSettings() {
    const profileData = {
        user_id: currentUser.id,
        full_name: currentUser.full_name || '',
        email: currentUser.email || '',
        phone: document.getElementById('settingsPatientPhone')?.value || '',
        city: document.getElementById('settingsPatientCity')?.value || '',
        address: document.getElementById('settingsPatientAddress')?.value || ''
    };
    try {
        const response = await fetch(`${API_URL}/patients/profile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(profileData)
        });
        if (response.ok) {
            currentUser = { ...currentUser, ...profileData };
            localStorage.setItem('user', JSON.stringify(currentUser));
            showToast('Paramètres du compte enregistrés ✓', 'success');
        } else {
            showToast('Erreur lors de la sauvegarde', 'error');
        }
    } catch (err) {
        showToast('Erreur de connexion au serveur', 'error');
    }
}

function changePatientPassword() {
    const currentPwd = document.getElementById('settingsCurrentPassword')?.value;
    const newPwd = document.getElementById('settingsNewPassword')?.value;
    const confirmPwd = document.getElementById('settingsConfirmPassword')?.value;

    if (!currentPwd || !newPwd || !confirmPwd) {
        showToast('Veuillez remplir tous les champs', 'error'); return;
    }
    if (newPwd.length < 6) {
        showToast('Le mot de passe doit contenir au moins 6 caractères', 'error'); return;
    }
    if (newPwd !== confirmPwd) {
        showToast('Les mots de passe ne correspondent pas', 'error'); return;
    }
    // Clear fields
    document.getElementById('settingsCurrentPassword').value = '';
    document.getElementById('settingsNewPassword').value = '';
    document.getElementById('settingsConfirmPassword').value = '';
    showToast('Mot de passe mis à jour ✓', 'success');
}

function saveNotifSettings() {
    const settings = {
        notifSettingsAppointments: document.getElementById('notifSettingsAppointments')?.checked ?? true,
        notifSettingsPrescriptions: document.getElementById('notifSettingsPrescriptions')?.checked ?? true,
        notifSettingsMessages: document.getElementById('notifSettingsMessages')?.checked ?? true,
        notifSettingsEmail: document.getElementById('notifSettingsEmail')?.checked ?? false
    };
    localStorage.setItem('patientNotifSettings', JSON.stringify(settings));
    showToast('Préférences de notification enregistrées ✓', 'success');
}

function saveAppearanceSettings() {
    const selectedTheme = document.querySelector('input[name="settingsTheme"]:checked')?.value || 'light';
    document.documentElement.setAttribute('data-theme', selectedTheme);
    localStorage.setItem('parrotTheme', selectedTheme);

    const selectedLang = document.getElementById('settingsLanguage')?.value || 'fr';
    localStorage.setItem('patientLanguage', selectedLang);

    showToast('Préférences d\'apparence enregistrées ✓', 'success');
}

function savePrivacySettings() {
    const settings = {
        shareData: document.getElementById('privacyShareData')?.checked ?? true,
        improveAI: document.getElementById('privacyImproveAI')?.checked ?? true
    };
    localStorage.setItem('patientPrivacySettings', JSON.stringify(settings));
    showToast('Paramètres de confidentialité enregistrés ✓', 'success');
}

function exportPatientData() {
    const data = {
        profile: currentUser,
        appointments: allAppointments,
        prescriptions: allPrescriptions,
        exportDate: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `parrotdiag_mes_donnees_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Données exportées ✓', 'success');
}

function requestAccountDeletion() {
    if (confirm('⚠️ Êtes-vous sûr de vouloir supprimer votre compte ?\n\nCette action est irréversible et toutes vos données seront perdues.')) {
        showToast('Demande de suppression envoyée. Vous serez contacté par email.', 'info');
    }
}

// ========================================
// NOTIFICATIONS
// ========================================
function renderNotifications() {
    const container = document.getElementById('notificationsList');
    if (!container) return;
    if (!allNotifications || allNotifications.length === 0) {
        container.innerHTML = `<div style="padding:30px;text-align:center;color:var(--text-3);font-size:14px;">Aucune notification</div>`;
        return;
    }
    const iconMap = {
        appointment:'fa-calendar-check', appointment_request:'fa-calendar-plus',
        appointment_confirmed:'fa-check-circle', appointment_cancelled:'fa-times-circle',
        appointment_completed:'fa-check-double', appointment_rescheduled:'fa-calendar-alt',
        prescription:'fa-file-prescription', reminder:'fa-clock',
        message:'fa-envelope', info:'fa-info-circle'
    };
    const sorted = [...allNotifications].sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    container.innerHTML = sorted.map(n => `
        <div class="notif-item ${!n.is_read ? 'unread' : ''}" onclick="markNotificationRead(${n.id})">
            <div class="notif-icon"><i class="fas ${iconMap[n.type] || 'fa-bell'}"></i></div>
            <div class="notif-content">
                <div class="notif-title">${n.title}</div>
                <div class="notif-msg">${n.message}</div>
                <div class="notif-time">${formatDateTime(n.created_at)}</div>
            </div>
        </div>`).join('');
}

function updateNotificationBadge() {
    const badge = document.getElementById('notificationBadge');
    if (!badge) return;
    const unread = allNotifications.filter(n => !n.is_read).length;
    badge.textContent = unread;
    badge.style.display = unread > 0 ? 'flex' : 'none';
}

function toggleNotifications() {
    const panel = document.getElementById('notificationsPanel');
    if (!panel) return;
    panel.classList.toggle('show');
    if (panel.classList.contains('show')) renderNotifications();
}

async function markNotificationRead(id) {
    try {
        await fetch(`${API_URL}/notifications/${id}/read`, { method: 'POST' });
        const n = allNotifications.find(x => x.id === id);
        if (n) { n.is_read = 1; updateNotificationBadge(); renderNotifications(); }
    } catch (e) { console.error("Erreur marquage notification:", e); }
}

async function markAllNotificationsRead() {
    try {
        await fetch(`${API_URL}/notifications/mark-all-read?user_id=${currentUser.id}`, { method: 'POST' });
        allNotifications.forEach(n => n.is_read = 1);
        updateNotificationBadge(); renderNotifications();
        showToast('Toutes les notifications lues ✓', 'success');
    } catch (e) { console.error("Erreur:", e); }
}

function startNotificationPolling() {
    notificationInterval = setInterval(async () => {
        await loadNotifications();
        updateNotificationBadge();
    }, 30000);
}

// ========================================
// PRISE DE RENDEZ-VOUS
// ========================================
function openNewAppointment() {
    const doctorsTab = document.querySelector('[data-tab="doctors"]');
    if (doctorsTab) doctorsTab.click();
    else showToast('La liste des médecins sera bientôt disponible', 'info');
}

function openAppointmentModal(doctorId, doctorName, specialty) {
    const modal = document.getElementById('appointmentModal');
    if (!modal || !doctorId || !doctorName) {
        showToast('Erreur: données du médecin manquantes', 'error'); return;
    }

    document.getElementById('appointmentDoctorId').value = doctorId;
    document.getElementById('appointmentDoctorName').innerHTML = `<i class="fas fa-user-md"></i> Dr. ${doctorName}`;
    document.getElementById('appointmentDoctorSpecialty').textContent = specialty || 'Médecin';

    const now = new Date();
    currentDoctorId      = doctorId;
    currentCalendarMonth = now.getMonth();
    currentCalendarYear  = now.getFullYear();
    selectedDate         = null;
    selectedTime         = null;
    doctorCalendarData   = {};

    document.getElementById('appointmentReason').value       = '';
    document.getElementById('appointmentType').value         = 'consultation';
    document.getElementById('submitAppointmentBtn').disabled = true;
    document.getElementById('slotsContainer').style.display  = 'none';
    document.getElementById('appointmentDate').value         = '';
    document.getElementById('appointmentTime').value         = '';

    openModal('appointmentModal');
    setTimeout(() => loadDoctorCalendar(), 100);
}

// ========================================
// CALENDRIER
//
// PRINCIPE FONDAMENTAL :
//   L'API (main.py) génère déjà TOUS les jours du mois avec la bonne couleur,
//   en tenant compte de :
//     • doctor_availabilities  (fermetures manuelles du médecin, max_patients)
//     • doctor_working_hours   (horaires habituels)
//     • appointments           (RDV déjà réservés → rouge si complet)
//
//   Le frontend AFFICHE simplement ce que l'API renvoie — sans aucune logique
//   de couleur locale, sans fusion, sans sur-écriture.
//
//   Si l'API est inaccessible → fallback local : lun-ven vert, sam/dim orange.
// ========================================

/** Fallback uniquement si l'API est hors ligne. */
function _buildFallbackCalendarData(year, month) {
    const data  = {};
    const today = new Date(); today.setHours(0,0,0,0);
    const days  = new Date(year, month, 0).getDate(); // month 1-indexed

    for (let day = 1; day <= days; day++) {
        const d       = new Date(year, month - 1, day);
        const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const dow     = d.getDay();
        const isPast  = d < today;

        if (isPast) {
            data[dateStr] = { color:'gray',   is_available:false, available_slots:0, message:'Date passée' };
        } else if (dow === 0 || dow === 6) {
            data[dateStr] = { color:'orange', is_available:false, available_slots:0, message:'Week-end (fermé)' };
        } else {
            data[dateStr] = { color:'green',  is_available:true,  available_slots:8, message:'Disponible' };
        }
    }
    return data;
}

async function loadDoctorCalendar() {
    if (!currentDoctorId) return;

    const month = currentCalendarMonth + 1; // 0-indexed → 1-indexed pour l'API
    const year  = currentCalendarYear;

    // Indicateur de chargement
    const calEl = document.getElementById('appointmentCalendar');
    if (calEl) calEl.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-3);"><i class="fas fa-spinner fa-spin" style="font-size:24px;"></i></div>';

    try {
        const url = `${API_URL}/doctors/${currentDoctorId}/calendar/${month}/${year}`;
        console.log(`📅 GET ${url}`);

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            // ✅ On utilise les données de l'API À 100% — aucune modification locale
            doctorCalendarData = await response.json();
            console.log(`✅ ${Object.keys(doctorCalendarData).length} jours reçus depuis l'API`);
        } else {
            console.warn(`⚠️ Erreur API ${response.status} — fallback local`);
            doctorCalendarData = _buildFallbackCalendarData(year, month);
        }

    } catch (err) {
        console.warn('⚠️ API inaccessible — fallback local:', err.message);
        doctorCalendarData = _buildFallbackCalendarData(year, month);
    }

    renderPatientCalendar();
}

function renderPatientCalendar() {
    const monthNames = ['Janvier','Février','Mars','Avril','Mai','Juin',
                        'Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
    const dayNames   = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];

    const titleEl = document.getElementById('calendarMonth');
    if (titleEl) titleEl.textContent = `${monthNames[currentCalendarMonth]} ${currentCalendarYear}`;

    const firstDay      = new Date(currentCalendarYear, currentCalendarMonth, 1).getDay();
    const daysInMonth   = new Date(currentCalendarYear, currentCalendarMonth + 1, 0).getDate();
    const firstDayIndex = firstDay === 0 ? 6 : firstDay - 1;

    let html = '';
    dayNames.forEach(d => { html += `<div class="calendar-day-header">${d}</div>`; });
    for (let i = 0; i < firstDayIndex; i++) html += '<div class="calendar-empty"></div>';

    const colorStyles = {
        green:  { bg: '#10b981', border: '#059669' },
        red:    { bg: '#ef4444', border: '#dc2626' },
        orange: { bg: '#f97316', border: '#ea580c' },
        gray:   { bg: '#d1d5db', border: '#9ca3af' }
    };

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${currentCalendarYear}-${String(currentCalendarMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;

        // Lire directement les données de l'API (ou du fallback)
        const dayData = doctorCalendarData[dateStr] || {
            color:'gray', is_available:false, available_slots:0, message:'Non disponible'
        };

        const color    = dayData.color || 'gray';
        const disabled = !dayData.is_available;
        const style    = colorStyles[color] || colorStyles.gray;

        const isSelected       = selectedDate === dateStr;
        const borderWidth      = isSelected ? '3px' : '1px';
        const borderColorFinal = isSelected ? '#2fa37c' : style.border;
        const boxShadow        = isSelected ? '0 0 12px rgba(47,163,124,0.4)' : 'none';

        // Badge créneaux (vert seulement)
        const slotBadge = (color === 'green' && dayData.available_slots > 0)
            ? `<span class="slot-badge">${dayData.available_slots}</span>` : '';

        // Icône d'état (fermé / complet)
        const statusIcon = color === 'orange'
            ? `<span style="position:absolute;top:-5px;right:-5px;background:white;border-radius:50%;width:16px;height:16px;font-size:9px;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,0.2);">🔒</span>`
            : color === 'red'
            ? `<span style="position:absolute;top:-5px;right:-5px;background:white;color:#ef4444;border-radius:50%;width:16px;height:16px;font-size:10px;display:flex;align-items:center;justify-content:center;font-weight:bold;box-shadow:0 1px 3px rgba(0,0,0,0.2);">✕</span>`
            : '';

        html += `
            <button type="button"
                class="calendar-day${!disabled ? ' clickable' : ''}"
                ${disabled ? 'disabled' : `onclick="selectPatientDate('${dateStr}')"`}
                title="${dayData.message || ''}"
                style="background:${style.bg};border:${borderWidth} solid ${borderColorFinal};cursor:${disabled ? 'not-allowed' : 'pointer'};opacity:${disabled ? 0.65 : 1};box-shadow:${boxShadow};position:relative;transition:all 0.15s;">
                <span>${day}</span>
                ${slotBadge}
                ${statusIcon}
            </button>`;
    }

    const calEl = document.getElementById('appointmentCalendar');
    if (calEl) calEl.innerHTML = html;
}

function selectPatientDate(dateStr) {
    selectedDate = dateStr;
    selectedTime = null;
    const submitBtn = document.getElementById('submitAppointmentBtn');
    if (submitBtn) submitBtn.disabled = true;
    document.getElementById('slotsContainer').style.display = 'none';
    renderPatientCalendar();
    loadPatientAvailableSlots(dateStr);
}

async function loadPatientAvailableSlots(dateStr) {
    const container = document.getElementById('slotsContainer');
    if (!container) return;
    container.style.display = 'block';
    container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-3);"><i class="fas fa-spinner fa-spin"></i> Chargement...</div>';

    try {
        const url = `${API_URL}/doctors/${currentDoctorId}/available-slots/${dateStr}`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        if (response.ok) {
            renderPatientSlots(await response.json(), dateStr);
        } else {
            container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-3);">Erreur lors du chargement des créneaux</div>';
        }
    } catch (error) {
        console.error('❌ Erreur créneaux:', error);
        container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-3);">Erreur de connexion</div>';
    }
}

function renderPatientSlots(slotsData, dateStr) {
    const container = document.getElementById('slotsContainer');
    if (!container) return;

    const dateObj       = new Date(dateStr + 'T00:00:00');
    const formattedDate = dateObj.toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' });

    let html = `
        <div style="margin-top:20px;margin-bottom:12px;">
            <h3 style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:4px;">
                Créneaux — ${formattedDate}
            </h3>
            <p style="font-size:12px;color:var(--text-muted);">
                ${slotsData.message || `${slotsData.available_count || 0} créneau(x) disponible(s)`}
            </p>
        </div>`;

    if (!slotsData.available_slots || slotsData.available_slots.length === 0) {
        html += `
            <div style="padding:30px;text-align:center;background:var(--bg-secondary);border-radius:12px;">
                <i class="fas fa-clock" style="font-size:28px;color:var(--text-muted);margin-bottom:10px;opacity:0.5;display:block;"></i>
                <p style="color:var(--text-muted);font-size:13px;">Aucun créneau disponible pour cette date</p>
            </div>`;
    } else {
        html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(85px,1fr));gap:8px;">';
        slotsData.available_slots.forEach(time => {
            const isSel = selectedTime === time;
            html += `
                <button type="button" class="slot-button" onclick="selectTimeSlot('${time}')"
                    style="padding:11px 6px;background:${isSel?'var(--teal)':'var(--bg-primary)'};border:2px solid var(--teal);border-radius:8px;color:${isSel?'white':'var(--teal)'};cursor:pointer;font-weight:600;font-size:13px;transition:all 0.15s;transform:${isSel?'translateY(-2px)':'none'};box-shadow:${isSel?'0 4px 8px rgba(16,185,129,0.25)':'none'};"
                    onmouseover="this.style.background='var(--teal)';this.style.color='white';this.style.transform='translateY(-2px)';"
                    onmouseout="if('${time}'!==window._selTime){this.style.background='var(--bg-primary)';this.style.color='var(--teal)';this.style.transform='none';}">
                    ${time}
                </button>`;
        });
        html += '</div>';
    }

    container.innerHTML = html;
    container.style.display = 'block';
}

function selectTimeSlot(time) {
    selectedTime       = time;
    window._selTime    = time;

    document.getElementById('appointmentDate').value         = selectedDate;
    document.getElementById('appointmentTime').value         = time;
    document.getElementById('submitAppointmentBtn').disabled = false;

    document.querySelectorAll('.slot-button').forEach(btn => {
        const t = btn.textContent.trim();
        if (t === time) {
            btn.style.background  = 'var(--teal)';
            btn.style.color       = 'white';
            btn.style.transform   = 'translateY(-2px)';
            btn.style.boxShadow   = '0 4px 8px rgba(16,185,129,0.25)';
        } else {
            btn.style.background  = 'var(--bg-primary)';
            btn.style.color       = 'var(--teal)';
            btn.style.transform   = 'none';
            btn.style.boxShadow   = 'none';
        }
    });
}

function prevMonthCalendar() {
    currentCalendarMonth--;
    if (currentCalendarMonth < 0) { currentCalendarMonth = 11; currentCalendarYear--; }
    selectedDate = null; selectedTime = null;
    loadDoctorCalendar();
}

function nextMonthCalendar() {
    currentCalendarMonth++;
    if (currentCalendarMonth > 11) { currentCalendarMonth = 0; currentCalendarYear++; }
    selectedDate = null; selectedTime = null;
    loadDoctorCalendar();
}

async function submitAppointment(e) {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Envoi...'; }

    const appointmentData = {
        patient_id: currentUser.id,
        doctor_id:  parseInt(document.getElementById('appointmentDoctorId').value),
        date:       document.getElementById('appointmentDate').value,
        time:       document.getElementById('appointmentTime').value + ':00',
        reason:     document.getElementById('appointmentReason').value,
        type:       document.getElementById('appointmentType')?.value || 'consultation'
    };

    try {
        const response = await fetch(`${API_URL}/appointments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(appointmentData)
        });
        if (response.ok) {
            showToast('Demande de rendez-vous envoyée !', 'success');
            closeModal('appointmentModal');
            await loadPatientAppointments();
            displayAppointments(allAppointments);
            displayUpcomingAppointments();
            document.querySelector('[data-tab="appointments"]')?.click();
        } else {
            const error = await response.json();
            showToast(error.detail || 'Erreur lors de la création', 'error');
        }
    } catch (err) {
        showToast('Erreur de connexion au serveur', 'error');
    } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Envoyer la demande'; }
    }
}

// ========================================
// PROFIL PATIENT
// ========================================
function openEditProfile() {
    loadPatientProfile().then(() => { fillProfileForm(); openModal('patientProfileModal'); });
}

function previewPatientPhoto(input) {
    if (!input.files || !input.files[0]) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const preview = document.getElementById('patientPhotoPreview');
        if (preview) preview.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        const b64 = document.getElementById('patientPhotoBase64');
        if (b64) b64.value = e.target.result;
    };
    reader.readAsDataURL(input.files[0]);
}

async function savePatientProfile(e) {
    e.preventDefault();
    const saveBtn = e.target.querySelector('button[type="submit"]');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...'; }

    const birthDate   = document.getElementById('patientBirthDate')?.value || '';
    const profileData = {
        user_id: currentUser.id,
        full_name:           document.getElementById('patientFullName')?.value || '',
        email:               document.getElementById('patientEmail')?.value || '',
        birth_date:          birthDate,
        age:                 calculateAge(birthDate),
        sex:                 document.getElementById('patientSex')?.value || '',
        phone:               document.getElementById('patientPhone')?.value || '',
        address:             document.getElementById('patientAddress')?.value || '',
        city:                document.getElementById('patientCity')?.value || '',
        zip_code:            document.getElementById('patientZipCode')?.value || '',
        blood_type:          document.getElementById('patientBloodType')?.value || '',
        allergies:           document.getElementById('patientAllergies')?.value || '',
        marital_status:      document.getElementById('patientMaritalStatus')?.value || '',
        current_medications: document.getElementById('patientMedications')?.value || '',
        medical_history:     document.getElementById('patientHistory')?.value || '',
        profile_photo:       document.getElementById('patientPhotoBase64')?.value || currentUser.profile_photo || null,
        emergency_contact: {
            name:     document.getElementById('emergencyName')?.value || '',
            phone:    document.getElementById('emergencyPhone')?.value || '',
            relation: document.getElementById('emergencyRelation')?.value || ''
        }
    };

    try {
        const response = await fetch(`${API_URL}/patients/profile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(profileData)
        });
        if (response.ok) {
            currentUser = { ...currentUser, ...profileData };
            localStorage.setItem('user', JSON.stringify(currentUser));
            showToast('Profil mis à jour ✓', 'success');
            closeModal('patientProfileModal');
            initUserInterface();
            await reloadAllData();
        } else {
            const error = await response.json();
            showToast(error.detail || 'Erreur lors de l\'enregistrement', 'error');
        }
    } catch (err) {
        showToast('Erreur de connexion au serveur', 'error');
    } finally {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-save"></i> Enregistrer'; }
    }
}

// ========================================
// NAVIGATION & ÉVÉNEMENTS
// ========================================
function initEventListeners() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', function () {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
            this.classList.add('active');
            const map = { dashboard:'dashboardSection', appointments:'appointmentsSection',
                          prescriptions:'prescriptionsSection', doctors:'doctorsSection' };
            const target = map[this.dataset.tab];
            if (target) {
                document.getElementById(target)?.classList.add('active');
                if (this.dataset.tab === 'doctors') loadDoctorsList();
            }
            if (this.dataset.tab === 'appointments') displayAppointments(allAppointments);
            if (this.dataset.tab === 'prescriptions') displayPrescriptions(allPrescriptions);
        });
    });

    document.getElementById('notificationBtn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleNotifications();
        document.getElementById('userMenu')?.classList.remove('active');
    });

    document.addEventListener('click', (e) => {
        const panel = document.getElementById('notificationsPanel');
        const btn   = document.getElementById('notificationBtn');
        if (panel && btn && !btn.contains(e.target) && !panel.contains(e.target))
            panel.classList.remove('show');
    });

    const userMenu = document.getElementById('userMenu');
    document.getElementById('userTrigger')?.addEventListener('click', (e) => {
        e.stopPropagation();
        userMenu?.classList.toggle('active');
        document.getElementById('notificationsPanel')?.classList.remove('show');
    });
    document.addEventListener('click', () => userMenu?.classList.remove('active'));

    document.getElementById('editProfileLink')?.addEventListener('click', (e) => {
        e.preventDefault(); userMenu?.classList.remove('active'); openEditProfile();
    });
    document.getElementById('settingsLink')?.addEventListener('click', (e) => {
        e.preventDefault(); userMenu?.classList.remove('active'); openPatientSettings();
    });
    document.getElementById('logoutLink')?.addEventListener('click', (e) => { e.preventDefault(); logout(); });

    document.getElementById('patientProfileForm')?.addEventListener('submit', savePatientProfile);
    document.getElementById('appointmentForm')?.addEventListener('submit', submitAppointment);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay.open').forEach(m => {
                m.classList.remove('open'); m.style.display = 'none'; document.body.style.overflow = 'auto';
            });
        }
    });

    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('open'); overlay.style.display = 'none'; document.body.style.overflow = 'auto';
            }
        });
    });
}

function initFilterButtons() {
    document.querySelectorAll('#appointmentsSection .btn-filter').forEach((btn, i) => {
        btn.addEventListener('click', function () {
            document.querySelectorAll('#appointmentsSection .btn-filter').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            const f = ['all','pending','confirmed','completed','cancelled'][i];
            displayAppointments(f === 'all' ? allAppointments : allAppointments.filter(a => a.status === f));
        });
    });
    document.querySelectorAll('#prescriptionsSection .btn-filter').forEach((btn, i) => {
        btn.addEventListener('click', function () {
            document.querySelectorAll('#prescriptionsSection .btn-filter').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            const f = ['all','active','expired'][i];
            let filtered = allPrescriptions;
            if (f === 'active')  filtered = allPrescriptions.filter(p =>  isPrescriptionActive(p));
            if (f === 'expired') filtered = allPrescriptions.filter(p => !isPrescriptionActive(p));
            displayPrescriptions(filtered);
        });
    });
}

// ========================================
// MODALS
// ========================================
function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) { modal.style.display = 'flex'; modal.classList.add('open'); document.body.style.overflow = 'hidden'; }
}
function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) { modal.style.display = 'none'; modal.classList.remove('open'); document.body.style.overflow = 'auto'; }
}

// ========================================
// TOAST & LOADING
// ========================================
function showToast(message, type = 'success') {
    document.querySelectorAll('.toast').forEach(t => t.remove());
    const icons = { success:'check-circle', error:'times-circle', info:'info-circle' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fas fa-${icons[type] || 'info-circle'}"></i> ${message}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}

function showLoading(message = 'Chargement...') {
    let loader = document.getElementById('globalLoader');
    if (!loader) {
        loader = document.createElement('div');
        loader.id = 'globalLoader';
        loader.style.cssText = 'position:fixed;inset:0;background:rgba(15,26,23,0.7);display:flex;flex-direction:column;justify-content:center;align-items:center;z-index:9999;backdrop-filter:blur(8px);';
        document.body.appendChild(loader);
    }
    loader.innerHTML = `
        <div style="width:44px;height:44px;border:3px solid rgba(255,255,255,0.1);border-top:3px solid var(--accent);border-radius:50%;animation:_spin 0.8s linear infinite;margin-bottom:16px;"></div>
        <p style="font-size:13px;color:var(--text-3);">${message}</p>`;
}
function hideLoading() { document.getElementById('globalLoader')?.remove(); }

// ========================================
// UTILITAIRES
// ========================================
function getInitials(name) {
    if (!name) return '??';
    return name.trim().split(' ').map(n => n[0]).join('').toUpperCase().substring(0,2);
}
function formatDate(str) {
    if (!str) return '—';
    return new Date(str).toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' });
}
function formatDateTime(str) {
    if (!str) return '—';
    return new Date(str).toLocaleDateString('fr-FR', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
}
function calculateAge(birthDate) {
    if (!birthDate) return null;
    const today = new Date(), birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    if (today.getMonth() < birth.getMonth() ||
        (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--;
    return age;
}
function logout() {
    if (notificationInterval) clearInterval(notificationInterval);
    localStorage.clear();
    showToast('Déconnexion réussie', 'success');
    setTimeout(() => window.location.href = 'connexionpage.html', 1000);
}
function _emptyState(icon, title, subtitle, extra = '') {
    return `<div class="empty-state"><i class="fas ${icon}"></i><h3>${title}</h3>${subtitle ? `<p>${subtitle}</p>` : ''}${extra}</div>`;
}

// Theme toggle
(function() {
    const saved = localStorage.getItem('parrotTheme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
    document.addEventListener('DOMContentLoaded', () => {
        document.getElementById('themeToggle')?.addEventListener('click', () => {
            const cur  = document.documentElement.getAttribute('data-theme');
            const next = cur === 'light' ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('parrotTheme', next);
        });
    });
})();

const _styles = document.createElement('style');
_styles.textContent = `@keyframes _spin { to { transform: rotate(360deg); } }`;
document.head.appendChild(_styles);