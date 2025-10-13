import { renderUsersTable, openUserEditModal, handleUserFormSubmit } from './admin-clientes.js';
import { renderAffiliatesTable, setupAffiliateModal, handleAffiliateFormSubmit } from './affiliates.js';
import { supabaseClient } from './api.js';
import { showToast, setTableLoading, setAllPlans, setAllAffiliates, getAllPlans, getAllAffiliates } from './admin-helpers.js';

document.addEventListener('DOMContentLoaded', async () => {
    console.log('[Admin] DOM totalmente carregado e analisado.');

    // --- AUTH GUARD ---
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
        console.log('[Admin] No user logged in. Redirecting to login page.');
        window.location.replace('index.html');
        return; // Stop further execution
    }
    console.log('[Admin] Utilizador autenticado:', user.email);

    // Check if user has admin role
    const { data: profile, error } = await supabaseClient
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();

    if (error || (profile && profile.role !== 'admin' && profile.role !== 'super_admin')) {
         console.warn('[Admin] User does not have admin/super_admin role. Redirecting.');
         showToast('Acesso negado. Você não é um superadmin.', 'error');
         setTimeout(() => {
            window.location.replace('index.html');
         }, 2000);
         return;
    }
    console.log(`[Admin] A função do utilizador é '${profile.role}'. Acesso concedido.`);

    // --- Global state is now handled in admin-helpers.js ---

    async function fetchPlansAndAffiliates() {
        console.log('[Admin] A buscar planos e afiliados...');
        try {
            const { data: plansData, error: plansError } = await supabaseClient.from('plans').select('*');
            if (plansError) throw plansError;
            setAllPlans(plansData); // Usa o helper para definir o estado
            console.log('[Admin] Planos obtidos:', plansData);

            const { data: affiliatesData, error: affiliatesError } = await supabaseClient.from('affiliates').select('id, name, contact_email');
            if (affiliatesError) throw affiliatesError;
            setAllAffiliates(affiliatesData); // Usa o helper para definir o estado
            console.log('[Admin] Afiliados obtidos:', affiliatesData);
        } catch (error) {
            console.error("Failed to fetch plans and affiliates", error);
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

            pageContents.forEach(page => {
                page.classList.toggle('active', page.id === `${targetPage}Page`);
            });

            pageTitle.textContent = link.querySelector('span').textContent;

            switch (targetPage) {
                case 'adminDashboard': loadAdminDashboard(); break;
                case 'adminUsers': renderUsersTable(); break;
                case 'adminPlans': renderPlansTable(); break;
                case 'adminAffiliates': renderAffiliatesTable(); break;
            }
        });
    });

    // --- LÓGICA DO DASHBOARD ---
    let mrrChartInstance = null;
    let newClientsChartInstance = null;

    async function loadAdminDashboard() {
        console.log('[Admin] A carregar dados do dashboard...');
        try {
            // Métricas principais
            const { data: metrics, error: metricsError } = await supabaseClient.rpc('get_super_admin_metrics');
            if (metricsError) throw metricsError;

            if (metrics) {
                console.log('[Admin] Métricas do dashboard obtidas:', metrics);
                document.getElementById('totalRevenue').textContent = `R$ ${metrics.total_revenue.toFixed(2).replace('.', ',')}`;
                document.getElementById('totalUsers').textContent = metrics.total_clients;
                document.getElementById('totalAffiliates').textContent = metrics.total_affiliates;
            }

            // Contagem de assinaturas ativas
            const { count: activeCount, error: countError } = await supabaseClient.from('companies').select('*', { count: 'exact' }).eq('status', 'active');
            if(countError) throw countError;
            document.getElementById('activeSubscriptions').textContent = activeCount || 0;


            // Gráfico de Novos Clientes
            const { data: newClients, error: newClientsError } = await supabaseClient.rpc('get_new_clients_monthly');
            if (newClientsError) throw newClientsError;
            console.log('[Admin] Dados de novos clientes obtidos:', newClients);

            const newClientsCtx = document.getElementById('newClientsChart').getContext('2d');
            if (newClientsChartInstance) newClientsChartInstance.destroy();
            newClientsChartInstance = new Chart(newClientsCtx, {
                type: 'bar',
                data: {
                    labels: newClients.map(item => new Date(item.month + '-02').toLocaleString('pt-BR', { month: 'short' })),
                    datasets: [{
                        label: 'Novos Clientes',
                        data: newClients.map(item => item.count),
                        backgroundColor: 'rgba(52, 152, 219, 0.7)',
                        borderColor: 'rgba(52, 152, 219, 1)',
                        borderWidth: 1
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
            });

            // Gráfico de Receita (com dados históricos mockados + real)
            const mrrCtx = document.getElementById('mrrChart').getContext('2d');
            if (mrrChartInstance) mrrChartInstance.destroy();
            const mrrData = [
                metrics.total_revenue * 0.5,
                metrics.total_revenue * 0.6,
                metrics.total_revenue * 0.75,
                metrics.total_revenue * 0.8,
                metrics.total_revenue * 0.9,
                metrics.total_revenue
            ];
            mrrChartInstance = new Chart(mrrCtx, {
                type: 'line',
                data: {
                    labels: ['Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out'],
                    datasets: [{
                        label: 'MRR',
                        data: mrrData,
                        backgroundColor: 'rgba(255, 127, 64, 0.2)',
                        borderColor: 'rgba(255, 127, 64, 1)',
                        borderWidth: 2,
                        tension: 0.4,
                        fill: true
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });

        } catch (error) {
            console.error("Erro ao carregar dashboard:", error);
            showToast("Falha ao carregar dados do dashboard.", "error");
        }
    }

    // --- LÓGICA DAS TABELAS ---
    
    async function renderPlansTable() {
        console.log('[Admin] Rendering plans table...');
        setTableLoading('plansTableBody');
        const tableBody = document.getElementById('plansTableBody');
        try {
            const { data, error } = await supabaseClient.from('plans').select('*').order('price');
            if (error) throw error;
            
            tableBody.innerHTML = '';
            data.forEach(plan => {
                const row = document.createElement('tr');
                Object.keys(plan).forEach(key => {
                    // Garante que valores nulos não sejam convertidos para a string "null"
                    row.dataset[key] = plan[key] === null ? '' : plan[key];
                });

                row.innerHTML = `
                    <td>${plan.name}</td>
                    <td>R$ ${plan.price.toFixed(2).replace('.', ',')}</td>
                    <td>${plan.monthly_chat_limit || 'Ilimitado'}</td>
                    <td><span class="status-badge-admin ${plan.is_active ? 'active' : 'inactive'}">${plan.is_active ? 'Ativo' : 'Inativo'}</span></td>
                    <td class="table-actions">
                        <button class="btn btn-small btn-secondary" data-action="edit-plan"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-small btn-danger" data-action="delete-plan"><i class="fas fa-trash"></i></button>
                    </td>
                `;
                tableBody.appendChild(row);
            });
        } catch (error) {
             console.error("Erro ao carregar planos:", error);
            tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--danger);">Falha ao carregar planos.</td></tr>`;
        }
    }
    
    // --- LÓGICA DOS MODAIS E CRUD ---

    function openPlanEditModal(planData) {
        console.log('[Admin] Opening plan edit modal with data:', planData);
        const modal = document.getElementById('planModal');
        document.getElementById('planModalTitle').textContent = 'Editar Plano';
        document.getElementById('planId').value = planData.id;
        document.getElementById('planName').value = planData.name;
        document.getElementById('planDescription').value = planData.description;
        document.getElementById('planPrice').value = planData.price;
        document.getElementById('planChatLimit').value = planData.monthly_chat_limit;
        modal.style.display = 'flex';
    }

    async function handlePlanFormSubmit(event) {
        event.preventDefault();
        const form = event.target;
        const saveBtn = form.querySelector('button[type="submit"]');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Salvando...';

        const planId = document.getElementById('planId').value;
        console.log('[Admin] Plan form submitted. Plan ID:', planId || 'New Plan');

        const planData = {
            name: document.getElementById('planName').value,
            description: document.getElementById('planDescription').value || null,
            price: parseFloat(document.getElementById('planPrice').value),
            monthly_chat_limit: parseInt(document.getElementById('planChatLimit').value, 10),
            is_active: true // Sempre ativo por padrão
        };

        if (planId) {
            planData.id = planId;
        }

        console.log('[Admin] Plan data to upsert:', planData);

        try {
            const { error } = await supabaseClient.from('plans').upsert(planData, { onConflict: 'id' });
            if (error) throw error;

            showToast(planId ? 'Plano atualizado com sucesso!' : 'Plano criado com sucesso!', 'success');
            document.getElementById('planModal').style.display = 'none';
            form.reset();
            renderPlansTable();
            await fetchPlansAndAffiliates(); // Recarrega os planos para os outros modais
        } catch (error) {
            console.error('Erro ao salvar plano:', error);
            showToast('Erro ao salvar o plano.', 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Salvar';
        }
    }

    async function deletePlan(planId) {
        console.log(`[Admin] Attempting to delete plan with ID: ${planId}`);
        if (!confirm('Tem certeza de que deseja excluir este plano? Esta ação é irreversível.')) {
            console.log('[Admin] Plan deletion cancelled by user.');
            return;
        }
        try {
            const { error } = await supabaseClient.from('plans').delete().eq('id', planId);
            if (error) throw error;
    
            showToast('Plano excluído com sucesso!', 'success');
            console.log(`[Admin] Plan with ID: ${planId} deleted successfully.`);
            renderPlansTable(); // Refresh the table
            await fetchPlansAndAffiliates(); // Recarrega os planos para os outros modais
        } catch (error) {
            console.error('Erro ao excluir plano:', error);
            showToast('Erro ao excluir o plano.', 'error');
        }
    }
    
    function setupModals() {
        console.log('[Admin] A configurar modais e listeners de eventos...');
        const modals = document.querySelectorAll('.modal');
        
        document.getElementById('openPlanModalBtn').addEventListener('click', () => {
            console.log('[Admin] Open New Plan modal clicked.');
            document.getElementById('planForm').reset();
            document.getElementById('planId').value = '';
            document.getElementById('planModalTitle').textContent = 'Novo Plano';
            document.getElementById('planModal').style.display = 'flex';
        });

        setupAffiliateModal();

        modals.forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target.classList.contains('modal') || e.target.classList.contains('close-modal')) {
                    modal.style.display = 'none';
                }
            });
        });

        // Event listener para os formulários
        document.getElementById('userForm').addEventListener('submit', handleUserFormSubmit); // Já não precisa de passar argumentos
        document.getElementById('planForm').addEventListener('submit', handlePlanFormSubmit);
        document.getElementById('affiliateForm').addEventListener('submit', handleAffiliateFormSubmit);


        // Event listeners para as tabelas
        document.getElementById('usersTableBody').addEventListener('click', async (e) => {
            const button = e.target.closest('button[data-action="edit-user"]');
            if (button) {
                const row = button.closest('tr');
                await openUserEditModal(row.dataset, getAllPlans(), getAllAffiliates());
            }
        });
        
        document.getElementById('plansTableBody').addEventListener('click', (e) => {
            const button = e.target.closest('button[data-action]');
            if (!button) return;

            const row = button.closest('tr');
            const action = button.dataset.action;
            const planId = row.dataset.id;
            console.log(`[Admin] Action '${action}' triggered for plan ID: ${planId}`);


            if (action === 'edit-plan') {
                openPlanEditModal(row.dataset);
            } else if (action === 'delete-plan') {
                deletePlan(planId);
            }
        });
    }


    // --- INICIALIZAÇÃO ---
    await fetchPlansAndAffiliates(); // Carrega dados de suporte no início
    loadAdminDashboard(); // Carrega o dashboard inicial
    setupModals();
});
