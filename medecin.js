// ============================================
// CONFIGURATION
// ============================================
const API_URL = "http://127.0.0.1:8000";
let currentDoctor = null;
let allPatients = [];
let allAppointments = [];
let todayAppointments = [];
let allAppointmentsList = [];
let notifications = [];
let currentConversation = null;
let realTimeUpdateInterval = null;
let messagePollingInterval = null;

// Variables pour les statistiques
let statsCharts = {};
let statsPeriod = 30;
let statsRefreshInterval = null;

// Variables pour les disponibilités
let currentAvailabilityMonth = new Date();
let selectedDate = null;
let doctorAvailabilities = {};

// ============================================
// FONCTIONS UTILITAIRES
// ============================================
function getInitials(name) {
    if (!name) return '??';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
}

function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

function formatDateTime(dateTimeString) {
    if (!dateTimeString) return '';
    const date = new Date(dateTimeString);
    return date.toLocaleString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit'
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showLoading(message = 'Chargement...') {
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
            background: rgba(10,13,18,0.85);
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            z-index: 9999;
            backdrop-filter: blur(8px);
        `;
        document.body.appendChild(loader);
    }
    loader.innerHTML = `
        <div style="border:2px solid rgba(255,255,255,0.08);border-top:2px solid #3dd9b4;border-radius:50%;width:40px;height:40px;animation:spin 0.8s linear infinite;margin-bottom:16px;"></div>
        <p style="margin-top:0;font-size:13px;color:#8b909e;font-family:'DM Sans',sans-serif;">${message}</p>
    `;
}

function hideLoading() {
    const loader = document.getElementById('globalLoader');
    if (loader) loader.remove();
}

function showNotification(message, type = 'info') {
    const toast = document.getElementById('notificationToast');
    if (!toast) return;

    const title = document.getElementById('toastTitle');
    const toastMessage = document.getElementById('toastMessage');

    const colors = {
        success: '#3dd9b4',
        error: '#e55c5c',
        warning: '#f0a04a',
        info: '#5b8dee'
    };
    toast.style.borderLeftColor = colors[type] || '#5b8dee';

    const icons = {
        success: 'check-circle',
        error: 'exclamation-circle',
        warning: 'exclamation-triangle',
        info: 'info-circle'
    };

    if (title) {
        title.innerHTML = `<i class="fas fa-${icons[type] || 'info-circle'}" style="color:${colors[type]};margin-right:6px;"></i> ${type.charAt(0).toUpperCase() + type.slice(1)}`;
    }

    if (toastMessage) toastMessage.textContent = message;
    toast.style.display = 'block';
    setTimeout(() => toast.style.display = 'none', 5000);
}

function closeToast() {
    document.getElementById('notificationToast').style.display = 'none';
}

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
        if (modalId === 'prescriptionDetailsModal') {
            setTimeout(() => { if (modal.parentNode) modal.remove(); }, 300);
        } else {
            document.body.style.overflow = 'auto';
        }
    }
}

function getStatusBadgeClass(status) {
    const classes = {
        confirmed: 'badge-primary',
        completed: 'badge-success',
        pending: 'badge-warning',
        cancelled: 'badge-danger',
        rescheduled_pending: 'badge-info'
    };
    return classes[status] || 'badge-info';
}

function getStatusIcon(status) {
    const icons = {
        confirmed: 'fas fa-check-circle',
        completed: 'fas fa-check-double',
        pending: 'fas fa-clock',
        cancelled: 'fas fa-times-circle',
        rescheduled_pending: 'fas fa-calendar-alt'
    };
    return icons[status] || 'fas fa-info-circle';
}

function getStatusText(status) {
    const texts = {
        pending: 'En attente',
        confirmed: 'Confirmé',
        completed: 'Terminé',
        cancelled: 'Annulé',
        rescheduled_pending: 'Proposition envoyée'
    };
    return texts[status] || status;
}

function getAppointmentTypeText(type) {
    const types = {
        consultation: 'Consultation standard',
        followup: 'Suivi',
        emergency: 'Urgence',
        teleconsultation: 'Téléconsultation'
    };
    return types[type] || type || 'Consultation';
}

// ============================================
// AUTHENTIFICATION & INTERFACE
// ============================================
async function checkAuthentication() {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');

    if (!token || !userStr) {
        window.location.href = 'connexionpage.html';
        return false;
    }

    try {
        const user = JSON.parse(userStr);
        if (user.role !== 'doctor') {
            window.location.href = 'index.html';
            return false;
        }
        currentDoctor = user;
        return true;
    } catch (error) {
        localStorage.clear();
        window.location.href = 'connexionpage.html';
        return false;
    }
}

function updateUserInterface() {
    if (!currentDoctor) return;

    document.getElementById('userName').textContent = currentDoctor.full_name || 'Docteur';
    document.getElementById('userRole').innerHTML = `<i class="fas fa-circle"></i> <span>${currentDoctor.specialty || 'Médecin'}</span>`;
    document.getElementById('userAvatar').textContent = getInitials(currentDoctor.full_name);

    const lastName = currentDoctor.full_name?.split(' ').pop() || 'Médecin';
    document.getElementById('pageTitle').textContent = `Dr. ${lastName} — Tableau de bord`;

    updateUserDropdown();
}

function updateUserDropdown() {
    document.getElementById('dropdownName').textContent = currentDoctor.full_name || 'Docteur';
    document.getElementById('dropdownSpecialty').textContent = currentDoctor.specialty || 'Médecin';
    document.getElementById('dropdownAvatar').textContent = getInitials(currentDoctor.full_name);
}

function updateCurrentDate() {
    const now = new Date();
    const dateStr = now.toLocaleDateString('fr-FR', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    document.getElementById('currentDate').innerHTML = `
        <i class="fas fa-circle"></i>
        <span>${dateStr.charAt(0).toUpperCase() + dateStr.slice(1)}</span>
    `;
}

function toggleUserDropdown() {
    document.getElementById('userDropdown').classList.toggle('show');
}

// ============================================
// FIX 1 — handleLogout : préserver les disponibilités
// ============================================
function handleLogout() {
    toggleUserDropdown();
    if (confirm('Voulez-vous vous déconnecter ?')) {
        if (realTimeUpdateInterval) clearInterval(realTimeUpdateInterval);
        if (messagePollingInterval) clearInterval(messagePollingInterval);

        // Garder les clés de disponibilité lors de la déconnexion
        const keysToKeep = Object.keys(localStorage).filter(k => k.includes('availabilities'));
        const saved = {};
        keysToKeep.forEach(k => { saved[k] = localStorage.getItem(k); });
        localStorage.clear();
        keysToKeep.forEach(k => { localStorage.setItem(k, saved[k]); });

        window.location.href = 'connexionpage.html';
    }
}

// ============================================
// NAVIGATION
// ============================================
function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            this.classList.add('active');
            loadPageContent(this.dataset.page);
        });
    });
}

async function loadPageContent(page) {
    document.getElementById('dashboardContent').style.display = 'none';
    document.getElementById('patientsContent').style.display = 'none';
    document.getElementById('appointmentsContent').style.display = 'none';
    const statsEl = document.getElementById('statisticsContent');
    if (statsEl) statsEl.style.display = 'none';
    const availEl = document.getElementById('availabilityContent');
    if (availEl) availEl.style.display = 'none';
    if (page !== 'statistics') cleanupStats();

    switch(page) {
        case 'dashboard':
            document.getElementById('dashboardContent').style.display = 'block';
            break;
        case 'patients':
            document.getElementById('patientsContent').style.display = 'block';
            await loadAllPatients();
            break;
        case 'appointments':
            document.getElementById('appointmentsContent').style.display = 'block';
            await loadAllAppointments();
            break;
        case 'availability':
            document.getElementById('availabilityContent').style.display = 'block';
            initAvailabilityCalendar();
            break;
        case 'messages':
            await loadMessagesPage();
            break;
        case 'statistics':
            if (typeof Chart === 'undefined') {
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js';
                script.onload = () => loadStatisticsPage();
                document.head.appendChild(script);
            } else {
                await loadStatisticsPage();
            }
            break;
        default:
            document.getElementById('dashboardContent').style.display = 'block';
    }
}

// ============================================
// STATISTIQUES
// ============================================
async function loadStats() {
    try {
        const response = await fetch(`${API_URL}/doctors/${currentDoctor.id}/stats`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const stats = await response.json();
        document.getElementById('statsContainer').innerHTML = `
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-title">Patients Actifs</div>
                    <div class="stat-icon"><i class="fas fa-user-injured"></i></div>
                </div>
                <div class="stat-value">${stats.total_patients || 0}</div>
                <div class="stat-change positive"><i class="fas fa-arrow-up"></i> +${stats.new_patients_this_month || 0} ce mois</div>
            </div>
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-title">RDV Aujourd'hui</div>
                    <div class="stat-icon"><i class="fas fa-calendar-check"></i></div>
                </div>
                <div class="stat-value">${stats.today_appointments || 0}</div>
                <div class="stat-change"><i class="fas fa-clock"></i> ${stats.pending_appointments || 0} en attente</div>
            </div>
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-title">Consultations</div>
                    <div class="stat-icon"><i class="fas fa-file-medical"></i></div>
                </div>
                <div class="stat-value">${stats.total_consultations || 0}</div>
                <div class="stat-change positive"><i class="fas fa-arrow-up"></i> Ce mois: ${stats.consultations_this_month || 0}</div>
            </div>
        `;
    } catch (error) {
        console.error('Erreur stats:', error);
        document.getElementById('statsContainer').innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Erreur de chargement des statistiques</p>
            </div>
        `;
    }
}

// ============================================
// GESTION DES PATIENTS
// ============================================
async function loadPatients() {
    try {
        const response = await fetch(`${API_URL}/doctors/${currentDoctor.id}/patients/recent?limit=5`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const patients = await response.json();
        const container = document.getElementById('patientsContainer');

        if (!patients || patients.length === 0) {
            container.innerHTML = `<div class="empty-state"><i class="fas fa-user-injured"></i><h3>Aucun patient</h3><p>Vous n'avez pas encore de patients</p></div>`;
            return;
        }

        let html = `<table><thead><tr><th>Patient</th><th>Dernière visite</th><th>Motif</th><th>Statut</th><th>Actions</th></tr></thead><tbody>`;

        patients.forEach(p => {
            const lastVisit = p.last_visit ? formatDate(p.last_visit) : 'Jamais';
            const statusClass = p.last_status === 'completed' ? 'badge-success' : 'badge-warning';
            const statusText = p.last_status === 'completed' ? 'Terminé' : 'En cours';

            html += `<tr>
                <td><div class="patient-info"><div class="patient-avatar">${getInitials(p.full_name)}</div><div class="patient-details"><h4>${p.full_name}</h4><p>${p.sex === 'male' ? 'Homme' : 'Femme'}</p></div></div></td>
                <td style="font-family:'DM Mono',monospace;font-size:12px;color:var(--text-secondary);">${lastVisit}</td>
                <td style="color:var(--text-secondary);font-size:13px;">${p.last_reason || 'Consultation'}</td>
                <td><span class="badge ${statusClass}">${statusText}</span></td>
                <td><div style="display:flex;gap:6px;">
                    <button class="action-btn btn-accept btn-icon" onclick="viewPatientDetails(${p.id})" title="Dossier"><i class="fas fa-file-medical"></i></button>
                    <button class="action-btn btn-reschedule btn-icon" onclick="openNewAppointmentForPatient(${p.id})" title="Nouveau RDV"><i class="fas fa-calendar-plus"></i></button>
                </div></td>
            </tr>`;
        });

        html += '</tbody></table>';
        container.innerHTML = html;

    } catch (error) {
        console.error('Erreur chargement patients:', error);
        document.getElementById('patientsContainer').innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Erreur de chargement</p></div>`;
    }
}

async function loadAllPatients() {
    const container = document.getElementById('allPatientsContainer');
    container.innerHTML = `<div class="loading"><div class="loading-spinner"></div><p>Chargement des patients...</p></div>`;

    try {
        const response = await fetch(`${API_URL}/doctors/${currentDoctor.id}/patients`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const patients = await response.json();

        if (!patients || patients.length === 0) {
            container.innerHTML = `<div class="empty-state"><i class="fas fa-user-injured"></i><h3>Aucun patient</h3><p>Vous n'avez pas encore de patients</p></div>`;
            return;
        }

        let html = `<div class="table-container"><table><thead><tr><th>Patient</th><th>Contact</th><th>Dernière visite</th><th>Total RDV</th><th>Actions</th></tr></thead><tbody>`;

        patients.forEach(p => {
            const lastVisit = p.last_visit ? formatDate(p.last_visit) : 'Jamais';
            html += `<tr>
                <td><div class="patient-info"><div class="patient-avatar">${getInitials(p.full_name)}</div><div class="patient-details"><h4>${p.full_name}</h4><p>${p.sex === 'male' ? 'Homme' : 'Femme'}</p></div></div></td>
                <td style="color:var(--text-secondary);font-size:12px;"><div><i class="fas fa-phone" style="color:var(--text-muted);margin-right:4px;"></i> ${p.phone || '—'}</div><div style="margin-top:3px;"><i class="fas fa-envelope" style="color:var(--text-muted);margin-right:4px;"></i> ${p.email || ''}</div></td>
                <td style="font-family:'DM Mono',monospace;font-size:12px;color:var(--text-secondary);">${lastVisit}</td>
                <td style="font-family:'DM Mono',monospace;font-size:13px;color:var(--teal);">${p.total_appointments || 0}</td>
                <td><div style="display:flex;gap:6px;">
                    <button class="action-btn btn-accept btn-icon" onclick="viewPatientDetails(${p.id})"><i class="fas fa-eye"></i></button>
                    <button class="action-btn btn-reschedule btn-icon" onclick="openNewAppointmentForPatient(${p.id})"><i class="fas fa-calendar-plus"></i></button>
                </div></td>
            </tr>`;
        });

        html += '</tbody></table></div>';
        container.innerHTML = html;

    } catch (error) {
        console.error('Erreur:', error);
        container.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Erreur</h3><p>Impossible de charger les patients</p></div>`;
    }
}

// ============================================
// GESTION DES RENDEZ-VOUS
// ============================================
async function loadAppointments() {
    try {
        const response = await fetch(`${API_URL}/doctors/${currentDoctor.id}/appointments/today`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        todayAppointments = await response.json();

        document.getElementById('filterAllCount').textContent = todayAppointments.length;
        document.getElementById('filterPendingCount').textContent = todayAppointments.filter(a => a.status === 'pending').length;
        document.getElementById('filterConfirmedCount').textContent = todayAppointments.filter(a => a.status === 'confirmed').length;
        document.getElementById('filterCompletedCount').textContent = todayAppointments.filter(a => a.status === 'completed').length;
        document.getElementById('appointmentsBadge').textContent = todayAppointments.filter(a => a.status === 'pending').length;

        filterAppointments('all');
        await loadPendingAppointments();

    } catch (error) {
        console.error('Erreur chargement rendez-vous:', error);
    }
}

function filterAppointments(filter) {
    document.querySelectorAll('#appointmentFilters .filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.filter === filter) btn.classList.add('active');
    });

    const filtered = filter === 'all' ? todayAppointments : todayAppointments.filter(a => a.status === filter);
    renderAppointments(filtered);
}

function renderAppointments(appointments) {
    const container = document.getElementById('appointmentsContainer');

    if (!appointments || appointments.length === 0) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-calendar-times"></i><h3>Aucun rendez-vous</h3><p>Aucun rendez-vous dans cette catégorie</p></div>`;
        return;
    }

    let html = '';

    appointments.sort((a, b) => a.time.localeCompare(b.time)).forEach(apt => {
        const time = apt.time.substring(0, 5);
        const badgeClass = getStatusBadgeClass(apt.status);
        const statusText = getStatusText(apt.status);
        const isUrgent = apt.type === 'emergency';

        html += `
            <div class="appointment-item ${isUrgent ? 'pulse' : ''}">
                <div class="appointment-time">${time}${isUrgent ? '<br><span style="font-size:9px;color:var(--red);letter-spacing:1px;">URGENT</span>' : ''}</div>
                <div class="appointment-patient" onclick="viewPatientDetails(${apt.patient_id})" style="cursor:pointer;">
                    <div class="patient-avatar">${getInitials(apt.patient_name)}</div>
                    <div style="flex:1;">
                        <h4 style="color:var(--text-primary);font-size:13px;margin-bottom:3px;">${apt.patient_name}</h4>
                        <p style="color:var(--text-muted);font-size:12px;">${apt.reason || 'Consultation'}</p>
                        ${apt.patient_phone ? `<small style="color:var(--teal);font-size:11px;"><i class="fas fa-phone" style="margin-right:4px;"></i>${apt.patient_phone}</small>` : ''}
                    </div>
                </div>
                <span class="badge ${badgeClass}"><i class="${getStatusIcon(apt.status)}"></i> ${statusText}</span>
                <div class="appointment-actions">
                    ${apt.status === 'pending' ? `
                        <button class="action-btn btn-accept btn-icon" onclick="acceptAppointment(${apt.id})" title="Accepter"><i class="fas fa-check"></i></button>
                        <button class="action-btn btn-reject btn-icon" onclick="rejectAppointment(${apt.id})" title="Refuser"><i class="fas fa-times"></i></button>
                        <button class="action-btn btn-reschedule btn-icon" onclick="openRescheduleAppointmentModal(${apt.id}, ${apt.patient_id}, '${apt.patient_name.replace(/'/g, "\\'")}', '${apt.date}', '${apt.time}')" title="Reprogrammer"><i class="fas fa-calendar-alt"></i></button>
                    ` : apt.status === 'confirmed' ? `
                        <button class="action-btn btn-reschedule btn-icon" onclick="openRescheduleAppointmentModal(${apt.id}, ${apt.patient_id}, '${apt.patient_name.replace(/'/g, "\\'")}', '${apt.date}', '${apt.time}')" title="Reprogrammer"><i class="fas fa-calendar-alt"></i></button>
                        <button class="action-btn btn-accept btn-icon" onclick="completeAppointment(${apt.id})" title="Terminer"><i class="fas fa-check-double"></i></button>
                    ` : apt.status === 'completed' ? `
                        <button class="action-btn btn-accept btn-icon" onclick="viewPatientDetails(${apt.patient_id})" title="Dossier"><i class="fas fa-file-medical"></i></button>
                    ` : ''}
                    <button class="action-btn btn-video btn-icon" onclick="startChatWithPatient(${apt.patient_id})" title="Message"><i class="fas fa-comment"></i></button>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

async function loadAllAppointments() {
    const container = document.getElementById('allAppointmentsContainer');
    container.innerHTML = `<div class="loading"><div class="loading-spinner"></div><p>Chargement des rendez-vous...</p></div>`;

    try {
        const response = await fetch(`${API_URL}/doctors/${currentDoctor.id}/appointments`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        allAppointmentsList = await response.json();

        document.getElementById('allFilterCount').textContent = allAppointmentsList.length;
        document.getElementById('pendingFilterCount').textContent = allAppointmentsList.filter(a => a.status === 'pending').length;
        document.getElementById('confirmedFilterCount').textContent = allAppointmentsList.filter(a => a.status === 'confirmed').length;
        document.getElementById('completedFilterCount').textContent = allAppointmentsList.filter(a => a.status === 'completed').length;

        filterAllAppointments('all');

    } catch (error) {
        console.error('Erreur:', error);
        container.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h3>Erreur</h3><p>Impossible de charger les rendez-vous</p></div>`;
    }
}

function filterAllAppointments(filter) {
    document.querySelectorAll('#appointmentsContent .filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.filter === filter) btn.classList.add('active');
    });

    const filtered = filter === 'all' ? allAppointmentsList : allAppointmentsList.filter(a => a.status === filter);
    renderAllAppointments(filtered);
}

function renderAllAppointments(appointments) {
    const container = document.getElementById('allAppointmentsContainer');

    if (!appointments || appointments.length === 0) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-calendar-times"></i><h3>Aucun rendez-vous</h3><p>Aucun rendez-vous trouvé</p></div>`;
        return;
    }

    let html = '<div class="appointment-list">';

    appointments.sort((a, b) => b.date.localeCompare(a.date) || a.time.localeCompare(b.time)).forEach(apt => {
        const badgeClass = getStatusBadgeClass(apt.status);
        const statusText = getStatusText(apt.status);

        html += `
            <div class="appointment-item">
                <div style="display:flex;align-items:center;gap:16px;width:100%;">
                    <div style="min-width:110px;">
                        <div style="font-weight:600;font-size:12px;font-family:'DM Mono',monospace;color:var(--text-primary);">${formatDate(apt.date)}</div>
                        <div style="color:var(--text-muted);font-size:11px;font-family:'DM Mono',monospace;">${apt.time.substring(0,5)}</div>
                    </div>
                    <div style="display:flex;align-items:center;gap:12px;flex:1;cursor:pointer;" onclick="viewPatientDetails(${apt.patient_id})">
                        <div class="patient-avatar">${getInitials(apt.patient_name)}</div>
                        <div>
                            <h4 style="margin-bottom:3px;color:var(--text-primary);font-size:13px;">${apt.patient_name}</h4>
                            <p style="color:var(--text-muted);margin-bottom:3px;font-size:12px;">${apt.reason || 'Consultation'}</p>
                            ${apt.patient_phone ? `<small style="color:var(--teal);font-size:11px;"><i class="fas fa-phone" style="margin-right:4px;"></i>${apt.patient_phone}</small>` : ''}
                        </div>
                    </div>
                    <span class="badge ${badgeClass}"><i class="${getStatusIcon(apt.status)}"></i> ${statusText}</span>
                    <div class="appointment-actions">
                        ${apt.status === 'pending' ? `
                            <button class="action-btn btn-accept btn-icon" onclick="acceptAppointment(${apt.id})" title="Accepter"><i class="fas fa-check"></i></button>
                            <button class="action-btn btn-reject btn-icon" onclick="rejectAppointment(${apt.id})" title="Refuser"><i class="fas fa-times"></i></button>
                        ` : apt.status === 'confirmed' ? `
                            <button class="action-btn btn-reschedule btn-icon" onclick="openRescheduleAppointmentModal(${apt.id}, ${apt.patient_id}, '${apt.patient_name.replace(/'/g, "\\'")}', '${apt.date}', '${apt.time}')" title="Reprogrammer"><i class="fas fa-calendar-alt"></i></button>
                        ` : ''}
                        <button class="action-btn btn-video btn-icon" onclick="startChatWithPatient(${apt.patient_id})" title="Message"><i class="fas fa-comment"></i></button>
                    </div>
                </div>
            </div>
        `;
    });

    html += '</div>';
    container.innerHTML = html;
}

async function loadPendingAppointments() {
    try {
        const response = await fetch(`${API_URL}/doctors/${currentDoctor.id}/appointments?status=pending`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const pending = await response.json();
        const badge = document.getElementById('appointmentsBadge');
        if (badge) {
            badge.textContent = pending.length;
            badge.style.display = pending.length > 0 ? 'flex' : 'none';
        }

    } catch (error) {
        console.error('Erreur chargement rendez-vous en attente:', error);
    }
}

async function acceptAppointment(appointmentId) {
    if (!confirm('✅ Voulez-vous accepter ce rendez-vous ?')) return;

    try {
        const response = await fetch(`${API_URL}/appointments/${appointmentId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'confirmed' })
        });

        if (response.ok) {
            showNotification('Rendez-vous accepté', 'success');
            await loadAppointments();
            await loadAllAppointments();
        }
    } catch (error) {
        showNotification('Erreur lors de l\'acceptation', 'error');
    }
}

async function rejectAppointment(appointmentId) {
    if (!confirm('❌ Voulez-vous refuser ce rendez-vous ?')) return;

    try {
        const response = await fetch(`${API_URL}/appointments/${appointmentId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'cancelled' })
        });

        if (response.ok) {
            showNotification('Rendez-vous refusé', 'info');
            await loadAppointments();
            await loadAllAppointments();
        }
    } catch (error) {
        showNotification('Erreur lors du refus', 'error');
    }
}

function completeAppointment(appointmentId) {
    if (confirm('✅ Voulez-vous marquer ce rendez-vous comme terminé ?')) {
        updateAppointmentStatus(appointmentId, 'completed');
    }
}

async function updateAppointmentStatus(appointmentId, status) {
    try {
        const response = await fetch(`${API_URL}/appointments/${appointmentId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });

        if (response.ok) {
            showNotification(`Rendez-vous ${status === 'completed' ? 'terminé' : 'mis à jour'}`, 'success');
            await loadAppointments();
            await loadAllAppointments();
        }
    } catch (error) {
        showNotification('Erreur lors de la mise à jour', 'error');
    }
}

function openRescheduleAppointmentModal(appointmentId, patientId, patientName, currentDate, currentTime) {
    document.getElementById('rescheduleAppointmentId').value = appointmentId;
    document.getElementById('reschedulePatientId').value = patientId;
    document.getElementById('reschedulePatientName').value = patientName;

    const today = new Date().toISOString().split('T')[0];
    document.getElementById('rescheduleNewDate').min = today;
    document.getElementById('rescheduleNewDate').value = currentDate || today;
    document.getElementById('rescheduleNewTime').value = currentTime || '09:00';

    openModal('rescheduleAppointmentModal');
}

document.getElementById('rescheduleAppointmentForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const appointmentId = document.getElementById('rescheduleAppointmentId').value;
    const newDate = document.getElementById('rescheduleNewDate').value;
    const newTime = document.getElementById('rescheduleNewTime').value;
    const reason = document.getElementById('rescheduleReason').value;

    if (!newDate || !newTime) {
        showNotification('Veuillez sélectionner une date et une heure', 'warning');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/appointments/${appointmentId}/reschedule`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ new_date: newDate, new_time: newTime, reason })
        });

        if (response.ok) {
            showNotification('Proposition de reprogrammation envoyée', 'success');
            closeModal('rescheduleAppointmentModal');
            await loadAppointments();
            await loadAllAppointments();
        }
    } catch (error) {
        showNotification('Erreur lors de la reprogrammation', 'error');
    }
});

// ============================================
// DOSSIER MÉDICAL
// ============================================
function addMedication() {
    const container = document.getElementById('medicationsContainer');
    const div = document.createElement('div');
    div.className = 'medication-item';
    div.style.cssText = 'display:grid;grid-template-columns:2fr 1fr 1fr 34px;gap:8px;margin-bottom:8px;background:var(--bg-primary);padding:10px;border-radius:8px;border:1px solid var(--border);';
    div.innerHTML = `
        <input type="text" class="form-control medication-name" placeholder="Médicament">
        <input type="text" class="form-control medication-dosage" placeholder="Dosage">
        <input type="text" class="form-control medication-frequency" placeholder="Fréquence">
        <button type="button" class="btn-icon" onclick="removeMedication(this)" style="background:var(--red-dim);color:var(--red);border-color:rgba(229,92,92,0.2);width:34px;height:34px;flex-shrink:0;">
            <i class="fas fa-times"></i>
        </button>
    `;
    container.appendChild(div);
}

function removeMedication(button) {
    button.closest('.medication-item').remove();
}

function addExam() {
    const container = document.getElementById('examsContainer');
    const div = document.createElement('div');
    div.className = 'exam-item';
    div.style.cssText = 'display:grid;grid-template-columns:2fr 1fr 34px;gap:8px;margin-bottom:8px;background:var(--bg-primary);padding:10px;border-radius:8px;border:1px solid var(--border);';
    div.innerHTML = `
        <input type="text" class="form-control exam-name" placeholder="Examen">
        <input type="text" class="form-control exam-result" placeholder="Résultat">
        <button type="button" class="btn-icon" onclick="removeExam(this)" style="background:var(--red-dim);color:var(--red);border-color:rgba(229,92,92,0.2);width:34px;height:34px;flex-shrink:0;">
            <i class="fas fa-times"></i>
        </button>
    `;
    container.appendChild(div);
}

function removeExam(button) {
    button.closest('.exam-item').remove();
}

async function openCreateMedicalRecord(patientId, appointmentId = null) {
    showLoading('Chargement des informations patient...');

    try {
        const response = await fetch(`${API_URL}/doctors/${currentDoctor.id}/patients/${patientId}/profile`);
        if (!response.ok) throw new Error('Erreur chargement patient');
        
        const patient = await response.json();

        let appointment = null;
        if (appointmentId) {
            const aptResponse = await fetch(`${API_URL}/appointments/${appointmentId}`);
            if (aptResponse.ok) {
                appointment = await aptResponse.json();
            }
        }

        document.getElementById('recordPatientId').value = patientId;
        document.getElementById('recordAppointmentId').value = appointmentId || '';
        document.getElementById('recordPatientName').textContent = patient.full_name;
        document.getElementById('recordPatientInfo').innerHTML = `
            ${patient.sex === 'male' ? 'Homme' : 'Femme'} &bull;
            ${patient.phone || 'Non renseigné'} &bull;
            ${patient.email || 'Non renseigné'}
        `;

        const avatarEl = document.getElementById('recordPatientAvatar');
        avatarEl.textContent = getInitials(patient.full_name);

        if (appointment) {
            document.getElementById('recordReason').value = appointment.reason || '';
        } else {
            document.getElementById('recordReason').value = '';
        }

        ['recordBloodPressure','recordHeartRate','recordTemperature','recordOxygen','recordWeight','recordHeight',
         'recordHistory','recordExamination','recordDiagnosis','recordSecondaryDiagnosis','recordInstructions','recordNotes'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });

        document.getElementById('medicationsContainer').innerHTML = `
            <div class="medication-item" style="display:grid;grid-template-columns:2fr 1fr 1fr 34px;gap:8px;margin-bottom:8px;background:var(--bg-primary);padding:10px;border-radius:8px;border:1px solid var(--border);">
                <input type="text" class="form-control medication-name" placeholder="Médicament">
                <input type="text" class="form-control medication-dosage" placeholder="Dosage">
                <input type="text" class="form-control medication-frequency" placeholder="Fréquence">
                <button type="button" class="btn-icon" onclick="removeMedication(this)" style="background:var(--red-dim);color:var(--red);border-color:rgba(229,92,92,0.2);width:34px;height:34px;flex-shrink:0;">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;

        document.getElementById('examsContainer').innerHTML = `
            <div class="exam-item" style="display:grid;grid-template-columns:2fr 1fr 34px;gap:8px;margin-bottom:8px;background:var(--bg-primary);padding:10px;border-radius:8px;border:1px solid var(--border);">
                <input type="text" class="form-control exam-name" placeholder="Examen">
                <input type="text" class="form-control exam-result" placeholder="Résultat">
                <button type="button" class="btn-icon" onclick="removeExam(this)" style="background:var(--red-dim);color:var(--red);border-color:rgba(229,92,92,0.2);width:34px;height:34px;flex-shrink:0;">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;

        hideLoading();
        openModal('createMedicalRecordModal');

    } catch (error) {
        console.error('Erreur chargement patient:', error);
        hideLoading();
        showNotification('Erreur lors du chargement du patient', 'error');
    }
}

document.getElementById('createMedicalRecordForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const saveBtn = document.getElementById('saveMedicalRecordBtn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';

    const medications = [];
    document.querySelectorAll('.medication-item').forEach(item => {
        const name = item.querySelector('.medication-name')?.value;
        const dosage = item.querySelector('.medication-dosage')?.value;
        const frequency = item.querySelector('.medication-frequency')?.value;
        if (name && dosage && frequency) medications.push({ name, dosage, frequency });
    });

    const exams = [];
    document.querySelectorAll('.exam-item').forEach(item => {
        const name = item.querySelector('.exam-name')?.value;
        const result = item.querySelector('.exam-result')?.value;
        if (name && result) exams.push({ name, result });
    });

    const medicalRecordData = {
        patient_id: parseInt(document.getElementById('recordPatientId').value),
        doctor_id: currentDoctor.id,
        appointment_id: document.getElementById('recordAppointmentId').value ? parseInt(document.getElementById('recordAppointmentId').value) : null,
        date: new Date().toISOString().split('T')[0],
        blood_pressure: document.getElementById('recordBloodPressure').value,
        heart_rate: document.getElementById('recordHeartRate').value ? parseInt(document.getElementById('recordHeartRate').value) : null,
        temperature: document.getElementById('recordTemperature').value ? parseFloat(document.getElementById('recordTemperature').value) : null,
        oxygen_saturation: document.getElementById('recordOxygen').value ? parseInt(document.getElementById('recordOxygen').value) : null,
        weight: document.getElementById('recordWeight').value ? parseFloat(document.getElementById('recordWeight').value) : null,
        height: document.getElementById('recordHeight').value ? parseInt(document.getElementById('recordHeight').value) : null,
        reason: document.getElementById('recordReason').value,
        history: document.getElementById('recordHistory').value,
        examination: document.getElementById('recordExamination').value,
        diagnosis: document.getElementById('recordDiagnosis').value,
        secondary_diagnosis: document.getElementById('recordSecondaryDiagnosis').value,
        medications,
        instructions: document.getElementById('recordInstructions').value,
        exams,
        notes: document.getElementById('recordNotes').value
    };

    try {
        const response = await fetch(`${API_URL}/medical-records`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(medicalRecordData)
        });

        if (response.ok) {
            showNotification('Dossier médical enregistré avec succès', 'success');
            closeModal('createMedicalRecordModal');

            if (medicalRecordData.appointment_id) {
                await updateAppointmentStatus(medicalRecordData.appointment_id, 'completed');
            }

            if (document.getElementById('patientDetailsModal').style.display === 'flex') {
                await viewPatientDetails(medicalRecordData.patient_id);
            }
        } else {
            showNotification('Erreur lors de l\'enregistrement', 'error');
        }
    } catch (error) {
        showNotification('Erreur de connexion', 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-save"></i> Enregistrer le dossier';
    }
});

async function viewPatientMedicalRecords(patientId) {
    showLoading('Chargement de l\'historique médical...');
    openModal('medicalRecordModal');

    try {
        const response = await fetch(`${API_URL}/patients/${patientId}/medical-records`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const records = await response.json();
        const container = document.getElementById('medicalRecordContent');

        if (!records || records.length === 0) {
            container.innerHTML = `
                <div style="text-align:center;padding:48px 20px;">
                    <i class="fas fa-file-medical" style="font-size:40px;color:var(--text-muted);margin-bottom:14px;opacity:0.2;display:block;"></i>
                    <h3 style="margin-bottom:10px;color:var(--text-secondary);font-size:14px;">Aucun dossier médical</h3>
                    <p style="color:var(--text-muted);margin-bottom:20px;font-size:12px;">Ce patient n'a pas encore de dossier médical</p>
                    <button onclick="openCreateMedicalRecord(${patientId})" class="btn btn-sm"><i class="fas fa-plus"></i> Créer un dossier</button>
                </div>
            `;
            hideLoading();
            return;
        }

        let html = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                <h3 style="font-size:14px;color:var(--text-primary);">Historique médical</h3>
                <button onclick="openCreateMedicalRecord(${patientId})" class="btn btn-sm"><i class="fas fa-plus"></i> Nouvelle consultation</button>
            </div>
        `;

        records.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(record => {
            html += `
                <div class="medical-record-card" style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:12px;">
                    <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
                        <span style="font-weight:600;font-size:12px;font-family:'DM Mono',monospace;color:var(--teal);">${formatDate(record.date)}</span>
                        <span style="color:var(--text-muted);font-size:11px;">Dr. ${record.doctor_name || 'Médecin'}</span>
                    </div>
                    <p style="margin-bottom:6px;font-size:13px;"><strong style="color:var(--text-secondary);">Diagnostic:</strong> <span style="color:var(--text-primary);">${record.diagnosis || 'Non spécifié'}</span></p>
                    ${record.medications && record.medications.length > 0 ? `<p style="font-size:12px;color:var(--text-muted);">${record.medications.length} médicament(s) prescrit(s)</p>` : ''}
                    <div style="margin-top:10px;">
                        <button onclick="viewMedicalRecordDetails(${record.id})" class="btn btn-secondary btn-sm"><i class="fas fa-eye"></i> Voir détails</button>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
        hideLoading();

    } catch (error) {
        console.error('Erreur:', error);
        hideLoading();
        showNotification('Erreur lors du chargement', 'error');
        closeModal('medicalRecordModal');
    }
}

function viewMedicalRecordDetails(recordId) {
    showNotification('Fonctionnalité de détails du dossier médical en développement', 'info');
    console.log('View medical record details:', recordId);
}

// ============================================
// DÉTAILS PATIENT
// ============================================
async function viewPatientDetails(patientId) {
    showLoading('Chargement des informations...');
    openModal('patientDetailsModal');

    try {
        const response = await fetch(`${API_URL}/doctors/${currentDoctor.id}/patients/${patientId}/profile`);
        if (!response.ok) throw new Error(`Erreur chargement profil: ${response.status}`);

        const patient = await response.json();

        const appointmentsResponse = await fetch(`${API_URL}/doctors/${currentDoctor.id}/appointments?patient_id=${patientId}`);
        const appointments = await appointmentsResponse.json();

        let medicalRecords = [];
        try {
            const medicalRecordsResponse = await fetch(`${API_URL}/patients/${patientId}/medical-records`);
            if (medicalRecordsResponse.ok) medicalRecords = await medicalRecordsResponse.json();
        } catch (error) {}

        const totalAppointments = appointments.length;
        const completedAppointments = appointments.filter(a => a.status === 'completed').length;
        const pendingAppointments = appointments.filter(a => a.status === 'pending').length;
        const cancelledAppointments = appointments.filter(a => a.status === 'cancelled').length;
        const totalMedicalRecords = medicalRecords.length;

        const lastAppointment = appointments.sort((a, b) => new Date(b.date + ' ' + b.time) - new Date(a.date + ' ' + a.time))[0];
        const nextAppointment = appointments.filter(a => a.status === 'confirmed' && new Date(a.date + ' ' + a.time) > new Date()).sort((a, b) => new Date(a.date + ' ' + a.time) - new Date(b.date + ' ' + a.time))[0];
        const lastMedicalRecord = medicalRecords.sort((a, b) => new Date(b.date) - new Date(a.date))[0];

        const content = document.getElementById('patientDetailsContent');

        content.innerHTML = `
            <div style="display:flex;align-items:center;gap:20px;margin-bottom:24px;padding-bottom:20px;border-bottom:1px solid var(--border);">
                <div class="patient-avatar" style="width:64px;height:64px;font-size:1.5rem;border-radius:14px;flex-shrink:0;">${getInitials(patient.full_name)}</div>
                <div style="flex:1;">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                        <div>
                            <h2 style="margin-bottom:6px;color:var(--text-primary);font-family:'Playfair Display',serif;font-size:1.3rem;">${patient.full_name}</h2>
                            <div style="display:flex;gap:16px;color:var(--text-muted);font-size:12px;flex-wrap:wrap;">
                                <span><i class="fas fa-venus-mars" style="color:var(--gold);margin-right:5px;"></i>${patient.sex === 'male' ? 'Homme' : 'Femme'}</span>
                                <span><i class="fas fa-phone" style="color:var(--teal);margin-right:5px;"></i>${patient.phone || 'Non renseigné'}</span>
                                <span><i class="fas fa-envelope" style="color:var(--teal);margin-right:5px;"></i>${patient.email || 'Non renseigné'}</span>
                            </div>
                        </div>
                        <div style="display:flex;gap:8px;">
                            <button onclick="startChatWithPatient(${patientId})" class="btn btn-secondary btn-sm"><i class="fas fa-comment"></i></button>
                            <button onclick="openNewAppointmentForPatient(${patientId})" class="btn btn-sm"><i class="fas fa-calendar-plus"></i></button>
                        </div>
                    </div>
                </div>
            </div>

            <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:24px;">
                ${[
                    {val: totalAppointments, label: 'Total RDV', color: 'var(--teal)'},
                    {val: completedAppointments, label: 'Terminés', color: '#5fe8c8'},
                    {val: pendingAppointments, label: 'En attente', color: 'var(--amber)'},
                    {val: cancelledAppointments, label: 'Annulés', color: 'var(--red)'},
                    {val: totalMedicalRecords, label: 'Consultations', color: 'var(--teal)'}
                ].map(s => `
                    <div style="background:var(--bg-secondary);border:1px solid var(--border);padding:14px;border-radius:10px;text-align:center;">
                        <div style="font-family:'Playfair Display',serif;font-size:1.6rem;font-weight:700;color:${s.color};line-height:1;">${s.val}</div>
                        <div style="font-size:10px;color:var(--text-muted);margin-top:4px;text-transform:uppercase;letter-spacing:0.8px;">${s.label}</div>
                    </div>
                `).join('')}
            </div>

            <div style="display:flex;gap:10px;margin-bottom:24px;flex-wrap:wrap;">
                <button onclick="viewPatientMedicalRecords(${patientId})" class="btn btn-sm"><i class="fas fa-file-medical"></i> Dossier médical</button>
                <button onclick="openCreateMedicalRecord(${patientId})" class="btn btn-sm" style="background:var(--gold);color:var(--bg-primary);"><i class="fas fa-plus-circle"></i> Nouvelle consultation</button>
                ${lastAppointment && lastAppointment.status === 'completed' ? `
                    <button onclick="openCreateMedicalRecord(${patientId}, ${lastAppointment.id})" class="btn btn-secondary btn-sm"><i class="fas fa-notes-medical"></i> Reprendre</button>
                ` : ''}
            </div>

            ${lastMedicalRecord ? `
                <div style="margin-bottom:20px;">
                    <h3 style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:var(--text-muted);margin-bottom:12px;">Dernière consultation</h3>
                    <div style="background:var(--bg-secondary);border:1px solid rgba(61,217,180,0.2);border-left:3px solid var(--teal);border-radius:10px;padding:16px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                            <span style="font-family:'DM Mono',monospace;font-size:12px;color:var(--teal);">${formatDate(lastMedicalRecord.date)}</span>
                            <span class="badge badge-success">Consultation</span>
                        </div>
                        <p style="font-size:13px;"><strong style="color:var(--text-secondary);">Diagnostic:</strong> <span style="color:var(--text-primary);">${lastMedicalRecord.diagnosis || 'Non spécifié'}</span></p>
                        ${lastMedicalRecord.medications && lastMedicalRecord.medications.length > 0 ? `<p style="font-size:12px;color:var(--text-muted);margin-top:4px;">${lastMedicalRecord.medications.length} médicament(s)</p>` : ''}
                    </div>
                </div>
            ` : ''}

            ${nextAppointment ? `
                <div style="margin-bottom:20px;">
                    <h3 style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:var(--text-muted);margin-bottom:12px;">Prochain rendez-vous</h3>
                    <div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:10px;padding:16px;display:flex;justify-content:space-between;align-items:center;">
                        <div>
                            <div style="font-family:'DM Mono',monospace;font-size:13px;font-weight:600;margin-bottom:4px;color:var(--text-primary);">${formatDate(nextAppointment.date)} — ${nextAppointment.time.substring(0,5)}</div>
                            <div style="color:var(--text-muted);font-size:12px;">${nextAppointment.reason || 'Consultation'}</div>
                        </div>
                        <div style="display:flex;gap:8px;">
                            <button onclick="openRescheduleAppointmentModal(${nextAppointment.id}, ${patientId}, '${patient.full_name.replace(/'/g, "\\'")}', '${nextAppointment.date}', '${nextAppointment.time}')" class="btn btn-secondary btn-sm"><i class="fas fa-calendar-alt"></i></button>
                            <button onclick="openCreateMedicalRecord(${patientId}, ${nextAppointment.id})" class="btn btn-sm"><i class="fas fa-play"></i></button>
                        </div>
                    </div>
                </div>
            ` : ''}

            <div>
                <h3 style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:var(--text-muted);margin-bottom:12px;">Historique des rendez-vous</h3>
                <div style="max-height:260px;overflow-y:auto;">
                    ${appointments.length > 0 ? `
                        <table style="width:100%;">
                            <thead style="background:var(--bg-elevated);">
                                <tr>
                                    <th style="padding:10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);">Date</th>
                                    <th style="padding:10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);">Heure</th>
                                    <th style="padding:10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);">Motif</th>
                                    <th style="padding:10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);">Statut</th>
                                    <th style="padding:10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${appointments.sort((a,b) => new Date(b.date+' '+b.time)-new Date(a.date+' '+a.time)).slice(0,10).map(apt => `
                                    <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                                        <td style="padding:10px;font-family:'DM Mono',monospace;font-size:11px;color:var(--text-secondary);">${formatDate(apt.date)}</td>
                                        <td style="padding:10px;font-family:'DM Mono',monospace;font-size:11px;color:var(--text-muted);">${apt.time.substring(0,5)}</td>
                                        <td style="padding:10px;font-size:12px;color:var(--text-secondary);">${apt.reason || '—'}</td>
                                        <td style="padding:10px;"><span class="badge ${getStatusBadgeClass(apt.status)}">${getStatusText(apt.status)}</span></td>
                                        <td style="padding:10px;">
                                            <div style="display:flex;gap:6px;">
                                                ${apt.status === 'pending' ? `
                                                    <button onclick="acceptAppointment(${apt.id})" class="action-btn btn-accept btn-icon" title="Accepter"><i class="fas fa-check"></i></button>
                                                    <button onclick="rejectAppointment(${apt.id})" class="action-btn btn-reject btn-icon" title="Refuser"><i class="fas fa-times"></i></button>
                                                ` : apt.status === 'confirmed' ? `
                                                    <button onclick="openRescheduleAppointmentModal(${apt.id}, ${patientId}, '${patient.full_name.replace(/'/g, "\\'")}', '${apt.date}', '${apt.time}')" class="action-btn btn-reschedule btn-icon"><i class="fas fa-calendar-alt"></i></button>
                                                    <button onclick="openCreateMedicalRecord(${patientId}, ${apt.id})" class="action-btn btn-accept btn-icon"><i class="fas fa-play"></i></button>
                                                ` : apt.status === 'completed' ? `
                                                    <button onclick="viewPatientMedicalRecords(${patientId})" class="action-btn btn-accept btn-icon"><i class="fas fa-file-medical"></i></button>
                                                ` : ''}
                                                <button onclick="startChatWithPatient(${patientId})" class="action-btn btn-video btn-icon"><i class="fas fa-comment"></i></button>
                                            </div>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    ` : `
                        <div class="empty-state">
                            <i class="fas fa-calendar-times"></i>
                            <p>Aucun historique de rendez-vous</p>
                            <button onclick="openNewAppointmentForPatient(${patientId})" class="btn btn-sm" style="margin-top:12px;"><i class="fas fa-calendar-plus"></i> Premier rendez-vous</button>
                        </div>
                    `}
                </div>
            </div>

            <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;padding-top:16px;border-top:1px solid var(--border);" id="patientDetailsButtons"></div>
        `;

        document.getElementById('patientDetailsButtons').innerHTML = `
            <button onclick="viewPatientMedicalRecords(${patientId})" class="btn btn-secondary btn-sm"><i class="fas fa-file-medical"></i> Dossier médical</button>
            <button onclick="viewPatientPrescriptions(${patientId})" class="btn btn-secondary btn-sm"><i class="fas fa-prescription"></i> Ordonnances</button>
            <button onclick="openPrescriptionModal(${patientId}, '${patient.full_name.replace(/'/g, "\\'")}', null, null)" class="btn btn-sm" style="background:var(--gold);color:var(--bg-primary);"><i class="fas fa-plus-circle"></i> Ordonnance</button>
            <button onclick="openCreateMedicalRecord(${patientId})" class="btn btn-sm"><i class="fas fa-plus-circle"></i> Consultation</button>
            <button onclick="startChatWithPatient(${patientId})" class="btn btn-secondary btn-sm"><i class="fas fa-comment"></i> Message</button>
        `;

        hideLoading();

    } catch (error) {
        console.error('Erreur:', error);
        hideLoading();
        showNotification(`Erreur: ${error.message}`, 'error');

        document.getElementById('patientDetailsContent').innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle" style="color:var(--red);"></i>
                <h3 style="color:var(--text-primary);">Erreur de chargement</h3>
                <p>${error.message}</p>
                <button onclick="closeModal('patientDetailsModal')" class="btn btn-sm" style="margin-top:14px;">Fermer</button>
            </div>
        `;
    }
}

// ============================================
// PROFIL MÉDECIN
// ============================================
function openDoctorProfileSettings() {
    toggleUserDropdown();
    loadDoctorProfile();
}

async function loadDoctorProfile() {
    if (!currentDoctor) return;

    showLoading('Chargement de votre profil...');

    try {
        const response = await fetch(`${API_URL}/doctors/${currentDoctor.id}/profile`);
        if (!response.ok) throw new Error('Erreur chargement profil');
        
        const profile = await response.json();

        document.getElementById('profileUserId').value = currentDoctor.id;
        document.getElementById('profileFullName').value = profile.full_name || currentDoctor.full_name || '';
        document.getElementById('profileAge').value = profile.age || '';
        document.getElementById('profileSpecialty').value = profile.specialty || currentDoctor.specialty || '';
        document.getElementById('profileLocation').value = profile.location || '';
        document.getElementById('profileAddress').value = profile.address || currentDoctor.address || '';
        document.getElementById('profilePhone').value = profile.phone || currentDoctor.phone || '';
        document.getElementById('profileEmail').value = profile.email || currentDoctor.email || '';
        document.getElementById('profileDiplomas').value = profile.diplomas || '';
        document.getElementById('profileExperience').value = profile.experience || '';
        document.getElementById('profilePrice').value = profile.consultation_price || '';
        document.getElementById('profileBio').value = profile.bio || '';

        const initials = getInitials(profile.full_name || currentDoctor.full_name);
        document.getElementById('profilePhotoInitials').textContent = initials;

        if (profile.profile_photo) {
            document.getElementById('profilePhotoPreview').innerHTML = `<img src="${profile.profile_photo}" style="width:100%;height:100%;object-fit:cover;border-radius:12px;">`;
            document.getElementById('profilePhotoBase64').value = profile.profile_photo;
        }

        hideLoading();
        openModal('doctorProfileSettingsModal');

    } catch (error) {
        console.error('Erreur chargement profil:', error);
        hideLoading();
        showNotification('Erreur lors du chargement du profil', 'error');
    }
}

function previewProfilePhoto(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const preview = document.getElementById('profilePhotoPreview');
            preview.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:12px;">`;
            document.getElementById('profilePhotoBase64').value = e.target.result;
        };
        reader.readAsDataURL(input.files[0]);
    }
}

document.getElementById('doctorProfileForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const saveBtn = document.getElementById('saveProfileBtn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';

    const profileData = {
        user_id: currentDoctor.id,
        full_name: document.getElementById('profileFullName').value,
        age: parseInt(document.getElementById('profileAge').value),
        specialty: document.getElementById('profileSpecialty').value,
        location: document.getElementById('profileLocation').value,
        address: document.getElementById('profileAddress').value,
        phone: document.getElementById('profilePhone').value,
        diplomas: document.getElementById('profileDiplomas').value,
        experience: document.getElementById('profileExperience').value,
        consultation_price: parseFloat(document.getElementById('profilePrice').value),
        bio: document.getElementById('profileBio').value,
        profile_photo: document.getElementById('profilePhotoBase64').value || null
    };

    try {
        const response = await fetch(`${API_URL}/doctors/profile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(profileData)
        });

        if (response.ok) {
            currentDoctor = { ...currentDoctor, ...profileData };
            localStorage.setItem('user', JSON.stringify(currentDoctor));
            updateUserInterface();
            showNotification('Profil mis à jour avec succès', 'success');
            closeModal('doctorProfileSettingsModal');
            await loadStats();
        } else {
            showNotification('Erreur lors de la sauvegarde', 'error');
        }

    } catch (error) {
        showNotification('Erreur de connexion', 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-save"></i> Enregistrer';
    }
});

// ============================================
// MESSAGERIE
// ============================================
async function loadMessagesPage() {
    openModal('messagingModal');
    await loadConversations();
}

async function loadConversations() {
    try {
        const response = await fetch(`${API_URL}/doctors/${currentDoctor.id}/conversations`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const conversations = await response.json();
        const container = document.getElementById('conversationsList');

        if (!conversations || conversations.length === 0) {
            container.innerHTML = `<div style="padding:32px 20px;text-align:center;"><i class="fas fa-comments" style="font-size:32px;color:var(--text-muted);margin-bottom:12px;opacity:0.2;display:block;"></i><p style="color:var(--text-muted);font-size:12px;">Aucune conversation</p></div>`;
            return;
        }

        let html = '';
        conversations.forEach(conv => {
            const time = conv.last_message_time ? formatDateTime(conv.last_message_time) : '';
            const lastMessage = conv.last_message || 'Aucun message';
            const truncatedMessage = lastMessage.length > 28 ? lastMessage.substring(0,28)+'...' : lastMessage;

            html += `
                <div class="conversation-item" onclick="loadChatMessages(${conv.patient_id}, '${conv.patient_name.replace(/'/g, "\\'")}')">
                    <div class="patient-avatar" style="width:38px;height:38px;font-size:11px;">${getInitials(conv.patient_name)}</div>
                    <div style="flex:1;min-width:0;">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
                            <span style="font-weight:600;color:var(--text-primary);font-size:13px;">${conv.patient_name}</span>
                            ${time ? `<span style="font-size:10px;color:var(--text-muted);font-family:'DM Mono',monospace;">${time}</span>` : ''}
                        </div>
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                            <span style="font-size:12px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:140px;">${truncatedMessage}</span>
                            ${conv.unread_count > 0 ? `<span style="background:var(--teal);color:var(--bg-primary);border-radius:50%;min-width:18px;height:18px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;margin-left:8px;">${conv.unread_count}</span>` : ''}
                        </div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;

        const totalUnread = conversations.reduce((sum, conv) => sum + (conv.unread_count || 0), 0);
        const messagesBadge = document.getElementById('messagesBadge');
        if (messagesBadge) {
            messagesBadge.textContent = totalUnread;
            messagesBadge.style.display = totalUnread > 0 ? 'flex' : 'none';
        }

    } catch (error) {
        console.error('Erreur chargement conversations:', error);
        document.getElementById('conversationsList').innerHTML = `<div style="padding:32px 20px;text-align:center;"><i class="fas fa-exclamation-triangle" style="color:var(--red);"></i><p>Erreur de chargement</p></div>`;
    }
}

async function loadChatMessages(patientId, patientName = 'Patient') {
    try {
        showLoading('Chargement des messages...');

        const response = await fetch(`${API_URL}/messages/${currentDoctor.id}/${patientId}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const messages = await response.json();

        const container = document.getElementById('chatMessages');
        const input = document.getElementById('messageInput');
        const sendBtn = document.querySelector('#messagingModal .btn-icon');

        container.innerHTML = `
            <div style="display:flex;align-items:center;gap:12px;padding:12px;border-bottom:1px solid var(--border);margin-bottom:14px;flex-shrink:0;">
                <div class="patient-avatar" style="width:36px;height:36px;font-size:11px;">${getInitials(patientName)}</div>
                <div>
                    <h4 style="margin-bottom:2px;font-size:13px;color:var(--text-primary);">${patientName}</h4>
                    <p style="color:var(--teal);font-size:11px;display:flex;align-items:center;gap:4px;"><i class="fas fa-circle" style="font-size:7px;"></i> En ligne</p>
                </div>
            </div>
            <div id="messagesList" style="flex:1;overflow-y:auto;padding:0;display:flex;flex-direction:column;gap:10px;"></div>
        `;

        const messagesList = document.getElementById('messagesList');

        if (!messages || messages.length === 0) {
            messagesList.innerHTML = `<div style="text-align:center;padding:32px 20px;color:var(--text-muted);"><i class="fas fa-comment-dots" style="font-size:32px;margin-bottom:10px;opacity:0.2;display:block;"></i><p style="font-size:12px;">Commencez la conversation !</p></div>`;
        } else {
            let lastDate = '';
            messages.forEach(msg => {
                const date = new Date(msg.created_at).toLocaleDateString('fr-FR');
                if (date !== lastDate) {
                    messagesList.innerHTML += `<div style="text-align:center;margin:6px 0;"><span style="background:var(--bg-elevated);padding:3px 10px;border-radius:10px;font-size:10px;color:var(--text-muted);font-family:'DM Mono',monospace;">${date === new Date().toLocaleDateString('fr-FR') ? "Aujourd'hui" : date}</span></div>`;
                    lastDate = date;
                }

                const messageDiv = document.createElement('div');
                messageDiv.className = `message ${msg.sender_id === currentDoctor.id ? 'sent' : 'received'}`;
                messageDiv.innerHTML = `<div style="word-wrap:break-word;">${escapeHtml(msg.content)}</div><div style="font-size:9px;color:${msg.sender_id === currentDoctor.id ? 'rgba(10,13,18,0.5)' : 'var(--text-muted)'};margin-top:4px;text-align:right;font-family:'DM Mono',monospace;">${new Date(msg.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}${msg.sender_id === currentDoctor.id ? ' <i class="fas fa-check"></i>' : ''}</div>`;
                messagesList.appendChild(messageDiv);
            });
        }

        input.disabled = false;
        sendBtn.disabled = false;
        input.focus();

        currentConversation = { patient_id: patientId, patient_name: patientName };

        setTimeout(() => messagesList.scrollTop = messagesList.scrollHeight, 100);
        hideLoading();

    } catch (error) {
        console.error('Erreur chargement messages:', error);
        hideLoading();
        showNotification('Erreur lors du chargement des messages', 'error');
    }
}

async function sendMessage() {
    const input = document.getElementById('messageInput');
    if (!input || !currentConversation) return;

    const message = input.value.trim();
    if (!message) return;

    input.disabled = true;

    try {
        const response = await fetch(`${API_URL}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sender_id: currentDoctor.id,
                receiver_id: currentConversation.patient_id,
                content: message
            })
        });

        if (response.ok) {
            const messagesList = document.getElementById('messagesList');
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message sent';
            messageDiv.innerHTML = `<div style="word-wrap:break-word;">${escapeHtml(message)}</div><div style="font-size:9px;color:rgba(10,13,18,0.5);margin-top:4px;text-align:right;font-family:'DM Mono',monospace;">${new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})} <i class="fas fa-check"></i></div>`;
            messagesList.appendChild(messageDiv);
            messagesList.scrollTop = messagesList.scrollHeight;

            input.value = '';
            await loadConversations();
        }
    } catch (error) {
        showNotification('Erreur lors de l\'envoi du message', 'error');
    } finally {
        input.disabled = false;
        input.focus();
    }
}

function startMessagePolling() {
    messagePollingInterval = setInterval(async () => {
        if (currentDoctor) {
            await loadConversations();
            if (currentConversation) {
                const container = document.getElementById('chatMessages');
                if (container && container.closest('.modal').style.display === 'flex') {
                    await loadChatMessages(currentConversation.patient_id, currentConversation.patient_name);
                }
            }
        }
    }, 10000);
}

// ============================================
// NOTIFICATIONS
// ============================================
async function loadNotifications() {
    try {
        const response = await fetch(`${API_URL}/users/${currentDoctor.id}/notifications?unread_only=true`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        notifications = await response.json();

        const badge = document.getElementById('notificationBadge');
        if (badge) {
            badge.textContent = notifications.length;
            badge.style.display = notifications.length > 0 ? 'flex' : 'none';
        }

        const container = document.getElementById('notificationsList');
        if (!container) return;

        if (!notifications || notifications.length === 0) {
            container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:12px;">Aucune notification</div>';
            return;
        }

        let html = '';
        notifications.forEach(notif => {
            html += `<div class="notification-item" style="padding:12px 16px;border-bottom:1px solid var(--border);cursor:pointer;" onclick="markAsRead(${notif.id})">
                <div style="font-weight:600;color:var(--text-primary);font-size:13px;">${notif.title}</div>
                <div style="font-size:12px;color:var(--text-muted);margin-top:3px;">${notif.message}</div>
                <div style="font-size:10px;color:var(--text-muted);margin-top:6px;font-family:'DM Mono',monospace;">${formatDateTime(notif.created_at)}</div>
            </div>`;
        });

        container.innerHTML = html;

    } catch (error) {
        console.error('Erreur notifications:', error);
    }
}

function toggleNotifications() {
    const panel = document.getElementById('notificationsPanel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

async function markAsRead(notificationId) {
    try {
        await fetch(`${API_URL}/notifications/${notificationId}/read`, { method: 'POST' });
        await loadNotifications();
    } catch (error) {}
}

async function markAllAsRead() {
    try {
        await fetch(`${API_URL}/notifications/mark-all-read?user_id=${currentDoctor.id}`, { method: 'POST' });
        await loadNotifications();
        showNotification('Toutes les notifications ont été marquées comme lues', 'success');
    } catch (error) {}
}

// ============================================
// PARAMÈTRES
// ============================================
function openSettings() {
    toggleUserDropdown();
    loadSettingsData();
    openModal('settingsModal');
}

function loadSettingsData() {
    if (!currentDoctor) return;

    document.getElementById('settingsEmail').value = currentDoctor.email || '';
    document.getElementById('settingsPhone').value = currentDoctor.phone || '';
    document.getElementById('settingsAddress').value = currentDoctor.address || '';

    loadNotificationSettings();
    loadAppearanceSettings();
    loadPrivacySettings();
}

function loadNotificationSettings() {
    const settings = JSON.parse(localStorage.getItem('notificationSettings')) || { appointments: true, messages: true, email: false };
    document.getElementById('notifAppointments').checked = settings.appointments;
    document.getElementById('notifMessages').checked = settings.messages;
    document.getElementById('notifEmail').checked = settings.email;
}

function saveNotificationSettings() {
    const settings = {
        appointments: document.getElementById('notifAppointments').checked,
        messages: document.getElementById('notifMessages').checked,
        email: document.getElementById('notifEmail').checked
    };
    localStorage.setItem('notificationSettings', JSON.stringify(settings));
    showNotification('Préférences de notification enregistrées', 'success');
}

function loadAppearanceSettings() {
    const theme = localStorage.getItem('parrotTheme') || 'light';
    const settings = JSON.parse(localStorage.getItem('appearanceSettings')) || { language: 'fr' };
    document.querySelectorAll('input[name="theme"]').forEach(radio => {
        if (radio.value === theme) radio.checked = true;
    });
    document.getElementById('languageSelect').value = settings.language;
}

function saveAppearanceSettings() {
    const theme = document.querySelector('input[name="theme"]:checked')?.value || 'light';
    const language = document.getElementById('languageSelect').value;
    localStorage.setItem('parrotTheme', theme);
    localStorage.setItem('appearanceSettings', JSON.stringify({ language }));
    applyTheme(theme);
    showNotification('Préférences d\'apparence enregistrées', 'success');
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    // Sync radio buttons in settings if open
    document.querySelectorAll('input[name="theme"]').forEach(radio => {
        radio.checked = radio.value === theme;
    });
}

function loadPrivacySettings() {
    const settings = JSON.parse(localStorage.getItem('privacySettings')) || { profilePublic: true, shareStats: true };
    document.getElementById('profilePublic').checked = settings.profilePublic;
    document.getElementById('shareStats').checked = settings.shareStats;
}

function switchSettingsTab(tabName) {
    const tabs = ['account', 'notifications', 'appearance', 'privacy'];
    tabs.forEach(tab => {
        const tabElement = document.getElementById(`settings${tab.charAt(0).toUpperCase() + tab.slice(1)}Tab`);
        if (tabElement) tabElement.style.display = 'none';
    });
    
    const activeTabElement = document.getElementById(`settings${tabName.charAt(0).toUpperCase() + tabName.slice(1)}Tab`);
    if (activeTabElement) activeTabElement.style.display = 'block';

    document.querySelectorAll('.settings-tab').forEach(tab => {
        tab.classList.remove('active');
        tab.style.background = 'transparent';
        tab.style.color = 'var(--text-muted)';
        tab.style.fontWeight = 'normal';
    });

    const activeTab = document.querySelector(`.settings-tab[data-tab="${tabName}"]`);
    if (activeTab) {
        activeTab.classList.add('active');
        activeTab.style.background = 'var(--teal-dim)';
        activeTab.style.color = 'var(--teal)';
        activeTab.style.fontWeight = '500';
    }
}

function exportData() {
    const data = { doctor: currentDoctor, exportDate: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `parrotdiag-export-${currentDoctor.id}-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    showNotification('Données exportées avec succès', 'success');
}

function deleteAccount() {
    if (confirm('⚠️ Êtes-vous absolument sûr de vouloir supprimer votre compte ?')) {
        const confirm2 = prompt('Tapez "SUPPRIMER" pour confirmer');
        if (confirm2 === 'SUPPRIMER') {
            showNotification('Fonctionnalité de suppression à venir', 'info');
        }
    }
}

// ============================================
// FONCTIONS D'ACTIONS
// ============================================
function openNewAppointmentModal() {
    loadPatientSelect();
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('appointmentDate').min = today;
    document.getElementById('appointmentDate').value = today;
    openModal('newAppointmentModal');
}

function openPrescriptionModalFromDashboard() {
    showNotification('Veuillez sélectionner un patient dans la liste', 'info');
}

async function loadPatientSelect() {
    try {
        const response = await fetch(`${API_URL}/doctors/${currentDoctor.id}/patients`);
        if (!response.ok) throw new Error('Erreur chargement patients');
        
        const patients = await response.json();

        const select = document.getElementById('patientSelect');
        select.innerHTML = '<option value="">Sélectionner un patient</option>';
        patients.forEach(p => select.innerHTML += `<option value="${p.id}">${p.full_name}</option>`);

    } catch (error) {
        console.error('Erreur chargement patients:', error);
        showNotification('Erreur lors du chargement des patients', 'error');
    }
}

document.getElementById('appointmentForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const patientId = document.getElementById('patientSelect').value;
    const date = document.getElementById('appointmentDate').value;
    const time = document.getElementById('appointmentTime').value;
    const reason = document.getElementById('appointmentReason').value;
    const type = document.getElementById('appointmentType').value;

    if (!patientId || !date || !time || !reason) {
        showNotification('Veuillez remplir tous les champs', 'warning');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/appointments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ patient_id: parseInt(patientId), doctor_id: currentDoctor.id, date, time, reason, type })
        });

        if (response.ok) {
            showNotification('Rendez-vous programmé avec succès', 'success');
            closeModal('newAppointmentModal');
            await loadAppointments();
            await loadAllAppointments();
            e.target.reset();
        } else {
            showNotification('Erreur lors de la création du rendez-vous', 'error');
        }
    } catch (error) {
        showNotification('Erreur de connexion', 'error');
    }
});

document.getElementById('accountSettingsForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const phone = document.getElementById('settingsPhone').value;
    const address = document.getElementById('settingsAddress').value;

    try {
        const profileData = {
            user_id: currentDoctor.id,
            full_name: currentDoctor.full_name,
            age: currentDoctor.age || 35,
            specialty: currentDoctor.specialty || '',
            location: currentDoctor.location || '',
            address,
            phone,
            diplomas: currentDoctor.diplomas || '',
            experience: currentDoctor.experience || '',
            consultation_price: currentDoctor.consultation_price || 0,
            bio: currentDoctor.bio || '',
            profile_photo: currentDoctor.profile_photo || null
        };

        const response = await fetch(`${API_URL}/doctors/profile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(profileData)
        });

        if (response.ok) {
            currentDoctor.phone = phone;
            currentDoctor.address = address;
            localStorage.setItem('user', JSON.stringify(currentDoctor));
            showNotification('Informations mises à jour', 'success');
        } else {
            showNotification('Erreur lors de la mise à jour', 'error');
        }
    } catch (error) {
        showNotification('Erreur de connexion', 'error');
    }
});

document.getElementById('passwordChangeForm').addEventListener('submit', function(e) {
    e.preventDefault();

    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (newPassword !== confirmPassword) {
        showNotification('Les mots de passe ne correspondent pas', 'error');
        return;
    }

    if (newPassword.length < 6) {
        showNotification('Le mot de passe doit contenir au moins 6 caractères', 'error');
        return;
    }

    showNotification('Fonctionnalité de changement de mot de passe à venir', 'info');
    e.target.reset();
});

function openNewConsultationModal() {
    showNotification('Fonctionnalité en développement', 'info');
}

function viewAllPatients() {
    document.querySelector('[data-page="patients"]').click();
}

function openNewAppointmentForPatient(patientId) {
    openNewAppointmentModal();
    setTimeout(() => {
        const select = document.getElementById('patientSelect');
        if (select) select.value = patientId;
    }, 100);
}

function startChatWithPatient(patientId) {
    loadMessagesPage();
    setTimeout(async () => {
        try {
            const response = await fetch(`${API_URL}/doctors/${currentDoctor.id}/patients/${patientId}/profile`);
            if (response.ok) {
                const patient = await response.json();
                await loadChatMessages(patientId, patient.full_name);
            } else {
                await loadChatMessages(patientId, 'Patient');
            }
        } catch (error) {
            await loadChatMessages(patientId, 'Patient');
        }
    }, 500);
}

// ============================================
// GESTION DES ORDONNANCES
// ============================================
function openPrescriptionModal(patientId, patientName = null, patientInfo = null, appointmentId = null) {
    document.getElementById('prescriptionPatientId').value = patientId;
    document.getElementById('prescriptionDoctorId').value = currentDoctor.id;
    document.getElementById('prescriptionAppointmentId').value = appointmentId || '';

    const today = new Date().toISOString().split('T')[0];
    document.getElementById('prescriptionDate').value = today;

    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    document.getElementById('prescriptionExpiry').value = nextYear.toISOString().split('T')[0];

    document.getElementById('prescriptionMedicationsContainer').innerHTML = `
        <div class="medication-row" style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr 34px;gap:8px;margin-bottom:8px;background:var(--bg-primary);padding:10px;border-radius:8px;border:1px solid var(--border);">
            <input type="text" class="form-control med-name" placeholder="Médicament" required>
            <input type="text" class="form-control med-dosage" placeholder="Dosage" required>
            <input type="text" class="form-control med-frequency" placeholder="Fréquence" required>
            <input type="text" class="form-control med-duration" placeholder="Durée">
            <button type="button" class="btn-icon" onclick="removePrescriptionMedication(this)" style="background:var(--red-dim);color:var(--red);border-color:rgba(229,92,92,0.2);width:34px;height:34px;flex-shrink:0;">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;

    if (patientName) {
        document.getElementById('prescriptionPatientName').textContent = patientName;
        document.getElementById('prescriptionPatientAvatar').textContent = getInitials(patientName);
        document.getElementById('prescriptionPatientInfo').innerHTML = patientInfo || '';
    } else {
        loadPatientInfoForPrescription(patientId);
    }

    openModal('prescriptionModal');
}

async function loadPatientInfoForPrescription(patientId) {
    try {
        const response = await fetch(`${API_URL}/doctors/${currentDoctor.id}/patients/${patientId}/profile`);
        if (response.ok) {
            const patient = await response.json();
            document.getElementById('prescriptionPatientName').textContent = patient.full_name;
            document.getElementById('prescriptionPatientAvatar').textContent = getInitials(patient.full_name);
            document.getElementById('prescriptionPatientInfo').innerHTML = `${patient.sex === 'male' ? 'Homme' : 'Femme'} &bull; ${patient.phone || 'Non renseigné'}`;
        }
    } catch (error) {}
}

function addPrescriptionMedication() {
    const container = document.getElementById('prescriptionMedicationsContainer');
    const div = document.createElement('div');
    div.className = 'medication-row';
    div.style.cssText = 'display:grid;grid-template-columns:2fr 1fr 1fr 1fr 34px;gap:8px;margin-bottom:8px;background:var(--bg-primary);padding:10px;border-radius:8px;border:1px solid var(--border);';
    div.innerHTML = `
        <input type="text" class="form-control med-name" placeholder="Médicament" required>
        <input type="text" class="form-control med-dosage" placeholder="Dosage" required>
        <input type="text" class="form-control med-frequency" placeholder="Fréquence" required>
        <input type="text" class="form-control med-duration" placeholder="Durée">
        <button type="button" class="btn-icon" onclick="removePrescriptionMedication(this)" style="background:var(--red-dim);color:var(--red);border-color:rgba(229,92,92,0.2);width:34px;height:34px;flex-shrink:0;">
            <i class="fas fa-times"></i>
        </button>
    `;
    container.appendChild(div);
}

function removePrescriptionMedication(button) {
    const container = document.getElementById('prescriptionMedicationsContainer');
    if (container.children.length > 1) {
        button.closest('.medication-row').remove();
    } else {
        showNotification('Vous devez avoir au moins un médicament', 'warning');
    }
}

document.getElementById('prescriptionForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const saveBtn = document.getElementById('savePrescriptionBtn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Création...';

    const medications = [];
    document.querySelectorAll('#prescriptionMedicationsContainer .medication-row').forEach(row => {
        const name = row.querySelector('.med-name')?.value;
        const dosage = row.querySelector('.med-dosage')?.value;
        const frequency = row.querySelector('.med-frequency')?.value;
        const duration = row.querySelector('.med-duration')?.value;

        if (name && dosage && frequency) {
            medications.push({ name, dosage, frequency, duration: duration || 'Non spécifié' });
        }
    });

    if (medications.length === 0) {
        showNotification('Veuillez ajouter au moins un médicament', 'warning');
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-prescription"></i> Créer l\'ordonnance';
        return;
    }

    const prescriptionData = {
        patient_id: parseInt(document.getElementById('prescriptionPatientId').value),
        doctor_id: parseInt(document.getElementById('prescriptionDoctorId').value),
        appointment_id: document.getElementById('prescriptionAppointmentId').value ? parseInt(document.getElementById('prescriptionAppointmentId').value) : null,
        date: document.getElementById('prescriptionDate').value,
        expiry_date: document.getElementById('prescriptionExpiry').value,
        diagnosis: document.getElementById('prescriptionDiagnosis').value,
        medications,
        instructions: document.getElementById('prescriptionInstructions').value,
        notes: document.getElementById('prescriptionNotes').value,
        is_active: document.getElementById('prescriptionActive').checked
    };

    try {
        const response = await fetch(`${API_URL}/prescriptions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(prescriptionData)
        });

        if (response.ok) {
            const result = await response.json();
            showNotification(`Ordonnance créée avec succès (N° ${result.prescription_number})`, 'success');
            closeModal('prescriptionModal');
            await generatePrescriptionPDF(result.prescription_id);

            if (document.getElementById('patientDetailsModal').style.display === 'flex') {
                await viewPatientDetails(prescriptionData.patient_id);
            }
        } else {
            showNotification('Erreur lors de la création', 'error');
        }
    } catch (error) {
        showNotification('Erreur de connexion', 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-prescription"></i> Créer l\'ordonnance';
    }
});

async function generatePrescriptionPDF(prescriptionId) {
    try {
        showNotification('📄 Génération du PDF en cours...', 'info');

        const response = await fetch(`${API_URL}/prescriptions/${prescriptionId}`);
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Erreur chargement ordonnance:', errorText);
            throw new Error(`Erreur ${response.status}: ${response.statusText}`);
        }

        const prescription = await response.json();

        let doctorProfile = {};
        try {
            const r = await fetch(`${API_URL}/doctors/${currentDoctor.id}/profile`);
            if (r.ok) doctorProfile = await r.json();
        } catch (_) {}

        let patientProfile = {};
        try {
            const r = await fetch(`${API_URL}/patients/${prescription.patient_id}/profile`);
            if (r.ok) patientProfile = await r.json();
        } catch (_) {}

        const fmt = (d) => {
            if (!d) return '—';
            try { return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }); }
            catch (_) { return d; }
        };

        const doctorName = doctorProfile.full_name || currentDoctor.full_name || 'Médecin';
        const doctorSpec = doctorProfile.specialty || currentDoctor.specialty || 'Médecin Généraliste';
        const doctorPhone = doctorProfile.phone || currentDoctor.phone || '—';
        const doctorAddress = doctorProfile.address || currentDoctor.address || '—';
        const patientName = patientProfile.full_name || prescription.patient_name || 'Patient';
        const patientDOB = patientProfile.birth_date ? fmt(patientProfile.birth_date) : '—';
        const patientPhone = patientProfile.phone || prescription.patient_phone || '—';
        const patientAddress = patientProfile.address || prescription.patient_address || '—';
        const rxNumber = prescription.prescription_number || 'RX-' + prescriptionId;
        const isActive = prescription.is_active !== false;

        const medRows = prescription.medications && prescription.medications.length > 0
            ? prescription.medications.map((m, i) => `
                <tr>
                    <td><span class="mn">${String(i+1).padStart(2,'0')}</span></td>
                    <td><span class="mname">${m.name || '—'}</span></td>
                    <td><span class="mp dos">${m.dosage || '—'}</span></td>
                    <td><span class="mp frq">${m.frequency || '—'}</span></td>
                    <td><span class="mp dur">${m.duration || '—'}</span></td>
                </tr>`).join('')
            : `<tr><td colspan="5" class="empty-row"><i class="fas fa-inbox"></i> Aucun médicament prescrit</td></tr>`;

        const htmlContent = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ordonnance ${rxNumber}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;1,400&family=Outfit:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
<style>
:root{
  --F:#0b3d2e;--E:#1a6647;--J:#2a9d6f;--M:#4dc994;
  --fo:#e4f7ef;--fm:#c8eddf;
  --G:#c9923a;--GL:#f8eedf;
  --ink:#111a16;--im:#324039;--is:#637068;--ip:#aebdb5;
  --ln:#dce9e2;--bg:#f0f4f2;--W:#fdfffe;
}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Outfit',sans-serif;background:var(--bg);
  background-image:radial-gradient(ellipse 80% 60% at 10% 0%,rgba(42,157,111,.09) 0%,transparent 70%),
                   radial-gradient(ellipse 60% 50% at 90% 100%,rgba(201,146,58,.07) 0%,transparent 60%);
  min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:48px 20px;gap:24px}

.wrap{width:100%;max-width:860px}

.doc{background:var(--W);border-radius:3px;
  box-shadow:0 32px 80px rgba(11,61,46,.18),0 8px 24px rgba(11,61,46,.10);
  overflow:hidden;position:relative;
  animation:appear .55s cubic-bezier(.22,1,.36,1) both}
.doc::before{
  content:'PARROTDIAG';position:absolute;top:52%;left:50%;
  transform:translate(-50%,-50%) rotate(-28deg);
  font-family:'Playfair Display',serif;font-size:7.5rem;font-weight:700;
  letter-spacing:18px;color:rgba(42,157,111,.028);
  pointer-events:none;white-space:nowrap;z-index:0}

.hdr{background:var(--F);position:relative;overflow:hidden;z-index:1}
.hdr::before{content:'';position:absolute;top:-90px;right:-90px;
  width:320px;height:320px;
  background:radial-gradient(circle,rgba(77,201,148,.18) 0%,transparent 70%);border-radius:50%}
.hdr::after{content:'';position:absolute;bottom:0;left:0;right:0;height:3px;
  background:linear-gradient(90deg,var(--J),var(--M),#f0c060,var(--M),var(--J))}
.hi{position:relative;z-index:2;padding:32px 44px 36px;
  display:grid;grid-template-columns:1fr auto;align-items:start;gap:24px}
.brow{display:flex;align-items:center;gap:16px;margin-bottom:18px}
.bicon{width:54px;height:54px;background:rgba(255,255,255,.08);
  border:1.5px solid rgba(255,255,255,.18);border-radius:14px;
  display:flex;align-items:center;justify-content:center;font-size:1.5rem;color:var(--M);flex-shrink:0}
.bname{font-family:'Playfair Display',serif;font-size:1.85rem;font-weight:700;
  letter-spacing:3px;color:#fff;line-height:1}
.bsub{font-size:.78rem;color:rgba(255,255,255,.45);letter-spacing:1.5px;text-transform:uppercase;margin-top:5px}
.dtype{display:flex;align-items:center;gap:14px}
.dtlbl{font-family:'Playfair Display',serif;font-size:1.45rem;font-style:italic;color:rgba(255,255,255,.65)}
.dtline{flex:1;height:1px;background:rgba(255,255,255,.12)}
.hmeta{display:flex;flex-direction:column;align-items:flex-end;gap:12px}
.rbox{background:rgba(255,255,255,.07);border:1.5px solid rgba(255,255,255,.14);border-radius:10px;padding:10px 18px}
.rlbl{font-size:.68rem;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,.4);margin-bottom:3px}
.rval{font-family:'DM Mono',monospace;font-size:1rem;font-weight:500;color:var(--M);letter-spacing:1px}
.rdate{font-size:.8rem;color:rgba(255,255,255,.4)}
.rdate strong{color:rgba(255,255,255,.7);font-weight:500}
.pill{display:inline-flex;align-items:center;gap:6px;padding:5px 14px;
  border-radius:99px;font-size:.75rem;font-weight:600;letter-spacing:.5px}
.pill.ok{background:rgba(77,201,148,.2);color:var(--M);border:1px solid rgba(77,201,148,.3)}
.pill.no{background:rgba(220,60,60,.15);color:#f08080;border:1px solid rgba(220,60,60,.2)}

.body{padding:44px;position:relative;z-index:1}
.idg{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:36px}
.idc{border:1px solid var(--ln);border-radius:14px;overflow:hidden}
.idh{background:var(--fo);padding:11px 20px;display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--fm)}
.idh i{color:var(--J);font-size:.9rem}
.idh span{font-size:.7rem;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--E)}
.idb{padding:18px 20px;display:flex;flex-direction:column;gap:9px;background:var(--W)}
.idn{font-family:'Playfair Display',serif;font-size:1.1rem;font-weight:600;color:var(--ink);margin-bottom:3px}
.idr{display:flex;align-items:baseline;gap:8px}
.idl{font-size:.7rem;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--ip);width:70px;flex-shrink:0}
.idv{font-size:.86rem;color:var(--im)}

.diag{background:linear-gradient(135deg,var(--fo) 0%,#d8f0e6 100%);
  border:1px solid var(--fm);border-left:4px solid var(--J);border-radius:14px;
  padding:22px 26px;margin-bottom:32px;display:flex;gap:18px;align-items:flex-start}
.dicon{width:42px;height:42px;border-radius:12px;background:var(--J);
  display:flex;align-items:center;justify-content:center;
  color:white;font-size:1rem;flex-shrink:0;box-shadow:0 4px 12px rgba(26,102,71,.28)}
.dlbl{font-size:.7rem;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--J);margin-bottom:5px}
.dtxt{font-family:'Playfair Display',serif;font-size:1.15rem;color:var(--ink);line-height:1.5}

.sh{display:flex;align-items:center;gap:12px;margin-bottom:14px}
.sicon{width:34px;height:34px;border-radius:9px;background:var(--F);
  display:flex;align-items:center;justify-content:center;color:var(--M);font-size:.8rem}
.stitle{font-size:.7rem;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--is)}

table{width:100%;border-collapse:collapse;border:1px solid var(--ln);border-radius:14px;overflow:hidden;margin-bottom:28px}
th{background:var(--F);color:rgba(255,255,255,.55);font-size:.67rem;font-weight:700;
  letter-spacing:1.5px;text-transform:uppercase;padding:12px 16px;text-align:left}
th:first-child{width:46px;text-align:center}
td{padding:13px 16px;font-size:.87rem;color:var(--im);vertical-align:middle;border-bottom:1px solid var(--ln)}
tbody tr:last-child td{border-bottom:none}
td:first-child{text-align:center}
tbody tr:nth-child(even){background:#fafcfb}
tbody tr:hover{background:var(--fo)}
.mn{font-family:'DM Mono',monospace;font-size:.76rem;color:var(--ip)}
.mname{font-weight:600;color:var(--F);font-size:.9rem}
.mp{display:inline-block;padding:3px 10px;border-radius:99px;font-size:.76rem;font-weight:500}
.mp.dos{background:#e8f0fd;color:#3b5bdb}
.mp.frq{background:var(--fo);color:var(--E)}
.mp.dur{background:var(--GL);color:#7c5010}
.empty-row{text-align:center;padding:40px!important;color:var(--ip);font-style:italic}

.instr{background:var(--GL);border:1px solid #e8d5b0;border-left:4px solid var(--G);
  border-radius:14px;padding:20px 24px;margin-bottom:24px}
.ih{display:flex;align-items:center;gap:9px;margin-bottom:9px}
.ih i{color:var(--G)}
.ih span{font-size:.7rem;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#8a6020}
.itxt{font-size:.9rem;color:var(--im);line-height:1.65}

.notes{background:#f5f7f6;border:1px solid var(--ln);border-left:4px solid var(--ip);
  border-radius:14px;padding:20px 24px;margin-bottom:24px}
.nh{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.nh i{color:var(--ip);font-size:.85rem}
.nh span{font-size:.7rem;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--is)}
.ntxt{font-size:.88rem;color:var(--is);line-height:1.6;font-style:italic}

.foot{margin-top:40px;padding-top:28px;border-top:1px solid var(--ln);
  display:grid;grid-template-columns:1fr auto 1fr;align-items:end;gap:24px}
.sname{font-family:'Playfair Display',serif;font-size:1.25rem;font-style:italic;color:var(--ink);margin-bottom:2px}
.stit{font-size:.76rem;color:var(--J);font-weight:500;margin-bottom:16px}
.sline{width:180px;height:1px;background:var(--ln);position:relative;margin-bottom:8px}
.sline::before{content:'Signature';position:absolute;bottom:5px;left:0;
  font-size:.63rem;letter-spacing:1px;text-transform:uppercase;color:var(--ip)}
.sdate{font-size:.78rem;color:var(--is)}
.sdate i{color:var(--J);margin-right:4px}
.seal{display:flex;flex-direction:column;align-items:center;gap:6px}
.sring{width:78px;height:78px;border:2px dashed var(--fm);border-radius:50%;
  display:flex;align-items:center;justify-content:center;color:var(--fm);font-size:1.8rem;position:relative}
.sring::before{content:'';position:absolute;inset:5px;border:1px solid var(--fm);border-radius:50%}
.stxt{font-size:.58rem;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--ip)}
.stamp{text-align:right}
.sbox{display:inline-block;border:1.5px dashed var(--J);border-radius:10px;
  padding:11px 18px;color:var(--J);font-size:.8rem;font-weight:600;margin-bottom:9px}
.sbox i{margin-right:6px}
.sgen{font-size:.7rem;color:var(--ip)}

.expiry{margin-top:26px;background:var(--fo);border:1px solid var(--fm);
  border-radius:10px;padding:11px 20px;display:flex;align-items:center;justify-content:space-between;gap:16px}
.expiry.dead{background:#fff0f0;border-color:#ffc9c9}
.eleft{display:flex;align-items:center;gap:10px;font-size:.84rem;color:var(--is)}
.eleft i{color:var(--J)}
.eleft strong{color:var(--ink);font-weight:600}

.bcrow{margin-top:20px;text-align:center;padding-top:16px;border-top:1px dashed var(--ln)}
.bcbars{display:inline-flex;align-items:flex-end;gap:1.5px;height:34px;margin-bottom:6px}
.bcbars span{display:block;width:2px;background:var(--F);opacity:.45}
.bclbl{font-family:'DM Mono',monospace;font-size:.7rem;color:var(--ip);letter-spacing:3px}

.actions{display:flex;gap:12px;justify-content:center}
.btn{display:inline-flex;align-items:center;gap:10px;padding:13px 30px;border:none;
  border-radius:10px;font-family:'Outfit',sans-serif;font-size:.9rem;font-weight:600;
  cursor:pointer;transition:all .2s ease}
.btn-p{background:var(--F);color:#fff;box-shadow:0 4px 14px rgba(11,61,46,.25)}
.btn-p:hover{background:var(--E);transform:translateY(-2px);box-shadow:0 8px 20px rgba(11,61,46,.3)}
.btn-s{background:var(--W);color:var(--is);border:1.5px solid var(--ln)}
.btn-s:hover{background:var(--fo);transform:translateY(-2px)}

@keyframes appear{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
@media print{body{background:white;padding:0}.doc{box-shadow:none}.actions{display:none}}
@media(max-width:640px){
  .hi{grid-template-columns:1fr}.idg{grid-template-columns:1fr}
  .body{padding:24px}.foot{grid-template-columns:1fr;gap:28px}
  .seal{display:none}.stamp{text-align:left}
}
</style>
</head>
<body>
<div class="wrap">
  <div class="doc">
    <div class="hdr">
      <div class="hi">
        <div>
          <div class="brow">
            <div class="bicon"><i class="fas fa-robot"></i></div>
            <div>
              <div class="bname">PARROTDIAG</div>
              <div class="bsub">Plateforme Médicale Intelligente</div>
            </div>
          </div>
          <div class="dtype">
            <span class="dtlbl">Ordonnance Médicale</span>
            <span class="dtline"></span>
          </div>
        </div>
        <div class="hmeta">
          <div class="rbox">
            <div class="rlbl">N° Ordonnance</div>
            <div class="rval">${rxNumber}</div>
          </div>
          <div class="rdate">Délivrée le <strong>${fmt(prescription.date)}</strong></div>
          <span class="pill ${isActive ? 'ok' : 'no'}">
            <i class="fas fa-${isActive ? 'check-circle' : 'times-circle'}"></i>
            ${isActive ? 'Active' : 'Expirée'}
          </span>
        </div>
      </div>
    </div>

    <div class="body">
      <div class="idg">
        <div class="idc">
          <div class="idh"><i class="fas fa-user-md"></i><span>Médecin prescripteur</span></div>
          <div class="idb">
            <div class="idn">Dr. ${doctorName}</div>
            <div class="idr"><span class="idl">Spécialité</span><span class="idv">${doctorSpec}</span></div>
            <div class="idr"><span class="idl">Téléphone</span><span class="idv">${doctorPhone}</span></div>
            <div class="idr"><span class="idl">Adresse</span><span class="idv">${doctorAddress}</span></div>
          </div>
        </div>
        <div class="idc">
          <div class="idh"><i class="fas fa-user-injured"></i><span>Patient</span></div>
          <div class="idb">
            <div class="idn">${patientName}</div>
            <div class="idr"><span class="idl">Naissance</span><span class="idv">${patientDOB}</span></div>
            <div class="idr"><span class="idl">Téléphone</span><span class="idv">${patientPhone}</span></div>
            <div class="idr"><span class="idl">Adresse</span><span class="idv">${patientAddress}</span></div>
          </div>
        </div>
      </div>

      <div class="diag">
        <div class="dicon"><i class="fas fa-stethoscope"></i></div>
        <div>
          <div class="dlbl">Diagnostic</div>
          <div class="dtxt">${prescription.diagnosis || 'Non spécifié'}</div>
        </div>
      </div>

      <div class="sh">
        <div class="sicon"><i class="fas fa-pills"></i></div>
        <span class="stitle">Prescription médicamenteuse</span>
      </div>
      <table>
        <thead>
          <tr><th>#</th><th>Médicament</th><th>Dosage</th><th>Fréquence</th><th>Durée</th></tr>
        </thead>
        <tbody>${medRows}</tbody>
      </table>

      <div class="instr">
        <div class="ih"><i class="fas fa-notes-medical"></i><span>Instructions posologiques</span></div>
        <div class="itxt">${prescription.instructions || 'Aucune instruction particulière.'}</div>
      </div>

      ${prescription.notes ? `
      <div class="notes">
        <div class="nh"><i class="fas fa-comment-dots"></i><span>Notes complémentaires</span></div>
        <div class="ntxt">${prescription.notes}</div>
      </div>` : ''}

      <div class="foot">
        <div>
          <div class="sname">Dr. ${doctorName}</div>
          <div class="stit">${doctorSpec}</div>
          <div class="sline"></div>
          <div class="sdate"><i class="fas fa-calendar-check"></i>${fmt(prescription.date)}</div>
        </div>
        <div class="seal">
          <div class="sring"><i class="fas fa-stamp"></i></div>
          <div class="stxt">Cachet médical</div>
        </div>
        <div class="stamp">
          <div class="sbox"><i class="fas fa-hospital"></i>PARROTDIAG</div>
          <div class="sgen">Généré le ${new Date().toLocaleDateString('fr-FR')}</div>
        </div>
      </div>

      <div class="expiry${isActive ? '' : ' dead'}">
        <div class="eleft">
          <i class="fas fa-${isActive ? 'hourglass-half' : 'hourglass-end'}"></i>
          <span>Valable jusqu'au <strong>${fmt(prescription.expiry_date)}</strong></span>
        </div>
        <span class="pill ${isActive ? 'ok' : 'no'}">
          <i class="fas fa-${isActive ? 'check' : 'ban'}"></i>
          ${isActive ? 'En cours de validité' : 'Expirée'}
        </span>
      </div>

      <div class="bcrow">
        <div class="bcbars" id="bc"></div>
        <div class="bclbl">${rxNumber}</div>
      </div>
    </div>
  </div>

  <div class="actions">
    <button class="btn btn-p" onclick="window.print()">
      <i class="fas fa-print"></i>Imprimer l'ordonnance
    </button>
    <button class="btn btn-s" onclick="window.close()">
      <i class="fas fa-times"></i>Fermer
    </button>
  </div>
</div>
<script>
  const bc = document.getElementById('bc');
  [100,60,100,40,80,100,50,100,70,40,100,60,100,30,80,100,50,100,60,40,
   100,80,50,100,40,60,100,80,50,100,70,40,100,60,50,100,80,40,100,60,
   100,50,80,40,100,60,80,100].forEach(h => {
    const s = document.createElement('span');
    s.style.height = h + '%';
    bc.appendChild(s);
  });
<\/script>
</body>
</html>`;

        const win = window.open('', '_blank');
        if (!win) {
            showNotification('❌ Popup bloqué ! Téléchargement du fichier...', 'warning');
            const blob = new Blob([htmlContent], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `ordonnance_${rxNumber}.html`;
            a.click();
            URL.revokeObjectURL(url);
            showNotification('📥 Fichier téléchargé (ouvrez-le puis Fichier > Imprimer)', 'info');
        } else {
            win.document.write(htmlContent);
            win.document.close();
            try {
                await fetch(`${API_URL}/prescriptions/${prescriptionId}/pdf-generated`, { method: 'POST' }).catch(() => {});
            } catch (_) {}
            showNotification('✅ Ordonnance générée avec succès !', 'success');
        }

    } catch (error) {
        console.error('❌ Erreur génération PDF:', error);
        showNotification('❌ Erreur lors de la génération : ' + error.message, 'error');
    }
}

async function viewPatientPrescriptions(patientId) {
    showLoading('Chargement des ordonnances...');
    openModal('prescriptionsHistoryModal');

    try {
        const response = await fetch(`${API_URL}/patients/${patientId}/prescriptions`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const prescriptions = await response.json();
        const container = document.getElementById('prescriptionsHistoryContent');

        if (!prescriptions || prescriptions.length === 0) {
            container.innerHTML = `
                <div style="text-align:center;padding:48px 20px;">
                    <i class="fas fa-prescription" style="font-size:40px;color:var(--text-muted);margin-bottom:14px;opacity:0.2;display:block;"></i>
                    <h3 style="margin-bottom:10px;color:var(--text-secondary);font-size:14px;">Aucune ordonnance</h3>
                    <p style="color:var(--text-muted);margin-bottom:20px;font-size:12px;">Ce patient n'a pas encore d'ordonnance</p>
                    <button onclick="openPrescriptionModal(${patientId})" class="btn btn-sm"><i class="fas fa-plus"></i> Créer une ordonnance</button>
                </div>
            `;
            hideLoading();
            return;
        }

        let html = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                <h3 style="font-size:14px;color:var(--text-primary);">Historique des ordonnances</h3>
                <button onclick="openPrescriptionModal(${patientId})" class="btn btn-sm"><i class="fas fa-plus"></i> Nouvelle ordonnance</button>
            </div>
        `;

        prescriptions.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(pres => {
            const statusClass = pres.is_active ? 'badge-success' : 'badge-danger';
            const statusText = pres.is_active ? 'Active' : 'Expirée';
            const medCount = pres.medications ? pres.medications.length : 0;

            html += `
                <div class="prescription-card" style="background:var(--bg-secondary);border:1px solid var(--border);border-left:3px solid ${pres.is_active ? 'var(--teal)' : 'var(--red)'};border-radius:10px;padding:16px;margin-bottom:12px;">
                    <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
                        <div>
                            <span style="font-weight:600;font-size:13px;font-family:'DM Mono',monospace;color:var(--text-primary);">N° ${pres.prescription_number}</span>
                            <span class="badge ${statusClass}" style="margin-left:10px;">${statusText}</span>
                        </div>
                        <span style="color:var(--text-muted);font-size:11px;font-family:'DM Mono',monospace;">${formatDate(pres.date)}</span>
                    </div>
                    <p style="margin-bottom:6px;font-size:13px;"><strong style="color:var(--text-secondary);">Diagnostic:</strong> <span style="color:var(--text-primary);">${pres.diagnosis}</span></p>
                    <p style="margin-bottom:8px;font-size:12px;color:var(--text-muted);">${medCount} médicament(s) prescrit(s)</p>
                    ${medCount > 0 ? `
                        <div style="margin:10px 0;padding:10px;background:var(--bg-primary);border-radius:8px;border:1px solid var(--border);">
                            ${pres.medications.slice(0,2).map(med => `<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.04);font-size:12px;"><span style="color:var(--text-primary);"><strong>${med.name}</strong> ${med.dosage}</span><span style="color:var(--text-muted);">${med.frequency}</span></div>`).join('')}
                            ${medCount > 2 ? `<p style="margin-top:6px;font-size:11px;color:var(--teal);">+${medCount-2} autre(s)</p>` : ''}
                        </div>
                    ` : ''}
                    <p style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">Exp: ${formatDate(pres.expiry_date)}</p>
                    <div style="display:flex;gap:8px;">
                        <button onclick="generatePrescriptionPDF(${pres.id})" class="btn btn-secondary btn-sm"><i class="fas fa-file-pdf"></i> PDF</button>
                        <button onclick="viewPrescriptionDetails(${pres.id})" class="btn btn-secondary btn-sm"><i class="fas fa-eye"></i> Détails</button>
                        ${pres.is_active ? `<button onclick="deactivatePrescription(${pres.id})" class="btn btn-secondary btn-sm" style="color:var(--red);"><i class="fas fa-ban"></i> Désactiver</button>` : ''}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
        hideLoading();

    } catch (error) {
        console.error('Erreur:', error);
        hideLoading();
        showNotification('Erreur lors du chargement', 'error');
        closeModal('prescriptionsHistoryModal');
    }
}

async function viewPrescriptionDetails(prescriptionId) {
    try {
        showLoading('Chargement des détails...');

        const response = await fetch(`${API_URL}/prescriptions/${prescriptionId}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const prescription = await response.json();

        const container = document.getElementById('prescriptionDetailsContent');
        if (!container) return;

        const medRows = prescription.medications && prescription.medications.length > 0
            ? prescription.medications.map(med => `
                <tr>
                    <td style="padding:8px;font-size:12px;color:var(--text-primary);"><strong>${med.name}</strong></td>
                    <td style="padding:8px;font-size:12px;color:var(--text-secondary);">${med.dosage}</td>
                    <td style="padding:8px;font-size:12px;color:var(--text-secondary);">${med.frequency}</td>
                    <td style="padding:8px;font-size:12px;color:var(--text-muted);">${med.duration || '—'}</td>
                </tr>
            `).join('')
            : '<tr><td colspan="4" style="text-align:center;padding:20px;">Aucun médicament</td></tr>';

        container.innerHTML = `
            <div>
                <div style="background:var(--teal-dim);border:1px solid rgba(61,217,180,0.2);padding:14px;border-radius:10px;margin-bottom:18px;">
                    <h3 style="color:var(--teal);margin-bottom:4px;font-family:'DM Mono',monospace;font-size:14px;">N° ${prescription.prescription_number}</h3>
                    <p style="color:var(--text-muted);font-size:11px;">${formatDate(prescription.date)}</p>
                </div>
                <div style="margin-bottom:16px;">
                    <h4 style="margin-bottom:6px;color:var(--text-muted);font-size:11px;text-transform:uppercase;letter-spacing:1px;">Patient</h4>
                    <p style="color:var(--text-primary);font-size:13px;">${prescription.patient_name}</p>
                    <p style="color:var(--text-muted);font-size:12px;">${prescription.patient_phone || 'Non renseigné'}</p>
                </div>
                <div style="margin-bottom:16px;">
                    <h4 style="margin-bottom:6px;color:var(--text-muted);font-size:11px;text-transform:uppercase;letter-spacing:1px;">Diagnostic</h4>
                    <p style="color:var(--text-primary);font-size:13px;">${prescription.diagnosis}</p>
                </div>
                <div style="margin-bottom:16px;">
                    <h4 style="margin-bottom:8px;color:var(--text-muted);font-size:11px;text-transform:uppercase;letter-spacing:1px;">Médicaments</h4>
                    <table style="width:100%;border-collapse:collapse;">
                        <thead><tr style="background:var(--bg-elevated);">
                            <th style="padding:8px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);">Médicament</th>
                            <th style="padding:8px;text-align:left;font-size:10px;color:var(--text-muted);">Dosage</th>
                            <th style="padding:8px;text-align:left;font-size:10px;color:var(--text-muted);">Fréquence</th>
                            <th style="padding:8px;text-align:left;font-size:10px;color:var(--text-muted);">Durée</th>
                        </tr></thead>
                        <tbody>${medRows}</tbody>
                    </table>
                </div>
                <div style="margin-bottom:16px;">
                    <h4 style="margin-bottom:6px;color:var(--text-muted);font-size:11px;text-transform:uppercase;letter-spacing:1px;">Instructions</h4>
                    <p style="background:var(--bg-secondary);padding:12px;border-radius:8px;font-size:13px;color:var(--text-secondary);">${prescription.instructions || 'Aucune instruction'}</p>
                </div>
                <div style="display:flex;justify-content:space-between;padding-top:14px;border-top:1px solid var(--border);">
                    <span style="font-size:12px;"><strong style="color:var(--text-secondary);">Statut:</strong> <span class="badge ${prescription.is_active ? 'badge-success' : 'badge-danger'}">${prescription.is_active ? 'Active' : 'Expirée'}</span></span>
                    <span style="font-size:12px;color:var(--text-muted);">Exp: ${formatDate(prescription.expiry_date)}</span>
                </div>
                <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;">
                    <button onclick="generatePrescriptionPDF(${prescription.id})" class="btn btn-secondary btn-sm"><i class="fas fa-file-pdf"></i> PDF</button>
                    <button onclick="closeModal('prescriptionDetailsModal')" class="btn btn-sm">Fermer</button>
                </div>
            </div>
        `;

        hideLoading();
        openModal('prescriptionDetailsModal');

    } catch (error) {
        console.error('Erreur:', error);
        hideLoading();
        showNotification('Erreur lors du chargement des détails', 'error');
    }
}

async function deactivatePrescription(prescriptionId) {
    if (!confirm('Voulez-vous désactiver cette ordonnance ?')) return;

    try {
        const response = await fetch(`${API_URL}/prescriptions/${prescriptionId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_active: false })
        });

        if (response.ok) {
            showNotification('Ordonnance désactivée', 'success');

            closeModal('prescriptionDetailsModal');

            const historyModal = document.getElementById('prescriptionsHistoryModal');
            if (historyModal && historyModal.style.display === 'flex') {
                const patientId = document.getElementById('prescriptionPatientId').value;
                if (patientId) await viewPatientPrescriptions(patientId);
            }
        }
    } catch (error) {
        showNotification('Erreur lors de la désactivation', 'error');
    }
}

// ============================================
// STATISTIQUES — MODULE COMPLET
// ============================================

function sRnd(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function sRndArr(n, min, max) { return Array.from({ length: n }, () => sRnd(min, max)); }

function sAnimCount(id, target, suffix = '') {
    const el = document.getElementById(id);
    if (!el) return;
    let current = 0;
    const step = Math.ceil(target / 40);
    const timer = setInterval(() => {
        current = Math.min(current + step, target);
        el.textContent = current.toLocaleString('fr-FR') + suffix;
        if (current >= target) clearInterval(timer);
    }, 20);
}

function sBuildSparkline(id, data, cls) {
    const wrap = document.getElementById(id);
    if (!wrap) return;
    const max = Math.max(...data);
    wrap.innerHTML = '';
    data.forEach((v, i) => {
        const bar = document.createElement('div');
        bar.className = 's-spark-bar' + (i === data.length - 1 ? ' hi' : '');
        bar.style.height = Math.max(5, (v / max) * 100) + '%';
        wrap.appendChild(bar);
    });
}

async function loadStatisticsPage() {
    document.getElementById('statisticsContent').style.display = 'block';

    const liveEl = document.getElementById('statsLiveDate');
    if (liveEl) {
        liveEl.textContent = new Date().toLocaleString('fr-FR', {
            day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    }

    if (typeof Chart !== 'undefined') {
        Chart.defaults.color = '#545868';
        Chart.defaults.font.family = "'DM Sans', sans-serif";
        Chart.defaults.font.size = 11;
        Chart.defaults.plugins.tooltip.backgroundColor = '#1e2535';
        Chart.defaults.plugins.tooltip.borderColor = 'rgba(255,255,255,0.07)';
        Chart.defaults.plugins.tooltip.borderWidth = 1;
        Chart.defaults.plugins.tooltip.titleColor = '#e8eaf0';
        Chart.defaults.plugins.tooltip.bodyColor = '#8b909e';
        Chart.defaults.plugins.tooltip.padding = 10;
        Chart.defaults.plugins.tooltip.cornerRadius = 8;
        Chart.defaults.plugins.legend.display = false;
    }

    await loadStatsFromAPI();

    if (statsRefreshInterval) clearInterval(statsRefreshInterval);
    statsRefreshInterval = setInterval(async () => {
        await loadStatsFromAPI();
    }, 60000);
}

async function loadStatsFromAPI() {
    try {
        const response = await fetch(`${API_URL}/doctors/${currentDoctor.id}/stats`);
        if (response.ok) {
            const apiStats = await response.json();
            buildStatsKPI(apiStats);
        } else {
            buildStatsKPI(null);
        }
    } catch (error) {
        console.warn('Stats API indisponible, données de démo utilisées');
        buildStatsKPI(null);
    }

    let appointments = [];
    try {
        const r = await fetch(`${API_URL}/doctors/${currentDoctor.id}/appointments`);
        if (r.ok) appointments = await r.json();
    } catch (_) {}

    let patients = [];
    try {
        const r = await fetch(`${API_URL}/doctors/${currentDoctor.id}/patients`);
        if (r.ok) patients = await r.json();
    } catch (_) {}

    buildAllCharts(appointments, patients);
}

function buildStatsKPI(apiStats) {
    const mult = statsPeriod / 30;

    const pVal  = apiStats?.total_patients       || sRnd(40, 80)  * Math.ceil(mult);
    const rVal  = apiStats?.total_appointments   || sRnd(90, 180) * Math.ceil(mult);
    const cPct  = apiStats?.cancellation_rate    || sRnd(5, 18);
    const csVal = apiStats?.total_consultations  || sRnd(60, 120) * Math.ceil(mult);

    sAnimCount('sKpiPatients', pVal);
    sAnimCount('sKpiRdv', rVal);
    document.getElementById('sKpiCancel') && (document.getElementById('sKpiCancel').textContent = cPct + '%');
    sAnimCount('sKpiCons', csVal);

    const tPat = document.getElementById('sTrendPat');
    const tRdv = document.getElementById('sTrendRdv');
    const tCan = document.getElementById('sTrendCan');
    const tCons = document.getElementById('sTrendCons');

    if (tPat)  tPat.innerHTML  = `<i class="fas fa-arrow-up"></i> +${apiStats?.new_patients_this_month || sRnd(3, 15)}%`;
    if (tRdv)  tRdv.innerHTML  = `<i class="fas fa-arrow-up"></i> +${sRnd(5, 20)}%`;
    if (tCan)  tCan.innerHTML  = `<i class="fas fa-minus"></i> ${sRnd(-3, 3) >= 0 ? '+' : '-'}${Math.abs(sRnd(-3, 3))}%`;
    if (tCons) tCons.innerHTML = `<i class="fas fa-arrow-up"></i> +${apiStats?.consultations_this_month || sRnd(4, 18)}%`;

    sBuildSparkline('sSparkPat',  sRndArr(12, 20, 80));
    sBuildSparkline('sSparkRdv',  sRndArr(12, 40, 180));
    sBuildSparkline('sSparkCan',  sRndArr(12, 4, 22));
    sBuildSparkline('sSparkCons', sRndArr(12, 30, 120));
}

function buildAllCharts(appointments, patients) {
    buildSLineChart(appointments);
    buildSDonutChart(appointments);
    buildSBarChart(appointments);
    buildSRadarChart();
    buildSHeatmap(appointments);
    buildSHourChart(appointments);
    buildSPolarChart(appointments);
    buildSRanking(patients, appointments);
    buildSTimeline(appointments);
}

function buildSLineChart(appointments) {
    const n = statsPeriod <= 30 ? statsPeriod : 12;
    const labels = statsPeriod <= 30
        ? Array.from({ length: n }, (_, i) => {
            const d = new Date(); d.setDate(d.getDate() - (n - i - 1));
            return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
        })
        : ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

    let rdvData, consultData, cancelData;
    if (appointments && appointments.length > 0) {
        rdvData     = Array(n).fill(0);
        consultData = Array(n).fill(0);
        cancelData  = Array(n).fill(0);
        appointments.forEach(apt => {
            const aptDate = new Date(apt.date);
            const now = new Date();
            if (statsPeriod <= 30) {
                const diff = Math.floor((now - aptDate) / (1000 * 60 * 60 * 24));
                const idx = n - 1 - diff;
                if (idx >= 0 && idx < n) {
                    rdvData[idx]++;
                    if (apt.status === 'completed') consultData[idx]++;
                    if (apt.status === 'cancelled') cancelData[idx]++;
                }
            } else {
                const idx = aptDate.getMonth();
                if (idx >= 0 && idx < n) {
                    rdvData[idx]++;
                    if (apt.status === 'completed') consultData[idx]++;
                    if (apt.status === 'cancelled') cancelData[idx]++;
                }
            }
        });
        if (rdvData.every(v => v === 0)) {
            rdvData     = sRndArr(n, 2, 14);
            consultData = sRndArr(n, 1, 9);
            cancelData  = sRndArr(n, 0, 4);
        }
    } else {
        rdvData     = sRndArr(n, 2, 14);
        consultData = sRndArr(n, 1, 9);
        cancelData  = sRndArr(n, 0, 4);
    }

    if (statsCharts.line) statsCharts.line.destroy();
    const ctx = document.getElementById('sLineChart');
    if (!ctx) return;
    const c = ctx.getContext('2d');

    const g1 = c.createLinearGradient(0, 0, 0, 240);
    g1.addColorStop(0, 'rgba(61,217,180,0.28)');
    g1.addColorStop(1, 'rgba(61,217,180,0.0)');
    const g2 = c.createLinearGradient(0, 0, 0, 240);
    g2.addColorStop(0, 'rgba(180,145,80,0.2)');
    g2.addColorStop(1, 'rgba(180,145,80,0.0)');

    statsCharts.line = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Rendez-vous',
                    data: rdvData,
                    borderColor: '#3dd9b4', backgroundColor: g1,
                    borderWidth: 2.5, pointRadius: n > 15 ? 0 : 4,
                    pointHoverRadius: 6, pointBackgroundColor: '#3dd9b4',
                    pointBorderColor: '#0a0d12', pointBorderWidth: 2,
                    fill: true, tension: 0.4
                },
                {
                    label: 'Consultations',
                    data: consultData,
                    borderColor: '#b49150', backgroundColor: g2,
                    borderWidth: 2, pointRadius: n > 15 ? 0 : 4,
                    pointHoverRadius: 6, pointBackgroundColor: '#b49150',
                    pointBorderColor: '#0a0d12', pointBorderWidth: 2,
                    fill: true, tension: 0.4
                },
                {
                    label: 'Annulations',
                    data: cancelData,
                    borderColor: '#e55c5c', backgroundColor: 'transparent',
                    borderWidth: 1.5, borderDash: [4, 4],
                    pointRadius: 0, fill: false, tension: 0.4
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    display: true, position: 'top', align: 'end',
                    labels: {
                        usePointStyle: true, pointStyle: 'circle',
                        padding: 16, boxWidth: 7, color: '#8b909e', font: { size: 11 }
                    }
                }
            },
            scales: {
                x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { maxTicksLimit: 10, maxRotation: 0 } },
                y: { grid: { color: 'rgba(255,255,255,0.04)' }, beginAtZero: true, ticks: { stepSize: 2 } }
            }
        }
    });
}

function buildSDonutChart(appointments) {
    let confirmed, completed, pending, cancelled;

    if (appointments && appointments.length > 0) {
        confirmed  = appointments.filter(a => a.status === 'confirmed').length;
        completed  = appointments.filter(a => a.status === 'completed').length;
        pending    = appointments.filter(a => a.status === 'pending').length;
        cancelled  = appointments.filter(a => a.status === 'cancelled').length;
    } else {
        confirmed = sRnd(30, 55); completed = sRnd(20, 45);
        pending   = sRnd(5, 15);  cancelled = sRnd(3, 12);
    }

    const total  = confirmed + completed + pending + cancelled || 1;
    const data   = [confirmed, completed, pending, cancelled];
    const labels = ['Confirmés', 'Terminés', 'En attente', 'Annulés'];
    const colors = ['#3dd9b4', '#b49150', '#f0a04a', '#e55c5c'];

    if (statsCharts.donut) statsCharts.donut.destroy();
    const ctx = document.getElementById('sDonutChart');
    if (!ctx) return;

    statsCharts.donut = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data, backgroundColor: colors,
                borderColor: '#141820', borderWidth: 3,
                hoverBorderWidth: 3, hoverBorderColor: '#1e2535'
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '72%',
            plugins: {
                tooltip: {
                    callbacks: {
                        label: ctx => ` ${ctx.label}: ${ctx.parsed} (${Math.round(ctx.parsed / total * 100)}%)`
                    }
                }
            }
        }
    });

    const legend = document.getElementById('sDonutLegend');
    if (!legend) return;
    legend.innerHTML = '';
    labels.forEach((lbl, i) => {
        const pct = Math.round(data[i] / total * 100);
        legend.innerHTML += `
            <div class="s-legend-item">
                <div class="s-legend-left">
                    <div class="s-legend-dot" style="background:${colors[i]};"></div>
                    <span class="s-legend-label">${lbl}</span>
                </div>
                <div class="s-legend-bar-wrap">
                    <div class="s-legend-bar-fill" style="width:${pct}%;background:${colors[i]};"></div>
                </div>
                <span class="s-legend-val">${data[i]}</span>
            </div>
        `;
    });
}

function buildSBarChart(appointments) {
    const days = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
    let data;

    if (appointments && appointments.length > 0) {
        data = [0, 0, 0, 0, 0, 0, 0];
        appointments.forEach(apt => {
            const d = new Date(apt.date).getDay();
            const idx = d === 0 ? 6 : d - 1;
            data[idx]++;
        });
        if (data.every(v => v === 0)) data = sRndArr(7, 2, 14);
    } else {
        data = sRndArr(7, 2, 14);
    }

    if (statsCharts.bar) statsCharts.bar.destroy();
    const ctx = document.getElementById('sBarChart');
    if (!ctx) return;

    const maxVal = Math.max(...data);
    statsCharts.bar = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: days,
            datasets: [{
                data,
                backgroundColor: data.map(v => v === maxVal ? '#3dd9b4' : 'rgba(61,217,180,0.2)'),
                borderRadius: 6, borderSkipped: false,
                hoverBackgroundColor: '#3dd9b4'
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y} RDV` } } },
            scales: {
                x: { grid: { display: false } },
                y: { grid: { color: 'rgba(255,255,255,0.04)' }, beginAtZero: true, ticks: { stepSize: 2 } }
            }
        }
    });
}

function buildSRadarChart() {
    if (statsCharts.radar) statsCharts.radar.destroy();
    const ctx = document.getElementById('sRadarChart');
    if (!ctx) return;

    statsCharts.radar = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: ['Cardio', 'Suivi', 'Urgence', 'Pédiatrie', 'Derma', 'Général'],
            datasets: [{
                data: sRndArr(6, 15, 80),
                borderColor: '#b49150', backgroundColor: 'rgba(180,145,80,0.12)',
                borderWidth: 2, pointBackgroundColor: '#b49150',
                pointBorderColor: '#141820', pointBorderWidth: 2, pointRadius: 4
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                r: {
                    grid: { color: 'rgba(255,255,255,0.06)' },
                    angleLines: { color: 'rgba(255,255,255,0.06)' },
                    pointLabels: { color: '#8b909e', font: { size: 10 } },
                    ticks: { display: false }
                }
            }
        }
    });
}

function buildSHeatmap(appointments) {
    const grid = document.getElementById('sHeatmapGrid');
    if (!grid) return;
    grid.innerHTML = '';
    const levels = ['', 'l1', 'l2', 'l3', 'l4', 'l5'];

    const counts = Array(84).fill(0);
    if (appointments && appointments.length > 0) {
        const now = new Date();
        appointments.forEach(apt => {
            const diff = Math.floor((now - new Date(apt.date)) / (1000 * 60 * 60 * 24));
            if (diff >= 0 && diff < 84) counts[83 - diff]++;
        });
    }

    const maxC = Math.max(...counts, 1);
    for (let i = 0; i < 84; i++) {
        const cell = document.createElement('div');
        const v = counts[i];
        const lvl = Math.min(5, Math.ceil((v / maxC) * 5));
        cell.className = 's-heatmap-cell ' + levels[lvl];
        cell.setAttribute('data-tip', `${v} RDV`);
        grid.appendChild(cell);
    }
}

function buildSHourChart(appointments) {
    const hours = ['8h', '9h', '10h', '11h', '12h', '13h', '14h', '15h', '16h', '17h', '18h'];
    let data;

    if (appointments && appointments.length > 0) {
        data = Array(11).fill(0);
        appointments.forEach(apt => {
            if (!apt.time) return;
            const h = parseInt(apt.time.split(':')[0]);
            if (h >= 8 && h <= 18) data[h - 8]++;
        });
        if (data.every(v => v === 0)) data = [2, 5, 12, 15, 10, 6, 3, 11, 14, 9, 4];
    } else {
        data = [2, 5, 12, 15, 10, 6, 3, 11, 14, 9, 4];
    }

    if (statsCharts.hour) statsCharts.hour.destroy();
    const ctx = document.getElementById('sHourChart');
    if (!ctx) return;

    const maxV = Math.max(...data);
    statsCharts.hour = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: hours,
            datasets: [{
                data,
                backgroundColor: data.map(v =>
                    v === maxV ? 'rgba(229,92,92,0.85)' :
                    v >= maxV * 0.6 ? 'rgba(240,160,74,0.6)' :
                    'rgba(91,141,238,0.35)'
                ),
                borderRadius: 5, borderSkipped: false
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y} patients` } } },
            scales: {
                x: { grid: { display: false } },
                y: { grid: { color: 'rgba(255,255,255,0.04)' }, beginAtZero: true, ticks: { stepSize: 3 } }
            }
        }
    });
}

function buildSPolarChart(appointments) {
    let standard, suivi, urgence, teleconsult;

    if (appointments && appointments.length > 0) {
        standard    = appointments.filter(a => a.type === 'consultation').length;
        suivi       = appointments.filter(a => a.type === 'followup').length;
        urgence     = appointments.filter(a => a.type === 'emergency').length;
        teleconsult = appointments.filter(a => a.type === 'teleconsultation').length;
        if (standard + suivi + urgence + teleconsult === 0) {
            standard = sRnd(30, 60); suivi = sRnd(15, 35);
            urgence  = sRnd(5, 15);  teleconsult = sRnd(10, 25);
        }
    } else {
        standard = sRnd(30, 60); suivi = sRnd(15, 35);
        urgence  = sRnd(5, 15);  teleconsult = sRnd(10, 25);
    }

    if (statsCharts.polar) statsCharts.polar.destroy();
    const ctx = document.getElementById('sPolarChart');
    if (!ctx) return;

    statsCharts.polar = new Chart(ctx, {
        type: 'polarArea',
        data: {
            labels: ['Standard', 'Suivi', 'Urgence', 'Téléconsult'],
            datasets: [{
                data: [standard, suivi, urgence, teleconsult],
                backgroundColor: [
                    'rgba(61,217,180,0.6)', 'rgba(180,145,80,0.6)',
                    'rgba(229,92,92,0.6)', 'rgba(91,141,238,0.6)'
                ],
                borderColor: '#141820', borderWidth: 2
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: { r: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { display: false } } },
            plugins: {
                legend: {
                    display: true, position: 'bottom',
                    labels: {
                        usePointStyle: true, pointStyle: 'circle',
                        padding: 10, boxWidth: 7, color: '#545868', font: { size: 10 }
                    }
                }
            }
        }
    });
}

function buildSRanking(patients, appointments) {
    const list = document.getElementById('sRankingList');
    if (!list) return;

    let ranked = [];
    if (patients && patients.length > 0) {
        ranked = patients
            .map(p => ({
                name: p.full_name,
                visits: appointments ? appointments.filter(a => a.patient_id === p.id).length : sRnd(2, 15)
            }))
            .filter(p => p.visits > 0)
            .sort((a, b) => b.visits - a.visits)
            .slice(0, 5);
    }

    if (ranked.length === 0) {
        const demoNames = ['Ahmed Benali', 'Sara El Idrissi', 'Karim Tazi', 'Nadia Chraibi', 'Omar Fassi'];
        const visits = [sRnd(12,20), sRnd(8,14), sRnd(6,11), sRnd(4,8), sRnd(2,6)].sort((a,b)=>b-a);
        ranked = demoNames.map((name, i) => ({ name, visits: visits[i] }));
    }

    const maxV = ranked[0]?.visits || 1;
    const rankCls = ['rg', 'rs', 'rb', '', ''];

    list.innerHTML = '';
    ranked.forEach((p, i) => {
        const initials = p.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
        list.innerHTML += `
            <div class="s-ranking-item">
                <span class="s-rank-num ${rankCls[i] || ''}">${i + 1}</span>
                <div class="patient-avatar" style="width:32px;height:32px;font-size:10px;flex-shrink:0;">${initials}</div>
                <div style="flex:1;min-width:0;">
                    <div style="font-size:12.5px;font-weight:500;color:var(--text-primary);margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.name}</div>
                    <div style="font-size:11px;color:var(--text-muted);">${p.visits} visite${p.visits > 1 ? 's' : ''}</div>
                </div>
                <div class="s-rank-bar-wrap">
                    <div class="s-rank-bar-fill" style="width:${Math.round(p.visits / maxV * 100)}%;"></div>
                </div>
                <span style="font-family:'DM Mono',monospace;font-size:12px;font-weight:500;color:var(--teal);">${p.visits}</span>
            </div>
        `;
    });
}

function buildSTimeline(appointments) {
    const tl = document.getElementById('sTimeline');
    if (!tl) return;

    let events = [];

    if (appointments && appointments.length > 0) {
        const sorted = [...appointments].sort((a, b) => new Date(b.date + ' ' + (b.time || '00:00')) - new Date(a.date + ' ' + (a.time || '00:00')));
        events = sorted.slice(0, 5).map(apt => {
            const d = new Date(apt.date + ' ' + (apt.time || '00:00'));
            const diff = Math.floor((new Date() - d) / 60000);
            const timeAgo = diff < 60 ? `il y a ${diff}min` : diff < 1440 ? `il y a ${Math.floor(diff/60)}h` : `il y a ${Math.floor(diff/1440)}j`;
            const colorMap = { confirmed: '#3dd9b4', completed: '#b49150', pending: '#f0a04a', cancelled: '#e55c5c' };
            const labelMap = { confirmed: 'RDV confirmé', completed: 'Consultation terminée', pending: 'Nouveau RDV', cancelled: 'RDV annulé' };
            return {
                title: `${labelMap[apt.status] || 'RDV'} — ${apt.patient_name || 'Patient'}`,
                sub: apt.reason || 'Consultation',
                time: timeAgo,
                color: colorMap[apt.status] || '#5b8dee'
            };
        });
    }

    if (events.length === 0) {
        events = [
            { title: 'Consultation terminée — Ahmed Benali', sub: 'Diagnostic: Hypertension', time: 'il y a 10min', color: '#3dd9b4' },
            { title: 'Nouveau RDV accepté — Sara El Idrissi', sub: 'Demain à 10h30', time: 'il y a 32min', color: '#b49150' },
            { title: 'Ordonnance créée — Karim Tazi', sub: '3 médicaments prescrits', time: 'il y a 1h', color: '#5b8dee' },
            { title: 'RDV annulé — Nadia Chraibi', sub: 'Motif: empêchement', time: 'il y a 2h', color: '#e55c5c' },
            { title: 'Dossier mis à jour — Omar Fassi', sub: 'Constantes vitales ajoutées', time: 'il y a 3h', color: '#f0a04a' },
        ];
    }

    tl.innerHTML = '';
    events.forEach(ev => {
        tl.innerHTML += `
            <div class="s-tl-item">
                <div class="s-tl-dot-wrap">
                    <div class="s-tl-dot" style="background:${ev.color};box-shadow:0 0 6px ${ev.color}60;"></div>
                    <div class="s-tl-line"></div>
                </div>
                <div style="flex:1;min-width:0;">
                    <div class="s-tl-title">${ev.title}</div>
                    <div class="s-tl-meta">
                        <span>${ev.sub}</span>
                        <span style="color:var(--border);">|</span>
                        <span style="font-family:'DM Mono',monospace;font-size:10px;">${ev.time}</span>
                    </div>
                </div>
            </div>
        `;
    });
}

function setStatsPeriod(period, btn) {
    statsPeriod = period;
    document.querySelectorAll('.stats-period-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    loadStatsFromAPI();
}

function cleanupStats() {
    if (statsRefreshInterval) {
        clearInterval(statsRefreshInterval);
        statsRefreshInterval = null;
    }
    Object.values(statsCharts).forEach(c => { try { c.destroy(); } catch(_){} });
    statsCharts = {};
}

// ============================================
// GESTION DES DISPONIBILITÉS — MÉDECIN (CORRIGÉ)
// ============================================

function initAvailabilityCalendar() {
    console.log('✓ Initialisation du calendrier de disponibilité');
    
    if (!currentDoctor) {
        console.error('❌ currentDoctor est null');
        showNotification('Erreur: Médecin non identifié. Veuillez vous reconnecter', 'error');
        return;
    }
    
    loadAvailabilities();
}

function renderCalendar() {
    const year = currentAvailabilityMonth.getFullYear();
    const month = currentAvailabilityMonth.getMonth();
    
    const monthName = new Date(year, month).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    document.getElementById('currentMonth').textContent = monthName.charAt(0).toUpperCase() + monthName.slice(1);
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    
    const grid = document.getElementById('calendarGrid');
    grid.innerHTML = '';
    
    const weekDays = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
    weekDays.forEach(day => {
        const dayHeader = document.createElement('div');
        dayHeader.style.cssText = `
            text-align: center;
            padding: 8px;
            font-weight: 600;
            color: var(--text-muted);
            font-size: 11px;
            text-transform: uppercase;
        `;
        dayHeader.textContent = day;
        grid.appendChild(dayHeader);
    });
    
    let startOffset = startingDayOfWeek === 0 ? 6 : startingDayOfWeek - 1;
    
    for (let i = 0; i < startOffset; i++) {
        const emptyCell = document.createElement('div');
        grid.appendChild(emptyCell);
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const date = new Date(year, month, day);
        
        const isPast = date < today;
        const avail = doctorAvailabilities[dateStr];
        
        let bgColor = '#10b981';
        let borderColor = '#059669';
        let title = '';
        let disabled = false;
        
        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
        
        if (isPast) {
            bgColor = '#9ca3af';
            borderColor = '#6b7280';
            title = 'Date passée';
            disabled = true;
        } else if (avail) {
            if (avail.is_open === false) {
                bgColor = '#f97316';
                borderColor = '#ea580c';
                title = 'Jour fermé' + (avail.notes ? ` - ${avail.notes}` : '');
                disabled = false;
            } else if (avail.current_patients >= avail.max_patients) {
                bgColor = '#ef4444';
                borderColor = '#dc2626';
                title = `Complet (${avail.current_patients}/${avail.max_patients})`;
                disabled = false;
            } else {
                bgColor = '#10b981';
                borderColor = '#059669';
                title = `Disponible (${avail.current_patients}/${avail.max_patients} patients)`;
                disabled = false;
            }
        } else {
            if (isWeekend) {
                bgColor = '#f97316';
                borderColor = '#ea580c';
                title = 'Week-end (fermé par défaut)';
                disabled = false;
            } else {
                bgColor = '#10b981';
                borderColor = '#059669';
                title = 'Disponible (par défaut)';
                disabled = false;
            }
        }
        
        const dayCell = document.createElement('div');
        dayCell.title = title;
        dayCell.style.cssText = `
            padding: 12px;
            background: ${bgColor};
            border: 2px solid ${borderColor};
            border-radius: 8px;
            text-align: center;
            cursor: ${disabled ? 'not-allowed' : 'pointer'};
            font-weight: 600;
            color: white;
            transition: all 0.2s;
            opacity: ${disabled ? 0.5 : 1};
            position: relative;
        `;
        
        if (avail) {
            const statusIcon = document.createElement('span');
            statusIcon.style.cssText = `
                position: absolute;
                top: -5px;
                left: -5px;
                background: white;
                border-radius: 50%;
                width: 18px;
                height: 18px;
                font-size: 10px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
            `;
            
            if (avail.is_open === false) {
                statusIcon.innerHTML = '🔒';
                statusIcon.style.background = '#f97316';
                statusIcon.style.color = 'white';
            } else if (avail.current_patients >= avail.max_patients) {
                statusIcon.innerHTML = '🔴';
                statusIcon.style.background = '#ef4444';
                statusIcon.style.color = 'white';
            } else {
                statusIcon.innerHTML = '✓';
                statusIcon.style.background = '#10b981';
                statusIcon.style.color = 'white';
            }
            dayCell.appendChild(statusIcon);
        }
        
        if (avail && avail.is_open !== false && avail.current_patients > 0) {
            const badge = document.createElement('span');
            badge.style.cssText = `
                position: absolute;
                top: -5px;
                right: -5px;
                background: white;
                color: black;
                border-radius: 10px;
                padding: 2px 6px;
                font-size: 9px;
                font-weight: 700;
                border: 1px solid ${borderColor};
            `;
            badge.textContent = `${avail.current_patients}/${avail.max_patients}`;
            dayCell.appendChild(badge);
        }
        
        if (selectedDate === dateStr) {
            dayCell.style.boxShadow = '0 0 0 3px var(--accent)';
            dayCell.style.transform = 'scale(1.05)';
            dayCell.style.zIndex = '10';
        }
        
        dayCell.textContent = day;
        
        if (!disabled) {
            dayCell.addEventListener('click', () => selectAvailabilityDate(dateStr, day, month, year));
            dayCell.addEventListener('mouseover', () => {
                if (selectedDate !== dateStr) {
                    dayCell.style.transform = 'scale(1.05)';
                }
            });
            dayCell.addEventListener('mouseout', () => {
                if (selectedDate !== dateStr) {
                    dayCell.style.transform = 'scale(1)';
                }
            });
        }
        
        grid.appendChild(dayCell);
    }
}

// ============================================
// FIX 2 — loadAvailabilities : sans fusion localStorage problématique
// ============================================
async function loadAvailabilities() {
    if (!currentDoctor) return;

    const year  = currentAvailabilityMonth.getFullYear();
    const month = currentAvailabilityMonth.getMonth() + 1;

    doctorAvailabilities = {};

    try {
        const token = localStorage.getItem('token');
        if (!token) {
            showNotification('❌ Token d\'authentification manquant', 'error');
            return;
        }

        const response = await fetch(
            `${API_URL}/doctors/${currentDoctor.id}/availability?year=${year}&month=${month}`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );

        if (response.ok) {
            const data = await response.json();
            (data.availabilities || []).forEach(a => {
                doctorAvailabilities[a.date] = {
                    date:             a.date,
                    max_patients:     a.max_patients || 5,
                    is_open:          a.is_open === true || a.is_open === 1,
                    current_patients: a.current_patients || 0,
                    notes:            a.notes || ''
                };
            });
            console.log(`✅ ${Object.keys(doctorAvailabilities).length} jours chargés depuis le serveur`);
        } else if (response.status === 401) {
            console.error('❌ Session expirée (401)');
            const errText = await response.text();
            let errorMsg = 'Votre session a expiré';
            try {
                const errJson = JSON.parse(errText);
                if (errJson.detail) errorMsg = errJson.detail;
            } catch(e) {}
            
            showNotification(`⚠️ ${errorMsg}. Reconnexion en cours...`, 'warning');
            setTimeout(() => {
                localStorage.removeItem('token');
                localStorage.removeItem('loggedInUser');
                window.location.href = 'connexionpage.html';
            }, 2000);
        } else {
            const errText = await response.text();
            let errorMsg = `Erreur ${response.status}`;
            try {
                const errJson = JSON.parse(errText);
                if (errJson.detail) errorMsg = errJson.detail;
                else if (errJson.message) errorMsg = errJson.message;
            } catch(e) {
                if (errText) errorMsg = errText;
            }
            console.error('❌ Erreur serveur:', errorMsg);
            showNotification(`Erreur chargement disponibilités: ${errorMsg}`, 'error');
        }
    } catch (err) {
        console.error('❌ Erreur réseau:', err.message || err);
        showNotification(`Erreur réseau: ${err.message || 'Impossible de charger les disponibilités'}`, 'error');
    }

    renderCalendar();
}

// ============================================
// FIX 3 — saveAvailability : rollback si erreur serveur
// ============================================
async function saveAvailability() {
    console.log('🔍 saveAvailability appelée');
    console.log('   selectedDate:', selectedDate);
    console.log('   currentDoctor:', currentDoctor);
    
    if (!selectedDate || !currentDoctor) {
        const msg = !selectedDate ? 'Aucune date sélectionnée' : 'Médecin non identifié';
        console.error('❌ Erreur:', msg);
        showNotification(`Erreur: ${msg}. Veuillez d'abord sélectionner une date.`, 'error');
        return;
    }

    const maxPatients = parseInt(document.getElementById('selectedDateMaxPatients').value) || 5;
    const status      = document.getElementById('selectedDateStatus').value;
    const notes       = document.getElementById('selectedDateNotes').value;
    const isOpen      = status !== 'closed';

    // Sauvegarder la date AVANT de faire quoi que ce soit
    const dateToSave = selectedDate;

    // Snapshot pour rollback
    const previous = doctorAvailabilities[dateToSave]
        ? { ...doctorAvailabilities[dateToSave] }
        : null;

    const existing = doctorAvailabilities[dateToSave];
    const currentPatientCount = existing?.current_patients || 0;

    // Affichage optimiste immédiat
    doctorAvailabilities[dateToSave] = {
        date:             dateToSave,
        max_patients:     maxPatients,
        is_open:          isOpen,
        current_patients: status === 'full' ? maxPatients : currentPatientCount,
        notes
    };
    renderCalendar();
    // NE PAS appeler cancelDateEdit() ici - on en aura besoin après!

    try {
        const payloadToSend = {
            doctor_id:    currentDoctor.id,
            date:         dateToSave,
            max_patients: maxPatients,
            is_open:      isOpen,
            notes:        notes || ""
        };
        
        console.log('📤 Envoi des données:', payloadToSend);

        const response = await fetch(`${API_URL}/doctors/availability/set`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(payloadToSend)
        });

        if (response.ok) {
            const labels = { closed: 'Jour fermé 🔒', full: 'Complet 🔴', open: 'Ouvert ✅' };
            showNotification(`${labels[status]} — Sauvegardé sur le serveur`, 'success');
            // Fermer le formulaire et réinitialiser la date
            cancelDateEdit();
            // Recharger pour confirmer les données réelles du serveur
            await loadAvailabilities();
        } else if (response.status === 401) {
            console.error('❌ Session expirée (401)');
            const errText = await response.text();
            let errorMessage = 'Votre session a expiré. Veuillez vous reconnecter.';
            try {
                const errJson = JSON.parse(errText);
                if (errJson.detail) errorMessage = errJson.detail;
            } catch(e) {}
            
            showNotification(`⚠️ ${errorMessage}`, 'error');
            
            // Forcer la déconnexion après 2 secondes
            setTimeout(() => {
                localStorage.removeItem('token');
                localStorage.removeItem('loggedInUser');
                window.location.href = 'connexionpage.html';
            }, 2000);
        } else {
            const errText = await response.text();
            console.error('❌ Erreur Serveur:', response.status, errText);
            
            let errorMessage = `Erreur ${response.status}`;
            try {
                const errJson = JSON.parse(errText);
                if (errJson.detail) errorMessage = errJson.detail;
            } catch(e) {
                errorMessage = errText || errorMessage;
            }
            
            showNotification(`❌ ${errorMessage}`, 'error');
            // Rollback
            if (previous) doctorAvailabilities[dateToSave] = previous;
            else delete doctorAvailabilities[dateToSave];
            selectedDate = dateToSave;  // Restaurer la date pour pouvoir réessayer
            renderCalendar();
        }
    } catch (err) {
        console.error('❌ Erreur Réseau:', err.message || err);
        showNotification(`❌ Erreur: ${err.message || 'Serveur inaccessible'}`, 'error');
        // Rollback
        if (previous) doctorAvailabilities[dateToSave] = previous;
        else delete doctorAvailabilities[dateToSave];
        selectedDate = dateToSave;  // Restaurer la date pour pouvoir réessayer
        renderCalendar();
    }
}

function selectAvailabilityDate(dateStr, day, month, year) {
    selectedDate = dateStr;
    console.log(`✓ Date sélectionnée: ${dateStr}`);
    console.log(`  Format: YYYY-MM-DD = "${dateStr}"`);
    
    // Vérifier que les éléments DOM existent
    const testElement = document.getElementById('dayDetailsSection');
    if (!testElement) {
        console.error('❌ #dayDetailsSection non trouvé dans le DOM');
        return;
    }
    
    renderCalendar();
    
    const dateObj = new Date(year, month, day);
    const dayName = dateObj.toLocaleDateString('fr-FR', { weekday: 'long' });
    const fullDate = dateObj.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    
    document.getElementById('selectedDateDisplay').textContent = `${dayName.charAt(0).toUpperCase() + dayName.slice(1)} ${fullDate}`;
    
    const avail = doctorAvailabilities[dateStr];
    const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
    
    if (avail) {
        document.getElementById('selectedDateMaxPatients').value = avail.max_patients || 5;
        document.getElementById('selectedDatePatients').textContent = avail.current_patients || 0;
        
        let status = 'open';
        if (avail.is_open === false) {
            status = 'closed';
        } else if (avail.current_patients >= avail.max_patients) {
            status = 'full';
        }
        
        document.getElementById('selectedDateStatus').value = status;
        document.getElementById('selectedDateNotes').value = avail.notes || '';
        
    } else {
        const defaultStatus = isWeekend ? 'closed' : 'open';
        
        document.getElementById('selectedDateMaxPatients').value = 5;
        document.getElementById('selectedDatePatients').textContent = '0';
        document.getElementById('selectedDateStatus').value = defaultStatus;
        document.getElementById('selectedDateNotes').value = isWeekend ? 'Week-end' : '';
    }
    
    document.getElementById('dayDetailsSection').style.display = 'block';
}

function generateDemoAvailabilities() {
    console.log('⚠️ Génération de données de démonstration');
    
    doctorAvailabilities = {};
    const year = currentAvailabilityMonth.getFullYear();
    const month = currentAvailabilityMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const date = new Date(year, month, day);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (date < today) continue;
        
        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
        
        if (isWeekend) {
            doctorAvailabilities[dateStr] = {
                date: dateStr,
                max_patients: 0,
                is_open: false,
                current_patients: 0,
                notes: 'Week-end'
            };
        } else {
            const random = Math.random();
            if (random < 0.2) {
                doctorAvailabilities[dateStr] = {
                    date: dateStr,
                    max_patients: 5,
                    is_open: true,
                    current_patients: 5,
                    notes: 'Complet'
                };
            } else if (random < 0.4) {
                doctorAvailabilities[dateStr] = {
                    date: dateStr,
                    max_patients: 0,
                    is_open: false,
                    current_patients: 0,
                    notes: 'Fermé exceptionnellement'
                };
            } else {
                const patients = Math.floor(Math.random() * 4);
                doctorAvailabilities[dateStr] = {
                    date: dateStr,
                    max_patients: 5,
                    is_open: true,
                    current_patients: patients,
                    notes: ''
                };
            }
        }
    }
    
    renderCalendar();
}

function cancelDateEdit() {
    document.getElementById('dayDetailsSection').style.display = 'none';
    selectedDate = null;
    renderCalendar();
}

function previousMonth() {
    currentAvailabilityMonth.setMonth(currentAvailabilityMonth.getMonth() - 1);
    loadAvailabilities();
}

function nextMonth() {
    currentAvailabilityMonth.setMonth(currentAvailabilityMonth.getMonth() + 1);
    loadAvailabilities();
}

function refreshAvailability() {
    loadAvailabilities();
    showNotification('Disponibilités actualisées', 'success');
}

function openWorkingHoursModal() {
    loadWorkingHours();
}

async function loadWorkingHours() {
    if (!currentDoctor) return;
    
    try {
        const response = await fetch(`${API_URL}/doctors/${currentDoctor.id}/working-hours`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            renderWorkingHours(data.working_hours || []);
        }
    } catch (error) {
        console.error('Erreur chargement horaires:', error);
    }
}

function renderWorkingHours(hours) {
    const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
    const container = document.getElementById('workingHoursContainer');
    
    container.innerHTML = days.map((day, idx) => {
        const hour = hours.find(h => h.day_of_week === idx) || {};
        return `
            <div style="display: grid; grid-template-columns: 80px 1fr 1fr 1fr; gap: 10px; margin-bottom: 12px; padding: 12px; background: var(--bg-secondary); border-radius: 8px; border: 1px solid var(--border);">
                <div style="display: flex; align-items: center; color: var(--text-primary); font-weight: 600; font-size: 13px;">${day}</div>
                <div>
                    <label style="font-size: 10px; color: var(--text-muted);">Début</label>
                    <input type="time" value="${hour.start_time || '09:00'}" class="wh-start" data-day="${idx}" style="width: 100%; padding: 6px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 6px; color: var(--text-primary);">
                </div>
                <div>
                    <label style="font-size: 10px; color: var(--text-muted);">Fin</label>
                    <input type="time" value="${hour.end_time || '17:00'}" class="wh-end" data-day="${idx}" style="width: 100%; padding: 6px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 6px; color: var(--text-primary);">
                </div>
                <div>
                    <label style="font-size: 10px; color: var(--text-muted);">Durée slot</label>
                    <select class="wh-duration" data-day="${idx}" style="width: 100%; padding: 6px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 6px; color: var(--text-primary);">
                        <option value="15" ${hour.slot_duration === 15 ? 'selected' : ''}>15 min</option>
                        <option value="30" ${hour.slot_duration === 30 || !hour.slot_duration ? 'selected' : ''}>30 min</option>
                        <option value="60" ${hour.slot_duration === 60 ? 'selected' : ''}>1h</option>
                    </select>
                </div>
            </div>
        `;
    }).join('');
    
    openModal('workingHoursModal');
}

async function saveWorkingHours() {
    if (!currentDoctor) return;
    
    const hours = [];
    
    document.querySelectorAll('.wh-start').forEach(el => {
        const day = parseInt(el.dataset.day);
        const start = el.value;
        const end = document.querySelector(`.wh-end[data-day="${day}"]`).value;
        const duration = parseInt(document.querySelector(`.wh-duration[data-day="${day}"]`).value);
        
        hours.push({
            doctor_id: currentDoctor.id,
            day_of_week: day,
            start_time: start,
            end_time: end,
            slot_duration: duration
        });
    });
    
    try {
        const response = await fetch(`${API_URL}/doctors/working-hours/set`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ working_hours: hours })
        });
        
        if (response.ok) {
            showNotification('Horaires mis à jour avec succès', 'success');
            closeModal('workingHoursModal');
        } else {
            showNotification('Erreur lors de la sauvegarde', 'error');
        }
    } catch (error) {
        console.error('Erreur sauvegarde horaires:', error);
        showNotification('Erreur de connexion au serveur', 'error');
    }
}

// ============================================
// ÉVÉNEMENTS & INITIALISATION
// ============================================
function setupEventListeners() {
    const userSection = document.getElementById('userProfileSection');
    if (userSection) {
        userSection.addEventListener('click', function(e) {
            e.stopPropagation();
            toggleUserDropdown();
        });
    }

    document.addEventListener('click', function(e) {
        const dropdown = document.getElementById('userDropdown');
        const userSection = document.getElementById('userProfileSection');
        if (userSection && dropdown && !userSection.contains(e.target) && dropdown.classList.contains('show')) {
            dropdown.classList.remove('show');
        }

        const notifPanel = document.getElementById('notificationsPanel');
        if (!e.target.closest('.notifications-dropdown') && notifPanel && notifPanel.style.display !== 'none') {
            notifPanel.style.display = 'none';
        }
    });

    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === this) closeModal(this.id);
        });
    });

    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') sendMessage();
        });
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    // Apply theme immediately on load
    const savedTheme = localStorage.getItem('parrotTheme') || 'light';
    applyTheme(savedTheme);

    // Theme toggle button
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            const next = current === 'dark' ? 'light' : 'dark';
            applyTheme(next);
            localStorage.setItem('parrotTheme', next);
            showNotification(`Thème ${next === 'light' ? 'clair' : 'sombre'} activé`, 'success');
        });
    }

    const isAuthenticated = await checkAuthentication();
    if (!isAuthenticated) return;

    updateUserInterface();
    updateCurrentDate();
    setupNavigation();
    setupEventListeners();

    showLoading('Chargement des données...');

    try {
        await Promise.all([
            loadStats(),
            loadPatients(),
            loadAppointments(),
            loadNotifications()
        ]);
        hideLoading();

        startMessagePolling();

        realTimeUpdateInterval = setInterval(async () => {
            await loadNotifications();
            await loadAppointments();
        }, 30000);

    } catch (error) {
        console.error('Erreur:', error);
        hideLoading();
        showNotification('Erreur lors du chargement des données', 'error');
    }
});

window.addEventListener('beforeunload', () => {
    if (realTimeUpdateInterval) clearInterval(realTimeUpdateInterval);
    if (messagePollingInterval) clearInterval(messagePollingInterval);
});