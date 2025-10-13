// affiliates.js - Lógica para a seção de afiliados do painel Superadmin

import { supabaseClient } from './api.js';
import { showToast, setTableLoading } from './admin-helpers.js';


export async function renderAffiliatesTable() {
    console.log('[Admin] Rendering affiliates table...');
    setTableLoading('affiliatesTableBody');
    const tableBody = document.getElementById('affiliatesTableBody');
     try {
        const { data, error } = await supabaseClient.rpc('get_affiliates_details');
        if (error) throw error;
        
        tableBody.innerHTML = '';
        if(data.length === 0) {
             tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 40px;">Nenhum afiliado encontrado.</td></tr>`;
             return;
        }

        data.forEach(affiliate => {
            const row = document.createElement('tr');
            // Armazenar todos os dados do afiliado no dataset da linha
            Object.keys(affiliate).forEach(key => {
                row.dataset[key] = affiliate[key];
            });
            const registrationDate = new Date(affiliate.registration_date).toLocaleDateString('pt-BR');
            row.innerHTML = `
                <td>${affiliate.affiliate_name}</td>
                <td>${affiliate.contact_email}</td>
                <td>${registrationDate}</td>
                <td>${(affiliate.commission_rate * 100).toFixed(0)}%</td>
                <td class="table-actions">
                    <button class="btn btn-small btn-secondary" data-action="edit-affiliate"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-small btn-danger" data-action="delete-affiliate"><i class="fas fa-trash"></i></button>
                </td>
            `;
            tableBody.appendChild(row);
        });
    } catch (error) {
         console.error("Erro ao carregar afiliados:", error);
        tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--danger);">Falha ao carregar afiliados.</td></tr>`;
    }
}


async function searchUsers(searchTerm) {
    const { data, error } = await supabaseClient
        .from('users')
        .select('id, full_name, email, role')
        .or(`full_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`)
        .eq('role', 'app_user') // Apenas usuários que ainda não são afiliados ou admins
        .limit(5);

    if (error) {
        console.error('Erro ao buscar usuários:', error);
        return [];
    }
    return data;
}

function openAffiliateEditModal(affiliateData) {
    const modal = document.getElementById('affiliateModal');
    document.getElementById('affiliateModalTitle').textContent = 'Editar Afiliado';
    
    // Preencher e desabilitar a busca
    const userSearchInput = document.getElementById('userSearch');
    userSearchInput.value = `${affiliateData.affiliate_name} (${affiliateData.contact_email})`;
    userSearchInput.disabled = true;
    document.getElementById('userSearchResults').innerHTML = '';


    document.getElementById('affiliateUserId').value = affiliateData.affiliate_id;
    document.getElementById('affiliateName').value = affiliateData.affiliate_name;
    document.getElementById('affiliateEmail').value = affiliateData.contact_email;
    document.getElementById('affiliateCommission').value = affiliateData.commission_rate * 100;

    modal.style.display = 'flex';
}


export function setupAffiliateModal() {
    const openAffiliateModalBtn = document.getElementById('openAffiliateModalBtn');
    const userSearchInput = document.getElementById('userSearch');
    const userSearchResults = document.getElementById('userSearchResults');

    openAffiliateModalBtn.addEventListener('click', () => {
        const modal = document.getElementById('affiliateModal');
        document.getElementById('affiliateModalTitle').textContent = 'Novo Afiliado';
        document.getElementById('affiliateForm').reset();
        userSearchInput.disabled = false;
        userSearchResults.innerHTML = '';
        modal.style.display = 'flex';
    });

    let debounceTimer;
    userSearchInput.addEventListener('keyup', (e) => {
        clearTimeout(debounceTimer);
        const searchTerm = e.target.value;
        if (searchTerm.length < 3) {
            userSearchResults.innerHTML = '';
            return;
        }
        debounceTimer = setTimeout(async () => {
            const users = await searchUsers(searchTerm);
            userSearchResults.innerHTML = '';
            if (users.length > 0) {
                users.forEach(user => {
                    const item = document.createElement('div');
                    item.className = 'user-search-item';
                    item.innerHTML = `<strong>${user.full_name}</strong><small>${user.email}</small>`;
                    item.addEventListener('click', () => {
                        document.getElementById('affiliateUserId').value = user.id;
                        document.getElementById('affiliateName').value = user.full_name;
                        document.getElementById('affiliateEmail').value = user.email;
                        userSearchInput.value = `${user.full_name} (${user.email})`;
                        userSearchResults.innerHTML = '';
                    });
                    userSearchResults.appendChild(item);
                });
            } else {
                userSearchResults.innerHTML = '<div class="user-search-item">Nenhum usuário encontrado.</div>';
            }
        }, 300);
    });

    document.getElementById('affiliatesTableBody').addEventListener('click', (e) => {
        const button = e.target.closest('button[data-action]');
        if (!button) return;

        const row = button.closest('tr');
        const action = button.dataset.action;

        if (action === 'edit-affiliate') {
            openAffiliateEditModal(row.dataset);
        } else if (action === 'delete-affiliate') {
            deleteAffiliate(row.dataset.affiliate_id, row.dataset.affiliate_name);
        }
    });

}

export async function handleAffiliateFormSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const saveBtn = form.querySelector('button[type="submit"]');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Salvando...';

    const userId = document.getElementById('affiliateUserId').value;
    const commissionRate = parseFloat(document.getElementById('affiliateCommission').value) / 100;
    const affiliateName = document.getElementById('affiliateName').value;
    const contactEmail = document.getElementById('affiliateEmail').value;
    
    // Se userId está vazio, significa que é um novo afiliado e um usuário precisa ter sido selecionado
    if (!userId) {
        showToast('Por favor, busque e selecione um usuário para promover.', 'error');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Salvar Afiliado';
        return;
    }

    try {
        // Inicia uma transação
        // Passo 1: Inserir ou atualizar na tabela 'affiliates'
        const { data: affiliateData, error: affiliateError } = await supabaseClient
            .from('affiliates')
            .upsert({ 
                id: userId, 
                name: affiliateName,
                contact_email: contactEmail,
                commission_rate: commissionRate 
            }, { onConflict: 'id' })
            .select()
            .single();

        if (affiliateError) throw affiliateError;

        // Passo 2: Atualizar a role do usuário na tabela 'users' para 'admin'
        const { error: userError } = await supabaseClient
            .from('users')
            .update({ role: 'admin' })
            .eq('id', userId);

        if (userError) throw userError;

        showToast('Afiliado salvo com sucesso!', 'success');
        document.getElementById('affiliateModal').style.display = 'none';
        form.reset();
        renderAffiliatesTable(); // Atualiza a tabela

    } catch (error) {
        console.error('Erro ao salvar afiliado:', error);
        showToast(`Erro ao salvar afiliado: ${error.message}`, 'error');
        // TODO: Implementar lógica de rollback se um dos passos falhar
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Salvar Afiliado';
    }
}


async function deleteAffiliate(affiliateId, affiliateName) {
    if (!confirm(`Tem certeza que deseja remover "${affiliateName}" como afiliado? Ele voltará a ser um usuário comum.`)) {
        return;
    }

    try {
        // Transação para garantir consistência
        // Passo 1: Reverter a role do usuário para 'app_user'
        const { error: userError } = await supabaseClient
            .from('users')
            .update({ role: 'app_user' })
            .eq('id', affiliateId);
        
        if (userError) throw userError;

        // Passo 2: Deletar o registro da tabela 'affiliates'
        const { error: affiliateError } = await supabaseClient
            .from('affiliates')
            .delete()
            .eq('id', affiliateId);

        if (affiliateError) throw affiliateError;

        showToast('Afiliado removido com sucesso!', 'success');
        renderAffiliatesTable();

    } catch (error) {
        console.error('Erro ao remover afiliado:', error);
        showToast(`Erro ao remover afiliado: ${error.message}`, 'error');
    }
}
