import { supabaseClient, logEvent } from './api.js';
import { showToast } from './ui.js';

let companySecretsSubscription = null;
const daysOfWeek = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'];

export function unsubscribeFromAiSettings() {
    if (companySecretsSubscription) {
        supabaseClient.removeChannel(companySecretsSubscription);
        companySecretsSubscription = null;
    }
}

// ✅ FUNÇÃO CORRIGIDA para ler os dados da coluna 'business_info'
function updateIaForm(settings) {
    if (!settings) return;

    const set = (id, value, defaultValue = '') => {
        const el = document.getElementById(id);
        if (!el) return;
        el.type === 'checkbox' ? el.checked = value : el.value = value || defaultValue;
    };
    
    // Controles Gerais e Personalidade
    set('aiActiveToggle', settings.is_ai_active, true);
    set('basePrompt', settings.base_prompt);
    set('personalityStyle', settings.ai_personality_style, 'amigavel');
    set('dominantTraits', settings.ai_dominant_traits, 'curioso');
    set('toneFormality', settings.ai_tone_formality, 'casual');
    set('toneAdaptability', settings.ai_tone_adaptability, true);
    set('languageComplexity', settings.ai_language_complexity, 'simples');
    set('agentFunction', settings.ai_agent_function, 'vendedor');

    // ✅ Lendo dados aninhados do objeto 'business_info'
    const businessInfo = settings.business_info || {};
    set('companyAddress', businessInfo.address);
    set('hasPhysicalAttendance', businessInfo.has_physical_attendance);
    
    const socialMedia = businessInfo.social_media || {};
    set('socialInstagram', socialMedia.instagram);
    set('socialFacebook', socialMedia.facebook);
    set('socialSite', socialMedia.site);

    const businessHours = businessInfo.business_hours || {};
    daysOfWeek.forEach(day => {
        const dayData = businessHours[day] || { active: false, start: '09:00', end: '18:00' };
        document.getElementById(`active-${day}`).checked = dayData.active;
        document.getElementById(`start-${day}`).value = dayData.start;
        document.getElementById(`end-${day}`).value = dayData.end;
    });
}

function createBusinessHoursUI() {
    const container = document.getElementById('businessHoursContainer');
    if (!container || container.children.length > 0) return;

    const dayNames = {
        segunda: 'Segunda-feira', terca: 'Terça-feira', quarta: 'Quarta-feira',
        quinta: 'Quinta-feira', sexta: 'Sexta-feira', sabado: 'Sábado', domingo: 'Domingo'
    };

    daysOfWeek.forEach(day => {
        const row = document.createElement('div');
        row.className = 'day-row';
        row.innerHTML = `
            <label class="day-toggle">
                <input type="checkbox" id="active-${day}">
                <span class="day-label">${dayNames[day]}</span>
            </label>
            <div class="time-inputs">
                <span>das</span>
                <input type="time" id="start-${day}">
                <span>às</span>
                <input type="time" id="end-${day}">
            </div>
        `;
        container.appendChild(row);
    });
}


export async function loadAiSettings() {
    console.log("[OREH] Carregando e subscrevendo configurações de IA...");
    createBusinessHoursUI(); 
    unsubscribeFromAiSettings();

    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error("Utilizador não autenticado.");

        const { data: profile } = await supabaseClient.from('users').select('company_id').eq('id', user.id).single();
        if (!profile) throw new Error("Perfil do utilizador não encontrado.");

        const { data: settings, error } = await supabaseClient
            .from('company_secrets').select('*').eq('company_id', profile.company_id).single();

        if (error && error.code !== 'PGRST116') throw error;

        updateIaForm(settings);

        companySecretsSubscription = supabaseClient
            .channel(`company-secrets-realtime:${profile.company_id}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'company_secrets', filter: `company_id=eq.${profile.company_id}` },
                (payload) => {
                    console.log('[OREH] Atualização de IA recebida!', payload.new);
                    showToast('As configurações foram atualizadas remotamente!', 'info');
                    updateIaForm(payload.new);
                }
            )
            .subscribe();

    } catch (error) {
        console.error('[OREH] Erro ao carregar configurações de IA:', error);
        showToast('Falha ao carregar as configurações de IA.', 'error');
        logEvent('ERROR', 'Falha ao carregar configurações de IA', { errorMessage: error.message });
    }
}

// ✅ FUNÇÃO CORRIGIDA para salvar os dados na coluna 'business_info'
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
        
        const businessHours = {};
        daysOfWeek.forEach(day => {
            businessHours[day] = {
                active: document.getElementById(`active-${day}`).checked,
                start: document.getElementById(`start-${day}`).value,
                end: document.getElementById(`end-${day}`).value
            };
        });

        const socialMedia = {
            instagram: document.getElementById('socialInstagram').value,
            facebook: document.getElementById('socialFacebook').value,
            site: document.getElementById('socialSite').value,
        };

        // ✅ Objeto 'business_info' criado para agrupar os dados
        const businessInfoData = {
            address: document.getElementById('companyAddress').value,
            has_physical_attendance: document.getElementById('hasPhysicalAttendance').checked,
            business_hours: businessHours,
            social_media: socialMedia
        };

        const settingsData = {
            company_id: profile.company_id,
            is_ai_active: document.getElementById('aiActiveToggle').checked,
            base_prompt: document.getElementById('basePrompt').value,
            ai_personality_style: document.getElementById('personalityStyle').value,
            ai_dominant_traits: document.getElementById('dominantTraits').value,
            ai_tone_formality: document.getElementById('toneFormality').value,
            ai_tone_adaptability: document.getElementById('toneAdaptability').checked,
            ai_language_complexity: document.getElementById('languageComplexity').value,
            ai_agent_function: document.getElementById('agentFunction').value,
            business_info: businessInfoData // ✅ Salvando o objeto na coluna correta
        };

        const { error } = await supabaseClient.from('company_secrets').upsert(settingsData, { onConflict: 'company_id' });
        if (error) throw error;

        showToast('Configurações guardadas com sucesso!', 'success');
        logEvent('INFO', 'Configurações de IA guardadas com sucesso.');

    } catch (error) {
        console.error('[OREH] Erro ao guardar configurações de IA:', error);
        showToast('Ocorreu um erro ao guardar as alterações.', 'error');
        logEvent('ERROR', 'Falha ao guardar configurações de IA', { errorMessage: error.message, stack: error.stack });
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Salvar Configurações de IA';
    }
}

