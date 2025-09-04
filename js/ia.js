import { supabaseClient, logEvent } from './api.js';
import { showToast } from './ui.js';

// Variável para guardar a nossa "subscrição" em tempo real
let companySecretsSubscription = null;

// Função para PARAR de "escutar" as mudanças. Essencial para quando o utilizador sair da página.
export function unsubscribeFromAiSettings() {
    if (companySecretsSubscription) {
        supabaseClient.removeChannel(companySecretsSubscription);
        companySecretsSubscription = null;
        console.log('[OREH] Subscrição de IA em tempo real terminada.');
    }
}

// Função auxiliar que atualiza os campos do formulário com os dados recebidos
function updateIaForm(settings) {
    if (!settings) return;

    // Função interna para evitar repetição de código
    const set = (id, value, defaultValue) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.type === 'checkbox' ? el.checked = value : el.value = value || defaultValue || '';
    };

    set('aiActiveToggle', settings.is_ai_active, true);
    set('basePrompt', settings.base_prompt);
    set('personalityStyle', settings.ai_personality_style, 'amigavel');
    set('dominantTraits', settings.ai_dominant_traits, 'curioso');
    set('toneFormality', settings.ai_tone_formality, 'casual');
    set('toneAdaptability', settings.ai_tone_adaptability, true);
    set('languageComplexity', settings.ai_language_complexity, 'simples');
    set('agentFunction', settings.ai_agent_function, 'vendedor');
}

export async function loadAiSettings() {
    console.log("[OREH] A carregar e a subscrever configurações de IA do Supabase...");
    
    // Primeiro, cancelamos qualquer subscrição anterior para evitar duplicados
    unsubscribeFromAiSettings();

    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error("Utilizador não autenticado.");

        const { data: profile } = await supabaseClient
            .from('users').select('company_id').eq('id', user.id).single();
        if (!profile) throw new Error("Perfil do utilizador não encontrado.");

        // 1. Carregamento inicial dos dados (como antes)
        const { data: settings, error } = await supabaseClient
            .from('company_secrets').select('*').eq('company_id', profile.company_id).single();

        if (error && error.code !== 'PGRST116') throw error;

        if (settings) {
            updateIaForm(settings);
        } else {
            showToast('Nenhuma configuração de IA encontrada.', 'warning');
        }

        // 2. Inicia a subscrição em tempo real
        companySecretsSubscription = supabaseClient
            .channel(`company-secrets-realtime:${profile.company_id}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'company_secrets',
                    filter: `company_id=eq.${profile.company_id}`
                },
                (payload) => {
                    console.log('[OREH] Atualização de IA recebida em tempo real!', payload.new);
                    showToast('As configurações foram atualizadas remotamente!', 'info');
                    updateIaForm(payload.new);
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('[OREH] Conectado ao canal de IA em tempo real.');
                }
            });

    } catch (error) {
        console.error('[OREH] Erro ao carregar ou subscrever configurações de IA:', error);
        showToast('Falha ao carregar as configurações de IA.', 'error');
        // ✅ LOG DE ERRO
        logEvent('ERROR', 'Falha ao carregar configurações de IA', { errorMessage: error.message, stack: error.stack });
    }
}

// A função de salvar
export async function saveAiSettings() {
    console.log("[OREH] A guardar configurações de IA no Supabase...");
    const saveBtn = document.getElementById('saveAiSettingsBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'A guardar...';

    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error("Utilizador não autenticado.");

        const { data: profile } = await supabaseClient.from('users').select('company_id').eq('id', user.id).single();
        if (!profile) throw new Error("Perfil do utilizador não encontrado.");
        
        const settingsData = {
            company_id: profile.company_id,
            is_ai_active: document.getElementById('aiActiveToggle').checked,
            base_prompt: document.getElementById('basePrompt').value,
            ai_personality_style: document.getElementById('personalityStyle').value,
            ai_dominant_traits: document.getElementById('dominantTraits').value,
            ai_tone_formality: document.getElementById('toneFormality').value,
            ai_tone_adaptability: document.getElementById('toneAdaptability').checked,
            ai_language_complexity: document.getElementById('languageComplexity').value,
            ai_agent_function: document.getElementById('agentFunction').value
        };

        const { error } = await supabaseClient.from('company_secrets').upsert(settingsData, { onConflict: 'company_id' });
        if (error) throw error;

        showToast('Configurações guardadas com sucesso!', 'success');
        // ✅ LOG DE SUCESSO
        logEvent('INFO', 'Configurações de IA guardadas com sucesso.');

    } catch (error) {
        console.error('[OREH] Erro ao guardar configurações de IA:', error);
        showToast('Ocorreu um erro ao guardar as alterações.', 'error');
        // ✅ LOG DE ERRO
        logEvent('ERROR', 'Falha ao guardar configurações de IA', { errorMessage: error.message, stack: error.stack });
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Guardar Alterações';
    }
}