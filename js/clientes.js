import { supabaseClient, logEvent } from './api.js';
import { showToast } from './ui.js';

let clientsSubscription = null;

// --- SUBSCRIPTION & CLEANUP ---

function stopClientsSubscription() {
    if (clientsSubscription) {
        supabaseClient.removeChannel(clientsSubscription);
        clientsSubscription = null;
    }
}

export function cleanupClients() {
    stopClientsSubscription();
}

// --- RENDERIZAÇÃO E MÉTRICAS ---

function updateMetrics(clients) {
    const total = clients.length;
    const active = clients.filter(c => c.status === 'Ativo').length;
    const withPhone = clients.filter(c => c.phone).length;
    const withEmail = clients.filter(c => c.email).length;
    
    document.getElementById('metricTotalClients').textContent = total;
    document.getElementById('metricActiveClients').textContent = active;
    document.getElementById('metricWAClients').textContent = withPhone;
    document.getElementById('metricEmailClients').textContent = withEmail;
}

function renderClientsTable(clients) {
    const tableBody = document.getElementById('clientTableBody');
    if (!tableBody) return;
    
    tableBody.innerHTML = ''; 

    if (!clients || clients.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="8" style="text-align: center;">Nenhum cliente cadastrado.</td></tr>';
        return;
    }

    clients.forEach(client => {
        const row = document.createElement('tr');
        Object.keys(client).forEach(key => {
            const value = client[key];
            if (value !== null) {
                row.dataset[key] = typeof value === 'object' ? JSON.stringify(value) : value;
            }
        });
        row.dataset.clientId = client.id;

        const date = client.created_at ? new Date(client.created_at).toLocaleDateString('pt-BR') : 'N/A';
        const nameDisplay = client.name || 'N/A';

        row.innerHTML = `
            <td data-label="Nome"><strong>${nameDisplay}</strong></td>
            <td data-label="Telefone">
                <i class="fas fa-phone-alt" style="color: var(--primary); margin-right: 8px;"></i>${client.phone || 'N/A'}
            </td>
            <td data-label="Email">
                <i class="fas fa-envelope" style="color: var(--accent); margin-right: 8px;"></i>${client.email || 'N/A'}
            </td>
            <td data-label="Localização">${client.location || 'Não informado'}</td>
            <td data-label="Status">
                <span class="status-cliente" data-status="${client.status || 'Lead'}">${client.status || 'Lead'}</span>
            </td>
            <td data-label="Origem">${client.origin || 'N/A'}</td>
            <td data-label="Data Cadastro">${date}</td>
            <td class="client-actions">
                <button class="btn btn-sm btn-secondary" data-action="edit"><i class="fas fa-pencil-alt"></i></button>
                <button class="btn btn-sm btn-danger" data-action="delete"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tableBody.appendChild(row);
    });
    
    updateMetrics(clients);
}


// --- DADOS (FETCH & SUBSCRIBE) ---

export async function loadClients() {
    stopClientsSubscription();
    const tableBody = document.getElementById('clientTableBody');
    if (tableBody) tableBody.innerHTML = '<tr><td colspan="8" style="text-align: center;">Carregando clientes...</td></tr>';
    
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error("Usuário não autenticado.");
        const { data: profile } = await supabaseClient.from('users').select('company_id').eq('id', user.id).single();
        if (!profile) throw new Error("Perfil do usuário não encontrado.");
        
        const { data: initialClients, error } = await supabaseClient
            .from('clients')
            .select('*')
            .eq('company_id', profile.company_id)
            .order('created_at', { ascending: false });

        if (error) throw error;
        renderClientsTable(initialClients);

        // Inicia a subscrição em tempo real
        clientsSubscription = supabaseClient
            .channel(`public:clients:company_id=eq.${profile.company_id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'clients', filter: `company_id=eq.${profile.company_id}`}, 
            () => loadClients()) 
            .subscribe();
            
    } catch (error) {
        console.error('[OREH] Erro ao carregar clientes:', error);
        showToast('Falha ao carregar a lista de clientes.', 'error');
        logEvent('ERROR', 'Falha ao carregar/subscrever clientes', { errorMessage: error.message });
        if (tableBody) tableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--danger);">Erro ao carregar clientes.</td></tr>`;
    }
}

// --- CRUD ---

export async function handleClientFormSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const saveBtn = form.querySelector('button[type="submit"]');
    saveBtn.disabled = true;
    saveBtn.textContent = 'A guardar...';

    const clientId = document.getElementById('clientId').value;

    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error("Usuário não autenticado.");
        const { data: profile } = await supabaseClient.from('users').select('company_id').eq('id', user.id).single();
        if (!profile) throw new Error("Perfil do usuário não encontrado.");
        
        const clientData = {
            company_id: profile.company_id,
            name: document.getElementById('clientName').value,
            phone: document.getElementById('clientPhone').value,
            email: document.getElementById('clientEmail').value,
            location: document.getElementById('clientLocation').value,
            status: document.getElementById('clientStatus').value,
            origin: document.getElementById('clientOrigin').value,
            notes: document.getElementById('clientNotes').value,
        };

        if (clientId) {
            clientData.id = clientId;
        }

        const { error } = await supabaseClient.from('clients').upsert(clientData, { onConflict: 'id' });
        if (error) throw error;

        showToast(clientId ? 'Cliente atualizado!' : 'Cliente criado!', 'success');
        document.getElementById('clientFormModal').style.display = 'none';
        form.reset();
        // A subscrição real-time fará o reload da lista
        logEvent('INFO', clientId ? `Cliente ${clientId} atualizado.` : 'Novo cliente criado.');

    } catch (error) {
        console.error('Erro ao guardar cliente:', error);
        showToast(`Erro ao guardar cliente: ${error.message}`, 'error');
        logEvent('ERROR', 'Falha ao guardar cliente', { errorMessage: error.message });
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Salvar Cliente';
    }
}

export function openEditClientModal(clientData) {
    const modal = document.getElementById('clientFormModal');
    
    document.getElementById('clientModalTitle').innerHTML = '<i class="fas fa-user-edit"></i> Editar Cliente';
    document.getElementById('clientId').value = clientData.id;
    document.getElementById('clientName').value = clientData.name;
    document.getElementById('clientPhone').value = clientData.phone || '';
    document.getElementById('clientEmail').value = clientData.email || '';
    document.getElementById('clientLocation').value = clientData.location || '';
    document.getElementById('clientStatus').value = clientData.status || 'Lead';
    document.getElementById('clientOrigin').value = clientData.origin || '';
    document.getElementById('clientNotes').value = clientData.notes || '';

    modal.style.display = 'flex';
}

export async function deleteClient(clientId) {
    // Usar modal customizado em produção, mas por enquanto, confirm simples
    if (!confirm('Tem a certeza de que deseja apagar este cliente? Esta ação é irreversível.')) return;

    try {
        const { error } = await supabaseClient.from('clients').delete().eq('id', clientId);
        if (error) throw error;
        showToast('Cliente apagado com sucesso!', 'success');
        // A subscrição real-time fará o reload da lista
        logEvent('INFO', `Cliente ${clientId} apagado.`);
    } catch (error) {
        console.error('Erro ao apagar cliente:', error);
        showToast(`Erro ao apagar cliente: ${error.message}`, 'error');
        logEvent('ERROR', `Falha ao apagar cliente ${clientId}`, { errorMessage: error.message });
    }
}
