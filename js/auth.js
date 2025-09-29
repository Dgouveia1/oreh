import { showToast, updateUserInfo, setupRoleBasedUI } from './ui.js'; 
import { initializeApp, fetchUserProfile, supabaseClient, logEvent } from './api.js';
import { getSubscriptionStatus, getSubscriptionPaymentUrl } from './asaasService.js'; // ✅ Adicionado getSubscriptionPaymentUrl

// Função para verificar e exibir o modal de assinatura em atraso
async function checkSubscriptionStatus(companyData) {
    if (!companyData.asaas_subscription_id) return;
    
    try {
        const subscription = await getSubscriptionStatus(companyData.asaas_subscription_id);
        
        // Verifica se o status é de atraso ou cancelamento
        if (subscription && (subscription.status === 'OVERDUE' || subscription.status === 'CANCELED')) {
            const modal = document.getElementById('overdueSubscriptionModal');
            const portalBtn = document.getElementById('asaasPortalBtn'); // ID do botão no modal
            
            if (modal) {
                // 1. Tenta obter o link da última fatura/invoice
                const paymentUrl = await getSubscriptionPaymentUrl(companyData.asaas_subscription_id);
                
                if (portalBtn) {
                     // 2. Se a URL da fatura for encontrada, usa ela. Senão, mantém o link para a página de finanças.
                    if (paymentUrl) {
                        portalBtn.onclick = () => window.open(paymentUrl, '_blank');
                        portalBtn.textContent = 'Pagar Fatura Pendente';
                    } else {
                        portalBtn.onclick = () => window.location.href='/finances'; // Volta para a página de finanças padrão
                        portalBtn.textContent = 'Gerir Assinatura';
                    }
                }
                
                modal.style.display = 'flex';
                logEvent('WARNING', `Assinatura em status de risco: ${subscription.status}`);
            }
        }
    } catch (error) {
        console.error('[Auth.js] Erro ao verificar status da assinatura no Asaas:', error);
        logEvent('ERROR', 'Falha ao checar status da assinatura', { errorMessage: error.message });
        // Continua o login mesmo com erro na API de pagamento.
    }
}


async function checkLoginState() {
    console.log('[Auth.js] Verificando estado do login...');
    const loginPage = document.getElementById('loginPage');
    const appContainer = document.getElementById('appContainer');

    const { data: { session } } = await supabaseClient.auth.getSession();

    if (session) {
        const userProfile = await fetchUserProfile();
        
        if (userProfile && userProfile.companies) {
            updateUserInfo(userProfile.full_name, userProfile.userinitial);
            setupRoleBasedUI(userProfile);

            // ✅ NOVA LÓGICA DE REDIRECIONAMENTO
            const companyStatus = userProfile.companies.status;
            console.log(`[Auth.js] Status da empresa: ${companyStatus}`);

            if (companyStatus === 'onboarding') {
                console.log('[Auth.js] Status é "onboarding". Redirecionando para /onboarding.html...');
                window.location.replace('onboarding.html');
                return; // Impede a execução do resto da função
            }
            
            // Para qualquer outro status ('active', 'payment_pending', etc), permite o acesso.
            console.log('[Auth.js] Acesso permitido. Mostrando a aplicação principal.');
            loginPage.style.display = 'none';
            appContainer.style.display = 'block';
            
            // ✅ REGRA DE NOTIFICAÇÃO DE ATRASO
            if (companyStatus === 'active' || companyStatus === 'payment_pending') {
                 await checkSubscriptionStatus(userProfile.companies);
            }
            
            await initializeApp();

        } else {
            console.warn('[Auth.js] Usuário logado mas sem empresa associada. Redirecionando para onboarding.');
            window.location.replace('onboarding.html');
        }

    } else {
        loginPage.style.display = 'flex';
        appContainer.style.display = 'none';
    }
}

async function login() {
    console.log('[OREH] A tentar iniciar sessão com o Supabase...');
    const emailInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const loginBtn = document.getElementById('loginBtn');

    loginBtn.disabled = true;
    loginBtn.textContent = 'A entrar...';

    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: emailInput.value,
            password: passwordInput.value,
        });

        if (error) {
            throw new Error(error.message || 'Utilizador ou palavra-passe inválidos.');
        }

        console.log('[OREH] Início de sessão bem-sucedido!');
        logEvent('INFO', `Login bem-sucedido para: ${emailInput.value}`);
        await checkLoginState();

    } catch (error) {
        console.error('[OREH] Falha no início de sessão:', error);
        showToast(error.message, 'error');
        logEvent('ERROR', `Falha no login para: ${emailInput.value}`, { errorMessage: error.message, stack: error.stack });
    } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Entrar';
    }
}

async function logout() {
    console.log('[OREH] A terminar sessão com o Supabase...');
    
    const userName = localStorage.getItem('oreh_userName') || 'usuário desconhecido';
    logEvent('INFO', `Logout realizado por: ${userName}`);
    
    const { error } = await supabaseClient.auth.signOut();

    if (error) {
        console.error('[OREH] Erro ao terminar sessão:', error);
        showToast('Erro ao sair da conta.', 'error');
        logEvent('ERROR', `Falha no logout para: ${userName}`, { errorMessage: error.message, stack: error.stack });
    }

    localStorage.removeItem('oreh_userName');
    localStorage.removeItem('oreh_userInitial');
    
    // Esconde o modal ao fazer logout
    const modal = document.getElementById('overdueSubscriptionModal');
    if (modal) modal.style.display = 'none';
    
    await checkLoginState();
}

async function signUp() {
    console.log('[OREH] A tentar criar nova conta e cliente Asaas via n8n...');
    const emailInput = document.getElementById('signUpEmail');
    const passwordInput = document.getElementById('signUpPassword');
    const passwordConfirmInput = document.getElementById('signUpPasswordConfirm');
    const fullNameInput = document.getElementById('signUpFullName');
    const cpfCnpjInput = document.getElementById('signUpCpfCnpj');
    const signUpBtn = document.getElementById('signUpBtn');

    if (passwordInput.value !== passwordConfirmInput.value) {
        showToast('As senhas não coincidem.', 'error');
        return;
    }

    signUpBtn.disabled = true;
    signUpBtn.textContent = 'A registar...';

    try {
        console.log('[OREH] Chamando webhook n8n para criar cliente Asaas...');
        const asaasResponse = await fetch('https://oreh-n8n.p7rc7g.easypanel.host/webhook/criar-cliente-asaas', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: fullNameInput.value,
                cpfCnpj: cpfCnpjInput.value.replace(/\D/g, '')
            })
        });

        const responseData = await asaasResponse.json();

        if (!asaasResponse.ok) {
            const errorMessage = responseData.errors?.[0]?.description || 'Ocorreu um erro no cadastro. Verifique seus dados.';
            throw new Error(errorMessage);
        }

        const asaasCustomerId = responseData.id;
        if (!asaasCustomerId) {
            throw new Error('Ocorreu um erro no cadastro. Verifique seus dados.');
        }
        console.log(`[OREH] Cliente Asaas criado com sucesso: ${asaasCustomerId}`);

        const { data, error } = await supabaseClient.auth.signUp({
            email: emailInput.value,
            password: passwordInput.value,
            options: {
                data: {
                    full_name: fullNameInput.value,
                    cpf_cnpj: cpfCnpjInput.value.replace(/\D/g, ''),
                    asaas_customer_id: asaasCustomerId
                }
            }
        });

        if (error) throw error;
        
        logEvent('INFO', `Nova conta criada para: ${emailInput.value} com Asaas ID: ${asaasCustomerId}`);
        showToast('Registo concluído! Verifique seu e-mail para confirmar a conta.', 'success');
        document.getElementById('signUpModal').style.display = 'none';
        document.getElementById('signUpForm').reset();

    } catch (error) {
        console.error('[OREH] Falha no registo:', error);
        showToast(error.message, 'error');
        
    } finally {
        signUpBtn.disabled = false;
        signUpBtn.textContent = 'Cadastrar';
    }
}


export { checkLoginState, login, logout, signUp };
