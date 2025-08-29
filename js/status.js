import { supabaseClient } from './api.js';
import { showToast } from './ui.js';

// Variáveis de controle
let statusInterval = null;
let isCheckingStatus = false;

// --- FUNÇÕES DO MODAL DE PRIMEIRA CONEXÃO ---

// Mostra o modal e anexa o evento ao formulário
function showFirstConnectionModal(companyId) {
    const modal = document.getElementById('firstConnectionModal');
    const form = document.getElementById('firstConnectionForm');
    
    // Armazena o company_id no formulário para uso posterior
    form.dataset.companyId = companyId;
    
    modal.style.display = 'flex';

    // Garante que o evento de submit seja adicionado apenas uma vez
    if (!form.dataset.listenerAttached) {
        form.addEventListener('submit', handleFirstConnection);
        form.dataset.listenerAttached = 'true';
    }
}

// Lida com o envio do formulário do modal
async function handleFirstConnection(event) {
    event.preventDefault();
    const btn = document.getElementById('createConnectionBtn');
    btn.disabled = true;
    btn.textContent = 'A criar...';

    const companyId = event.target.dataset.companyId;
    const countryCode = document.getElementById('countryCode').value;
    const phoneNumber = document.getElementById('phoneNumber').value;
    const fullPhoneNumber = countryCode + phoneNumber.replace(/\D/g, ''); // Limpa o número

    try {
        const webhookUrl = 'https://oreh-n8n.p7rc7g.easypanel.host/webhook/oreh-onboarding';
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                telefone: fullPhoneNumber,
                company_id: companyId
            })
        });

        if (response.status !== 200) {
            throw new Error(`Ocorreu um erro ao criar a conexão (${response.statusText})`);
        }
        
        showToast('Conexão solicitada com sucesso! A obter status...', 'success');
        document.getElementById('firstConnectionModal').style.display = 'none';
        
        // Adiciona uma pequena pausa para dar tempo ao webhook de atualizar a base de dados
        await new Promise(resolve => setTimeout(resolve, 2000)); 
        
        await updateConnectionStatus();

    } catch (error) {
        console.error('[OREH] Erro ao criar primeira conexão:', error);
        showToast(error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Criar Conexão';
    }
}


// --- FUNÇÕES DE VERIFICAÇÃO DE STATUS ---

export function stopStatusPolling() {
  if (statusInterval) {
    clearInterval(statusInterval);
    statusInterval = null;
    isCheckingStatus = false;
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

    // ✅ LÓGICA ATUALIZADA: Mostra o modal se não houver segredos OU se o nome da instância estiver em falta.
    if (!secrets || !secrets.evolution_instance_name) {
      console.log('[OREH] Instância não configurada. A solicitar primeira conexão.');
      statusElement.textContent = 'PRIMEIRA CONEXÃO NECESSÁRIA';
      qrCodeOutput.innerHTML = '<p>Configure sua instância para começar.</p>';
      showFirstConnectionModal(profile.company_id);
      isCheckingStatus = false;
      return; 
    }

    const checkStatus = async () => {
      console.log('[OREH] A verificar status na Evolution API...');
      statusElement.textContent = 'A VERIFICAR CONEXÃO...';

      try {
        const evolutionUrl = `${secrets.evolution_api_url}/instance/connect/${secrets.evolution_instance_name}`;
        const evolutionResponse = await fetch(evolutionUrl, {
          headers: { 'apikey': secrets.evolution_api_key }
        });
        
        if (!evolutionResponse.ok) throw new Error(`Erro na API (${evolutionResponse.status})`);
        
        const evolutionData = await evolutionResponse.json();

        if (evolutionData?.instance?.state === 'open') {
          statusElement.textContent = 'CONECTADO';
          if (disconnectBtn) disconnectBtn.style.display = 'block';
          qrCodeOutput.innerHTML = '<p>Telefone conectado.</p>';
          stopStatusPolling();
        } else if (evolutionData?.base64) {
          statusElement.textContent = 'A AGUARDAR CONEXÃO';
          qrCodeOutput.innerHTML = `<img src="${evolutionData.base64}" alt="QR Code para conexão">`;
        } else {
          statusElement.textContent = 'DESCONECTADO';
          qrCodeOutput.innerHTML = '<p>Telefone desconectado. A tentar obter novo QR Code...</p>';
        }
      } catch (e) {
        console.error('Erro dentro do loop de verificação:', e);
        statusElement.textContent = 'ERRO NA VERIFICAÇÃO';
        qrCodeOutput.innerHTML = `<p>${e.message}</p>`;
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
  
      const evolutionUrl = `${secrets.evolution_api_url}/instance/logout/${secrets.evolution_instance_name}`;
      
      const response = await fetch(evolutionUrl, {
        method: 'DELETE',
        headers: { 'apikey': secrets.evolution_api_key }
      });
  
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Erro na API (${response.status})`);
      }
  
      showToast('Instância desconectada com sucesso!', 'success');
  
      await updateConnectionStatus();
  
    } catch (error) {
      console.error('[OREH] Erro ao desconectar:', error);
      showToast(error.message, 'error');
    } finally {
      disconnectBtn.disabled = false;
      disconnectBtn.textContent = 'Desconectar';
    }
  }