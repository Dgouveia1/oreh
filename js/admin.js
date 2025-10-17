import { renderUsersTable } from './admin-clientes.js';
import { renderAffiliatesTable, setupAffiliateModal } from './affiliates.js';
import { supabaseClient } from './api.js';
import { showToast, setTableLoading, setAllPlans, setAllAffiliates, getAllPlans, getAllAffiliates } from './admin-helpers.js';

document.addEventListener('DOMContentLoaded', async () => {
    console.log('[Admin] DOM totalmente carregado e analisado.');

    // --- VARIÁVEIS DE ESTADO GLOBAL ---
    let userRole = '';
    let affiliateId = null;

    // --- AUTH GUARD & ROLE CHECK ---
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
        console.log('[Admin] Nenhum usuário logado. Redirecionando para a página de login.');
        window.location.replace('index.html');
        return;
    }
    console.log('[Admin] Utilizador autenticado:', user.email);

    try {
        const { data: profile, error } = await supabaseClient
            .from('users')
            .select('role, full_name') // Pega a role e o nome
            .eq('id', user.id)
            .single();

        if (error || !profile || (profile.role !== 'admin' && profile.role !== 'super_admin')) {
             console.warn('[Admin] Usuário não tem a função admin/super_admin. Redirecionando.');
             showToast('Acesso negado. Você não tem permissão para acessar esta área.', 'error');
             setTimeout(() => window.location.replace('index.html'), 2000);
             return;
        }
        
        userRole = profile.role;
        affiliateId = userRole === 'admin' ? user.id : null; // Para afiliados, o affiliateId é o próprio userId.
        console.log(`[Admin] Acesso concedido. Função: '${userRole}'. ID de Afiliado: ${affiliateId || 'N/A'}`);
        
        setupUIForRole(userRole, profile.full_name); // Configura a UI com base na role

    } catch (authError) {
        console.error("Erro na verificação de autenticação/role:", authError);
        showToast('Erro ao verificar suas permissões.', 'error');
        return;
    }

    // --- CONFIGURAÇÃO DA UI BASEADA NA ROLE ---
    function setupUIForRole(role, fullName) {
        const sidebarHeader = document.querySelector('.sidebar-header h1 span');
        const userAvatar = document.querySelector('.user-avatar');
        const userNameDisplay = document.querySelector('.user-info span');

        if (role === 'admin') { // Visão do Afiliado
            document.querySelector('.nav-link[data-page="adminPlans"]').style.display = 'none';
            document.querySelector('.nav-link[data-page="adminAffiliates"]').style.display = 'none';
            document.getElementById('totalAffiliatesCard').style.display = 'none';
            document.querySelector('.charts-grid').style.display = 'none'; // Esconde gráficos por padrão
            document.getElementById('affiliateColumnHeader').style.display = 'none'; // Esconde coluna de afiliado na tabela de clientes
            document.querySelector('.nav-link[data-page="adminUsers"] span').textContent = 'Meus Clientes';
            document.getElementById('clientsPageTitle').textContent = 'Meus Clientes Indicados';
            document.getElementById('revenueLabel').textContent = 'Sua Receita Gerada (MRR)';
            
            sidebarHeader.textContent = 'PAINEL DE AFILIADO';
            userAvatar.textContent = fullName ? fullName.substring(0, 2).toUpperCase() : 'AF';
            userNameDisplay.textContent = fullName || 'Afiliado';
        } else { // Visão do Super Admin
            sidebarHeader.textContent = 'SUPERADMIN';
            userAvatar.textContent = 'SA';
            userNameDisplay.textContent = 'Super Admin';
        }
    }

    // --- FETCH DE DADOS GERAIS ---
    async function fetchPlansAndAffiliates() {
        console.log('[Admin] A buscar planos e afiliados...');
        try {
            const { data: plansData, error: plansError } = await supabaseClient.from('plans').select('*');
            if (plansError) throw plansError;
            setAllPlans(plansData);
            
            const { data: affiliatesData, error: affiliatesError } = await supabaseClient.from('affiliates').select('id, name, contact_email');
            if (affiliatesError) throw affiliatesError;
            setAllAffiliates(affiliatesData);
        } catch (error) {
            console.error("Falha ao buscar planos e afiliados", error);
            showToast('Erro ao carregar dados de suporte.', 'error');
        }
    }

    // --- LÓGICA DE NAVEGAÇÃO ---
    const navLinks = document.querySelectorAll('.nav-link');
    const pageContents = document.querySelectorAll('.page-content');
    const pageTitle = document.getElementById('pageTitle');

    navLinks.forEach(link => {
        if (link.href.includes('index.html')) return; 

        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetPage = link.getAttribute('data-page');
            console.log(`[Admin] A navegar para a página: ${targetPage}`);

            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            pageContents.forEach(page => page.classList.toggle('active', page.id === `${targetPage}Page`));
            pageTitle.textContent = link.querySelector('span').textContent;

            switch (targetPage) {
                case 'adminDashboard': loadAdminDashboard(); break;
                case 'adminUsers': renderUsersTable(userRole, affiliateId); break; // Passa a role e o ID
                case 'adminPlans': renderPlansTable(); break;
                case 'adminAffiliates': renderAffiliatesTable(); break;
            }
        });
    });

    // --- LÓGICA DO DASHBOARD ---
    async function loadAdminDashboard() {
        console.log('[Admin] A carregar dados do dashboard...');
        try {
            if (userRole === 'super_admin') {
                const { data: metrics, error } = await supabaseClient.rpc('get_super_admin_metrics');
                if (error) throw error;
                document.getElementById('totalRevenue').textContent = `R$ ${metrics.total_revenue.toFixed(2).replace('.', ',')}`;
                
                // Card total de clientes deve contar 'app_users'
                const { count: appUserCount, error: countError } = await supabaseClient
                    .from('users')
                    .select('*', { count: 'exact', head: true })
                    .eq('role', 'app_user');
                if (countError) throw countError;
                document.getElementById('totalUsers').textContent = appUserCount;

                document.getElementById('totalAffiliates').textContent = metrics.total_affiliates;

                const { count } = await supabaseClient.from('companies').select('*', { count: 'exact' }).eq('status', 'active');
                document.getElementById('activeSubscriptions').textContent = count || 0;
                
            } else if (userRole === 'admin') {
                const { data: metrics, error } = await supabaseClient.rpc('get_affiliate_metrics', { p_affiliate_id: affiliateId });
                if (error) throw error;
                document.getElementById('totalRevenue').textContent = `R$ ${metrics.total_revenue.toFixed(2).replace('.', ',')}`;
                
                // Card total de clientes deve contar 'app_users' ligados ao afiliado
                const { count: affiliateUserCount, error: countError } = await supabaseClient
                    .from('companies')
                    .select('users!inner(id)', { count: 'exact', head: true })
                    .eq('affiliate_id', affiliateId)
                    .eq('users.role', 'app_user');
                if(countError) throw countError;
                document.getElementById('totalUsers').textContent = affiliateUserCount || 0;

                document.getElementById('activeSubscriptions').textContent = metrics.active_clients;
            }
        } catch (error) {
            console.error("Erro ao carregar dashboard:", error);
            showToast("Falha ao carregar dados do dashboard.", "error");
        }
    }
    
    // --- LÓGICA DAS TABELAS (Planos) ---
    async function renderPlansTable() {
        console.log('[Admin] A renderizar a tabela de planos...');
        setTableLoading('plansTableBody');
        const tableBody = document.getElementById('plansTableBody');
        try {
            const { data, error } = await supabaseClient.from('plans').select('*').order('price');
            if (error) throw error;
            tableBody.innerHTML = data.map(plan => `
                <tr data-id="${plan.id}" data-name="${plan.name}" data-description="${plan.description || ''}" data-price="${plan.price}" data-monthly_chat_limit="${plan.monthly_chat_limit || ''}">
                    <td data-label="Plano">${plan.name}</td>
                    <td data-label="Preço">R$ ${plan.price.toFixed(2).replace('.', ',')}</td>
                    <td data-label="Limite Conversas">${plan.monthly_chat_limit || 'Ilimitado'}</td>
                    <td data-label="Status"><span class="status-badge-admin ${plan.is_active ? 'active' : 'inactive'}">${plan.is_active ? 'Ativo' : 'Inativo'}</span></td>
                    <td class="table-actions" data-label="Ações">
                        <button class="btn btn-small btn-secondary" data-action="edit-plan"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-small btn-danger" data-action="delete-plan"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>
            `).join('');
        } catch (error) {
            console.error("Erro ao carregar planos:", error);
            tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--danger);">Falha ao carregar planos.</td></tr>`;
        }
    }
    
    // --- LÓGICA DOS MODAIS E CRUD (Planos) ---
    function openPlanEditModal(planData) {
        document.getElementById('planModalTitle').textContent = 'Editar Plano';
        document.getElementById('planId').value = planData.id;
        document.getElementById('planName').value = planData.name;
        document.getElementById('planDescription').value = planData.description;
        document.getElementById('planPrice').value = planData.price;
        document.getElementById('planChatLimit').value = planData.monthly_chat_limit;
        document.getElementById('planModal').style.display = 'flex';
    }

    async function handlePlanFormSubmit(event) {
        event.preventDefault();
        const saveBtn = event.target.querySelector('button[type="submit"]');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Salvando...';

        const planId = document.getElementById('planId').value;
        const planData = {
            name: document.getElementById('planName').value,
            description: document.getElementById('planDescription').value || null,
            price: parseFloat(document.getElementById('planPrice').value),
            monthly_chat_limit: parseInt(document.getElementById('planChatLimit').value, 10),
            is_active: true
        };
        if (planId) planData.id = planId;

        try {
            const { error } = await supabaseClient.from('plans').upsert(planData, { onConflict: 'id' });
            if (error) throw error;
            showToast(planId ? 'Plano atualizado!' : 'Plano criado!', 'success');
            document.getElementById('planModal').style.display = 'none';
            event.target.reset();
            renderPlansTable();
            await fetchPlansAndAffiliates();
        } catch (error) {
            console.error('Erro ao salvar plano:', error);
            showToast('Erro ao salvar o plano.', 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Salvar';
        }
    }

    async function deletePlan(planId) {
        if (!confirm('Tem certeza? Esta ação é irreversível.')) return;
        try {
            const { error } = await supabaseClient.from('plans').delete().eq('id', planId);
            if (error) throw error;
            showToast('Plano excluído!', 'success');
            renderPlansTable();
            await fetchPlansAndAffiliates();
        } catch (error) {
            console.error('Erro ao excluir plano:', error);
            showToast('Erro ao excluir o plano.', 'error');
        }
    }
    
    // --- INICIALIZAÇÃO DOS LISTENERS ---
    function setupModalListeners() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target.classList.contains('modal') || e.target.classList.contains('close-modal')) {
                    modal.style.display = 'none';
                }
            });
        });

        document.getElementById('userForm').addEventListener('submit', (event) => handleUserFormSubmit(event, userRole, affiliateId));
        document.getElementById('planForm').addEventListener('submit', handlePlanFormSubmit);

        document.getElementById('usersTableBody').addEventListener('click', async (e) => {
            const button = e.target.closest('button[data-action="edit-user"]');
            if (button) {
                const row = button.closest('tr');
                openUserEditModal(row.dataset, getAllPlans(), getAllAffiliates(), userRole);
            }
        });
        
        document.getElementById('plansTableBody').addEventListener('click', (e) => {
            const button = e.target.closest('button[data-action]');
            if (!button) return;
            const row = button.closest('tr');
            if (button.dataset.action === 'edit-plan') openPlanEditModal(row.dataset);
            else if (button.dataset.action === 'delete-plan') deletePlan(row.dataset.id);
        });

        document.getElementById('openPlanModalBtn').addEventListener('click', () => {
            document.getElementById('planForm').reset();
            document.getElementById('planId').value = '';
            document.getElementById('planModalTitle').textContent = 'Novo Plano';
            document.getElementById('planModal').style.display = 'flex';
        });

        setupAffiliateModal(); // Configura os listeners para a tabela de afiliados
    }

    // --- INICIALIZAÇÃO DA PÁGINA ---
    await fetchPlansAndAffiliates();
    loadAdminDashboard();
    setupModalListeners();
});

