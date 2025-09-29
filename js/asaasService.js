import { supabaseClient } from './api.js';

// Função centralizada e CORRIGIDA para chamar a Edge Function
async function callAsaasApi(method, asaasEndpoint, body = null) {
    console.log(`[Asaas Service] Chamando a Edge Function com:`, { method, asaasEndpoint, body });

    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        throw new Error("Sessão do usuário não encontrada. Não é possível chamar a API segura.");
    }

    try {
        // A função 'invoke' do Supabase sempre usa POST, então passamos o método real no corpo.
        const { data, error } = await supabaseClient.functions.invoke('proxy-asaas-api', {
            headers: {
                'Authorization': `Bearer ${session.access_token}`
            },
            body: {
                method, // ✅ CORREÇÃO: Enviamos o método HTTP desejado no corpo da requisição
                asaasEndpoint,
                body 
            }
        });

        if (error) throw error;
        
        // A Edge Function pode retornar um objeto com um campo de erro que precisamos verificar
        if (data.error) {
            throw new Error(data.error);
        }

        return data;
    } catch (error) {
        console.error(`[Asaas Service] Erro ao invocar a Edge Function:`, error);
        throw new Error(error.message || 'Falha na comunicação com o servidor seguro.');
    }
}


export async function createCustomer(name, cpfCnpj) {
    console.log('[Asaas Service] Criando cliente...');
    return await callAsaasApi('POST', 'customers', { name, cpfCnpj });
}

export async function createSubscription(customerId, value, description) {
    console.log('[Asaas Service] Criando assinatura...');
    const nextDueDate = new Date();
    nextDueDate.setDate(nextDueDate.getDate() + 8);
    const formattedDate = nextDueDate.toISOString().split('T')[0];

    const body = {
        customer: customerId,
        billingType: 'UNDEFINED', // Ou o tipo que você preferir
        cycle: 'MONTHLY',
        value,
        nextDueDate: formattedDate,
        description,
    };
    return await callAsaasApi('POST', 'subscriptions', body);
}

// ✅ FUNÇÃO CORRIGIDA para buscar o link da fatura da assinatura
export async function getSubscriptionPaymentUrl(subscriptionId) {
    console.log(`[Asaas Service] Buscando URL de pagamento para a assinatura ${subscriptionId}...`);
    // O Asaas não tem um endpoint direto 'subscriptions/{id}/invoiceUrl'.
    // Devemos buscar as payments/invoices vinculadas à assinatura e achar a URL da mais recente.
    // Vamos buscar as cobranças (payments) vinculadas à assinatura.
    // Endpoint: payments?subscription={subscriptionId}
    const response = await callAsaasApi('GET', `payments?subscription=${subscriptionId}&limit=1&order=desc`);
    
    // Verificamos se há dados retornados e se a primeira (mais recente) tem um link de pagamento (invoiceUrl)
    if (response && response.data && response.data.length > 0) {
        const latestPayment = response.data[0];
        
        // Retorna a URL da fatura (invoiceUrl) se for encontrada.
        if (latestPayment.invoiceUrl) {
            return latestPayment.invoiceUrl;
        }
        
        // Se a fatura mais recente não tiver URL, tentamos a URL de pagamento direto (externalPaymentLink)
        if (latestPayment.externalPaymentLink) {
             return latestPayment.externalPaymentLink;
        }
    }
    
    // Se não encontrar nenhum link, retorna null
    return null;
}

export async function getSubscriptionStatus(subscriptionId) {
    console.log(`[Asaas Service] Buscando status da assinatura ${subscriptionId}...`);
    return await callAsaasApi('GET', `subscriptions/${subscriptionId}`);
}
