import { showToast, updateUserInfo, setupRoleBasedUI } from './ui.js';
import { initializeApp, fetchUserProfile, supabaseClient, logEvent } from './api.js';
import { getSubscriptionStatus, getSubscriptionPaymentUrl } from './asaasService.js'; // ✅ Adicionado getSubscriptionPaymentUrl

// Função para verificar e exibir o modal de assinatura em atraso
async function checkSubscriptionStatus(companyData) {
    // [MODIFICADO] Se não houver ID do Asaas E o status local não for 'overdue', não há o que fazer.
    if (!companyData.asaas_subscription_id && companyData.status !== 'overdue') return;

    let asaasStatus = null;
    let paymentUrl = null;

    try {
        // [MODIFICADO] Só tenta buscar na API se tiver um ID
        if (companyData.asaas_subscription_id) {
            const subscription = await getSubscriptionStatus(companyData.asaas_subscription_id);
            if (subscription) {
                asaasStatus = subscription.status;
            }
            // Tenta buscar a URL de pagamento de qualquer forma
            paymentUrl = await getSubscriptionPaymentUrl(companyData.asaas_subscription_id);
        }

        // [MODIFICADO] Lógica principal do modal
        // Mostra o modal se o status LOCAL for 'overdue' OU se o status da API (Asaas) for 'OVERDUE'
        const isOverdue = companyData.status === 'overdue';
        const isAsaasOverdue = asaasStatus && (asaasStatus === 'OVERDUE' || asaasStatus === 'CANCELED' || asaasStatus === 'PENDING');

        if (isOverdue || isAsaasOverdue) {
            const modal = document.getElementById('overdueSubscriptionModal');
            const portalBtn = document.getElementById('asaasPortalBtn');

            if (modal) {
                if (portalBtn) {
                    // Se a URL da fatura for encontrada, usa ela.
                    if (paymentUrl) {
                        portalBtn.onclick = () => window.open(paymentUrl, '_blank');
                        portalBtn.textContent = 'Pagar Fatura Pendente';
                    } else {
                        // ✅ CORREÇÃO: Fallback aponta para o portal do cliente Asaas, igual à página de finanças.
                        const portalLink = `https://www.asaas.com/portal/customers/${companyData.asaas_customer_id}`;
                        portalBtn.onclick = () => window.open(portalLink, '_blank');
                        portalBtn.textContent = 'Gerir Assinatura';
                    }
                }

                modal.style.display = 'flex';
                logEvent('WARNING', `Assinatura em status de risco: Local (${companyData.status}), Asaas (${asaasStatus})`);
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

            const companyStatus = userProfile.companies.status;
            console.log(`[Auth.js] Status da empresa: ${companyStatus}`);

            // [NOVO] Verificação de Conta Banida
            if (companyStatus === 'banned') {
                console.warn('[Auth.js] Conta banida. Acesso negado.');
                showToast('Esta conta foi suspensa. Entre em contato com o suporte.', 'error');
                logEvent('ERROR', `Tentativa de login bloqueada: Conta banida (Empresa: ${userProfile.companies.id})`);
                await supabaseClient.auth.signOut(); // Desloga o usuário
                loginPage.style.display = 'flex';
                appContainer.style.display = 'none';
                return; // Impede o acesso
            }

            // Para qualquer outro status ('active', 'payment_pending', etc), permite o acesso.
            console.log('[Auth.js] Acesso permitido. Mostrando a aplicação principal.');
            loginPage.style.display = 'none';
            appContainer.style.display = 'block';

            // [MODIFICADO] REGRA DE NOTIFICAÇÃO DE ATRASO
            // Inclui a verificação do status local 'overdue'
            if (companyStatus === 'active' || companyStatus === 'payment_pending' || companyStatus === 'overdue') {
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
    loginBtn.textContent = 'Acessando Oreh...';

    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: emailInput.value,
            password: passwordInput.value,
        });

        if (error) {
            throw new Error(error.message || 'E-mail ou senha inválidos.'); // Mensagem de erro mais clara
        }

        console.log('[OREH] Início de sessão bem-sucedido!');
        logEvent('INFO', `Login bem-sucedido para: ${emailInput.value}`);
        await checkLoginState(); // checkLoginState agora trata os status 'banned' e 'overdue'

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

// --- Funções de Redefinição de Senha ---

// Mostra o modal para inserir o email (ISSO É MANTIDO)
function showForgotPasswordModal() {
    const modal = document.getElementById('forgotPasswordModal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

// Lida com o envio do link de redefinição (ISSO É MANTIDO)
async function handleForgotPassword(event) {
    event.preventDefault();
    const emailInput = document.getElementById('forgotPasswordEmail');
    const sendBtn = document.getElementById('sendResetLinkBtn');
    const email = emailInput.value;

    if (!email) {
        showToast('Por favor, digite seu e-mail.', 'error');
        return;
    }

    sendBtn.disabled = true;
    sendBtn.textContent = 'Enviando...';

    try {
        // A URL para onde o usuário será redirecionado APÓS clicar no link do e-mail.
        // O Supabase adicionará automaticamente os tokens necessários.
        const redirectUrl = window.location.origin + window.location.pathname; // Redireciona para a própria página de login

        const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
            redirectTo: redirectUrl,
        });

        if (error) throw error;

        showToast('Link de redefinição enviado! Verifique seu e-mail (incluindo spam).', 'success');
        document.getElementById('forgotPasswordModal').style.display = 'none';
        emailInput.value = ''; // Limpa o campo

    } catch (error) {
        console.error('[Auth.js] Erro ao enviar link de redefinição:', error);
        showToast(`Erro: ${error.message}`, 'error');
        logEvent('ERROR', `Falha ao enviar reset de senha para: ${email}`, { errorMessage: error.message });
    } finally {
        sendBtn.disabled = false;
        sendBtn.textContent = 'Enviar Link';
    }
}

// Exporta as funções
export { checkLoginState, login, logout, signUp, showForgotPasswordModal, handleForgotPassword };