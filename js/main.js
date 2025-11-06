import { checkLoginState, login, logout, signUp, showForgotPasswordModal, handleForgotPassword } from './auth.js'; // Importa as funções (sem handlePasswordUpdate)
import { setupNavigation, setupModals, setupUploadModal, setupThemeToggle } from './ui.js';
import { saveAiSettings } from './ia.js';
import { disconnectInstance } from './status.js';
import { saveEvent, changeDay } from './agenda.js';
// ✅ REQ 4: Importa as novas funções do modal de busca
import { descartarLead, takeOverChat, openSearchFinishedModal, handleSearchFinished, openChatHistoryModal, renderChatHistory} from './atendimentos.js';
import { uploadFile, deleteFile } from './drive.js';
// ✅ ATUALIZADO: Importa 'savePasswordSettings' do settings.js
import { loadSettings, saveUserSettings, saveCompanySettings, savePasswordSettings } from './settings.js';
// ✅ ATUALIZADO: Importa 'confirmDeleteProduct' e remove 'deleteProduct'
import { handleProductFormSubmit, openEditModal as openEditProductModal, setupProductEventListeners, confirmDeleteProduct } from './produtos.js';
import { handleClientFormSubmit, deleteClient, openEditModal as openEditClientModal, setupClientTableListeners } from './clientes.js';
import './finances.js';
import { supabaseClient, logEvent } from './api.js';


console.log('[OREH] Módulo principal carregado.');

// --- LÓGICA DO SERVICE WORKER E SPLASH SCREEN ---

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js')
                .then(registration => {
                    console.log('Service Worker registrado com sucesso:', registration);
                })
                .catch(error => {
                    console.log('Falha ao registrar Service Worker:', error);
                });
        });
    }
}

function hideSplashScreen() {
    const splashScreen = document.getElementById('splashScreen');
    if (splashScreen) {
        splashScreen.classList.add('hidden');
    }
}

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

    // --- Listeners para Redefinição de Senha ---
    const forgotPasswordLink = document.getElementById('forgotPasswordLink');
    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', (e) => {
            e.preventDefault();
            showForgotPasswordModal();
        });
    }

    const forgotPasswordForm = document.getElementById('forgotPasswordForm');
    if (forgotPasswordForm) {
        forgotPasswordForm.addEventListener('submit', handleForgotPassword);
    }

    // ✅ REMOVIDO: Listener para 'resetPasswordForm' (modal) foi removido.
     // --- Fim dos Listeners de Redefinição ---


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

    const kanbanBoard = document.getElementById('kanbanBoard');
    if (kanbanBoard) {
        // ✅ ATUALIZADO: Tornou a função async para buscar o histórico
        kanbanBoard.addEventListener('click', async (e) => {
            const card = e.target.closest('.chat-card');
            if (!card) return;

            const modal = document.getElementById('chatDetailModal');
            if (!modal) return;

            // 1. Limpa o histórico anterior e define como "Carregando"
            const historyContainer = modal.querySelector('#kanbanChatHistoryContainer'); // <-- ID CORRETO
            if (historyContainer) {
                historyContainer.innerHTML = '<p class="loading-message" style="padding: 2rem 0;">Carregando histórico...</p>';
            }

            // 2. Preenche os dados do cabeçalho (como antes)
            const descartarBtn = modal.querySelector('#descartarLeadBtn');
            if (descartarBtn) {
                descartarBtn.dataset.chatId = card.dataset.id;
            }
            const takeOverBtn = modal.querySelector('#kanbanTakeOverBtn');
            if (takeOverBtn) {
                takeOverBtn.dataset.chatId = card.dataset.id;
            }

            const setText = (id, text) => {
                const el = modal.querySelector(id);
                if (el) el.textContent = text || 'N/A';
            };

            const status = (card.dataset.status || 'N/A').replace(/_/g, ' ');
            const statusEl = modal.querySelector('#chatDetailStatus');

            const customerName = card.dataset.customer_name;
            const customerPhone = card.dataset.customer_phone; // O telefone já vem limpo do .js

            setText('#chatDetailCustomer', customerName);
            setText('#chatDetailPhone', customerPhone);
            setText('#chatDetailCreated', card.dataset.formatted_created_at || new Date(card.dataset.created_at).toLocaleString('pt-BR'));
            setText('#chatDetailSummary', card.dataset.last_message_summary || 'Nenhuma informação.');

            if (statusEl) {
                statusEl.textContent = status;
                statusEl.className = 'status-badge';
                statusEl.dataset.status = card.dataset.status;
            }

            // 3. Mostra o modal
            modal.style.display = 'flex';

            // 4. Busca e renderiza o histórico (nova lógica)
            try {
                const { data: { user } } = await supabaseClient.auth.getUser();
                if (!user) throw new Error("Usuário não autenticado.");
                
                const { data: profile } = await supabaseClient
                    .from('users')
                    .select('company_id')
                    .eq('id', user.id)
                    .single();
                if (!profile) throw new Error("Perfil do usuário não encontrado.");

                // Chama a RPC
                const { data: messages, error } = await supabaseClient.rpc('get_chat_history', {
                    p_company_id: profile.company_id,
                    p_customer_phone: customerPhone 
                });

                if (error) throw error;

                // ✅ ATUALIZADO: Renderiza no container correto
                renderChatHistory(historyContainer, messages, customerName);

            } catch (error) {
                console.error('Erro ao buscar histórico de chat:', error);
                if (historyContainer) {
                    historyContainer.innerHTML = `<p class="loading-message error">Falha ao carregar histórico: ${error.message}</p>`;
                }
                logEvent('ERROR', 'Falha ao buscar histórico de chat (Kanban)', { phone: customerPhone, error: error.message });
            }
        });
    }

    const humanAttentionContainer = document.getElementById('humanAttentionContainer');
    if (humanAttentionContainer) {
        humanAttentionContainer.addEventListener('click', (e) => {
            const card = e.target.closest('.chat-card');
            if (!card) return;

            const modal = document.getElementById('humanAttentionDetailModal');
            if (!modal) return;

            const takeOverBtn = modal.querySelector('#takeOverBtn');
            if (takeOverBtn) {
                takeOverBtn.dataset.chatId = card.dataset.id;
            }

            const setText = (id, text) => {
                const el = modal.querySelector(id);
                if (el) el.textContent = text || 'N/A';
            };

            const status = (card.dataset.status || 'N/A').replace(/_/g, ' ');
            const statusEl = modal.querySelector('#humanAttentionStatus');

            setText('#humanAttentionCustomer', card.dataset.customer_name);
            setText('#humanAttentionPhone', card.dataset.customer_phone);
            setText('#humanAttentionCreated', card.dataset.formatted_created_at || new Date(card.dataset.created_at).toLocaleString('pt-BR'));
            setText('#humanAttentionSummary', card.dataset.last_message_summary || 'Nenhuma informação.');

            if (statusEl) {
                statusEl.textContent = status;
                statusEl.className = 'status-badge';
                statusEl.dataset.status = card.dataset.status;
            }

            modal.style.display = 'flex';
        });
    }

    const takeOverBtn = document.getElementById('takeOverBtn');
    if(takeOverBtn) {
        takeOverBtn.addEventListener('click', (e) => {
            const chatId = e.target.dataset.chatId;
            if (chatId) {
                takeOverChat(chatId);
            }
        });
    }

    const descartarLeadBtn = document.getElementById('descartarLeadBtn');
    if (descartarLeadBtn) {
        descartarLeadBtn.addEventListener('click', (e) => {
            const chatId = e.target.dataset.chatId;
            if (chatId && confirm('Tem certeza que deseja descartar este lead?')) {
                descartarLead(chatId);
            }
        });
    }
    
    const kanbanTakeOverBtn = document.getElementById('kanbanTakeOverBtn');
    if(kanbanTakeOverBtn) {
        kanbanTakeOverBtn.addEventListener('click', (e) => {
            const chatId = e.target.dataset.chatId;
            if (chatId) {
                takeOverChat(chatId); // Chama a função importada de atendimentos.js
                // Fecha o modal atual, já que o card vai sumir do Kanban
                document.getElementById('chatDetailModal').style.display = 'none';
            }
        });
    }
    // ✅ REQ 4: Listeners para o novo modal de busca
    const openSearchModalBtn = document.getElementById('openSearchFinishedModalBtn');
    if (openSearchModalBtn) {
        openSearchModalBtn.addEventListener('click', openSearchFinishedModal);
    }

    const searchFinishedForm = document.getElementById('searchFinishedForm');
    if (searchFinishedForm) {
        searchFinishedForm.addEventListener('submit', handleSearchFinished);
    }

    const searchResultsContainer = document.getElementById('searchFinishedResultsContainer');
    if (searchResultsContainer) {
        searchResultsContainer.addEventListener('click', (e) => {
            const card = e.target.closest('.chat-card'); // Usa a classe do card renderizado
            if (!card) return;

            const phone = card.dataset.customer_phone;
            const name = card.dataset.customer_name;

            if (phone) {
                // Fecha o modal de busca
                document.getElementById('searchFinishedModal').style.display = 'none';
                // Abre o modal de histórico
                openChatHistoryModal(phone, name);
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

    // Produtos
    setupProductEventListeners(); // ✅ CORREÇÃO: Esta função agora configura os listeners da tabela

    // Clientes
    setupClientTableListeners();

    // Formulários
    const productForm = document.getElementById('productForm');
    if (productForm) productForm.addEventListener('submit', handleProductFormSubmit);

    const clientForm = document.getElementById('clientForm');
    if (clientForm) clientForm.addEventListener('submit', handleClientFormSubmit);

    const userSettingsForm = document.getElementById('userSettingsForm');
    if (userSettingsForm) userSettingsForm.addEventListener('submit', saveUserSettings);

    const companySettingsForm = document.getElementById('companySettingsForm');
    if (companySettingsForm) companySettingsForm.addEventListener('submit', saveCompanySettings);

    // ✅ NOVO LISTENER: Adiciona listener para o novo formulário de senha
    const passwordSettingsForm = document.getElementById('passwordSettingsForm');
    if (passwordSettingsForm) {
        passwordSettingsForm.addEventListener('submit', savePasswordSettings);
    }

    // Modais de Criação
    const openProductModalBtn = document.getElementById('openProductModalBtn');
    if (openProductModalBtn) {
        openProductModalBtn.addEventListener('click', () => {
            const form = document.getElementById('productForm');
            form.reset();
            form.dataset.existingPhotos = '[]';
            document.getElementById('productId').value = '';
            document.getElementById('productModalTitle').textContent = 'Adicionar Novo Produto';
            document.getElementById('imagePreviewContainer').innerHTML = '<p>Nenhuma imagem ou arquivo selecionado.</p>';
            document.getElementById('productFormModal').style.display = 'flex';
        });
    }

    const openClientModalBtn = document.getElementById('openClientModalBtn');
    if (openClientModalBtn) {
        openClientModalBtn.addEventListener('click', () => {
            const form = document.getElementById('clientForm');
            form.reset();
            document.getElementById('clientId').value = '';
            document.getElementById('clientModalTitle').textContent = 'Novo Cliente';
            document.getElementById('clientFormModal').style.display = 'flex';
            document.getElementById('isPersonal').checked = false;
        });
    }
    
    // ✅ NOVO LISTENER: Adiciona listener para o botão de confirmação de exclusão de produto
    const confirmDeleteProductBtn = document.getElementById('confirmDeleteProductBtn');
    if (confirmDeleteProductBtn) {
        confirmDeleteProductBtn.addEventListener('click', confirmDeleteProduct);
    }


    console.log('[OREH] Listeners configurados.');
}

// --- INICIALIZAÇÃO DA APLICAÇÃO ---
document.addEventListener('DOMContentLoaded', async () => {
    registerServiceWorker();
    setupNavigation();
    setupModals();
    setupUploadModal();
    setupEventListeners(); // Configura todos os listeners, incluindo os novos de reset
    setupThemeToggle();
    await checkLoginState(); // Verifica login e também se há reset de senha pendente
    // A splash screen é escondida após a verificação de login
    hideSplashScreen();
});