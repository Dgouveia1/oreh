import { showToast, updateUserInfo } from './ui.js';
// ✅ ALTERADO AQUI: importamos 'supabaseClient'
import { initializeApp, fetchUserProfile, supabaseClient } from './api.js';

async function checkLoginState() {
    console.log('[OREH] A verificar o estado da sessão com o Supabase...');
    const loginPage = document.getElementById('loginPage');
    const appContainer = document.getElementById('appContainer');

    // ✅ ALTERADO AQUI
    const { data: { session } } = await supabaseClient.auth.getSession();

    if (session) {
        loginPage.style.display = 'none';
        appContainer.style.display = 'block';

        const cachedName = localStorage.getItem('oreh_userName');
        const cachedInitial = localStorage.getItem('oreh_userInitial');
        if (cachedName && cachedInitial) {
            updateUserInfo(cachedName, cachedInitial);
        }

        const userProfileResponse = await fetchUserProfile();
        
        if (userProfileResponse && userProfileResponse.length > 0) {
            const userProfile = userProfileResponse[0];
            const userName = userProfile.full_name;
            const userInitial = userProfile.userinitial;

            if (userName && userInitial) {
                localStorage.setItem('oreh_userName', userName);
                localStorage.setItem('oreh_userInitial', userInitial);
                updateUserInfo(userName, userInitial);
            }
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
        // ✅ ALTERADO AQUI
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: emailInput.value,
            password: passwordInput.value,
        });

        if (error) {
            throw new Error(error.message || 'Utilizador ou palavra-passe inválidos.');
        }

        console.log('[OREH] Início de sessão bem-sucedido!');
        await checkLoginState();

    } catch (error) {
        console.error('[OREH] Falha no início de sessão:', error);
        showToast(error.message, 'error');
    } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Entrar';
    }
}

async function logout() {
    console.log('[OREH] A terminar sessão com o Supabase...');
    
    // ✅ ALTERADO AQUI
    const { error } = await supabaseClient.auth.signOut();

    if (error) {
        console.error('[OREH] Erro ao terminar sessão:', error);
        showToast('Erro ao sair da conta.', 'error');
    }

    localStorage.removeItem('oreh_userName');
    localStorage.removeItem('oreh_userInitial');
    
    await checkLoginState();
}

export { checkLoginState, login, logout };