import { logout } from './auth.js';
import { showToast } from './ui.js';

const N8N_CONFIG_URL = 'https://webhook.ia-tess.com.br/webhook/config/webhooks'; 
// ▼▼▼ ADICIONE A URL DO NOVO WEBHOOK AQUI ▼▼▼
const N8N_USER_PROFILE_URL = 'https://webhook.ia-tess.com.br/webhook/get-user-profile'; 
window.userWebhooks = {};

async function initializeApp() {
    console.log('[OREH] Inicializando o app...');
    // A busca de configuração do usuário agora acontece em paralelo ou depois
    await fetchUserConfiguration();
    
    // O ideal é que a página home seja exibida por padrão, 
    // e os dados específicos (como AI) carreguem quando a página for visitada.
    if (Object.keys(window.userWebhooks).length > 0 || localStorage.getItem('oreh_token')) {
        document.querySelector('.nav-link[data-page="home"]').click();
    } else {
        console.error('[OREH] Nenhuma configuração encontrada. Deslogando.');
        logout();
    }
}

async function fetchUserConfiguration() {
    console.log('[OREH] Buscando configuração de webhooks...');
    const cachedWebhooks = sessionStorage.getItem('oreh_webhooks');
    if (cachedWebhooks) {
        window.userWebhooks = JSON.parse(cachedWebhooks);
        return;
    }

    try {
        const response = await fetchWithAuth(N8N_CONFIG_URL);
        const data = await response.json();
        if (!data || data.length === 0) {
            throw new Error('Configuração de webhooks não encontrada para este usuário.');
        }
        window.userWebhooks = data[0];
        sessionStorage.setItem('oreh_webhooks', JSON.stringify(window.userWebhooks));

    } catch (error) {
        console.error('[OREH] Falha ao buscar configuração:', error);
        // Não deslogar aqui, pode ser um problema temporário de rede.
        // showToast(error.message, 'error'); 
    }
}

async function fetchWithAuth(url, options = {}) {
    const token = localStorage.getItem('oreh_token');
    if (!token) {
        logout();
        throw new Error("Usuário não autenticado.");
    }
    
    const defaultHeaders = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };

    const config = {
        ...options,
        headers: {
            ...defaultHeaders,
            ...options.headers,
        },
    };

    const response = await fetch(url, config);
    if (!response.ok) {
        if(response.status === 401 || response.status === 403) {
            logout();
        }
        const errorData = await response.json();
        throw new Error(errorData.message || `Erro na requisição: ${response.statusText}`);
    }
    return response;
}

// ▼▼▼ NOVA FUNÇÃO PARA BUSCAR INFO DO USUÁRIO ▼▼▼
async function fetchUserProfile() {
    try {
        const response = await fetchWithAuth(N8N_USER_PROFILE_URL);
        return await response.json(); // Retorna { userName: "...", userInitial: "..." }
    } catch (error) {
        console.error('[OREH] Falha ao buscar perfil do usuário:', error);
        showToast(error.message, 'error');
        return null;
    }
}


export { initializeApp, fetchUserConfiguration, fetchWithAuth, fetchUserProfile };
