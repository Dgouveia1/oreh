import { supabaseClient } from './api.js';
import { createCustomer, createSubscription, getSubscriptionPaymentUrl, getSubscriptionStatus } from './asaasService.js';

document.addEventListener('DOMContentLoaded', () => {
    
    let currentStep = 'welcome';
    let onboardingState = {
        user: null,
        company: null,
        appliedCoupon: null // Armazena os dados do cupom válido
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

    // --- FUNÇÕES DE LÓGICA DE CUPOM ---

    async function applyCoupon() {
        const codeInput = document.getElementById('couponCode');
        const feedbackEl = document.getElementById('couponFeedback');
        const applyBtn = document.getElementById('applyCouponBtn');
        const code = codeInput.value.trim().toUpperCase();

        if (!code) {
            showToast('Por favor, insira um código de cupom.', 'error');
            return;
        }

        applyBtn.disabled = true;
        applyBtn.textContent = 'Verificando...';
        feedbackEl.textContent = '';
        onboardingState.appliedCoupon = null; // Reseta o cupom anterior
        resetPlanPrices(); // Volta os preços para o original

        try {
            const { data: result, error } = await supabaseClient.rpc('validate_coupon', { coupon_code: code });

            if (error) throw error;
            if (result.error) throw new Error(result.error);
            
            onboardingState.appliedCoupon = result;
            showToast('Cupom aplicado com sucesso!', 'success');
            feedbackEl.textContent = `Cupom "${result.code}" aplicado!`;
            feedbackEl.style.color = 'var(--success)';
            updatePlanPrices();

        } catch (e) {
            showToast(e.message, 'error');
            feedbackEl.textContent = e.message;
            feedbackEl.style.color = 'var(--danger)';
        } finally {
            applyBtn.disabled = false;
            applyBtn.textContent = 'Aplicar';
        }
    }

    function updatePlanPrices() {
        const coupon = onboardingState.appliedCoupon;
        if (!coupon) return;

        document.querySelectorAll('.plan-card').forEach(card => {
            const planId = card.dataset.planId;
            const originalPrice = parseFloat(card.dataset.planOriginalValue);
            const priceEl = card.querySelector('.price');

            if (coupon.applicable_plan_id && coupon.applicable_plan_id !== planId) {
                return; // Cupom não se aplica a este plano
            }

            let newPrice = originalPrice;
            if (coupon.discount_type === 'percentage') {
                newPrice = originalPrice * (1 - coupon.discount_value / 100);
            } else { // 'fixed'
                newPrice = originalPrice - coupon.discount_value;
            }

            newPrice = Math.max(0.01, newPrice); // Preço mínimo de 1 centavo

            priceEl.innerHTML = `
                <span style="text-decoration: line-through; color: var(--text-color-light); font-size: 2rem;">R$ ${originalPrice.toFixed(2).replace('.', ',')}</span>
                R$ ${newPrice.toFixed(2).replace('.', ',')}<span>/mês</span>
            `;
        });
    }

    function resetPlanPrices() {
        document.querySelectorAll('.plan-card').forEach(card => {
            const originalPrice = parseFloat(card.dataset.planOriginalValue);
            const priceEl = card.querySelector('.price');
            if (priceEl) {
                priceEl.innerHTML = `R$ ${originalPrice.toFixed(2).replace('.', ',')}<span>/mês</span>`;
            }
        });
    }


    // --- FUNÇÕES DE RENDERIZAÇÃO DAS ETAPAS ---

    function renderWelcomeStep() {
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
        const stepContainer = document.getElementById('stepContainer');
        if (!stepContainer) return;

        stepContainer.innerHTML = `
            <div class="step-content active">
                <h2>Escolha o plano que melhor se encaixa no seu negócio.</h2>
                <p>Todos os planos começam com um período de 7 dias para você testar. A cobrança só virá após esse período.</p>
                <div class="coupon-section" style="margin-bottom: 2.5rem; background-color: var(--bg-color); padding: 2rem; border-radius: 1.2rem; border: 1px solid var(--border-color);">
                    <label for="couponCode" style="font-weight: 600; display: block; margin-bottom: 1rem;">Tem um cupom de desconto?</label>
                    <div style="display: flex; gap: 1rem;">
                        <input type="text" id="couponCode" placeholder="Insira o código" style="flex-grow: 1; margin:0; padding: 1.2rem 1.6rem; border-radius: 0.8rem; text-transform: uppercase;">
                        <button id="applyCouponBtn" class="btn btn-secondary" style="padding: 1.2rem 2rem; margin:0; white-space: nowrap;">Aplicar</button>
                    </div>
                    <p id="couponFeedback" style="font-size: 1.4rem; margin-top: 1rem; font-weight: 500;"></p>
                </div>
                <div class="plans-grid" id="plansGridContainer">
                    <p class="loading-message">Carregando planos...</p>
                </div>
            </div>
        `;

        document.getElementById('applyCouponBtn').addEventListener('click', applyCoupon);

        try {
            const { data: plans, error } = await supabaseClient.from('plans').select('*').order('price', { ascending: true });
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
                    planCard.dataset.planOriginalValue = plan.price;

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
        const stepContainer = document.getElementById('stepContainer');
        if (!stepContainer) return;
        stepContainer.innerHTML = `
            <div class="step-content active">
                <h2>Quase lá!</h2>
                <p>Sua assinatura foi criada e o link de pagamento aberto em uma nova aba.</p>
                <p>Enquanto isso, você já tem <strong>7 dias de teste grátis</strong> para explorar a plataforma!</p>
                <button id="goToAppBtn" class="btn btn-primary">Acessar o painel Oreh</button>
            </div>
        `;
        document.getElementById('goToAppBtn').addEventListener('click', () => {
             supabaseClient.auth.signOut().then(() => window.location.href = 'index.html');
        });
    }

    // --- FUNÇÕES DE CONTROLE DE FLUXO ---
    
    function renderStep(step) {
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
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const passwordConfirm = document.getElementById('passwordConfirm').value;

        if (password !== passwordConfirm) return showToast('As senhas não coincidem.', 'error');
        showToast('Criando sua conta, aguarde...', 'info');

        try {
            const { data, error } = await supabaseClient.auth.signUp({ email, password });
            if (error) throw error;
            
            const { data: loginData, error: loginError } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (loginError) throw loginError;
            
            onboardingState.user = loginData.user;
            renderStep('personal-data');
        } catch (error) {
            console.error('Erro ao criar conta:', error);
            showToast(error.message, 'error');
        }
    }

    async function handleSavePersonalData() {
        const fullName = document.getElementById('fullName').value;
        const cpfCnpj = document.getElementById('cpfCnpj').value;
        const phone = document.getElementById('phone').value;

        if (!fullName || !cpfCnpj) return showToast('Por favor, preencha todos os campos.', 'error');
        showToast('Salvando seus dados...', 'info');
        
        try {
            const customer = await createCustomer(fullName, cpfCnpj);
            const { data: companyData, error: companyError } = await supabaseClient.from('companies').select('*').single();
            if (companyError) throw companyError;
            
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
            onboardingState.company = updatedCompany;
            renderStep('ai-config');
        } catch (error) {
            console.error('Erro ao salvar dados pessoais:', error);
            showToast(error.message, 'error');
        }
    }

    async function handleSaveAiConfig() {
        const agentFunction = document.getElementById('agentFunction').value;
        const personalityStyle = document.getElementById('personalityStyle').value;
        const basePrompt = document.getElementById('basePrompt').value;
        showToast('Salvando configurações da IA...', 'info');
        try {
            const { error } = await supabaseClient.from('company_secrets').update({
                ai_agent_function: agentFunction,
                ai_personality_style: personalityStyle,
                base_prompt: basePrompt
            }).eq('company_id', onboardingState.company.id);
            if (error) throw error;
            renderStep('business-questions');
        } catch (error) {
            console.error('Erro ao salvar config da IA:', error);
            showToast(error.message, 'error');
        }
    }

    async function handleSaveBusinessQuestions() {
        const companyAddress = document.getElementById('companyAddress').value;
        const socialMedia = document.getElementById('socialMedia').value;
        showToast('Quase lá...', 'info');
        try {
            const { error } = await supabaseClient.from('onboarding_data').insert({
                company_id: onboardingState.company.id,
                responses: { companyAddress, socialMedia }
            });
            if (error) throw error;
            renderStep('plans');
        } catch (error) {
            console.error('Erro ao salvar perguntas de negócio:', error);
            showToast(error.message, 'error');
        }
    }

    async function handleSelectPlan(planId, planName, planValue) {
        let finalValue = parseFloat(planValue);
        const coupon = onboardingState.appliedCoupon;
        const card = document.querySelector(`.plan-card[data-plan-id="${planId}"]`);
        
        if (card) {
            const originalPrice = parseFloat(card.dataset.planOriginalValue);
             if (coupon && (!coupon.applicable_plan_id || coupon.applicable_plan_id === planId)) {
                if (coupon.discount_type === 'percentage') {
                    finalValue = originalPrice * (1 - coupon.discount_value / 100);
                } else { // fixed
                    finalValue = originalPrice - coupon.discount_value;
                }
                finalValue = Math.max(0.01, finalValue);
            } else {
                finalValue = originalPrice;
            }
        }
        
        showToast('Criando sua assinatura, aguarde...', 'info');
        try {
            const companyId = onboardingState.company.id;
            const asaasCustomerId = onboardingState.company.asaas_customer_id;

            const description = coupon ? `${planName} (Cupom: ${coupon.code})` : planName;
            const subscription = await createSubscription(asaasCustomerId, finalValue, description);
            
            // Prepara os dados para a atualização da empresa
            const companyUpdateData = {
                asaas_subscription_id: subscription.id,
                plan_id: planId
            };
    
            // Se um cupom foi aplicado, adiciona seu ID aos dados de atualização
            if (coupon) {
                companyUpdateData.used_coupon_id = coupon.id;
            }

            await supabaseClient.from('companies').update(companyUpdateData).eq('id', companyId);

            if (coupon) {
                const { error: incrementError } = await supabaseClient.rpc('increment_coupon_usage', { p_coupon_id: coupon.id });
                if(incrementError) {
                    console.error('Falha ao incrementar o uso do cupom:', incrementError);
                }
            }

            const paymentUrl = await getSubscriptionPaymentUrl(subscription.id);
            if (!paymentUrl) throw new Error("Não foi possível obter o link de pagamento.");
            
            await supabaseClient.from('companies').update({ status: 'payment_pending' }).eq('id', companyId);

            window.open(paymentUrl, '_blank');
            renderStep('payment-pending');
        } catch (error) {
            console.error('Erro ao selecionar plano:', error);
            showToast(`Erro: ${error.message}`, 'error');
        }
    }
    
    async function handleCheckPaymentStatus() {
        showToast('Verificando status da assinatura...', 'info');
        try {
            if (!onboardingState.company || !onboardingState.company.asaas_subscription_id) {
                throw new Error('ID da assinatura não encontrado.');
            }

            const subscription = await getSubscriptionStatus(onboardingState.company.asaas_subscription_id);
            
            if (subscription.status === 'ACTIVE') {
                showToast('Pagamento confirmado! Bem-vindo!', 'success');
                
                await supabaseClient.from('companies').update({ status: 'active' }).eq('id', onboardingState.company.id);
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
        const { data: { session } } = await supabaseClient.auth.getSession();
        
        if (session) {
            onboardingState.user = session.user;
            
            const { data, error } = await supabaseClient.from('companies').select('*').single();

            if (error) {
                renderStep('personal-data');
                return;
            }

            if (data) {
                onboardingState.company = data;

                if (data.status === 'active') {
                    window.location.replace('index.html');
                    return; 
                }

                if (data.status === 'payment_pending') {
                     renderStep('payment-pending');
                     return;
                }

                if (!data.asaas_customer_id) {
                    renderStep('personal-data');
                } else {
                    renderStep('ai-config');
                }
            } else {
                 renderStep('personal-data');
            }
        } else {
            renderStep('welcome');
        }
    }

    initializeOnboardingState();
});

