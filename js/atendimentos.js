import { supabaseClient, logEvent } from './api.js';
import { showToast } from './ui.js';

let atendimentosSubscription = null;
let lastHumanAttentionCount = 0; // ✅ Variável para contar atendimentos humanos

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

    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error("Utilizador não autenticado.");
        
        const { data: profile } = await supabaseClient.from('users').select('company_id').eq('id', user.id).single();
        if (!profile) throw new Error("Perfil do utilizador não encontrado.");

        // Passo 1: Buscar todos os clientes da empresa e criar um mapa.
        const { data: clients, error: clientsError } = await supabaseClient
            .from('clients')
            .select('name, phone')
            .eq('company_id', profile.company_id);
        
        if (clientsError) throw clientsError;

        const clientNameMap = new Map();
        clients.forEach(client => {
            clientNameMap.set(client.phone, client.name);
        });

        // Passo 2: Buscar os chats da empresa.
        const { data: chats, error: chatsError } = await supabaseClient
            .from('chats')
            .select('*')
            .eq('company_id', profile.company_id)
            .neq('temperatura', 'DESCARTE')
            .order('created_at', { ascending: false });

        if (chatsError) throw chatsError;

        // Passo 3: Mapear os nomes dos clientes para os chats.
        const formattedChats = chats.map(chat => ({
            ...chat,
            client_name: clientNameMap.get(chat.customer_phone) || 'Cliente não cadastrado'
        }));
        
        const humanAttentionChats = formattedChats.filter(chat => chat.status === 'ATENDIMENTO_HUMANO');
        const kanbanChats = formattedChats.filter(chat => chat.status !== 'ATENDIMENTO_HUMANO');

        renderHumanAttention(humanAttentionChats);
        renderKanban(kanbanChats);

    } catch (error) {
        console.error("Erro ao carregar atendimentos:", error);
        showToast('Não foi possível carregar os atendimentos.', 'error');
        logEvent('ERROR', 'Falha ao carregar atendimentos', { errorMessage: error.message, stack: error.stack });
    }
}


async function updateChatTemperatura(chatId, newTemperatura) {
    console.log(`[OREH] A atualizar chat ${chatId} para ${newTemperatura}`);
    try {
        const { error } = await supabaseClient
            .from('chats')
            .update({ temperatura: newTemperatura, updated_at: new Date().toISOString() })
            .eq('id', chatId);

        if (error) throw error;
        showToast('Atendimento movido com sucesso!', 'success');
    } catch (error) {
        console.error('Erro ao atualizar a temperatura do chat:', error);
        showToast('Falha ao mover o atendimento.', 'error');
        logEvent('ERROR', `Falha ao mover lead ${chatId} para ${newTemperatura}`, { errorMessage: error.message, stack: error.stack });
    }
}

export async function descartarLead(chatId) {
    // A confirmação deve ser feita na UI antes de chamar esta função.
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

// ✅ NOVA FUNÇÃO: Assumir atendimento
export async function takeOverChat(chatId) {
    console.log(`[OREH] Assumindo o atendimento do chat ${chatId}`);
    try {
        const { error } = await supabaseClient
            .from('chats')
            .update({ 
                status: 'Em atendimento', 
                temperatura: 'Atendimento', 
                updated_at: new Date().toISOString() 
            })
            .eq('id', chatId);
        if (error) throw error;
        showToast('Atendimento assumido!', 'success');
        logEvent('INFO', `Atendimento ${chatId} assumido.`);
        document.getElementById('humanAttentionDetailModal').style.display = 'none';
        // A subscrição em tempo real cuidará de recarregar a lista
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
        
    const clientName = chat.client_name || 'Cliente não cadastrado';

    card.innerHTML = `
        <div>
            <div class="chat-info">
                <span class="customer-name">${chat.customer_name}</span>
                <p class="linked-client-name"><i class="fas fa-address-book"></i> ${clientName}</p>
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

    card.dataset.clientName = clientName; // Armazena o nome do cliente no dataset para o modal

    return card;
}

function renderHumanAttention(chats) {
    const container = document.getElementById('humanAttentionContainer');
    container.innerHTML = '';
    if (!chats || chats.length === 0) {
        container.innerHTML = '<p class="loading-message">Nenhum atendimento requerendo atenção.</p>';
        lastHumanAttentionCount = 0; // Reseta a contagem
        return;
    }

    // ✅ Lógica de notificação sonora
    if (chats.length > lastHumanAttentionCount) {
        const audio = document.getElementById('notificationSound');
        if (audio) {
            audio.play().catch(error => console.warn("A reprodução automática do áudio foi bloqueada pelo navegador.", error));
        }
    }
    lastHumanAttentionCount = chats.length;

    chats.forEach(chat => {
        const card = createChatCard(chat);
        card.draggable = false; 
        container.appendChild(card);
    });
}

function renderKanban(chats) {
    const kanbanBoard = document.getElementById('kanbanBoard');
    kanbanBoard.querySelectorAll('.kanban-cards-container').forEach(c => c.innerHTML = '');

    if (!chats || chats.length === 0) {
        kanbanBoard.querySelector('.kanban-column[data-temperatura="Novo"] .kanban-cards-container').innerHTML = '<p class="loading-message">Nenhum atendimento no funil.</p>';
        return;
    }

    chats.forEach(chat => {
        const card = createChatCard(chat);
        const column = kanbanBoard.querySelector(`.kanban-column[data-temperatura="${chat.temperatura || 'Novo'}"]`);
        if (column) {
            const container = column.querySelector('.kanban-cards-container');
            if(container.querySelector('.loading-message')) container.innerHTML = '';
            container.appendChild(card);
        } else {
            const defaultContainer = kanbanBoard.querySelector('.kanban-column[data-temperatura="Novo"] .kanban-cards-container');
            if(defaultContainer.querySelector('.loading-message')) defaultContainer.innerHTML = '';
            defaultContainer.appendChild(card);
        }
    });
    initDragAndDrop();
}

function initDragAndDrop() {
    const cards = document.querySelectorAll('.chat-card[draggable="true"]');
    const columns = document.querySelectorAll('.kanban-column');
    let draggedCard = null;

    cards.forEach(card => {
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
            const container = column.querySelector('.kanban-cards-container');
            if(container.querySelector('.loading-message')) container.innerHTML = '';
            container.appendChild(draggedCard);
            updateChatTemperatura(chatId, newTemperatura);
        });
    });
}

function subscribeToChatChanges() {
    if (atendimentosSubscription) return;

    atendimentosSubscription = supabaseClient
        .channel('atendimentos-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'chats' }, (payload) => {
            console.log('Mudança nos atendimentos:', payload);
            showToast('A lista de atendimentos foi atualizada!', 'info');
            fetchAndRenderAllChats();
        })
        .subscribe(status => {
            if (status === 'SUBSCRIBED') console.log('Conectado ao canal de atendimentos.');
        });
}
