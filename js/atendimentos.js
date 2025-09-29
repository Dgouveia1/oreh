import { supabaseClient, logEvent } from './api.js';
import { showToast } from './ui.js';

let atendimentosSubscription = null;

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

        const { data: chats, error } = await supabaseClient
            .from('chats')
            .select('*')
            .eq('company_id', profile.company_id)
            .neq('temperatura', 'DESCARTE')
            .order('created_at', { ascending: false });

        if (error) throw error;

        const humanAttentionChats = chats.filter(chat => chat.status === 'ATENDIMENTO_HUMANO');
        const kanbanChats = chats.filter(chat => chat.status !== 'ATENDIMENTO_HUMANO');

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
    // Substituindo o confirm() por uma lógica de modal que seria implementada na UI
    // Por enquanto, vamos assumir que o usuário sempre confirma.
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

    card.innerHTML = `
        <div>
            <div class="chat-info">
                <span class="customer-name">${chat.customer_name}</span>
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
        if(chat[key] !== null) card.dataset[key] = chat[key];
    });

    return card;
}

function renderHumanAttention(chats) {
    const container = document.getElementById('humanAttentionContainer');
    container.innerHTML = '';
    if (!chats || chats.length === 0) {
        container.innerHTML = '<p class="loading-message">Nenhum atendimento requerendo atenção.</p>';
        return;
    }
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
        kanbanBoard.querySelector('.kanban-cards-container').innerHTML = '<p class="loading-message">Nenhum atendimento no funil.</p>';
        return;
    }

    chats.forEach(chat => {
        const card = createChatCard(chat);
        const column = kanbanBoard.querySelector(`.kanban-column[data-temperatura="${chat.temperatura || 'TOPO DO FUNIL'}"]`);
        if (column) {
            column.querySelector('.kanban-cards-container').appendChild(card);
        } else {
            kanbanBoard.querySelector('.kanban-cards-container').appendChild(card);
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
            column.querySelector('.kanban-cards-container').appendChild(draggedCard);
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
