import { supabaseClient, logEvent } from './api.js';
import { showToast } from './ui.js';

let statusInterval = null;
let isCheckingStatus = false;

// --- FUNÇÕES DE MODAL ---

function showFirstConnectionModal(companyId) {
    const modal = document.getElementById('firstConnectionModal');
    const form = document.getElementById('firstConnectionForm');
    if (!modal || !form) return;

    modal.style.display = 'flex';

    const formHandler = async (e) => {
        e.preventDefault();
        const createBtn = document.getElementById('createConnectionBtn');
        createBtn.disabled = true;
        createBtn.textContent = 'Criando...';

        const countryCode = document.getElementById('countryCode').value;
        const phoneNumber = document.getElementById('phoneNumber').value;
        const fullPhoneNumber = countryCode + phoneNumber.replace(/\D/g, '');

        try {
            const { data, error } = await supabaseClient.functions.invoke('oreh-onboarding', {
                body: {
                    telefone: fullPhoneNumber,
                    company_id: companyId
                },
            });

            if (error) throw error;
            if (data.error) throw new Error(data.message);

            showToast('Instância criada com sucesso! A carregar QR Code...', 'success');
            logEvent('INFO', `Primeira conexão criada para o número: ${fullPhoneNumber}`);
            modal.style.display = 'none';
            form.removeEventListener('submit', formHandler); // Remove para evitar duplicados
            
            // Força a atualização do status para buscar o QR Code da nova instância
            setTimeout(updateConnectionStatus, 1000); 

        } catch (error) {
            console.error('Erro ao criar primeira conexão:', error);
            showToast(`Erro: ${error.message}`, 'error');
            logEvent('ERROR', `Falha na primeira conexão para ${fullPhoneNumber}`, { errorMessage: error.message });
        } finally {
            createBtn.disabled = false;
            createBtn.textContent = 'Criar Conexão';
        }
    };

    // Remove qualquer listener antigo antes de adicionar um novo
    form.removeEventListener('submit', formHandler);
    form.addEventListener('submit', formHandler);
}

// --- FUNÇÕES DE VERIFICAÇÃO DE STATUS ---

export function stopStatusPolling() {
  if (statusInterval) {
      clearInterval(statusInterval);
      statusInterval = null;
      console.log('[OREH] Polling de status interrompido.');
  }
}

export async function updateConnectionStatus() {
  if (isCheckingStatus) return;
  isCheckingStatus = true;
  console.log('[OREH] Iniciando verificação de status da conexão...');

  stopStatusPolling();

  const statusElement = document.getElementById('connectionStatus');
  const qrCodeOutput = document.getElementById('qrcode-output');
  const disconnectBtn = document.getElementById('disconnectBtn');

  statusElement.textContent = 'A OBTER CONFIGURAÇÕES...';
  qrCodeOutput.innerHTML = '';
  if (disconnectBtn) disconnectBtn.style.display = 'none';

  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error("Utilizador não autenticado.");

    const { data: profile } = await supabaseClient.from('users').select('company_id').eq('id', user.id).single();
    if (!profile || !profile.company_id) throw new Error("O seu utilizador não está associado a nenhuma empresa.");

    const { data: secrets, error: secretsError } = await supabaseClient
      .from('company_secrets')
      .select('evolution_api_url, evolution_api_key, evolution_instance_name')
      .eq('company_id', profile.company_id)
      .single();

    if (secretsError && secretsError.code !== 'PGRST116') {
        throw secretsError;
    }

    if (!secrets || !secrets.evolution_instance_name) {
      console.log('[OREH] Instância não configurada. A solicitar primeira conexão.');
      statusElement.textContent = 'PRIMEIRA CONEXÃO NECESSÁRIA';
      qrCodeOutput.innerHTML = '<p>Configure sua instância para começar.</p>';
      showFirstConnectionModal(profile.company_id);
      isCheckingStatus = false;
      return; 
    }

    const checkStatus = async () => {
      const apiUrl = secrets.evolution_api_url;
      const apiKey = secrets.evolution_api_key;
      const instanceKey = secrets.evolution_instance_name;

      console.log('[OREH] A verificar status na Mega API...');
      statusElement.textContent = 'A VERIFICAR CONEXÃO...';

      try {
        // 1. Verificar o status da instância com o endpoint da Mega API
        const statusUrl = `${apiUrl}/rest/instance/${instanceKey}`;
        const statusResponse = await fetch(statusUrl, {
            method: 'GET',
            headers: { 
                'accept': '*/*',
                'Authorization': `Bearer ${apiKey}` 
            }
        });
        
        if (!statusResponse.ok) throw new Error(`Erro na comunicação com a API (${statusResponse.status})`);
        
        const statusData = await statusResponse.json();
        
        if (statusData.error === true) {
            throw new Error(statusData.message || 'API retornou um erro.');
        }

        // 2. Avaliar o status (qualquer coisa diferente de 'disconnected' é considerado conectado)
        if (statusData.instance && statusData.instance.status !== 'disconnected') {
            statusElement.textContent = 'CONECTADO';
            if (disconnectBtn) disconnectBtn.style.display = 'block';
            qrCodeOutput.innerHTML = '<p>Telefone conectado.</p>';
            stopStatusPolling();
        } else {
            statusElement.textContent = 'DESCONECTADO - A OBTER QR CODE...';
            const qrCodeUrl = `${apiUrl}/rest/instance/qrcode_base64/${instanceKey}`;

            const qrCodeResponse = await fetch(qrCodeUrl, {
                method: 'GET',
                headers: {
                    'accept': '*/*',
                    'Authorization': `Bearer ${apiKey}`
                }
            });

            if (!qrCodeResponse.ok) throw new Error(`Erro na comunicação ao obter QR Code (${qrCodeResponse.status})`);
            
            const qrCodeData = await qrCodeResponse.json();

            if (qrCodeData.error === true) {
                 throw new Error(qrCodeData.message || 'API retornou um erro ao buscar QR Code.');
            }

            if (qrCodeData.qrcode) {
                statusElement.textContent = 'A AGUARDAR CONEXÃO';
                // A Mega API já retorna o data URI completo
                qrCodeOutput.innerHTML = `<img src="${qrCodeData.qrcode}" alt="QR Code para conexão">`;
            } else {
                statusElement.textContent = 'DESCONECTADO';
                qrCodeOutput.innerHTML = '<p>Telefone desconectado. Não foi possível obter novo QR Code.</p>';
            }
        }
      } catch (e) {
        console.error('Erro dentro do loop de verificação:', e);
        statusElement.textContent = 'ERRO NA VERIFICAÇÃO';
        qrCodeOutput.innerHTML = `<p>Erro: ${e.message}</p>`;
        logEvent('WARN', 'Falha ao verificar status da instância (loop)', { errorMessage: e.message });
        stopStatusPolling();
      }
    };

    await checkStatus();

    if (statusElement.textContent !== 'CONECTADO') {
      statusInterval = setInterval(checkStatus, 13000);
    }

  } catch (error) {
    console.error('[OREH] Erro ao obter configurações para verificar status:', error);
    showToast(error.message, 'error');
    statusElement.textContent = 'ERRO AO OBTER CONFIGURAÇÕES';
    qrCodeOutput.innerHTML = `<p>${error.message}</p>`;
    logEvent('ERROR', 'Falha ao obter configurações da API para a página de Status', { errorMessage: error.message, stack: error.stack });
  } finally {
    isCheckingStatus = false;
  }
}

export async function disconnectInstance() {
    if (!confirm('Tem a certeza de que deseja desconectar a sua instância?')) {
      return;
    }
  
    const disconnectBtn = document.getElementById('disconnectBtn');
    disconnectBtn.disabled = true;
    disconnectBtn.textContent = 'A desconectar...';
    showToast('A desconectar a instância...', 'info');
  
    try {
      const { data: { user } } = await supabaseClient.auth.getUser();
      if (!user) throw new Error("Utilizador não autenticado.");
  
      const { data: profile } = await supabaseClient.from('users').select('company_id').eq('id', user.id).single();
      if (!profile || !profile.company_id) throw new Error("O seu utilizador não está associado a nenhuma empresa.");
  
      const { data: secrets } = await supabaseClient.from('company_secrets').select('evolution_api_url, evolution_api_key, evolution_instance_name').eq('company_id', profile.company_id).single();
      if (!secrets) throw new Error('Não foi possível encontrar as configurações da API.');

      const apiUrl = secrets.evolution_api_url;
      const apiKey = secrets.evolution_api_key;
      const instanceKey = secrets.evolution_instance_name;

      // Endpoint de logout da Mega API
      const disconnectUrl = `${apiUrl}/rest/instance/logout/${instanceKey}`;
      
      const response = await fetch(disconnectUrl, {
        method: 'DELETE',
        headers: { 
            'accept': '*/*',
            'Authorization': `Bearer ${apiKey}` 
        }
      });
  
      if (!response.ok) {
        try {
            const errorData = await response.json();
            throw new Error(errorData.message || `Erro na API (${response.status})`);
        } catch(e) {
            throw new Error(`Erro na API (${response.status})`);
        }
      }
  
      showToast('Instância desconectada com sucesso!', 'success');
      logEvent('INFO', `Instância '${secrets.evolution_instance_name}' desconectada.`);
  
      await updateConnectionStatus();
  
    } catch (error) {
      console.error('[OREH] Erro ao desconectar:', error);
      showToast(error.message, 'error');
      logEvent('ERROR', 'Falha ao desconectar a instância', { errorMessage: error.message, stack: error.stack });
    } finally {
      disconnectBtn.disabled = false;
      disconnectBtn.textContent = 'Desconectar';
    }
}
