import { supabaseClient, logEvent } from './api.js';
import { showToast } from './ui.js';

async function loadSettings() {
    console.log('[OREH] Carregando configurações...');
    
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error("Utilizador não autenticado.");

        const { data: profile, error: profileError } = await supabaseClient
            .from('users')
            .select('*, companies(*)')
            .eq('id', user.id)
            .single();

        if (profileError) throw profileError;

        // Preencher formulário de usuário
        document.getElementById('fullName').value = profile.full_name || '';
        document.getElementById('userInitial').value = profile.userinitial || '';
        document.getElementById('jobTitle').value = profile.job_title || '';

        // Preencher formulário da empresa
        if (profile.companies) {
            const company = profile.companies;
            document.getElementById('companyName').value = company.name || '';
            document.getElementById('officialName').value = company.official_name || '';
            document.getElementById('cnpj').value = company.cnpj || '';
            document.getElementById('industry').value = company.industry || '';
            document.getElementById('corporateEmail').value = company.corporate_email || '';
            document.getElementById('phone').value = company.phone || '';
            document.getElementById('address').value = company.address || '';
        }

    } catch (error) {
        console.error('[OREH] Erro ao carregar configurações:', error);
        showToast('Falha ao carregar as configurações.', 'error');
        // ✅ LOG DE ERRO
        logEvent('ERROR', 'Falha ao carregar a página de configurações', { errorMessage: error.message, stack: error.stack });
    }
}

async function saveUserSettings(event) {
    event.preventDefault();
    console.log('[OREH] A guardar configurações do utilizador...');
    const saveBtn = document.getElementById('saveUserSettingsBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'A guardar...';

    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error("Utilizador não autenticado.");

        const updates = {
            full_name: document.getElementById('fullName').value,
            userinitial: document.getElementById('userInitial').value,
            job_title: document.getElementById('jobTitle').value,
        };

        const { error } = await supabaseClient
            .from('users')
            .update(updates)
            .eq('id', user.id);

        if (error) throw error;
        showToast('Dados do utilizador atualizados com sucesso!', 'success');
        // ✅ LOG DE SUCESSO
        logEvent('INFO', 'Configurações do utilizador guardadas com sucesso.');
    } catch (error) {
        console.error('[OREH] Erro ao guardar configurações do utilizador:', error);
        showToast('Ocorreu um erro ao guardar as alterações do utilizador.', 'error');
        // ✅ LOG DE ERRO
        logEvent('ERROR', 'Falha ao guardar configurações do utilizador', { errorMessage: error.message, stack: error.stack });
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Guardar Alterações';
    }
}

async function saveCompanySettings(event) {
    event.preventDefault();
    console.log('[OREH] A guardar configurações da empresa...');
    const saveBtn = document.getElementById('saveCompanySettingsBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'A guardar...';

    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error("Utilizador não autenticado.");

        const { data: profile } = await supabaseClient.from('users').select('company_id').eq('id', user.id).single();
        if (!profile || !profile.company_id) {
            throw new Error("Perfil do utilizador não encontrado ou não associado a uma empresa.");
        }

        const updates = {
            name: document.getElementById('companyName').value,
            official_name: document.getElementById('officialName').value,
            cnpj: document.getElementById('cnpj').value,
            industry: document.getElementById('industry').value,
            corporate_email: document.getElementById('corporateEmail').value,
            phone: document.getElementById('phone').value,
            address: document.getElementById('address').value,
        };

        const { data, error } = await supabaseClient
            .from('companies')
            .update(updates)
            .eq('id', profile.company_id)
            .select();

        if (error) throw error;
        if (!data || data.length === 0) throw new Error("A atualização falhou. Nenhuma linha foi alterada.");

        showToast('Dados da empresa atualizados com sucesso!', 'success');
        // ✅ LOG DE SUCESSO
        logEvent('INFO', 'Configurações da empresa guardadas com sucesso.');
        
    } catch (error) {
        console.error('[OREH] Erro detalhado ao guardar configurações da empresa:', error);
        showToast(error.message || 'Ocorreu um erro ao guardar as alterações da empresa.', 'error');
        // ✅ LOG DE ERRO
        logEvent('ERROR', 'Falha ao guardar configurações da empresa', { errorMessage: error.message, stack: error.stack });
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Guardar Alterações';
    }
}

// ✅ NOVA FUNÇÃO: Salvar nova senha (lógica movida de auth.js)
export async function savePasswordSettings(event) {
    event.preventDefault();
    const newPasswordInput = document.getElementById('newPassword');
    const confirmPasswordInput = document.getElementById('confirmNewPassword');
    const updateBtn = document.getElementById('savePasswordSettingsBtn');
    const newPassword = newPasswordInput.value;

    if (newPassword !== confirmPasswordInput.value) {
        showToast('As novas senhas não coincidem.', 'error');
        return;
    }
    if (newPassword.length < 6) {
        showToast('A nova senha deve ter pelo menos 6 caracteres.', 'error');
        return;
    }

    updateBtn.disabled = true;
    updateBtn.textContent = 'Salvando...';

    try {
        // updateUser funciona para o usuário logado (que é o caso aqui)
        const { data, error } = await supabaseClient.auth.updateUser({
            password: newPassword
        });

        if (error) throw error;

        showToast('Senha atualizada com sucesso!', 'success');
        logEvent('INFO', `Senha redefinida com sucesso pelo usuário.`);
        newPasswordInput.value = '';
        confirmPasswordInput.value = '';

    } catch (error) {
        console.error('[Settings.js] Erro ao atualizar senha:', error);
        showToast(`Erro ao atualizar senha: ${error.message}`, 'error');
        logEvent('ERROR', `Falha ao atualizar senha`, { errorMessage: error.message });
    } finally {
        updateBtn.disabled = false;
        updateBtn.textContent = 'Salvar Nova Senha';
    }
}


export { loadSettings, saveUserSettings, saveCompanySettings };