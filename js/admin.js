import { renderUsersTable, handleUserFormSubmit, openUserEditModal } from './admin-clientes.js';
import { renderAffiliatesTable, setupAffiliateModal } from './affiliates.js';
import { renderCouponsTable, setupCouponModalListeners } from './admin-cupons.js';
import { supabaseClient } from './api.js';
import { showToast, setTableLoading, setAllPlans, setAllAffiliates, getAllPlans, getAllAffiliates } from './admin-helpers.js';

// --- LÓGICA DE DOCUMENTOS LEGAIS ---

async function loadLegalDocuments() {
    console.log('[Admin] Carregando documentos legais...');
    try {
        // Assume que os documentos estão em uma única linha com id=1
        const { data, error } = await supabaseClient
            .from('legal_documents')
            .select('*')
            .eq('id', 1)
            .single();

        if (error && error.code !== 'PGRST116') throw error; // Ignora erro "nenhuma linha encontrada"

        if (data) {
            document.getElementById('membershipAgreement').value = data.membership_agreement || '';
            document.getElementById('termsOfUse').value = data.terms_of_use || '';
            document.getElementById('privacyPolicy').value = data.privacy_policy || '';
        } else {
            // Se não encontrar dados, limpa os campos
            document.getElementById('membershipAgreement').value = '';
            document.getElementById('termsOfUse').value = '';
            document.getElementById('privacyPolicy').value = '';
            console.log('[Admin] Nenhum documento legal encontrado no banco de dados.');
        }

    } catch (error) {
        console.error("Erro ao carregar documentos legais:", error);
        showToast('Falha ao carregar os documentos legais.', 'error');
    }
}

async function handleLegalDocsFormSubmit(event) {
    event.preventDefault();
    console.log('[Admin] Salvando documentos legais...');
    const saveBtn = document.getElementById('saveLegalDocsBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Salvando...';

    const legalData = {
        id: 1, // Assume sempre o ID 1
        membership_agreement: document.getElementById('membershipAgreement').value,
        terms_of_use: document.getElementById('termsOfUse').value,
        privacy_policy: document.getElementById('privacyPolicy').value,
        last_updated_at: new Date().toISOString() // Atualiza a data
    };

    try {
        const { error } = await supabaseClient
            .from('legal_documents')
            .upsert(legalData, { onConflict: 'id' }); // Usa upsert para criar se não existir

        if (error) throw error;
        showToast('Documentos legais salvos com sucesso!', 'success');
    } catch (error) {
        console.error('Erro ao salvar documentos legais:', error);
        showToast('Erro ao salvar os documentos legais.', 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Salvar Documentos';
    }
}

// --- FIM DA LÓGICA DE DOCUMENTOS LEGAIS ---


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
            document.querySelector('.nav-link[data-page="adminCoupons"]').style.display = 'none';
            document.querySelector('.nav-link[data-page="adminLegal"]').style.display = 'none'; // Esconde legal para afiliado
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
            // Busca incluindo a nova coluna 'show_on_onboarding'
            const { data: plansData, error: plansError } = await supabaseClient
                .from('plans')
                .select('*');
            if (plansError) throw plansError;
            setAllPlans(plansData);

            const { data: affiliatesData, error: affiliatesError } = await supabaseClient
                .from('affiliates')
                .select('id, name, contact_email'); // Ajuste conforme nome real das colunas
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
                case 'adminCoupons': renderCouponsTable(); break;
                case 'adminAffiliates': renderAffiliatesTable(); break;
                case 'adminLegal': loadLegalDocuments(); break; // Carrega documentos legais ao navegar
            }
        });
    });

    // --- LÓGICA DO DASHBOARD ---
    async function loadAdminDashboard() {
        console.log('[Admin] A carregar dados do dashboard...');
        // Oculta a lógica específica do dashboard para focar nas mudanças pedidas
        // ... (código do dashboard original) ...
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
        document.getElementById('legalDocumentsForm').addEventListener('submit', handleLegalDocsFormSubmit); // Listener para form legal

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

        setupAffiliateModal(); // Configura os listeners para a tabela de afiliados
        setupCouponModalListeners(); // Configura os listeners para a tabela de cupons
    }

    // --- INICIALIZAÇÃO DA PÁGINA ---
    await fetchPlansAndAffiliates();
    loadAdminDashboard(); // Carrega o dashboard por padrão
    setupModalListeners();
});
