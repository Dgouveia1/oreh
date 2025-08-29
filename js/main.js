import { checkLoginState, login, logout, signUp } from './auth.js';
import { setupNavigation, setupModals, setupUploadModal } from './ui.js';
import { saveAiSettings } from './ia.js';
import { disconnectInstance } from './status.js';
import { saveEvent, changeDay } from './agenda.js';
import { descartarLead } from './atendimentos.js';
import { uploadFile, deleteFile } from './drive.js';
// ✅ Importa as novas funções do settings.js
import { saveUserSettings, saveCompanySettings } from './settings.js';

console.log('[OREH] Módulo principal carregado.');

function setupEventListeners() {
    console.log('[OREH] Configurando listeners de eventos globais...');

    // Autenticação
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) loginBtn.addEventListener('click', login);

    const passwordInput = document.getElementById('password');
    if (passwordInput) {
        passwordInput.addEventListener('keypress', e => {
            if (e.key === 'Enter') login();
        });
    }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);

    // Gestão de IA
    const saveAiSettingsBtn = document.getElementById('saveAiSettingsBtn');
    if (saveAiSettingsBtn) {
        saveAiSettingsBtn.addEventListener('click', saveAiSettings);
    }

    // Status
    const disconnectBtn = document.getElementById('disconnectBtn');
    if (disconnectBtn) {
        disconnectBtn.addEventListener('click', disconnectInstance);
    }

    // Atendimentos (Kanban)
    const kanbanBoard = document.getElementById('kanbanBoard');
    if (kanbanBoard) {
        kanbanBoard.addEventListener('click', (e) => {
            const card = e.target.closest('.chat-card');
            if (!card) return;

            const modal = document.getElementById('chatDetailModal');
            if (!modal) return;
            
            const descartarBtn = modal.querySelector('#descartarLeadBtn');
            if (descartarBtn) {
                descartarBtn.dataset.chatId = card.dataset.id;
            }

            const setText = (id, text) => {
                const el = modal.querySelector(id);
                if (el) el.textContent = text || 'N/A';
            };

            const status = (card.dataset.status || 'N/A').replace(/_/g, ' ');
            const statusEl = modal.querySelector('#chatDetailStatus');

            setText('#chatDetailCustomer', card.dataset.customer_name);
            setText('#chatDetailPhone', card.dataset.customer_phone);
            setText('#chatDetailCreated', card.dataset.formatted_created_at || new Date(card.dataset.created_at).toLocaleString('pt-BR'));
            setText('#chatDetailSummary', card.dataset.last_message_summary || 'Nenhuma informação.');

            if (statusEl) {
                statusEl.textContent = status;
                statusEl.className = 'status-badge';
                statusEl.dataset.status = card.dataset.status;
            }

            modal.style.display = 'flex';
        });
    }

    const descartarLeadBtn = document.getElementById('descartarLeadBtn');
    if (descartarLeadBtn) {
        descartarLeadBtn.addEventListener('click', (e) => {
            const chatId = e.target.dataset.chatId;
            if (chatId) {
                descartarLead(chatId);
            }
        });
    }

    // Agenda
    const agendaBody = document.getElementById('agendaBody');
    if (agendaBody) {
        agendaBody.addEventListener('click', (e) => {
            const card = e.target.closest('.event-card');
            if (!card) return;

            const modal = document.getElementById('eventDetailModal');
            if (!modal) return;
            
            const setText = (id, text) => {
                const el = modal.querySelector(id);
                if (el) el.textContent = text || 'N/A';
            }

            setText('#eventDetailAssunto', card.dataset.assunto);
            setText('#eventDetailData', card.dataset.formatted_date);
            setText('#eventDetailHorario', `${card.dataset.hora_inicio} - ${card.dataset.hora_fim}`);
            setText('#eventDetailCliente', card.dataset.cliente);
            setText('#eventDetailTelefone', card.dataset.telefone);
            setText('#eventDetailLocal', card.dataset.local);
            
            modal.style.display = 'flex';
        });
    }

    const openEventModalBtn = document.getElementById('openEventModalBtn');
    if (openEventModalBtn) {
        openEventModalBtn.addEventListener('click', () => {
            document.getElementById('eventFormModal').style.display = 'flex';
        });
    }

    const eventForm = document.getElementById('eventForm');
    if (eventForm) {
        eventForm.addEventListener('submit', saveEvent);
    }

    const prevDayBtn = document.getElementById('prevDayBtn');
    if (prevDayBtn) prevDayBtn.addEventListener('click', () => changeDay(-7));

    const nextDayBtn = document.getElementById('nextDayBtn');
    if (nextDayBtn) nextDayBtn.addEventListener('click', () => changeDay(7));

    // Drive
    const uploadForm = document.getElementById('uploadForm');
    if (uploadForm) {
        uploadForm.addEventListener('submit', uploadFile);
    }

    const fileGrid = document.getElementById('fileGrid');
    if (fileGrid) {
        fileGrid.addEventListener('click', (e) => {
            const deleteBtn = e.target.closest('.delete-file-btn');
            if (deleteBtn) {
                const fileName = deleteBtn.dataset.filename;
                if (fileName) {
                    deleteFile(fileName);
                }
            }
        });
    }

    // ✅ NOVO: Listeners para os formulários de Configurações
    const userSettingsForm = document.getElementById('userSettingsForm');
    if (userSettingsForm) {
        userSettingsForm.addEventListener('submit', saveUserSettings);
    }

    const companySettingsForm = document.getElementById('companySettingsForm');
    if (companySettingsForm) {
        companySettingsForm.addEventListener('submit', saveCompanySettings);
    }

    // Cadastro (SignUp)
    const openSignUpModalBtn = document.getElementById('openSignUpModalBtn');
    if (openSignUpModalBtn) {
        openSignUpModalBtn.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('signUpModal').style.display = 'flex';
        });
    }

    const signUpForm = document.getElementById('signUpForm');
    if (signUpForm) {
        signUpForm.addEventListener('submit', (e) => {
            e.preventDefault();
            signUp();
        });
    }

    console.log('[OREH] Listeners configurados.');
}

// --- INICIALIZAÇÃO DA APLICAÇÃO ---
document.addEventListener('DOMContentLoaded', () => {
    setupNavigation();
    setupModals();
    setupUploadModal();
    setupEventListeners();
    checkLoginState();
});