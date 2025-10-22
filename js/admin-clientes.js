import { supabaseClient } from './api.js';
import { showToast, setTableLoading } from './admin-helpers.js';

/**
 * Renderiza a tabela de clientes buscando dados da tabela sincronizada 'company_user_details_sync'.
 * A tabela já contém os dados combinados e é atualizada por triggers.
 * A RLS definida na tabela 'company_user_details_sync' controla a visibilidade para 'super_admin' e 'admin'.
 * @param {string} userRole - A função do usuário logado ('super_admin' ou 'admin').
 * @param {string|null} affiliateId - O ID do afiliado (apenas para a função 'admin').
 */
export async function renderUsersTable(userRole, affiliateId = null) {
    console.log(`[Admin-Clientes] Renderizando tabela via Tabela Sincronizada para role: ${userRole}.`);
    setTableLoading('usersTableBody');
    const tableBody = document.getElementById('usersTableBody');
    tableBody.innerHTML = ''; // Limpa a tabela

    try {
        // --- ETAPA ÚNICA: Buscar dados da Tabela Sincronizada ---
        let syncQuery = supabaseClient
            .from('company_user_details_sync') // Consulta a Tabela Sincronizada
            .select(`
                company_id,
                company_name,
                official_name,
                company_status,
                plan_id,
                plan_name,
                affiliate_id,
                affiliate_name,
                user_id,
                contact_name,
                contact_email
            `) // Seleciona as colunas da tabela sync
            .order('company_created_at', { ascending: false }); // Ordena pelos mais recentes

        // O filtro por afiliado AGORA É FEITO PELA RLS DA TABELA 'company_user_details_sync'.
        // O código JS não precisa mais filtrar se a RLS estiver correta.
        if (userRole === 'admin') {
             console.log(`[Admin-Clientes] Role 'admin' detectada. RLS da tabela sync deve filtrar por affiliate_id: ${affiliateId}`);
        } else {
             // CORREÇÃO: Troca as aspas externas para crases (backticks)
             console.log(`[Admin-Clientes] Role 'super_admin' detectada. RLS da tabela sync deve permitir acesso total.`);
        }

        const { data: details, error: syncError } = await syncQuery;
        if (syncError) throw syncError;

        console.log('[Admin-Clientes] Dados recebidos da tabela sync:', details);

        if (!details || details.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 40px;">Nenhum cliente encontrado.</td></tr>`;
            return;
        }

        // --- Renderizar Tabela ---
        tableBody.innerHTML = details.map(detail => {
            // Usa os nomes das colunas da tabela sync
            const contactDisplay = detail.contact_name || detail.official_name || detail.company_name || 'N/A';
            const contactSub = detail.contact_email ? `<small style="color: var(--text-color-light);">${detail.contact_email}</small>` : '';

            // Define se a coluna 'Afiliado' deve ser exibida
            const affiliateCell = userRole === 'super_admin'
                ? `<td data-label="Afiliado">${detail.affiliate_name || 'Nenhum'}</td>`
                : '';

            const companyDisplayName = detail.official_name || detail.company_name || 'N/A';
            const companySubName = detail.official_name && detail.company_name && detail.official_name !== detail.company_name
                ? `<small style="color: var(--text-color-light);">${detail.company_name}</small>`
                : '';

            // Monta o HTML da linha usando dados da tabela sync
            // Os data attributes refletem os nomes da tabela sync
            return `
                <tr data-company_id="${detail.company_id}"
                    data-user_id="${detail.user_id || ''}"
                    data-contact_name="${detail.contact_name || ''}"
                    data-contact_email="${detail.contact_email || ''}"
                    data-company_name="${detail.company_name || ''}"
                    data-official_name="${detail.official_name || ''}"
                    data-plan_id="${detail.plan_id || ''}"
                    data-plan_name="${detail.plan_name || ''}"
                    data-affiliate_id="${detail.affiliate_id || ''}"
                    data-affiliate_name="${detail.affiliate_name || ''}"
                    data-company_status="${detail.company_status || ''}">
                    <td data-label="Contato">
                        <div>${contactDisplay}</div>
                        ${contactSub}
                    </td>
                    <td data-label="Empresa">
                        <div>${companyDisplayName}</div>
                        ${companySubName}
                    </td>
                    <td data-label="Plano">${detail.plan_name || 'Nenhum'}</td>
                    <td data-label="Status"><span class="status-badge-admin ${detail.company_status === 'active' ? 'active' : 'inactive'}">${detail.company_status || 'N/A'}</span></td>
                    ${affiliateCell}
                    <td class="table-actions" data-label="Ações">
                        <button class="btn btn-small btn-secondary" data-action="edit-user"><i class="fas fa-edit"></i></button>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (error) {
        console.error("Erro ao carregar clientes via Tabela Sincronizada:", error);
        tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--danger);">Falha ao carregar clientes. Verifique o console e as permissões RLS da tabela 'company_user_details_sync'.</td></tr>`;
    }
}


/**
 * Abre o modal para editar os dados de um cliente (lendo da tabela sync).
 * @param {object} detailData - Os dados combinados vindos do dataset da linha da tabela (tabela sync).
 * @param {Array} allPlans - Lista de todos os planos disponíveis.
 * @param {Array} allAffiliates - Lista de todos os afiliados disponíveis.
 * @param {string} userRole - A função do usuário logado ('super_admin' ou 'admin').
 */
export function openUserEditModal(detailData, allPlans, allAffiliates, userRole) {
    console.log('[Admin-Clientes] Abrindo modal de edição (Tabela Sync) com os dados:', detailData);
    const modal = document.getElementById('userModal');

    // Preenche os campos do formulário usando dados da tabela sync
    document.getElementById('userModalTitle').textContent = 'Editar Cliente';
    document.getElementById('userId').value = detailData.user_id || '';
    document.getElementById('companyId').value = detailData.company_id;
    document.getElementById('userName').value = detailData.contact_name || ''; // Nome do contato
    document.getElementById('userName').readOnly = false;
    document.getElementById('userEmail').value = detailData.contact_email || ''; // Email
    document.getElementById('userEmail').parentElement.style.display = 'block';
    document.getElementById('userEmail').readOnly = true; // Email não editável por aqui
    document.getElementById('userCompany').value = detailData.company_name || ''; // Nome fantasia
    document.getElementById('userOfficialName').value = detailData.official_name || ''; // Razão social

    // Lógica para esconder/mostrar seleção de afiliado
    const affiliateSelectGroup = document.getElementById('userAffiliate').parentElement;
    if (userRole === 'admin') {
        affiliateSelectGroup.style.display = 'none';
    } else {
        affiliateSelectGroup.style.display = 'block';
    }

    // Preenche o select de Planos
    const planSelect = document.getElementById('userPlan');
    planSelect.innerHTML = '<option value="">Selecione um Plano</option>';
    allPlans.forEach(plan => {
        const option = document.createElement('option');
        option.value = plan.id;
        option.textContent = `${plan.name} - R$ ${plan.price}`;
        if (plan.id === detailData.plan_id) option.selected = true; // Usa plan_id da tabela sync
        planSelect.appendChild(option);
    });

    // Preenche o select de Afiliados
    const affiliateSelect = document.getElementById('userAffiliate');
    affiliateSelect.innerHTML = '<option value="">Nenhum</option>';
    allAffiliates.forEach(affiliate => {
         const displayText = affiliate.name || affiliate.contact_email || `ID: ${affiliate.id}`;
         const option = document.createElement('option');
         option.value = affiliate.id;
         option.textContent = displayText;
         if (affiliate.id === detailData.affiliate_id) option.selected = true; // Usa affiliate_id da tabela sync
         affiliateSelect.appendChild(option);
    });

    modal.style.display = 'flex';
}

/**
 * Lida com o envio do formulário de edição de cliente. ATUALIZA AS TABELAS ORIGINAIS ('users', 'companies').
 * Os triggers cuidarão de atualizar a tabela 'company_user_details_sync'.
 * @param {Event} event - O evento de submit do formulário.
 * @param {string} userRole - A função do usuário logado.
 * @param {string|null} currentAffiliateId - O ID do afiliado logado (se aplicável).
 */
export async function handleUserFormSubmit(event, userRole, currentAffiliateId) {
    event.preventDefault();
    console.log('[Admin-Clientes] Formulário de edição submetido. Atualizando tabelas originais...');

    const form = event.target;
    const saveBtn = form.querySelector('button[type="submit"]');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Salvando...';

    // Obtém os valores dos campos do formulário
    const companyId = document.getElementById('companyId').value;
    const userId = document.getElementById('userId').value;
    const contactName = document.getElementById('userName').value;
    const companyName = document.getElementById('userCompany').value;
    const officialName = document.getElementById('userOfficialName').value;
    const newPlanId = document.getElementById('userPlan').value;
    const newAffiliateId = userRole === 'super_admin'
        ? document.getElementById('userAffiliate').value
        : currentAffiliateId;

    if (!companyId) {
        showToast('ID da empresa não encontrado. Não foi possível salvar.', 'error');
        console.error('[Admin-Clientes] ID da empresa não encontrado no formulário.');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Salvar Alterações';
        return;
    }

    try {
        // --- ATUALIZA AS TABELAS ORIGINAIS ---

        // 1. Atualiza o nome do contato na tabela 'users' (se houver userId)
        if (userId && userId !== 'null' && userId !== '') {
            console.log(`[Admin-Clientes] Atualizando usuário ${userId}...`);
            const { error: userUpdateError } = await supabaseClient
                .from('users')
                .update({ full_name: contactName })
                .eq('id', userId);
            if(userUpdateError) {
                console.warn(`[Admin-Clientes] Falha ao atualizar usuário ${userId}:`, userUpdateError.message);
                showToast(`Aviso: Não foi possível atualizar o nome do contato (${userUpdateError.message}).`, 'info');
            } else {
                 console.log(`[Admin-Clientes] Usuário ${userId} atualizado.`);
            }
        } else {
             console.log("[Admin-Clientes] Nenhum ID de usuário válido para atualizar.");
        }

        // 2. Atualiza os dados da empresa na tabela 'companies'
        console.log(`[Admin-Clientes] Atualizando empresa ${companyId}...`);
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

        console.log(`[Admin-Clientes] Empresa ${companyId} atualizada. Triggers devem atualizar a tabela sync.`);
        showToast('Dados do cliente atualizados! A tabela será atualizada em breve.', 'success'); // Informa que a atualização pode levar um instante (trigger)
        document.getElementById('userModal').style.display = 'none';
        form.reset();
        // Não chamamos renderUsersTable() imediatamente, esperamos o trigger e a RLS fazerem efeito.
        // O Supabase Realtime (se configurado para a tabela sync) pode atualizar a UI.
        // Ou podemos adicionar um pequeno delay e chamar renderUsersTable().
        setTimeout(() => renderUsersTable(userRole, currentAffiliateId), 1000); // Exemplo com delay

    } catch (error) {
        console.error('Erro ao atualizar dados do cliente:', error);
        showToast(`Falha ao atualizar os dados do cliente: ${error.message}`, 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Salvar Alterações';
    }
}

