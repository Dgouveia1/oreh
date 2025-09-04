import { showToast, updateUserInfo, setupRoleBasedUI } from './ui.js'; 
import { initializeApp, fetchUserProfile, supabaseClient, logEvent } from './api.js';

async function checkLoginState() {
    console.log('[OREH] A verificar o estado da sessão com o Supabase...');
    const loginPage = document.getElementById('loginPage');
    const appContainer = document.getElementById('appContainer');

    const { data: { session } } = await supabaseClient.auth.getSession();

    if (session) {
        loginPage.style.display = 'none';
        appContainer.style.display = 'block';

        const userProfile = await fetchUserProfile();
        
        if (userProfile) {
            const { full_name, userinitial, role } = userProfile;
            
            localStorage.setItem('oreh_userName', full_name || 'Utilizador');
            localStorage.setItem('oreh_userInitial', userinitial || '?');
            updateUserInfo(full_name, userinitial);

            setupRoleBasedUI(userProfile);
        }
        
        await initializeApp();

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
        // ✅ LOG DE SUCESSO
        logEvent('INFO', `Login bem-sucedido para: ${emailInput.value}`);
        await checkLoginState();

    } catch (error) {
        console.error('[OREH] Falha no início de sessão:', error);
        showToast(error.message, 'error');
        // ✅ LOG DE ERRO
        logEvent('ERROR', `Falha no login para: ${emailInput.value}`, { errorMessage: error.message, stack: error.stack });
    } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Entrar';
    }
}

async function logout() {
    console.log('[OREH] A terminar sessão com o Supabase...');
    
    const userName = localStorage.getItem('oreh_userName') || 'usuário desconhecido';
    // ✅ LOG DE INFO
    logEvent('INFO', `Logout realizado por: ${userName}`);
    
    const { error } = await supabaseClient.auth.signOut();

    if (error) {
        console.error('[OREH] Erro ao terminar sessão:', error);
        showToast('Erro ao sair da conta.', 'error');
        // ✅ LOG DE ERRO
        logEvent('ERROR', `Falha no logout para: ${userName}`, { errorMessage: error.message, stack: error.stack });
    }

    localStorage.removeItem('oreh_userName');
    localStorage.removeItem('oreh_userInitial');
    
    await checkLoginState();
}

 async function signUp() {
    console.log('[OREH] A tentar criar nova conta...');
    const emailInput = document.getElementById('signUpEmail');
    const passwordInput = document.getElementById('signUpPassword');
    const passwordConfirmInput = document.getElementById('signUpPasswordConfirm');
    const signUpBtn = document.getElementById('signUpBtn');

    if (passwordInput.value !== passwordConfirmInput.value) {
        showToast('As senhas não coincidem.', 'error');
        return;
    }

    signUpBtn.disabled = true;
    signUpBtn.textContent = 'A registar...';

    try {
        const { data, error } = await supabaseClient.auth.signUp({
            email: emailInput.value,
            password: passwordInput.value,
        });

        if (error) throw error;
        
        // ✅ LOG DE SUCESSO
        logEvent('INFO', `Nova conta criada para: ${emailInput.value}`);

        if (data.user && data.user.identities && data.user.identities.length > 0) {
             showToast('Registo concluído! Faça o login para continuar.', 'success');
             document.getElementById('signUpModal').style.display = 'none';
             document.getElementById('signUpForm').reset();
        } else {
             showToast('Registo concluído! Por favor, verifique o seu e-mail para confirmar a conta.', 'success');
             document.getElementById('signUpModal').style.display = 'none';
             document.getElementById('signUpForm').reset();
        }

    } catch (error) {
        console.error('[OREH] Falha no registo:', error);
        showToast(error.message, 'error');
        // ✅ LOG DE ERRO
        logEvent('ERROR', `Falha ao criar conta para: ${emailInput.value}`, { errorMessage: error.message, stack: error.stack });
    } finally {
        signUpBtn.disabled = false;
        signUpBtn.textContent = 'Cadastrar';
    }
}

export { checkLoginState, login, logout, signUp };