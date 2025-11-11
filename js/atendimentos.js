import { supabaseClient, logEvent } from './api.js';
import { showToast } from './ui.js';

let atendimentosSubscription = null;
let lastHumanAttentionCount = 0; 

// --- LÓGICA DE DADOS (SUPABASE) ---

export function loadAtendimentos() {
    console.log("[OREH] Carregando e subscrevendo atendimentos...");
    fetchAndRenderAllChats();
    subscribeToChatChanges();
}

export function cleanupAtendimentos() {
    if (atendimentosSubscription) {
        supabaseClient.removeChannel(atendimentosSubscription);
        atendimentosSubscription = null;
        console.log('[OREH] Subscrição de Atendimentos encerrada.');
    }
}

async function fetchAndRenderAllChats() {
    const kanbanBoard = document.getElementById('kanbanBoard');
    const humanAttentionContainer = document.getElementById('humanAttentionContainer');
    if (!kanbanBoard || !humanAttentionContainer) return;

    kanbanBoard.querySelectorAll('.kanban-cards-container').forEach(c => c.innerHTML = '<p class="loading-message">Carregando...</p>');
    humanAttentionContainer.innerHTML = '<p class="loading-message">Carregando...</p>';
    
    const today = new Date().toISOString().split('T')[0];

    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error("Utilizador não autenticado.");
        
        const { data: profile } = await supabaseClient.from('users').select('company_id').eq('id', user.id).single();
        if (!profile) throw new Error("Perfil do utilizador não encontrado.");

        console.log(`[OREH Atendimentos] Buscando dados para a empresa: ${profile.company_id}`);

        const { data: clients, error: clientsError } = await supabaseClient
            .from('clients')
            .select('name, phone')
            .eq('company_id', profile.company_id);
        
        if (clientsError) throw clientsError;

        const clientNameMap = new Map();
        clients.forEach(client => {
            const cleanPhone = client.phone.replace(/\D/g, '');
            clientNameMap.set(cleanPhone, client.name);
        });

        const { data: chats, error: chatsError } = await supabaseClient
            .from('chats')
            .select('*')
            .eq('company_id', profile.company_id)
            .neq('temperatura', 'DESCARTE')
            .order('created_at', { ascending: false });

        if (chatsError) throw chatsError;

        console.log('[OREH Atendimentos] Chats brutos recebidos do DB:', chats);

        const formattedChats = chats.map(chat => {
            const cleanCustomerPhone = chat.customer_phone.replace(/\D/g, '');
            const registeredClientName = clientNameMap.get(cleanCustomerPhone);
            return {
                ...chat,
                customer_name: registeredClientName || chat.customer_name 
            };
        });
        
        console.log('[OREH Atendimentos] Chats após formatação de nome:', formattedChats);
        
        const humanAttentionChats = formattedChats.filter(chat => chat.status === 'ATENDIMENTO_HUMANO');
        
        const kanbanChats = formattedChats.filter(chat => {
            if (chat.status === 'ATENDIMENTO_HUMANO') return false;
            if (chat.temperatura === 'Finalizado') {
                const chatUpdateDate = new Date(chat.updated_at).toISOString().split('T')[0];
                return chatUpdateDate === today;
            }
            return true; 
        });

        console.log('[OREH Atendimentos] Chats filtrados para o Kanban:', kanbanChats);
        console.log('[OREH Atendimentos] Chats filtrados para Atendimento Humano:', humanAttentionChats);

        renderHumanAttention(humanAttentionChats);
        renderKanban(kanbanChats);

    } catch (error) {
        console.error("Erro ao carregar atendimentos:", error);
        showToast('Não foi possível carregar os atendimentos.', 'error');
        logEvent('ERROR', 'Falha ao carregar atendimentos', { errorMessage: error.message, stack: error.stack });
    }
}


async function updateChat(chatId, updates) {
    console.log(`[OREH] A atualizar chat ${chatId} com`, updates);
    try {
        const { error } = await supabaseClient
            .from('chats')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', chatId);

        if (error) throw error;
        showToast('Atendimento atualizado com sucesso!', 'success');
    } catch (error) {
        console.error('Erro ao atualizar o chat:', error);
        showToast('Falha ao atualizar o atendimento.', 'error');
        logEvent('ERROR', `Falha ao atualizar chat ${chatId}`, { updates, errorMessage: error.message, stack: error.stack });
    }
}

export async function descartarLead(chatId) {
    console.log(`[OREH] A descartar o chat ${chatId}`);
    try {
        const { error } = await supabaseClient
            .from('chats')
            .update({ temperatura: 'DESCARTE', updated_at: new Date().toISOString() })
            .eq('id', chatId);
        if (error) throw error;
        showToast('Lead descartado com sucesso!', 'success');
        logEvent('INFO', `Lead com ID '${chatId}' foi descartado.`);
        document.getElementById('chatDetailModal').style.display = 'none';
    } catch (error) {
        console.error('Erro ao descartar o lead:', error);
        showToast('Falha ao descartar o lead.', 'error');
        logEvent('ERROR', `Falha ao descartar lead com ID '${chatId}'`, { errorMessage: error.message, stack: error.stack });
    }
}

export async function takeOverChat(chatId) {
    console.log(`[OREH] Assumindo o atendimento do chat ${chatId}`);
    try {
        const { error } = await supabaseClient
            .from('chats')
            .update({ 
                status: 'ATENDIMENTO_ASSUMIDO', 
                temperatura: 'Atendimento', 
                updated_at: new Date().toISOString() 
            })
            .eq('id', chatId);
        if (error) throw error;
        showToast('Atendimento assumido!', 'success');
        logEvent('INFO', `Atendimento ${chatId} assumido.`);
        document.getElementById('humanAttentionDetailModal').style.display = 'none';
    } catch (error) {
        console.error('Erro ao assumir atendimento:', error);
        showToast('Falha ao assumir o atendimento.', 'error');
        logEvent('ERROR', `Falha ao assumir atendimento ${chatId}`, { errorMessage: error.message });
    }
}

// --- RENDERIZAÇÃO E LÓGICA DE UI ---

function createChatCard(chat) {
    const card = document.createElement('div');
    card.className = 'chat-card';
    card.draggable = true;
    card.dataset.id = chat.id;

    const status = chat.status ? chat.status.replace(/_/g, ' ') : 'N/A';
    const createdAt = new Date(chat.created_at);
    const formattedDate = createdAt.toLocaleDateString('pt-BR');
    chat.formatted_created_at = `${formattedDate} às ${createdAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    
    const leadValueHTML = chat.lead_value && chat.lead_value > 0 
        ? `<div class="lead-value">R$ ${parseFloat(chat.lead_value).toFixed(2).replace('.', ',')}</div>`
        : '';
        
    const customerName = chat.customer_name || 'Cliente não identificado';

    card.innerHTML = `
        <div>
            <div class="chat-info">
                <span class="customer-name">${customerName}</span>
                <p class="last-message">${chat.last_message_summary || 'Nenhuma mensagem.'}</p>
            </div>
            <div class="chat-meta">
                <span><i class="fas fa-calendar-alt"></i> ${formattedDate}</span>
                <span class="status-badge" data-status="${chat.status || 'N/A'}">${status}</span>
            </div>
        </div>
        ${leadValueHTML}
    `;

    Object.keys(chat).forEach(key => {
        const value = chat[key];
        if(value !== null) card.dataset[key] = typeof value === 'object' ? JSON.stringify(value) : value;
    });

    card.dataset.customer_name = customerName; 

    return card;
}

function renderHumanAttention(chats) {
    const container = document.getElementById('humanAttentionContainer');
    container.innerHTML = '';
    if (!chats || chats.length === 0) {
        container.innerHTML = '<p class="loading-message">Nenhum atendimento requerendo atenção.</p>';
        lastHumanAttentionCount = 0; 
        return;
    }

    if (chats.length > lastHumanAttentionCount) {
        const audio = document.getElementById('notificationSound');
        if (audio) {
            audio.play().catch(error => console.warn("A reprodução automática do áudio foi bloqueada pelo navegador.", error));
        }
    }
    lastHumanAttentionCount = chats.length;

    chats.forEach(chat => {
        const card = createChatCard(chat);
        container.appendChild(card);
    });
}

function renderKanban(chats) {
    const kanbanBoard = document.getElementById('kanbanBoard');
    kanbanBoard.querySelectorAll('.kanban-cards-container').forEach(c => c.innerHTML = '');

    if (!chats || chats.length === 0) {
        const novoContainer = kanbanBoard.querySelector('.kanban-column[data-temperatura="Novo"] .kanban-cards-container');
        if (novoContainer) {
            novoContainer.innerHTML = '<p class="loading-message">Nenhum atendimento no funil.</p>';
        }
    }

    chats.forEach(chat => {
        const card = createChatCard(chat);
        const column = kanbanBoard.querySelector(`.kanban-column[data-temperatura="${chat.temperatura || 'Novo'}"]`);
        if (column) {
            const container = column.querySelector('.kanban-cards-container');
            container.appendChild(card);
        } else {
            const defaultContainer = kanbanBoard.querySelector('.kanban-column[data-temperatura="Novo"] .kanban-cards-container');
            defaultContainer.appendChild(card);
        }
    });

    kanbanBoard.querySelectorAll('.kanban-column').forEach(column => {
        const count = column.querySelectorAll('.chat-card').length;
        const titleEl = column.querySelector('.kanban-column-title');
        
        const existingCount = titleEl.querySelector('.card-count');
        if (existingCount) {
            existingCount.remove();
        }
        
        const countSpan = document.createElement('span');
        countSpan.className = 'card-count';
        countSpan.textContent = `(${count})`;
        titleEl.appendChild(countSpan);
    });

    initDragAndDrop();
}


function initDragAndDrop() {
    const cards = document.querySelectorAll('.chat-card');
    const columns = document.querySelectorAll('.kanban-column');
    const humanAttentionSection = document.querySelector('.human-attention-section');
    let draggedCard = null;

    cards.forEach(card => {
        if (card.draggable) {
            card.addEventListener('dragstart', () => {
                draggedCard = card;
                document.body.classList.add('dragging-card');
                setTimeout(() => card.classList.add('dragging'), 0);
            });
            card.addEventListener('dragend', () => {
                document.body.classList.remove('dragging-card');
                draggedCard?.classList.remove('dragging');
                draggedCard = null;
            });
        }
    });

    columns.forEach(column => {
        column.addEventListener('dragover', e => { e.preventDefault(); column.classList.add('drag-over'); });
        column.addEventListener('dragleave', () => { column.classList.remove('drag-over'); });
        column.addEventListener('drop', e => {
            e.preventDefault();
            column.classList.remove('drag-over');
            if (!draggedCard) return;

            const newTemperatura = column.dataset.temperatura;
            const chatId = draggedCard.dataset.id;
            const originalStatus = draggedCard.dataset.status;

            if (draggedCard.closest('.kanban-column') === column && draggedCard.dataset.temperatura === newTemperatura) {
                return;
            }

            if (originalStatus === 'ATENDIMENTO_HUMANO') {
                updateChat(chatId, { status: 'ATENDIMENTO_ASSUMIDO', temperatura: newTemperatura });
            } else {
                updateChat(chatId, { temperatura: newTemperatura });
            }
        });
    });

    if (humanAttentionSection) {
        humanAttentionSection.addEventListener('dragover', e => {
            e.preventDefault();
            humanAttentionSection.classList.add('drag-over');
        });
        humanAttentionSection.addEventListener('dragleave', () => {
            humanAttentionSection.classList.remove('drag-over');
        });
        humanAttentionSection.addEventListener('drop', e => {
            e.preventDefault();
            humanAttentionSection.classList.remove('drag-over');
            if (!draggedCard) return;

            if (draggedCard.closest('.human-attention-section')) return;

            const chatId = draggedCard.dataset.id;
            updateChat(chatId, { status: 'ATENDIMENTO_HUMANO' });
        });
    }
}


async function subscribeToChatChanges() {
    if (atendimentosSubscription) {
        return;
    }

    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return; 

        const { data: profile } = await supabaseClient.from('users').select('company_id').eq('id', user.id).single();
        if (!profile || !profile.company_id) return; 

        const companyId = profile.company_id;
        console.log(`[OREH Atendimentos] Subscrevendo ao canal de chats para a empresa: ${companyId}`);

        atendimentosSubscription = supabaseClient
            .channel(`public:chats:company_id=eq.${companyId}`) 
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'chats',
                    filter: `company_id=eq.${companyId}` 
                },
                (payload) => {
                    console.log('Mudança nos atendimentos recebida via subscrição:', payload);
                    showToast('A lista de atendimentos foi atualizada!', 'info');
                    fetchAndRenderAllChats();
                }
            )
            .subscribe((status, err) => {
                if (status === 'SUBSCRIBED') {
                    console.log(`Conectado ao canal de atendimentos da empresa ${companyId}.`);
                }
                if (status === 'CHANNEL_ERROR') {
                    console.error('Erro no canal de atendimentos:', err);
                    logEvent('ERROR', 'Erro no canal de subscrição de atendimentos', { error: err });
                }
                 if (status === 'TIMED_OUT') {
                    console.warn('Conexão com o canal de atendimentos expirou.');
                }
            });

    } catch (error) {
        console.error('Falha ao iniciar subscrição de atendimentos:', error);
        logEvent('ERROR', 'Falha ao iniciar subscrição de atendimentos', { error: error });
    }
}

export function openSearchFinishedModal() {
    const modal = document.getElementById('searchFinishedModal');
    if (modal) {
        document.getElementById('searchFinishedForm').reset();
        document.getElementById('searchFinishedResultsContainer').innerHTML = '';
        modal.style.display = 'flex';
    }
}


// =========================================================================
// ✅ INÍCIO DA ATUALIZAÇÃO: Funções de histórico de chat
// =========================================================================

/**
 * ✅ ATUALIZADO: Renderiza o histórico de chat lendo da tabela 'chat_history_treated'.
 * @param {HTMLElement} messagesContainer - O elemento onde as bolhas do chat serão renderizadas.
 * @param {Array} messages - O array de mensagens vindo da tabela 'chat_history_treated'.
 * @param {string} customerName - O nome do cliente.
 */
export function renderChatHistory(messagesContainer, messages, customerName) {
    if (!messagesContainer) {
        console.error("Container de histórico não fornecido para renderChatHistory.");
        return;
    }

    if (!messages || messages.length === 0) {
        messagesContainer.innerHTML = '<p class="loading-message">Nenhuma mensagem encontrada para este chat.</p>';
        return;
    }

    messagesContainer.innerHTML = ''; // Limpa o loading

    messages.forEach(msg => {
        const bubble = document.createElement('div');
        bubble.classList.add('chat-bubble');
        
        // ✅ CORREÇÃO: Lendo das novas colunas (sender_name, sender_type, message_content)
        const senderType = msg.sender_type || 'system'; // 'human', 'IA', 'system'
        const senderName = msg.sender_name || 'Sistema'; // 'Davi', 'Oreh', 'Sistema'
        const finalMessageText = msg.message_content || '(Mensagem vazia)'; 

        // ✅ CORREÇÃO: Lógica de alinhamento baseada no SENDER_TYPE
        if (senderType.toLowerCase() === 'human') {
            bubble.classList.add('human'); // Classe CSS 'human' (alinha à esquerda)
        } else { 
            bubble.classList.add('ai'); // Classe CSS 'ai' (alinha à direita)
        }
        
        // Define o rótulo do balão (ex: "Davi" ou "Oreh")
        bubble.dataset.sender = senderName; 
        bubble.textContent = finalMessageText;
        
        messagesContainer.appendChild(bubble);
    });

    // Rola para a mensagem mais recente
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

/**
 * ✅ ATUALIZADO: Esta função (do modal de BUSCA) agora consulta a tabela 'chat_history_treated'.
 * Abre o modal de histórico (da BUSCA) e busca os dados no Supabase.
 */
export async function openChatHistoryModal(customerPhone, customerName) {
    const modal = document.getElementById('chatHistoryModal');
    const title = document.getElementById('historyClientPhone');
    const messagesContainer = document.getElementById('chatHistoryMessages'); // <-- Container deste modal

    if (!modal || !title || !messagesContainer) return;

    title.textContent = customerName ? `${customerName} (${customerPhone})` : customerPhone;
    messagesContainer.innerHTML = '<p class="loading-message">Carregando histórico...</p>';
    modal.style.display = 'flex';

    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error("Usuário não autenticado.");
        
        const { data: profile } = await supabaseClient
            .from('users')
            .select('company_id')
            .eq('id', user.id)
            .single();
        if (!profile) throw new Error("Perfil do usuário não encontrado.");

        // ✅ CORREÇÃO: Trocada a chamada RPC pela query direta na nova tabela
        const { data: messages, error } = await supabaseClient
            .from('chat_history_treated') // ⬅️ 1. Tabela nova
            .select('sender_name, sender_type, message_content, created_at') // ⬅️ 2. Colunas novas (incluindo sender_type)
            .eq('company_id', profile.company_id)
            .eq('customer_phone', customerPhone) // ⬅️ 3. Filtrando pelo telefone
            .order('created_at', { ascending: true });

        if (error) throw error;

        // Passa o container correto
        renderChatHistory(messagesContainer, messages, customerName);

    } catch (error) {
        console.error('Erro ao buscar histórico de chat:', error);
        messagesContainer.innerHTML = `<p class="loading-message error">Falha ao carregar histórico: ${error.message}</p>`;
        logEvent('ERROR', 'Falha ao buscar histórico de chat (Tabela Tratada)', { phone: customerPhone, error: error.message });
    }
}

// =========================================================================
// ✅ FIM DA ATUALIZAÇÃO
// =========================================================================


export async function handleSearchFinished(event) {
    event.preventDefault();
    const phone = document.getElementById('searchPhone').value;
    const date = document.getElementById('searchDate').value;
    const resultsContainer = document.getElementById('searchFinishedResultsContainer');
    const searchBtn = event.target.querySelector('button[type="submit"]');

    if (!phone && !date) {
        showToast('Por favor, informe um telefone ou uma data.', 'error');
        return;
    }

    searchBtn.disabled = true;
    searchBtn.textContent = 'Buscando...';
    resultsContainer.innerHTML = '<p class="loading-message">Buscando...</p>';

    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error("Utilizador não autenticado.");
        const { data: profile } = await supabaseClient.from('users').select('company_id').eq('id', user.id).single();
        if (!profile) throw new Error("Perfil do utilizador não encontrado.");

        let query = supabaseClient
            .from('chats')
            .select('*')
            .eq('company_id', profile.company_id)
            .eq('temperatura', 'Finalizado') // Apenas finalizados
            .order('updated_at', { ascending: false })
            .limit(50);

        if (phone) {
            query = query.like('customer_phone', `%${phone.replace(/\D/g, '')}%`);
        }
        if (date) {
            const startDate = new Date(date + 'T00:00:00');
            const endDate = new Date(date + 'T23:59:59');
            
            query = query.gte('updated_at', startDate.toISOString());
            query = query.lt('updated_at', endDate.toISOString());
        }

        const { data: chats, error } = await query;
        if (error) throw error;

        if (!chats || chats.length === 0) {
            resultsContainer.innerHTML = '<p class="loading-message" style="text-align: center;">Nenhum atendimento finalizado encontrado para esta busca.</p>';
            return;
        }

        resultsContainer.innerHTML = chats.map(chat => {
            const card = createChatCard(chat);
            card.draggable = false; 
            return card.outerHTML;
        }).join('');

    } catch (error) {
        console.error('Erro ao buscar atendimentos finalizados:', error);
        resultsContainer.innerHTML = '<p class="loading-message error">Falha ao buscar atendimentos.</p>';
        logEvent('ERROR', 'Falha na busca de atendimentos finalizados', { phone, date, errorMessage: error.message });
    } finally {
        searchBtn.disabled = false;
        searchBtn.textContent = 'Buscar';
    }
}