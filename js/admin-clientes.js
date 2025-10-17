import { supabaseClient } from './api.js';
import { showToast, setTableLoading } from './admin-helpers.js';

/**
 * Renderiza a tabela de clientes buscando diretamente da tabela 'companies'.
 * Para 'super_admin', busca todas as empresas.
 * Para 'admin' (afiliado), busca apenas as empresas associadas ao seu ID.
 * @param {string} userRole - A função do usuário logado ('super_admin' ou 'admin').
 * @param {string|null} affiliateId - O ID do afiliado (apenas para a função 'admin').
 */
export async function renderUsersTable(userRole, affiliateId = null) {
    console.log(`[Admin-Clientes] Renderizando tabela de companies para a role: ${userRole}.`);
    setTableLoading('usersTableBody');
    const tableBody = document.getElementById('usersTableBody');

    try {
        let query = supabaseClient
            .from('companies')
            .select(`
                id,
                name,
                official_name,
                status,
                plan_id,
                affiliate_id,
                plans (name),
                affiliates (name),
                users (full_name, email, id)
            `);

        if (userRole === 'admin' && affiliateId) {
            query = query.eq('affiliate_id', affiliateId);
        }

        const { data: companies, error } = await query;
        if (error) throw error;

        console.log('[Admin-Clientes] Dados de companies recebidos:', companies);
        
        tableBody.innerHTML = '';
        if(!companies || companies.length === 0) {
             tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 40px;">Nenhum cliente encontrado.</td></tr>`;
             return;
        }

        tableBody.innerHTML = companies.map(company => {
            const mainUser = company.users && company.users.length > 0 ? company.users[0] : { full_name: 'Sem usuário', email: '', id: null };
            
            const affiliateCell = userRole === 'super_admin' 
                ? `<td data-label="Afiliado">${company.affiliates ? company.affiliates.name : 'Nenhum'}</td>`
                : ''; 
            
            const companyDisplayName = company.official_name || company.name || 'N/A';
            const companySubName = company.official_name && company.name && company.official_name !== company.name
                ? `<small style="color: var(--text-color-light);">${company.name}</small>`
                : '';

            return `
                <tr data-user_id="${mainUser.id}" 
                    data-contact_name="${mainUser.full_name || ''}" 
                    data-contact_email="${mainUser.email || ''}" 
                    data-company_id="${company.id}" 
                    data-company_name="${company.name || ''}" 
                    data-official_name="${company.official_name || ''}" 
                    data-plan_id="${company.plan_id || ''}" 
                    data-plan_name="${company.plans ? company.plans.name : ''}" 
                    data-affiliate_id="${company.affiliate_id || ''}" 
                    data-affiliate_name="${company.affiliates ? company.affiliates.name : ''}" 
                    data-company_status="${company.status || ''}">
                    <td data-label="Contato">
                        <div>${mainUser.full_name || 'N/A'}</div>
                        <small style="color: var(--text-color-light);">${mainUser.email || 'Nenhum e-mail'}</small>
                    </td>
                    <td data-label="Empresa">
                        <div>${companyDisplayName}</div>
                        ${companySubName}
                    </td>
                    <td data-label="Plano">${company.plans ? company.plans.name : 'Nenhum'}</td>
                    <td data-label="Status"><span class="status-badge-admin ${company.status === 'active' ? 'active' : 'inactive'}">${company.status || 'N/A'}</span></td>
                    ${affiliateCell}
                    <td class="table-actions" data-label="Ações">
                        <button class="btn btn-small btn-secondary" data-action="edit-user"><i class="fas fa-edit"></i></button>
                    </td>
                </tr>
            `;
        }).join('');
        
    } catch (error) {
        console.error("Erro ao carregar clientes (companies):", error);
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
    document.getElementById('userOfficialName').value = userData.official_name;

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
    const officialName = document.getElementById('userOfficialName').value;
    const newPlanId = document.getElementById('userPlan').value;
    
    const newAffiliateId = userRole === 'super_admin' ? document.getElementById('userAffiliate').value : affiliateId;

    if (!companyId) {
        showToast('ID da empresa não encontrado. Não foi possível guardar.', 'error');
        console.error('[Admin-Clientes] ID da empresa não encontrado no formulário.');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Guardar Alterações';
        return;
    }

    try {
        if (userId && userId !== 'null') { // A company may not have a user yet
            const { error: userUpdateError } = await supabaseClient
                .from('users')
                .update({ full_name: contactName })
                .eq('id', userId);
            if(userUpdateError) throw userUpdateError;
        }

        const { error: companyUpdateError } = await supabaseClient
            .from('companies')
            .update({ 
                name: companyName,
                official_name: officialName,
                plan_id: newPlanId || null,
                affiliate_id: newAffiliateId || null
            })
            .eq('id', companyId);

        if (companyUpdateError) throw companyUpdateError;

        showToast('Dados do cliente atualizados com sucesso!', 'success');
        document.getElementById('userModal').style.display = 'none';
        form.reset();
        
        await renderUsersTable(userRole, affiliateId); 

    } catch (error) {
        console.error('Erro ao atualizar dados do cliente:', error);
        showToast('Falha ao atualizar os dados do cliente.', 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Guardar Alterações';
    }
}

