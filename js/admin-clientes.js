import { supabaseClient } from './api.js';
import { showToast, setTableLoading, getAllPlans, getAllAffiliates } from './admin-helpers.js';

export async function renderUsersTable() {
    console.log('[Admin-Clientes] A renderizar a tabela de utilizadores...');
    setTableLoading('usersTableBody');
    const tableBody = document.getElementById('usersTableBody');
    try {
        // Usando a nova RPC para buscar usuários 'app_user'
        const { data, error } = await supabaseClient.rpc('get_app_users_details');
        if (error) {
            console.error('[Admin-Clientes] Erro ao buscar detalhes do utilizador:', error);
            throw error;
        }
        
        tableBody.innerHTML = '';
        if(!data || data.length === 0) {
             tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 40px;">Nenhum cliente (app_user) encontrado.</td></tr>`;
             return;
        }
        console.log('[Admin-Clientes] Dados de utilizador obtidos:', data);

        data.forEach(user => {
            const row = document.createElement('tr');
            // Armazena todos os dados na linha da tabela para uso no modal
            Object.keys(user).forEach(key => {
                row.dataset[key] = user[key] === null ? '' : user[key];
            });

            row.innerHTML = `
                <td>
                    <div>${user.contact_name || 'N/A'}</div>
                    <small style="color: var(--text-color-light);">${user.contact_email || ''}</small>
                </td>
                <td>${user.company_name || 'N/A'}</td>
                <td>${user.plan_name || 'Nenhum'}</td>
                <td><span class="status-badge-admin ${user.company_status === 'active' ? 'active' : 'inactive'}">${user.company_status || 'N/A'}</span></td>
                <td>${user.affiliate_name || 'Nenhum'}</td>
                <td class="table-actions">
                    <button class="btn btn-small btn-secondary" data-action="edit-user"><i class="fas fa-edit"></i></button>
                </td>
            `;
            tableBody.appendChild(row);
        });
        console.log('[Admin-Clientes] Tabela de utilizadores renderizada com sucesso.');
    } catch (error) {
        console.error("Erro ao carregar utilizadores:", error);
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--danger);">Falha ao carregar clientes.</td></tr>`;
    }
}

export function openUserEditModal(userData, allPlans, allAffiliates) {
    console.log('[Admin-Clientes] A abrir modal de edição de utilizador com os dados:', userData);
    const modal = document.getElementById('userModal');
    
    // Preenche campos estáticos
    document.getElementById('userModalTitle').textContent = 'Editar Cliente';
    document.getElementById('userId').value = userData.user_id;
    
    // CORRECÇÃO: Se company_id estiver vazio, usar user_id como fallback.
    const companyId = userData.company_id || userData.user_id;
    if (!userData.company_id && userData.user_id) {
        console.warn(`[Admin-Clientes] company_id vazio para user_id: ${userData.user_id}. A usar user_id como fallback para companyId: ${companyId}`);
    }
    document.getElementById('companyId').value = companyId;

    document.getElementById('userName').value = userData.contact_name;
    document.getElementById('userEmail').value = userData.contact_email;
    document.getElementById('userCompany').value = userData.company_name;

    // Popula o dropdown de planos
    const planSelect = document.getElementById('userPlan');
    planSelect.innerHTML = '<option value="">Selecione um Plano</option>';
    allPlans.forEach(plan => {
        const option = document.createElement('option');
        option.value = plan.id;
        option.textContent = `${plan.name} - R$ ${plan.price}`;
        if (plan.id === userData.plan_id) {
            option.selected = true;
        }
        planSelect.appendChild(option);
    });
    console.log('[Admin-Clientes] Dropdown de planos preenchido.');
    
    // Popula e seleciona o afiliado
    const affiliateSelect = document.getElementById('userAffiliate');
    affiliateSelect.innerHTML = '<option value="">Nenhum</option>';
    console.log(`[Admin-Clientes] A popular dropdown de afiliados. Número de afiliados recebidos: ${allAffiliates.length}`);
    allAffiliates.forEach(affiliate => {
         const displayText = affiliate.name || affiliate.contact_email || `ID: ${affiliate.id}`;
         console.log(`[Admin-Clientes] A adicionar afiliado à lista: ${displayText} (ID: ${affiliate.id})`);
         const option = document.createElement('option');
         option.value = affiliate.id;
         option.textContent = displayText;
         
         // DEBUG LOGGING ADICIONAL
         console.log(`[Admin-Clientes] Comparando: Afiliado da lista (ID: ${affiliate.id}, Tipo: ${typeof affiliate.id}) com Afiliado do utilizador (ID: ${userData.affiliate_id}, Tipo: ${typeof userData.affiliate_id})`);

         if (affiliate.id === userData.affiliate_id) {
            console.log(`[Admin-Clientes] CORRESPONDÊNCIA ENCONTRADA! A pré-selecionar o afiliado: ${displayText}`);
            option.selected = true;
         }
         affiliateSelect.appendChild(option);
    });
    console.log('[Admin-Clientes] Dropdown de afiliados preenchido.');

    modal.style.display = 'flex';
}

export async function handleUserFormSubmit(event) {
    event.preventDefault();
    console.log('[Admin-Clientes] Formulário de utilizador submetido.');

    // Obtém o estado partilhado a partir do helper
    const allPlans = getAllPlans();
    const allAffiliates = getAllAffiliates();

    const form = event.target;
    const saveBtn = form.querySelector('button[type="submit"]');
    saveBtn.disabled = true;
    saveBtn.textContent = 'A guardar...';

    const companyId = document.getElementById('companyId').value;
    const userId = document.getElementById('userId').value;
    const contactName = document.getElementById('userName').value;
    const newPlanId = document.getElementById('userPlan').value;
    const newAffiliateId = document.getElementById('userAffiliate').value;
    
    if (!companyId || !userId) {
        showToast('ID do utilizador ou da empresa não encontrado. Não foi possível guardar.', 'error');
        console.error('[Admin-Clientes] ID do utilizador ou da empresa não encontrado no formulário.');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Guardar Alterações';
        return;
    }

    console.log(`[Admin-Clientes] A chamar RPC para atualizar a empresa ${companyId} para o utilizador ${userId}`);

    try {
        const { error } = await supabaseClient.rpc('update_company_details_as_admin', {
            p_company_id: companyId,
            p_user_id: userId,
            p_contact_name: contactName || 'Empresa sem nome',
            p_plan_id: newPlanId || null,
            p_affiliate_id: newAffiliateId || null
        });

        if (error) {
            console.error('[Admin-Clientes] Erro ao chamar RPC update_company_details_as_admin:', error);
            throw error;
        }

        showToast('Dados do cliente atualizados com sucesso!', 'success');
        console.log('[Admin-Clientes] Dados da empresa atualizados com sucesso via RPC.');
        document.getElementById('userModal').style.display = 'none';
        form.reset();
        
        const row = document.querySelector(`#usersTableBody tr[data-user_id='${userId}']`);
        if (row) {
            console.log('[Admin-Clientes] A atualizar a linha da tabela diretamente na UI...');
            
            const plan = allPlans.find(p => p.id === newPlanId);
            if (plan) {
                row.cells[2].textContent = plan.name || 'Nenhum';
                row.dataset.plan_id = newPlanId;
                row.dataset.plan_name = plan.name || '';
            } else {
                 row.cells[2].textContent = 'Nenhum';
                 row.dataset.plan_id = '';
                 row.dataset.plan_name = '';
            }

            const affiliate = allAffiliates.find(a => a.id === newAffiliateId);
            if (affiliate) {
                const affiliateDisplayName = affiliate.name || affiliate.contact_email || `ID: ${affiliate.id}`;
                row.cells[4].textContent = affiliateDisplayName;
                row.dataset.affiliate_id = newAffiliateId;
                row.dataset.affiliate_name = affiliateDisplayName;
            } else {
                 row.cells[4].textContent = 'Nenhum';
                 row.dataset.affiliate_id = '';
                 row.dataset.affiliate_name = '';
            }

            if (!row.dataset.company_id) {
                row.dataset.company_id = companyId;
            }
             console.log('[Admin-Clientes] Linha da UI atualizada:', row.dataset);

        } else {
            console.warn('[Admin-Clientes] Não foi possível encontrar a linha para atualizar na UI. A recarregar tabela completa.');
            await renderUsersTable(); 
        }

    } catch (error) {
        console.error('Erro ao atualizar dados do cliente:', error);
        showToast('Falha ao atualizar os dados do cliente.', 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Guardar Alterações';
    }
}

