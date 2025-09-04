import { logout } from './auth.js';
import { showToast } from './ui.js';

// Usamos o objeto 'supabase' global (do script no HTML) para criar o nosso cliente.
// Exportamo-lo com um novo nome, 'supabaseClient', para evitar conflitos.
const supabaseUrl = 'https://kgcrektcfxydfhezmlsc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtnY3Jla3RjZnh5ZGZoZXptbHNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDMxODM5ODEsImV4cCI6MjA1ODc1OTk4MX0.HJde0dv6z-Iy9U2sUKSH-F3Uzt2wlhIa_EBehCUBDL4';
export const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

// ✅ NOVA FUNÇÃO DE LOGGING
export async function logEvent(level, message, metadata = {}) {
  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      console.warn("Tentativa de log sem usuário autenticado.");
      return;
    }

    const { data: profile } = await supabaseClient.from('users').select('company_id').eq('id', user.id).single();
    
    const logData = {
      level,
      message,
      user_id: user.id,
      company_id: profile ? profile.company_id : null,
      metadata
    };

    const { error } = await supabaseClient.from('app_logs').insert(logData);

    if (error) {
      throw error;
    }

  } catch (error) {
    // Se a própria função de log falhar, registramos no console para não entrar em loop.
    console.error('[OREH] Falha ao registrar o log no Supabase:', error);
  }
}


async function initializeApp() {
    console.log('[OREH] A inicializar a aplicação...');
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        document.querySelector('.nav-link[data-page="home"]').click();
    } else {
        console.log('[OREH] Nenhum utilizador com sessão iniciada.');
    }
}

async function fetchUserProfile() {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error("Utilizador não autenticado para obter o perfil.");

        const { data, error } = await supabaseClient
            .from('users')
            .select('full_name, userinitial, role')
            .eq('id', user.id)
            .single();

        if (error) throw error;
        
        return data; 

    } catch (error) {
        console.error('[OREH] Falha ao obter o perfil do utilizador:', error.message);
        showToast('Não foi possível carregar os dados do utilizador.', 'error');
        // ✅ LOG DE ERRO
        logEvent('ERROR', 'Falha ao obter perfil do utilizador', { errorMessage: error.message, stack: error.stack });
        if (error.status === 401 || error.status === 403) {
            logout();
        }
        return null;
    }
}

export { initializeApp, fetchUserProfile };