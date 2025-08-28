import { checkLoginState, login, logout } from './auth.js';
import { setupNavigation, setupModals, setupUploadModal } from './ui.js';
import { saveAiSettings } from './ia.js';
import { disconnectInstance } from './status.js';
import { saveEvent, changeDay } from './agenda.js';
import { descartarLead } from './atendimentos.js';
import { uploadFile, deleteFile } from './drive.js';

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

    // ✅ CORREÇÃO: Listener para os cards de ATENDIMENTO no Kanban
    const kanbanBoard = document.getElementById('kanbanBoard');
    if (kanbanBoard) {
        kanbanBoard.addEventListener('click', (e) => {
            const card = e.target.closest('.chat-card');
            if (!card) return;

            const modal = document.getElementById('chatDetailModal');
            if (!modal) return;

            // ✅ NOVO: Armazena o ID do chat no próprio botão de descarte
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

    // ✅ NOVO: Listener para o botão de descarte
    const descartarLeadBtn = document.getElementById('descartarLeadBtn');
    if (descartarLeadBtn) {
        descartarLeadBtn.addEventListener('click', (e) => {
            const chatId = e.target.dataset.chatId;
            if (chatId) {
                descartarLead(chatId);
            }
        });
    }

    // Listener para os cards da AGENDA
    const agendaBody = document.getElementById('agendaBody');
    if (agendaBody) {
        agendaBody.addEventListener('click', (e) => {
            const card = e.target.closest('.event-card');
            if (!card) return;

            const assuntoEl = document.getElementById('eventDetailAssunto');
            const dataEl = document.getElementById('eventDetailData');
            const horarioEl = document.getElementById('eventDetailHorario');
            const clienteEl = document.getElementById('eventDetailCliente');
            const telefoneEl = document.getElementById('eventDetailTelefone');
            const localEl = document.getElementById('eventDetailLocal');
            const modalEl = document.getElementById('eventDetailModal');

            if (assuntoEl) assuntoEl.textContent = card.dataset.assunto || 'Evento sem título';
            if (dataEl) dataEl.textContent = card.dataset.formatted_date || new Date(card.dataset.data).toLocaleDateString('pt-BR');
            if (horarioEl) horarioEl.textContent = `${card.dataset.hora_inicio} - ${card.dataset.hora_fim}`;
            if (clienteEl) clienteEl.textContent = card.dataset.cliente || 'N/A';
            if (telefoneEl) telefoneEl.textContent = card.dataset.telefone || 'N/A';
            if (localEl) localEl.textContent = card.dataset.local || 'N/A';
            if (modalEl) modalEl.style.display = 'flex';
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
    if (prevDayBtn) prevDayBtn.addEventListener('click', () => changeDay(-7)); // Volta 7 dias

    const nextDayBtn = document.getElementById('nextDayBtn');
    if (nextDayBtn) nextDayBtn.addEventListener('click', () => changeDay(7)); // Avança 7 dias

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
