import { supabaseClient, logEvent } from './api.js';
import { showToast } from './ui.js';

let clientsSubscription = null;

// Função auxiliar para atualizar o card de métrica
function updateMetricCard(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = value;
    }
}

// --- LÓGICA DE RENDERIZAÇÃO ---

function renderClientsTable(clients) {
    const tableBody = document.getElementById('clientTableBody');
    if (!tableBody) {
        console.error("Elemento #clientTableBody não encontrado.");
        return;
    }
    
    tableBody.innerHTML = ''; 

    // Atualiza a métrica principal independentemente de haver clientes
    updateMetricCard('totalClients', clients ? clients.length : 0);
    
    if (!clients || clients.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="9" style="text-align: center;">Nenhum cliente cadastrado.</td></tr>';
        // Zera as outras métricas se não houver clientes
        updateMetricCard('activeClients', 0);
        updateMetricCard('whatsappClients', 0);
        updateMetricCard('emailClients', 0);
        return;
    }

    let activeCount = 0;
    let whatsappCount = 0;
    let emailCount = 0;

    clients.forEach(client => {
        try {
            const row = document.createElement('tr');
            
            Object.keys(client).forEach(key => {
                const value = client[key];
                row.dataset[key] = value !== null ? (typeof value === 'object' ? JSON.stringify(value) : value) : '';
            });
            row.dataset.clientId = client.id;
            
            if (client.status === 'Ativo') activeCount++;
            if (client.phone) whatsappCount++;
            if (client.email) emailCount++;

            const formattedDate = client.created_at ? new Date(client.created_at).toLocaleDateString('pt-BR') : 'N/A';
            
            // ✅ CORREÇÃO: Usando a classe CSS correta 'status-cliente'
            const statusBadge = `<span class="status-cliente" data-status="${client.status || 'N/A'}">${client.status || 'N/A'}</span>`;
            const personalTag = client.is_personal 
                ? `<span class="tag-ia-ignore">Sim</span>` 
                : `<span class="tag-ia-active">Não</span>`;
            
            row.innerHTML = `
                <td data-label="Nome" class="client-name-cell">
                    <i class="fas fa-user-circle"></i> 
                    <strong>${client.name || 'Nome não informado'}</strong>
                </td>
                <td data-label="Telefone">${client.phone || 'N/A'}</td>
                <td data-label="Email">${client.email || 'N/A'}</td>
                <td data-label="Localização">${client.location || 'Não informado'}</td>
                <td data-label="Status">${statusBadge}</td>
                <td data-label="Origem">${client.origin || 'N/A'}</td>
                <td data-label="Data Cadastro">${formattedDate}</td>
                <td data-label="Pessoal">${personalTag}</td>
                <td data-label="Ações" class="client-actions">
                    <button class="btn btn-sm btn-edit" data-action="edit"><i class="fas fa-pencil-alt"></i></button>
                    <button class="btn btn-sm btn-delete" data-action="delete"><i class="fas fa-trash"></i></button>
                </td>
            `;
            tableBody.appendChild(row);
        } catch (e) {
            console.error("Erro ao renderizar a linha do cliente:", client, e);
        }
    });
    
    updateMetricCard('activeClients', activeCount);
    updateMetricCard('whatsappClients', whatsappCount);
    updateMetricCard('emailClients', emailCount);
}


// --- LÓGICA DE ESTADO E CARREGAMENTO ---

function stopClientsSubscription() {
    if (clientsSubscription) {
        supabaseClient.removeChannel(clientsSubscription);
        clientsSubscription = null;
        console.log('[OREH] Subscrição de Clientes encerrada.');
    }
}

export function cleanupClients() {
    stopClientsSubscription();
}

export async function loadClients() {
    stopClientsSubscription();
    console.log('[OREH] Carregando e subscrevendo clientes...');
    const tableBody = document.getElementById('clientTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="9" style="text-align: center;"><p class="loading-message">Carregando clientes...</p></td></tr>';

    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error("Utilizador não autenticado.");
        const { data: profile, error: profileError } = await supabaseClient.from('users').select('company_id').eq('id', user.id).single();
        if (profileError) throw profileError;
        if (!profile || !profile.company_id) throw new Error("Perfil do utilizador não encontrado ou sem empresa associada.");
        
        const companyId = profile.company_id;

        const { data: initialClients, error } = await supabaseClient
            .from('clients')
            .select('*')
            .eq('company_id', companyId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        
        console.log(`[OREH] Clientes encontrados para a empresa ${companyId}:`, initialClients); // Log para depuração
        renderClientsTable(initialClients);

        clientsSubscription = supabaseClient
            .channel(`public:clients:company_id=eq.${companyId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'clients', filter: `company_id=eq.${companyId}`}, 
            () => {
                console.log('[OREH] Alteração detectada na tabela de clientes. Recarregando...');
                loadClients();
            })
            .subscribe((status) => {
                 if (status === 'SUBSCRIBED') console.log('Conectado ao canal de clientes.');
            });

    } catch (error) {
        console.error('[OREH] Erro ao carregar clientes:', error);
        showToast('Não foi possível carregar a lista de clientes.', 'error');
        logEvent('ERROR', 'Falha ao carregar/subscrever clientes', { errorMessage: error.message });
        if (tableBody) tableBody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--danger);">Falha ao carregar clientes: ${error.message}</td></tr>`;
    }
}


// --- LÓGICA DE FORMULÁRIO E CRUD ---

export function openEditModal(clientData) {
    const modal = document.getElementById('clientFormModal');
    
    document.getElementById('clientModalTitle').textContent = 'Editar Cliente';
    document.getElementById('clientId').value = clientData.id;
    document.getElementById('clientName').value = clientData.name;
    document.getElementById('clientPhone').value = clientData.phone;
    document.getElementById('clientEmail').value = clientData.email;
    document.getElementById('clientOrigin').value = clientData.origin;
    document.getElementById('clientLocation').value = clientData.location;
    document.getElementById('clientStatus').value = clientData.status;
    document.getElementById('clientNotes').value = clientData.notes;
    
    // Define o estado do checkbox is_personal
    document.getElementById('isPersonal').checked = clientData.is_personal === 'true' || clientData.is_personal === true;

    modal.style.display = 'flex';
}

export async function handleClientFormSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const saveBtn = form.querySelector('button[type="submit"]');
    saveBtn.disabled = true;
    saveBtn.textContent = 'A guardar...';

    const clientId = document.getElementById('clientId').value;

    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error("Utilizador não autenticado.");
        const { data: profile } = await supabaseClient.from('users').select('company_id').eq('id', user.id).single();
        if (!profile) throw new Error("Perfil do utilizador não encontrado.");
        
        const clientData = {
            company_id: profile.company_id,
            name: document.getElementById('clientName').value,
            phone: document.getElementById('clientPhone').value.replace(/\D/g, ''),
            email: document.getElementById('clientEmail').value,
            origin: document.getElementById('clientOrigin').value,
            location: document.getElementById('clientLocation').value,
            status: document.getElementById('clientStatus').value,
            notes: document.getElementById('clientNotes').value,
            is_personal: document.getElementById('isPersonal').checked, // ✅ Valor do checkbox
            updated_at: new Date().toISOString()
        };

        if (clientId) {
            clientData.id = clientId;
        } else {
             clientData.created_at = new Date().toISOString();
        }

        const { error } = await supabaseClient.from('clients').upsert(clientData, { onConflict: 'id' });
        if (error) throw error;

        showToast(clientId ? 'Cliente atualizado!' : 'Cliente criado!', 'success');
        logEvent('INFO', `Cliente ${clientId ? 'atualizado' : 'criado'}: ${clientData.name}`);
        document.getElementById('clientFormModal').style.display = 'none';
        form.reset();
        loadClients(); 

    } catch (error) {
        console.error('Erro ao guardar cliente:', error);
        showToast(`Erro ao guardar cliente: ${error.message}`, 'error');
        logEvent('ERROR', 'Falha ao guardar cliente', { errorMessage: error.message });
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Salvar Cliente';
    }
}


export async function deleteClient(clientId) {
    if (!confirm('Tem a certeza de que deseja apagar este cliente? Esta ação é irreversível.')) return;

    try {
        const { error } = await supabaseClient.from('clients').delete().eq('id', clientId);
        if (error) throw error;
        showToast('Cliente apagado com sucesso!', 'success');
        logEvent('INFO', `Cliente com ID ${clientId} apagado.`);
        loadClients(); 
    } catch (error) {
        console.error('Erro ao apagar cliente:', error);
        showToast(`Erro ao apagar cliente: ${error.message}`, 'error');
        logEvent('ERROR', 'Falha ao apagar cliente', { errorMessage: error.message });
    }
}

// Lógica para inicializar listeners na tabela
export function setupClientTableListeners() {
    const clientTableContainer = document.getElementById('clientTableContainer');
    if (!clientTableContainer) return;
    
    clientTableContainer.addEventListener('click', (e) => {
        const button = e.target.closest('button');
        if (!button) return;
        
        const action = button.dataset.action;
        const row = button.closest('tr');
        if (!row) return;

        const clientId = row.dataset.clientId;

        // Clona todos os dados do dataset da linha (tr)
        const clientData = { ...row.dataset }; 
        
        if (action === 'delete') {
            deleteClient(clientId);
        }
        
        if (action === 'edit') {
            openEditModal(clientData);
        }
    });
}
