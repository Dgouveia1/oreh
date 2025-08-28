import { supabaseClient } from './api.js';
import { showToast } from './ui.js';

// Variável para controlar o nosso loop de verificação (polling)
let statusInterval = null;
// Variável para evitar que múltiplas verificações ocorram ao mesmo tempo
let isCheckingStatus = false;

// Função para PARAR o loop de verificação. Será chamada quando o utilizador sair da página.
export function stopStatusPolling() {
  if (statusInterval) {
    clearInterval(statusInterval);
    statusInterval = null;
    isCheckingStatus = false;
    console.log('[OREH] Polling de status interrompido.');
  }
}

// Função principal que inicia a verificação de status
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
    // Passo 1: Obter utilizador e perfil
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error("Utilizador não autenticado.");

    const { data: profile, error: profileError } = await supabaseClient
        .from('users')
        .select('company_id')
        .eq('id', user.id)
        .single();

    if (profileError) throw profileError;
    if (!profile || !profile.company_id) {
        throw new Error("O seu utilizador não está associado a nenhuma empresa.");
    }

    // Passo 2: ✅ CORREÇÃO: Carregar as credenciais (secrets) ANTES de qualquer outra coisa.
    const { data: secrets, error: secretsError } = await supabaseClient
      .from('company_secrets')
      .select('evolution_api_url, evolution_api_key, evolution_instance_name')
      .eq('company_id', profile.company_id)
      .single();

    if (secretsError) throw secretsError;
    if (!secrets || !secrets.evolution_api_url || !secrets.evolution_api_key || !secrets.evolution_instance_name) {
      throw new Error('As configurações da Evolution API não foram encontradas na base de dados.');
    }

    // Passo 3: Definir a função que fará a verificação
    const checkStatus = async () => {
      console.log('[OREH] A verificar status na Evolution API...');
      statusElement.textContent = 'A VERIFICAR CONEXÃO...';

      try {
        // Agora a variável 'secrets' está disponível e pode ser usada aqui
        const evolutionUrl = `${secrets.evolution_api_url}/instance/connect/${secrets.evolution_instance_name}`;
        const evolutionResponse = await fetch(evolutionUrl, {
          headers: { 'apikey': secrets.evolution_api_key }
        });
        
        if (!evolutionResponse.ok) {
            throw new Error(`Erro na API (${evolutionResponse.status})`);
        }
        
        const evolutionData = await evolutionResponse.json();

        if (evolutionData?.instance?.state === 'open') {
          statusElement.textContent = 'CONECTADO';
          if (disconnectBtn) disconnectBtn.style.display = 'block';
          qrCodeOutput.innerHTML = '<p>Telefone conectado.</p>';
          stopStatusPolling();
        } 
        else if (evolutionData?.base64) {
          statusElement.textContent = 'A AGUARDAR CONEXÃO';
          qrCodeOutput.innerHTML = `<img src="${evolutionData.base64}" alt="QR Code para conexão">`;
        }
        else {
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

    // Passo 4: Executar a verificação pela primeira vez
    await checkStatus();

    // Passo 5: Se não estiver conectado, iniciar o loop
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
    // Pede confirmação ao utilizador para evitar cliques acidentais
    if (!confirm('Tem a certeza de que deseja desconectar a sua instância?')) {
      return;
    }
  
    const disconnectBtn = document.getElementById('disconnectBtn');
    disconnectBtn.disabled = true;
    disconnectBtn.textContent = 'A desconectar...';
    showToast('A desconectar a instância...', 'info');
  
    try {
      // 1. Obtém as credenciais da API, tal como na função de verificação de status
      const { data: { user } } = await supabaseClient.auth.getUser();
      if (!user) throw new Error("Utilizador não autenticado.");
  
      const { data: profile } = await supabaseClient.from('users').select('company_id').eq('id', user.id).single();
      if (!profile || !profile.company_id) {
        throw new Error("O seu utilizador não está associado a nenhuma empresa.");
      }
  
      const { data: secrets } = await supabaseClient.from('company_secrets').select('evolution_api_url, evolution_api_key, evolution_instance_name').eq('company_id', profile.company_id).single();
      if (!secrets) {
        throw new Error('Não foi possível encontrar as configurações da API.');
      }
  
      // 2. Monta o URL e os parâmetros para a chamada DELETE
      const evolutionUrl = `${secrets.evolution_api_url}/instance/logout/${secrets.evolution_instance_name}`;
      
      const response = await fetch(evolutionUrl, {
        method: 'DELETE',
        headers: {
          'apikey': secrets.evolution_api_key
        }
      });
  
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Erro na API (${response.status})`);
      }
  
      const result = await response.json();
      console.log('[OREH] Resultado da desconexão:', result);
      showToast('Instância desconectada com sucesso!', 'success');
  
      // 3. Atualiza a interface para refletir o novo status (DESCONECTADO)
      await updateConnectionStatus();
  
    } catch (error) {
      console.error('[OREH] Erro ao desconectar:', error);
      showToast(error.message, 'error');
    } finally {
      disconnectBtn.disabled = false;
      disconnectBtn.textContent = 'Desconectar';
    }
  }