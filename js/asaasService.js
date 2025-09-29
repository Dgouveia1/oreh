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

export async function getSubscriptionPaymentUrl(subscriptionId) {
    console.log(`[Asaas Service] Buscando URL de pagamento para ${subscriptionId}...`);
    const response = await callAsaasApi('GET', `subscriptions/${subscriptionId}/payments`);
    return response?.data?.[0]?.invoiceUrl || null;
}

export async function getSubscriptionStatus(subscriptionId) {
    console.log(`[Asaas Service] Buscando status da assinatura ${subscriptionId}...`);
    return await callAsaasApi('GET', `subscriptions/${subscriptionId}`);
}

