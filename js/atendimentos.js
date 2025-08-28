import { supabaseClient } from './api.js';
import { showToast } from './ui.js';

console.log('[OREH] A executar atendimentos.js v6 (Com função de descarte)');

// --- LÓGICA DE DADOS (SUPABASE) ---

export async function loadAtendimentos() {
    console.log("[OREH] A carregar atendimentos do Supabase para o Kanban...");
    const kanbanBoard = document.getElementById('kanbanBoard');
    if (!kanbanBoard) return;

    kanbanBoard.querySelectorAll('.kanban-cards-container').forEach(container => {
        container.innerHTML = '<p class="loading-message">A carregar...</p>';
    });

    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error("Utilizador não autenticado.");
        
        const { data: profile } = await supabaseClient.from('users').select('company_id').eq('id', user.id).single();
        if (!profile) throw new Error("Perfil do utilizador não encontrado.");

        const { data: chats, error } = await supabaseClient
            .from('chats')
            .select('*')
            .eq('company_id', profile.company_id)
            // ✅ CORREÇÃO: Não seleciona chats com a temperatura 'DESCARTE'
            .neq('temperatura', 'DESCARTE') 
            .order('created_at', { ascending: false });

        if (error) throw error;

        renderKanban(chats);
    } catch (error) {
        console.error("Erro ao carregar atendimentos:", error);
        showToast('Não foi possível carregar os atendimentos.', 'error');
        kanbanBoard.querySelectorAll('.kanban-cards-container').forEach(container => {
            container.innerHTML = `<p class="loading-message error">Falha ao carregar: ${error.message}</p>`;
        });
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
        loadAtendimentos(); 
    }
}

// ✅ NOVO: Função para marcar um lead como 'DESCARTE'
export async function descartarLead(chatId) {
    if (!confirm('Tem a certeza de que deseja descartar este lead? Esta ação não pode ser desfeita.')) {
        return;
    }

    console.log(`[OREH] A descartar o chat ${chatId}`);
    try {
        const { error } = await supabaseClient
            .from('chats')
            .update({ temperatura: 'DESCARTE', updated_at: new Date().toISOString() })
            .eq('id', chatId);

        if (error) throw error;

        showToast('Lead descartado com sucesso!', 'success');
        document.getElementById('chatDetailModal').style.display = 'none'; // Fecha o modal
        loadAtendimentos(); // Recarrega o Kanban para remover o card

    } catch (error) {
        console.error('Erro ao descartar o lead:', error);
        showToast('Falha ao descartar o lead.', 'error');
    }
}


// --- RENDERIZAÇÃO E LÓGICA DE DRAG & DROP ---
// (O restante do arquivo permanece o mesmo)

function createChatCard(chat) {
    const card = document.createElement('div');
    card.className = 'chat-card';
    card.draggable = true;
    card.dataset.id = chat.id;

    const status = chat.status ? chat.status.replace(/_/g, ' ') : 'N/A';
    const createdAt = new Date(chat.created_at);
    const formattedDate = createdAt.toLocaleDateString('pt-BR');
    chat.formatted_created_at = `${formattedDate} às ${createdAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

    card.innerHTML = `
        <div class="chat-info">
            <span class="customer-name">${chat.customer_name}</span>
            <p class="last-message">${chat.last_message_summary || 'Nenhuma mensagem.'}</p>
        </div>
        <div class="chat-meta">
            <span><i class="fas fa-calendar-alt"></i> ${formattedDate}</span>
            <span class="status-badge" data-status="${status}">${status}</span>
        </div>
    `;

    Object.keys(chat).forEach(key => {
        if(chat[key] !== null) card.dataset[key] = chat[key];
    });

    return card;
}

function renderKanban(chats) {
    const kanbanBoard = document.getElementById('kanbanBoard');
    kanbanBoard.querySelectorAll('.kanban-cards-container').forEach(container => {
        container.innerHTML = '';
    });

    if (!chats || chats.length === 0) {
        const firstColumn = kanbanBoard.querySelector('.kanban-cards-container');
        if(firstColumn) firstColumn.innerHTML = '<p class="loading-message">Nenhum atendimento encontrado.</p>';
        return;
    }

    chats.forEach(chat => {
        const card = createChatCard(chat);
        
        const temperatura = (chat.temperatura || 'TOPO DO FUNIL').toUpperCase();
        
        const column = kanbanBoard.querySelector(`.kanban-column[data-temperatura="${temperatura}"]`);
        
        if (column) {
            column.querySelector('.kanban-cards-container').appendChild(card);
        } else {
            console.warn(`Coluna não encontrada para a temperatura: ${temperatura}. A colocar na primeira coluna.`);
            kanbanBoard.querySelector('.kanban-cards-container').appendChild(card);
        }
    });

    initDragAndDrop();
}

function initDragAndDrop() {
    const cards = document.querySelectorAll('.chat-card');
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
            if (draggedCard) {
                draggedCard.classList.remove('dragging');
            }
            draggedCard = null;
        });
    });

    columns.forEach(column => {
        column.addEventListener('dragover', e => {
            e.preventDefault();
            column.classList.add('drag-over');
        });

        column.addEventListener('dragleave', () => {
            column.classList.remove('drag-over');
        });

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