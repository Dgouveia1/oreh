import { renderUsersTable, handleUserFormSubmit, openUserEditModal } from './admin-clientes.js';
import { renderAffiliatesTable, setupAffiliateModal } from './affiliates.js';
import { renderCouponsTable, setupCouponModalListeners } from './admin-cupons.js';
import { supabaseClient } from './api.js';
import { showToast, setTableLoading, setAllPlans, setAllAffiliates, getAllPlans, getAllAffiliates } from './admin-helpers.js';

// Variáveis para instâncias dos gráficos
let mrrChart = null;
let newClientsChart = null;
let clientsByAffiliateChart = null;
let commissionsByAffiliateChart = null;
let affiliateNewClientsChart = null;


// --- LÓGICA DE DOCUMENTOS LEGAIS (GERAIS) ---

async function loadLegalDocuments() {
    console.log('[Admin] Carregando documentos legais gerais...');
    try {
        const { data, error } = await supabaseClient
            .from('legal_documents')
            .select('*')
            .eq('id', 1)
            .single();

        if (error && error.code !== 'PGRST116') throw error;

        if (data) {
            document.getElementById('membershipAgreement').value = data.membership_agreement || '';
            document.getElementById('termsOfUse').value = data.terms_of_use || '';
            document.getElementById('privacyPolicy').value = data.privacy_policy || '';
        } else {
            document.getElementById('membershipAgreement').value = '';
            document.getElementById('termsOfUse').value = '';
            document.getElementById('privacyPolicy').value = '';
            console.log('[Admin] Nenhum documento legal geral encontrado.');
        }
    } catch (error) {
        console.error("Erro ao carregar documentos legais gerais:", error);
        showToast('Falha ao carregar os documentos gerais.', 'error');
    }
}

async function handleLegalDocsFormSubmit(event) {
    event.preventDefault();
    console.log('[Admin] Salvando documentos legais gerais...');
    const saveBtn = document.getElementById('saveLegalDocsBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Salvando...';

    const legalData = {
        id: 1,
        membership_agreement: document.getElementById('membershipAgreement').value,
        terms_of_use: document.getElementById('termsOfUse').value,
        privacy_policy: document.getElementById('privacyPolicy').value,
        last_updated_at: new Date().toISOString()
    };

    try {
        const { error } = await supabaseClient.from('legal_documents').upsert(legalData, { onConflict: 'id' });
        if (error) throw error;
        showToast('Documentos gerais salvos com sucesso!', 'success');
    } catch (error) {
        console.error('Erro ao salvar documentos legais gerais:', error);
        showToast('Erro ao salvar os documentos gerais.', 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Salvar Documentos Gerais';
    }
}

// --- LÓGICA DE DOCUMENTOS LEGAIS (AFILIADOS) ---

async function loadAffiliateLegalDocuments() {
    console.log('[Admin] Carregando documentos legais de afiliados...');
    try {
        const { data, error } = await supabaseClient
            .from('affiliate_legal_documents') // <-- Nova tabela
            .select('*')
            .eq('id', 1)
            .single();

        if (error && error.code !== 'PGRST116') throw error;

        if (data) {
            document.getElementById('affiliateTerms').value = data.affiliate_terms || '';
            document.getElementById('affiliatePaymentPolicy').value = data.payment_policy || '';
        } else {
            document.getElementById('affiliateTerms').value = '';
            document.getElementById('affiliatePaymentPolicy').value = '';
            console.log('[Admin] Nenhum documento legal de afiliado encontrado.');
        }
    } catch (error) {
        console.error("Erro ao carregar documentos legais de afiliados:", error);
        showToast('Falha ao carregar os documentos de afiliados.', 'error');
    }
}

async function handleAffiliateLegalDocsFormSubmit(event) {
    event.preventDefault();
    console.log('[Admin] Salvando documentos legais de afiliados...');
    const saveBtn = document.getElementById('saveAffiliateLegalDocsBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Salvando...';

    const legalData = {
        id: 1,
        affiliate_terms: document.getElementById('affiliateTerms').value,
        payment_policy: document.getElementById('affiliatePaymentPolicy').value,
        last_updated_at: new Date().toISOString()
    };

    try {
        const { error } = await supabaseClient.from('affiliate_legal_documents').upsert(legalData, { onConflict: 'id' }); // <-- Nova tabela
        if (error) throw error;
        showToast('Documentos de afiliados salvos com sucesso!', 'success');
    } catch (error) {
        console.error('Erro ao salvar documentos legais de afiliados:', error);
        showToast('Erro ao salvar os documentos de afiliados.', 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Salvar Documentos de Afiliados';
    }
}


// --- INICIALIZAÇÃO E LÓGICA PRINCIPAL ---

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

        // Seleciona os containers de métricas e gráficos
        const superadminMetrics = document.getElementById('superadminMetricsGrid');
        const affiliateMetrics = document.getElementById('affiliateMetricsGrid');
        const superadminCharts = document.getElementById('superadminChartsGrid');
        const affiliateCharts = document.getElementById('affiliateChartsGrid');
        const affiliateFilter = document.getElementById('affiliateFilterContainer');


        if (role === 'admin') { // Visão do Afiliado
            // Esconde navegação de Superadmin
            document.querySelector('.nav-link[data-page="adminPlans"]').style.display = 'none';
            document.querySelector('.nav-link[data-page="adminAffiliates"]').style.display = 'none';
            document.querySelector('.nav-link[data-page="adminCoupons"]').style.display = 'none';
            document.querySelector('.nav-link[data-page="adminLegal"]').style.display = 'none'; // Esconde legal para afiliado
            document.getElementById('affiliateColumnHeader').style.display = 'none'; // Esconde coluna de afiliado na tabela de clientes
            if (affiliateFilter) affiliateFilter.style.display = 'none'; // Esconde filtro de afiliados

            // Ajusta textos
            document.querySelector('.nav-link[data-page="adminUsers"] span').textContent = 'Meus Clientes';
            document.getElementById('clientsPageTitle').textContent = 'Meus Clientes Indicados';

            // Ajusta Dashboard
            if (superadminMetrics) superadminMetrics.style.display = 'none';
            if (affiliateMetrics) affiliateMetrics.style.display = 'grid'; // Mostra métricas de afiliado
            if (superadminCharts) superadminCharts.style.display = 'none';
            if (affiliateCharts) affiliateCharts.style.display = 'grid'; // Mostra gráficos de afiliado
            
            // Info do Usuário
            sidebarHeader.textContent = 'PAINEL DE AFILIADO';
            userAvatar.textContent = fullName ? fullName.substring(0, 2).toUpperCase() : 'AF';
            userNameDisplay.textContent = fullName || 'Afiliado';

        } else { // Visão do Super Admin
            sidebarHeader.textContent = 'SUPERADMIN';
            userAvatar.textContent = 'SA';
            userNameDisplay.textContent = 'Super Admin';

            // Ajusta Dashboard
            if (superadminMetrics) superadminMetrics.style.display = 'grid';
            if (affiliateMetrics) affiliateMetrics.style.display = 'none';
            if (superadminCharts) superadminCharts.style.display = 'grid';
            if (affiliateCharts) affiliateCharts.style.display = 'none';
            if (affiliateFilter) affiliateFilter.style.display = 'block'; // Mostra filtro de afiliados

            // Garante que a seção de documentos legais de afiliados seja visível
            const affiliateLegalForm = document.getElementById('affiliateLegalDocumentsForm');
            if (affiliateLegalForm) affiliateLegalForm.style.display = 'block';
        }
    }

    // --- FETCH DE DADOS GERAIS ---
    async function fetchPlansAndAffiliates() {
        console.log('[Admin] A buscar planos e afiliados...');
        try {
            // Busca incluindo a nova coluna 'show_on_onboarding'
            const { data: plansData, error: plansError } = await supabaseClient
                .from('plans')
                .select('*');
            if (plansError) throw plansError;
            setAllPlans(plansData);

            // Popula o filtro de planos na página de Gestão de Clientes
            const filterPlan = document.getElementById('filterPlan');
            if (filterPlan) {
                plansData.forEach(plan => {
                    filterPlan.innerHTML += `<option value="${plan.id}">${plan.name}</option>`;
                });
            }

            const { data: affiliatesData, error: affiliatesError } = await supabaseClient
                .from('affiliates')
                .select('id, name, contact_email'); // Ajuste conforme nome real das colunas
            if (affiliatesError) throw affiliatesError;
            setAllAffiliates(affiliatesData);

            // Popula o filtro de afiliados na página de Gestão de Clientes
            const filterAffiliate = document.getElementById('filterAffiliate');
            if (filterAffiliate) {
                affiliatesData.forEach(aff => {
                    filterAffiliate.innerHTML += `<option value="${aff.id}">${aff.name || aff.contact_email}</option>`;
                });
            }

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

            // Limpa gráficos antigos
            [mrrChart, newClientsChart, clientsByAffiliateChart, commissionsByAffiliateChart, affiliateNewClientsChart].forEach(chart => {
                if (chart) chart.destroy();
                chart = null;
            });

            switch (targetPage) {
                case 'adminDashboard': loadAdminDashboard(); break;
                case 'adminUsers': renderUsersTable(userRole, affiliateId, getFilters()); break; // Passa a role, ID e filtros
                case 'adminPlans': renderPlansTable(); break;
                case 'adminCoupons': renderCouponsTable(); break;
                case 'adminAffiliates': renderAffiliatesTable(); break;
                case 'adminLegal':
                    loadLegalDocuments(); // Carrega documentos gerais
                    loadAffiliateLegalDocuments(); // Carrega documentos de afiliados
                    break;
            }
        });
    });

    // --- LÓGICA DO DASHBOARD ---
    async function loadAdminDashboard() {
        console.log('[Admin] A carregar dados do dashboard...');
        
        try {
            if (userRole === 'super_admin') {
                const { data, error } = await supabaseClient.rpc('get_superadmin_dashboard_metrics');
                if (error) throw error;
                console.log("Métricas Superadmin:", data);
                populateSuperadminDashboard(data);
            } else if (userRole === 'admin') {
                const { data, error } = await supabaseClient.rpc('get_affiliate_dashboard_metrics', { p_affiliate_id: affiliateId });
                if (error) throw error;
                console.log("Métricas Afiliado:", data);
                populateAffiliateDashboard(data);
            }
        } catch (error) {
            console.error('Erro ao carregar métricas do dashboard:', error);
            showToast(`Erro ao carregar métricas: ${error.message}`, 'error');
        }
    }
    
    function formatCurrency(value) {
        return (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function populateSuperadminDashboard(data) {
        // Cards
        document.getElementById('totalRevenue').textContent = formatCurrency(data.total_revenue);
        document.getElementById('totalUsers').textContent = data.total_clients;
        document.getElementById('activeSubscriptions').textContent = data.clients_by_status.active || 0;
        document.getElementById('totalAffiliates').textContent = data.total_affiliates;
        document.getElementById('avgTicket').textContent = formatCurrency(data.avg_ticket);
        document.getElementById('churnRate').textContent = `${(data.churn_rate_month || 0).toFixed(1)}%`;
        document.getElementById('clientsOnboarding').textContent = data.clients_by_status.onboarding || 0;
        document.getElementById('commissionsToPay').textContent = formatCurrency(data.commissions_to_pay_month);
        
        // Gráficos
        renderBarChart('newClientsChart', data.new_clients_monthly, 'Novos Clientes', 'Clientes');
        renderDoughnutChart('clientsByAffiliateChart', data.clients_by_affiliate, 'Clientes por Afiliado');
        renderBarChart('commissionsByAffiliateChart', data.commissions_by_affiliate, 'Comissões por Afiliado', 'Valor (R$)');
    }

    function populateAffiliateDashboard(data) {
        // Cards
        document.getElementById('affiliateRevenue').textContent = formatCurrency(data.total_revenue);
        document.getElementById('affiliateTotalClients').textContent = data.total_clients;
        document.getElementById('affiliateActiveClients').textContent = data.active_clients;
        document.getElementById('affiliatePendingCommission').textContent = formatCurrency(data.commission_pending_month);
        document.getElementById('affiliateTotalCommission').textContent = formatCurrency(data.commission_total_lifetime);
        
        // Link de Afiliado (Exemplo)
        const affiliateLinkEl = document.getElementById('affiliateLink');
        if(affiliateLinkEl) {
            const affiliateLink = `https://oreh.com.br/register?aff_id=${affiliateId.substring(0, 8)}`;
            affiliateLinkEl.textContent = affiliateLink;
            affiliateLinkEl.title = "Clique para copiar";
            affiliateLinkEl.style.cursor = "pointer";
            affiliateLinkEl.onclick = () => {
                // Implementar lógica de copiar para clipboard
                showToast("Link copiado! (implementação pendente)", "info");
            };
        }

        // Gráfico
        renderBarChart('affiliateNewClientsChart', data.new_clients_monthly_chart, 'Seus Novos Clientes', 'Clientes');
    }

    // --- FUNÇÕES DE GRÁFICO ---
    function renderBarChart(canvasId, chartData, label, valueLabel) {
        const ctx = document.getElementById(canvasId)?.getContext('2d');
        if (!ctx) return;

        const labels = chartData.map(item => item.name || item.month);
        const data = chartData.map(item => item.total || item.count);

        // CORREÇÃO: Destruir a instância de gráfico correta (armazenada na variável)
        // e não no 'window' (que é o elemento canvas).
        let chartInstance = null;
        if (canvasId === 'newClientsChart') chartInstance = newClientsChart;
        else if (canvasId === 'commissionsByAffiliateChart') chartInstance = commissionsByAffiliateChart;
        else if (canvasId === 'affiliateNewClientsChart') chartInstance = affiliateNewClientsChart;

        if (chartInstance) {
            chartInstance.destroy();
        }

        const newChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: valueLabel,
                    data: data,
                    backgroundColor: 'rgba(255, 127, 64, 0.7)',
                    borderColor: 'rgba(255, 127, 64, 1)',
                    borderWidth: 1,
                    borderRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true } }
            }
        });

        // CORREÇÃO: Armazena a nova instância na variável global correta.
        if (canvasId === 'newClientsChart') newClientsChart = newChart;
        else if (canvasId === 'commissionsByAffiliateChart') commissionsByAffiliateChart = newChart;
        else if (canvasId === 'affiliateNewClientsChart') affiliateNewClientsChart = newChart;
    }

    function renderDoughnutChart(canvasId, chartData, label) {
         const ctx = document.getElementById(canvasId)?.getContext('2d');
        if (!ctx) return;

        const labels = chartData.map(item => item.name);
        const data = chartData.map(item => item.count);
        
        // Gerar cores dinamicamente
        const colors = data.map((_, i) => `hsl(${(i * 360 / data.length) % 360}, 70%, 60%)`);

        // CORREÇÃO: Destruir a instância de gráfico correta (armazenada na variável).
        let chartInstance = null;
        if (canvasId === 'clientsByAffiliateChart') chartInstance = clientsByAffiliateChart;

        if (chartInstance) {
            chartInstance.destroy();
        }

        const newChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    label: label,
                    data: data,
                    backgroundColor: colors,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                    }
                }
            }
        });

        // CORREÇÃO: Armazena a nova instância na variável global correta.
        if (canvasId === 'clientsByAffiliateChart') clientsByAffiliateChart = newChart;
    }


    // --- LÓGICA DAS TABELAS (Planos) ---
    async function renderPlansTable() {
        console.log('[Admin] A renderizar a tabela de planos...');
        setTableLoading('plansTableBody');
        const tableBody = document.getElementById('plansTableBody');
        try {
            // Busca incluindo a nova coluna
            const { data, error } = await supabaseClient
                .from('plans')
                .select('*')
                .order('price');

            if (error) throw error;
            tableBody.innerHTML = data.map(plan => `
                <tr data-id="${plan.id}"
                    data-name="${plan.name}"
                    data-description="${plan.description || ''}"
                    data-price="${plan.price}"
                    data-monthly_chat_limit="${plan.monthly_chat_limit || ''}"
                    data-show_on_onboarding="${plan.show_on_onboarding}">
                    <td data-label="Plano">${plan.name}</td>
                    <td data-label="Preço">R$ ${plan.price.toFixed(2).replace('.', ',')}</td>
                    <td data-label="Limite Conversas">${plan.monthly_chat_limit || 'Ilimitado'}</td>
                    <td data-label="Visível no Onboarding">${plan.show_on_onboarding ? 'Sim' : 'Não'}</td>
                    <td data-label="Status"><span class="status-badge-admin ${plan.is_active ? 'active' : 'inactive'}">${plan.is_active ? 'Ativo' : 'Inativo'}</span></td>
                    <td class="table-actions" data-label="Ações">
                        <button class="btn btn-small btn-secondary" data-action="edit-plan"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-small btn-danger" data-action="delete-plan"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>
            `).join('');
        } catch (error) {
            console.error("Erro ao carregar planos:", error);
            tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--danger);">Falha ao carregar planos.</td></tr>`; // Ajustado colspan
        }
    }


    // --- LÓGICA DOS MODAIS E CRUD (Planos) ---
    function openPlanEditModal(planData) {
        document.getElementById('planModalTitle').textContent = 'Editar Plano';
        document.getElementById('planId').value = planData.id;
        document.getElementById('planName').value = planData.name;
        document.getElementById('planDescription').value = planData.description;
        document.getElementById('planPrice').value = planData.price;
        document.getElementById('planChatLimit').value = planData.monthly_chat_limit || ''; // Trata nulo
        // Define o estado do toggle
        document.getElementById('planShowOnOnboarding').checked = planData.show_on_onboarding === 'true' || planData.show_on_onboarding === true;
        document.getElementById('planModal').style.display = 'flex';
    }

    async function handlePlanFormSubmit(event) {
        event.preventDefault();
        const saveBtn = event.target.querySelector('button[type="submit"]');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Salvando...';

        const planId = document.getElementById('planId').value;
        const chatLimitInput = document.getElementById('planChatLimit').value;

        const planData = {
            name: document.getElementById('planName').value,
            description: document.getElementById('planDescription').value || null,
            price: parseFloat(document.getElementById('planPrice').value),
            // Define como null se o campo estiver vazio
            monthly_chat_limit: chatLimitInput ? parseInt(chatLimitInput, 10) : null,
            show_on_onboarding: document.getElementById('planShowOnOnboarding').checked, // Pega valor do toggle
            is_active: true // Assume que sempre salva como ativo
        };

        if (planId) planData.id = planId;

        try {
            const { error } = await supabaseClient.from('plans').upsert(planData, { onConflict: 'id' });
            if (error) throw error;
            showToast(planId ? 'Plano atualizado!' : 'Plano criado!', 'success');
            document.getElementById('planModal').style.display = 'none';
            event.target.reset();
            renderPlansTable();
            await fetchPlansAndAffiliates(); // Atualiza a lista global de planos
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

    // --- LÓGICA DE FILTROS (CLIENTES) ---
    function getFilters() {
        const search = document.getElementById('clientSearchInput').value;
        const planId = document.getElementById('filterPlan').value;
        const status = document.getElementById('filterStatus').value;
        const affiliateId = document.getElementById('filterAffiliate').value;
        return { search, planId, status, affiliateId };
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
        document.getElementById('legalDocumentsForm').addEventListener('submit', handleLegalDocsFormSubmit); // Listener para form legal geral
        document.getElementById('affiliateLegalDocumentsForm').addEventListener('submit', handleAffiliateLegalDocsFormSubmit); // Listener para form legal afiliado

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
            document.getElementById('planShowOnOnboarding').checked = true; // Default para true
            document.getElementById('planModal').style.display = 'flex';
        });

        // Listeners dos Filtros
        const triggerFilter = () => renderUsersTable(userRole, affiliateId, getFilters());
        document.getElementById('clientSearchInput').addEventListener('input', triggerFilter);
        document.getElementById('filterPlan').addEventListener('change', triggerFilter);
        document.getElementById('filterStatus').addEventListener('change', triggerFilter);
        document.getElementById('filterAffiliate').addEventListener('change', triggerFilter);

        setupAffiliateModal(); // Configura os listeners para a tabela de afiliados
        setupCouponModalListeners(); // Configura os listeners para a tabela de cupons
    }

    // --- INICIALIZAÇÃO DA PÁGINA ---
    await fetchPlansAndAffiliates();
    loadAdminDashboard(); // Carrega o dashboard por padrão
    setupModalListeners();
});

