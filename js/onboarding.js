import { supabaseClient } from './api.js';
import { createCustomer, createSubscription, getSubscriptionPaymentUrl, getSubscriptionStatus } from './asaasService.js';

document.addEventListener('DOMContentLoaded', () => {
    
    let currentStep = 'welcome';
    let onboardingState = {
        user: null,
        company: null,
    };

    function showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        if (toast) {
            toast.textContent = message;
            toast.className = `toast ${type} show`;
            setTimeout(() => {
                toast.className = toast.className.replace('show', '');
            }, 3000);
        }
    }

    function renderWelcomeStep() {
        console.log('[DEBUG] Renderizando etapa: welcome');
        const stepContainer = document.getElementById('stepContainer');
        if (!stepContainer) return;
        stepContainer.innerHTML = `
            <div class="step-content active">
                <h2>Bem-vindo ao Oreh!</h2>
                <p>Vamos configurar sua conta em poucas etapas. Primeiro, crie seu acesso.</p>
                <div class="input-group">
                    <label for="email">Seu melhor e-mail</label>
                    <input type="email" id="email" required autocomplete="email">
                </div>
                <div class="input-group">
                    <label for="password">Crie uma senha</label>
                    <input type="password" id="password" required autocomplete="new-password">
                </div>
                <div class="input-group">
                    <label for="passwordConfirm">Confirme sua senha</label>
                    <input type="password" id="passwordConfirm" required autocomplete="new-password">
                </div>
                <button id="nextBtn" class="btn btn-primary">Começar</button>
            </div>
        `;
        document.getElementById('nextBtn').addEventListener('click', handleCreateAccount);
    }

    function renderPersonalDataStep() {
        console.log('[DEBUG] Renderizando etapa: personal-data');
        const stepContainer = document.getElementById('stepContainer');
        if (!stepContainer) return;
        stepContainer.innerHTML = `
            <div class="step-content active">
                <h2>Ótimo! Agora, alguns dados sobre você.</h2>
                <p>Usaremos essas informações para criar sua conta de pagamentos de forma segura.</p>
                <div class="input-group">
                    <label for="fullName">Nome Completo</label>
                    <input type="text" id="fullName" required>
                </div>
                <div class="input-group">
                    <label for="cpfCnpj">CPF ou CNPJ</label>
                    <input type="text" id="cpfCnpj" required>
                </div>
                 <div class="input-group">
                    <label for="phone">Seu Telefone com DDD</label>
                    <input type="tel" id="phone" required>
                </div>
                <button id="nextBtn" class="btn btn-primary">Salvar e Continuar</button>
            </div>
        `;
        document.getElementById('nextBtn').addEventListener('click', handleSavePersonalData);
    }

    function renderAiConfigStep() {
        console.log('[DEBUG] Renderizando etapa: ai-config');
        const stepContainer = document.getElementById('stepContainer');
        if (!stepContainer) return;
        stepContainer.innerHTML = `
            <div class="step-content active">
                <h2>Vamos dar uma personalidade à sua IA!</h2>
                <p>Esta é a parte divertida. As respostas aqui definem como seu assistente virtual irá se comportar. Lembre-se, ele é um reflexo da sua marca.</p>
                <div class="input-group">
                    <label for="agentFunction">Qual a principal função do seu assistente?</label>
                    <input type="text" id="agentFunction" placeholder="Ex: Vendedor, Suporte, Agendamentos">
                </div>
                 <div class="input-group">
                    <label for="personalityStyle">Qual deve ser o estilo de comportamento dele?</label>
                    <input type="text" id="personalityStyle" placeholder="Ex: Amigável e prestativo, formal e direto">
                </div>
                <div class="input-group">
                    <label for="basePrompt">Instruções Base</label>
                    <textarea id="basePrompt" rows="5" placeholder="Descreva em poucas palavras o que sua empresa faz e como a IA deve se apresentar. Ex: 'Você é um assistente da Pizzaria do Zé...'"></textarea>
                </div>
                <button id="nextBtn" class="btn btn-primary">Próxima Etapa</button>
            </div>
        `;
        document.getElementById('nextBtn').addEventListener('click', handleSaveAiConfig);
    }

    function renderBusinessQuestionsStep() {
        console.log('[DEBUG] Renderizando etapa: business-questions');
        const stepContainer = document.getElementById('stepContainer');
        if (!stepContainer) return;
        stepContainer.innerHTML = `
            <div class="step-content active">
                <h2>Só mais um pouco sobre o seu negócio...</h2>
                <p>Isso nos ajuda a entender suas necessidades e a evoluir o Oreh para você.</p>
                 <div class="input-group">
                    <label for="companyAddress">Qual o endereço da sua empresa? (se aplicável)</label>
                    <input type="text" id="companyAddress">
                </div>
                <div class="input-group">
                    <label for="socialMedia">Quais suas redes sociais? (Instagram, Site, etc.)</label>
                    <input type="text" id="socialMedia" placeholder="cole os links aqui">
                </div>
                <button id="nextBtn" class="btn btn-primary">Finalizar Configuração</button>
            </div>
        `;
        document.getElementById('nextBtn').addEventListener('click', handleSaveBusinessQuestions);
    }

    async function renderPlansStep() {
        console.log('[DEBUG] Renderizando etapa: plans');
        const stepContainer = document.getElementById('stepContainer');
        if (!stepContainer) return;

        stepContainer.innerHTML = `
            <div class="step-content active">
                <h2>Escolha o plano que melhor se encaixa no seu negócio.</h2>
                <p>Todos os planos começam com um período de 7 dias para você testar. A cobrança só virá após esse período.</p>
                <div class="plans-grid" id="plansGridContainer">
                    <p class="loading-message">Carregando planos...</p>
                </div>
            </div>
        `;

        try {
            const { data: plans, error } = await supabaseClient
                .from('plans')
                .select('*')
                .order('price', { ascending: true });

            if (error) throw error;

            const plansGridContainer = document.getElementById('plansGridContainer');
            if (!plansGridContainer) return;

            if (plans && plans.length > 0) {
                plansGridContainer.innerHTML = ''; 
                plans.forEach(plan => {
                    const planCard = document.createElement('div');
                    planCard.className = 'plan-card';
                    planCard.dataset.planId = plan.id;
                    planCard.dataset.planName = plan.name;
                    planCard.dataset.planValue = plan.price;

                    planCard.innerHTML = `
                        <h4>${plan.name}</h4>
                        <div class="price">R$ ${parseFloat(plan.price).toFixed(2).replace('.', ',')}<span>/mês</span></div>
                        <p>${plan.description || 'Descrição do plano...'}</p>
                        <button class="btn btn-primary">Selecionar Plano</button>
                    `;
                    plansGridContainer.appendChild(planCard);
                });

                plansGridContainer.querySelectorAll('.plan-card button').forEach(button => {
                    button.addEventListener('click', (e) => {
                        const card = e.target.closest('.plan-card');
                        const { planId, planName, planValue } = card.dataset;
                        handleSelectPlan(planId, planName, planValue);
                    });
                });
            } else {
                plansGridContainer.innerHTML = '<p class="loading-message">Nenhum plano disponível encontrado.</p>';
            }

        } catch (error) {
            console.error('Erro ao carregar planos:', error);
            showToast('Não foi possível carregar os planos.', 'error');
            const plansGridContainer = document.getElementById('plansGridContainer');
            if (plansGridContainer) {
                plansGridContainer.innerHTML = `<p class="loading-message error">Erro ao carregar planos.</p>`;
            }
        }
    }
    
    function renderPaymentPendingStep() {
        console.log('[DEBUG] Renderizando etapa: payment-pending');
        const stepContainer = document.getElementById('stepContainer');
        if (!stepContainer) return;
        stepContainer.innerHTML = `
            <div class="step-content active">
                <h2>Quase lá!</h2>
                <p>O pagamento da sua assinatura foi aberta em uma nova guia</p>
                <p>Liberado seu periodo de teste</p>
                <p>Já pode começar a usar o Oreh</p>
                <button id="checkPaymentBtn" class="btn btn-primary">Verificar Status da Assinatura</button>
                <button id="logoutBtn" class="btn btn-secondary" style="margin-top: 10px;">Acessar o painel com 7 dias de teste</button>
            </div>
        `;
        document.getElementById('checkPaymentBtn').addEventListener('click', handleCheckPaymentStatus);
        document.getElementById('logoutBtn').addEventListener('click', () => supabaseClient.auth.signOut().then(() => window.location.href = 'index.html'));
    }

    function renderStep(step) {
        console.log(`[DEBUG] Chamando renderStep para: ${step}`);
        currentStep = step;
        switch (step) {
            case 'welcome': renderWelcomeStep(); break;
            case 'personal-data': renderPersonalDataStep(); break;
            case 'ai-config': renderAiConfigStep(); break;
            case 'business-questions': renderBusinessQuestionsStep(); break;
            case 'plans': renderPlansStep(); break;
            case 'payment-pending': renderPaymentPendingStep(); break;
            default: renderWelcomeStep();
        }
    }

    async function handleCreateAccount() {
        console.log('[DEBUG] handleCreateAccount iniciado.');
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const passwordConfirm = document.getElementById('passwordConfirm').value;

        if (password !== passwordConfirm) {
            return showToast('As senhas não coincidem.', 'error');
        }
        showToast('Criando sua conta, aguarde...', 'info');

        try {
            const { data, error } = await supabaseClient.auth.signUp({ email, password });
            if (error) throw error;
            console.log('[DEBUG] Conta criada no Supabase Auth.');
            
            const { data: loginData, error: loginError } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (loginError) throw loginError;
            console.log('[DEBUG] Login automático realizado com sucesso.');
            
            onboardingState.user = loginData.user;
            renderStep('personal-data');

        } catch (error) {
            console.error('Erro ao criar conta:', error);
            showToast(error.message, 'error');
        }
    }

    async function handleSavePersonalData() {
        console.log('[DEBUG] handleSavePersonalData iniciado.');
        const fullName = document.getElementById('fullName').value;
        const cpfCnpj = document.getElementById('cpfCnpj').value;
        const phone = document.getElementById('phone').value;

        if (!fullName || !cpfCnpj) return showToast('Por favor, preencha todos os campos.', 'error');
        showToast('Salvando seus dados...', 'info');
        
        try {
            const customer = await createCustomer(fullName, cpfCnpj);
            console.log('[DEBUG] Cliente Asaas criado:', customer);
            
            const { data: companyData, error: companyError } = await supabaseClient.from('companies').select('*').single();
            if (companyError) throw companyError;
            console.log('[DEBUG] Empresa encontrada no Supabase:', companyData);
            
            const { data: updatedCompany, error: updateError } = await supabaseClient
                .from('companies')
                .update({
                    name: `${fullName}'s Company`,
                    official_name: fullName,
                    cnpj: cpfCnpj,
                    phone: phone,
                    asaas_customer_id: customer.id
                })
                .eq('id', companyData.id)
                .select()
                .single();

            if (updateError) throw updateError;
            console.log('[DEBUG] Empresa atualizada com sucesso:', updatedCompany);
            onboardingState.company = updatedCompany;
            renderStep('ai-config');

        } catch (error) {
            console.error('Erro ao salvar dados pessoais:', error);
            showToast(error.message, 'error');
        }
    }

    async function handleSaveAiConfig() {
        console.log('[DEBUG] handleSaveAiConfig iniciado.');
        const agentFunction = document.getElementById('agentFunction').value;
        const personalityStyle = document.getElementById('personalityStyle').value;
        const basePrompt = document.getElementById('basePrompt').value;

        showToast('Salvando configurações da IA...', 'info');
        
        try {
            const { error } = await supabaseClient
                .from('company_secrets')
                .update({
                    ai_agent_function: agentFunction,
                    ai_personality_style: personalityStyle,
                    base_prompt: basePrompt
                })
                .eq('company_id', onboardingState.company.id);

            if (error) throw error;
            console.log('[DEBUG] Configurações de IA salvas.');
            renderStep('business-questions');

        } catch (error) {
            console.error('Erro ao salvar config da IA:', error);
            showToast(error.message, 'error');
        }
    }

    async function handleSaveBusinessQuestions() {
        console.log('[DEBUG] handleSaveBusinessQuestions iniciado.');
        const companyAddress = document.getElementById('companyAddress').value;
        const socialMedia = document.getElementById('socialMedia').value;
        
        showToast('Quase lá...', 'info');

        try {
            const { error } = await supabaseClient
                .from('onboarding_data')
                .insert({
                    company_id: onboardingState.company.id,
                    responses: { companyAddress, socialMedia }
                });
            
            if (error) throw error;
            console.log('[DEBUG] Perguntas de negócio salvas.');
            renderStep('plans');

        } catch (error) {
            console.error('Erro ao salvar perguntas de negócio:', error);
            showToast(error.message, 'error');
        }
    }

    async function handleSelectPlan(planId, planName, planValue) {
        console.log(`[DEBUG] handleSelectPlan iniciado para o plano: ${planName}`);
        showToast('Criando sua assinatura, aguarde...', 'info');
        try {
            const companyId = onboardingState.company.id;
            const asaasCustomerId = onboardingState.company.asaas_customer_id;

            const subscription = await createSubscription(asaasCustomerId, planValue, planName);
            console.log('[DEBUG] Assinatura Asaas criada:', subscription);
            
            await supabaseClient.from('companies').update({
                asaas_subscription_id: subscription.id,
                plan_id: planId
            }).eq('id', companyId);
            console.log('[DEBUG] ID da assinatura salvo no Supabase.');

            const paymentUrl = await getSubscriptionPaymentUrl(subscription.id);
            if (!paymentUrl) throw new Error("Não foi possível obter o link de pagamento.");
            console.log('[DEBUG] URL de pagamento obtida:', paymentUrl);
            
            await supabaseClient.from('companies').update({ status: 'payment_pending' }).eq('id', companyId);
            console.log('[DEBUG] Status da empresa atualizado para "payment_pending".');

            window.open(paymentUrl, '_blank');
            renderStep('payment-pending');

        } catch (error) {
            console.error('Erro ao selecionar plano:', error);
            showToast(`Erro: ${error.message}`, 'error');
        }
    }

    async function handleCheckPaymentStatus() {
        console.log('[DEBUG] handleCheckPaymentStatus iniciado.');
        showToast('Verificando status da assinatura...', 'info');
        try {
            if (!onboardingState.company || !onboardingState.company.asaas_subscription_id) {
                throw new Error('ID da assinatura não encontrado.');
            }

            const subscription = await getSubscriptionStatus(onboardingState.company.asaas_subscription_id);
            console.log('[DEBUG] Status da assinatura recebido do Asaas:', subscription);
            
            if (subscription.status === 'ACTIVE') {
                showToast('Pagamento confirmado! Bem-vindo!', 'success');
                
                await supabaseClient.from('companies').update({ status: 'active' }).eq('id', onboardingState.company.id);
                console.log('[DEBUG] Status da empresa atualizado para "active". Redirecionando...');
                window.location.replace('index.html');

            } else {
                showToast(`O status da sua assinatura é: ${subscription.status}. O pagamento ainda está pendente.`, 'info');
            }

        } catch (error) {
            console.error('Erro ao verificar status do pagamento:', error);
            showToast(error.message, 'error');
        }
    }

    async function initializeOnboardingState() {
        console.log('[DEBUG] initializeOnboardingState iniciado.');
        const { data: { session } } = await supabaseClient.auth.getSession();
        
        if (session) {
            console.log('[DEBUG] Sessão encontrada para o usuário:', session.user.id);
            onboardingState.user = session.user;
            
            const { data, error } = await supabaseClient.from('companies').select('*').single();

            if (error) {
                console.error('[DEBUG] Erro ao buscar empresa:', error.message);
                renderStep('personal-data');
                return;
            }

            if (data) {
                console.log('[DEBUG] Dados da empresa encontrados:', data);
                onboardingState.company = data;

                if (data.status === 'active') {
                    console.log('[DEBUG] Usuário ativo. Redirecionando...');
                    window.location.replace('index.html');
                    return; 
                }

                if (data.status === 'payment_pending') {
                     console.log('[DEBUG] Status "payment_pending". Renderizando etapa de pagamento.');
                     renderStep('payment-pending');
                     return;
                }

                if (!data.asaas_customer_id) {
                    console.log('[DEBUG] asaas_customer_id não encontrado. Renderizando etapa de dados pessoais.');
                    renderStep('personal-data');
                } else {
                    console.log('[DEBUG] asaas_customer_id encontrado. Renderizando etapa de config da IA.');
                    renderStep('ai-config');
                }
            } else {
                 console.log('[DEBUG] Nenhum dado de empresa retornado. Renderizando etapa de dados pessoais.');
                 renderStep('personal-data');
            }
        } else {
            console.log('[DEBUG] Nenhuma sessão encontrada. Renderizando etapa de boas-vindas.');
            renderStep('welcome');
        }
    }

    initializeOnboardingState();
});

