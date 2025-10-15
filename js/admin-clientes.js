import { supabaseClient } from './api.js';
import { showToast, setTableLoading } from './admin-helpers.js';

/**
 * Renderiza a tabela de clientes com base na função do usuário.
 * Para 'super_admin', busca todos os clientes.
 * Para 'admin' (afiliado), busca apenas os clientes associados ao seu ID.
 * @param {string} userRole - A função do usuário logado ('super_admin' ou 'admin').
 * @param {string|null} affiliateId - O ID do afiliado (apenas para a função 'admin').
 */
export async function renderUsersTable(userRole, affiliateId = null) {
    console.log(`[Admin-Clientes] A renderizar tabela para a função: ${userRole}. ID do Afiliado: ${affiliateId}`);
    setTableLoading('usersTableBody');
    const tableBody = document.getElementById('usersTableBody');

    try {
        let data, error;

        // Lógica de busca de dados foi alterada para ser mais robusta.
        if (userRole === 'super_admin') {
            // Super admin continua a buscar todos os detalhes dos usuários.
            ({ data, error } = await supabaseClient.rpc('get_app_users_details'));
        } else if (userRole === 'admin') {
            // Para afiliados, agora usamos a nova RPC dedicada.
            if (!affiliateId) {
                throw new Error("ID de Afiliado não fornecido para a função de admin.");
            }
            ({ data, error } = await supabaseClient.rpc('get_affiliate_clients_details', { 
                p_affiliate_id: affiliateId 
            }));
        } else {
            throw new Error("Função de usuário desconhecida.");
        }
        
        if (error) throw error;

        console.log('[Admin-Clientes] Dados recebidos da RPC:', data);
        
        tableBody.innerHTML = '';
        if(!data || data.length === 0) {
             tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 40px;">Nenhum cliente encontrado.</td></tr>`;
             return;
        }

        tableBody.innerHTML = data.map(user => {
            // A célula do afiliado só é renderizada se o usuário for super_admin.
            const affiliateCell = userRole === 'super_admin' 
                ? `<td>${user.affiliate_name || 'Nenhum'}</td>`
                : ''; 

            const totalColumns = userRole === 'super_admin' ? 6 : 5;

            return `
                <tr data-user_id="${user.user_id}" data-contact_name="${user.contact_name || ''}" data-contact_email="${user.contact_email || ''}" data-company_id="${user.company_id || ''}" data-company_name="${user.company_name || ''}" data-plan_id="${user.plan_id || ''}" data-plan_name="${user.plan_name || ''}" data-affiliate_id="${user.affiliate_id || ''}" data-affiliate_name="${user.affiliate_name || ''}" data-company_status="${user.company_status || ''}">
                    <td>
                        <div>${user.contact_name || 'N/A'}</div>
                        <small style="color: var(--text-color-light);">${user.contact_email || ''}</small>
                    </td>
                    <td>${user.company_name || 'N/A'}</td>
                    <td>${user.plan_name || 'Nenhum'}</td>
                    <td><span class="status-badge-admin ${user.company_status === 'active' ? 'active' : 'inactive'}">${user.company_status || 'N/A'}</span></td>
                    ${affiliateCell}
                    <td class="table-actions">
                        <button class="btn btn-small btn-secondary" data-action="edit-user"><i class="fas fa-edit"></i></button>
                    </td>
                </tr>
            `;
        }).join('');
        
    } catch (error) {
        console.error("Erro ao carregar utilizadores:", error);
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--danger);">Falha ao carregar clientes.</td></tr>`;
    }
}


export function openUserEditModal(userData, allPlans, allAffiliates, userRole) {
    console.log('[Admin-Clientes] A abrir modal de edição de utilizador com os dados:', userData);
    const modal = document.getElementById('userModal');
    
    document.getElementById('userModalTitle').textContent = 'Editar Cliente';
    document.getElementById('userId').value = userData.user_id;
    document.getElementById('companyId').value = userData.company_id || userData.user_id;
    document.getElementById('userName').value = userData.contact_name;
    document.getElementById('userEmail').value = userData.contact_email;
    document.getElementById('userCompany').value = userData.company_name;

    // Oculta a seleção de afiliado para a role 'admin', pois ele não pode alterar isso
    const affiliateSelectGroup = document.getElementById('userAffiliate').parentElement;
    if (userRole === 'admin') {
        affiliateSelectGroup.style.display = 'none';
    } else {
        affiliateSelectGroup.style.display = 'block';
    }

    const planSelect = document.getElementById('userPlan');
    planSelect.innerHTML = '<option value="">Selecione um Plano</option>';
    allPlans.forEach(plan => {
        const option = document.createElement('option');
        option.value = plan.id;
        option.textContent = `${plan.name} - R$ ${plan.price}`;
        if (plan.id === userData.plan_id) option.selected = true;
        planSelect.appendChild(option);
    });
    
    const affiliateSelect = document.getElementById('userAffiliate');
    affiliateSelect.innerHTML = '<option value="">Nenhum</option>';
    allAffiliates.forEach(affiliate => {
         const displayText = affiliate.name || affiliate.contact_email || `ID: ${affiliate.id}`;
         const option = document.createElement('option');
         option.value = affiliate.id;
         option.textContent = displayText;
         if (affiliate.id === userData.affiliate_id) option.selected = true;
         affiliateSelect.appendChild(option);
    });

    modal.style.display = 'flex';
}

export async function handleUserFormSubmit(event, userRole, affiliateId) {
    event.preventDefault();
    console.log('[Admin-Clientes] Formulário de utilizador submetido.');

    const form = event.target;
    const saveBtn = form.querySelector('button[type="submit"]');
    saveBtn.disabled = true;
    saveBtn.textContent = 'A guardar...';

    const companyId = document.getElementById('companyId').value;
    const userId = document.getElementById('userId').value;
    const contactName = document.getElementById('userName').value;
    const companyName = document.getElementById('userCompany').value;
    const newPlanId = document.getElementById('userPlan').value;
    
    // Para 'admin', o afiliado não muda. Para 'super_admin', pega o valor do select.
    const newAffiliateId = userRole === 'super_admin' ? document.getElementById('userAffiliate').value : affiliateId;

    if (!companyId || !userId) {
        showToast('ID do utilizador ou da empresa não encontrado. Não foi possível guardar.', 'error');
        console.error('[Admin-Clientes] ID do utilizador ou da empresa não encontrado no formulário.');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Guardar Alterações';
        return;
    }

    try {
        await supabaseClient
            .from('users')
            .update({ full_name: contactName })
            .eq('id', userId);

        const { error: rpcError } = await supabaseClient.rpc('update_company_details_as_admin', {
            p_company_id: companyId,
            p_user_id: userId,
            p_contact_name: companyName || contactName || 'Empresa sem nome',
            p_plan_id: newPlanId || null,
            p_affiliate_id: newAffiliateId || null
        });

        if (rpcError) throw rpcError;

        showToast('Dados do cliente atualizados com sucesso!', 'success');
        document.getElementById('userModal').style.display = 'none';
        form.reset();
        
        // CORREÇÃO: Ao recarregar a tabela, passa o affiliateId correto para a visão do afiliado.
        await renderUsersTable(userRole, affiliateId); 

    } catch (error) {
        console.error('Erro ao atualizar dados do cliente:', error);
        showToast('Falha ao atualizar os dados do cliente.', 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Guardar Alterações';
    }
}

