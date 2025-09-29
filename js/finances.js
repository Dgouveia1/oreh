import { supabaseClient, logEvent } from './api.js';
import { showToast } from './ui.js';
import { getSubscriptionStatus } from './asaasService.js';

export async function loadFinancesPage() {
    console.log('[OREH] A carregar página de Assinatura...');
    const infoContainer = document.getElementById('currentSubscriptionInfo');
    const plansCard = document.getElementById('plansCard');
    if (!infoContainer || !plansCard) return;

    infoContainer.innerHTML = '<p class="loading-message">A carregar a sua assinatura...</p>';
    plansCard.style.display = 'none';

    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error("Utilizador não autenticado.");

        const { data: company, error } = await supabaseClient
            .from('companies')
            .select('asaas_customer_id, asaas_subscription_id, plans(name)')
            .eq('id', (await supabaseClient.from('users').select('company_id').eq('id', user.id).single()).data.company_id)
            .single();

        if (error) throw error;
        
        if (company && company.asaas_subscription_id) {
            // ✅ SUBSTITUIÇÃO: Agora busca os dados reais da assinatura via Edge Function
            const subscriptionDetails = await getSubscriptionStatus(company.asaas_subscription_id);
            const asaasPortalUrl = `https://www.asaas.com/portal/customers/${company.asaas_customer_id}`;

            // Formata a data que vem da API (YYYY-MM-DD) para DD/MM/YYYY
            const formattedDueDate = subscriptionDetails.nextDueDate 
                ? new Date(subscriptionDetails.nextDueDate + 'T00:00:00').toLocaleDateString('pt-BR')
                : 'N/A';

            infoContainer.innerHTML = `
                <div class="subscription-detail">
                    <strong>Plano Atual</strong>
                    <span>${company.plans ? company.plans.name : 'Não identificado'}</span>
                </div>
                <div class="subscription-detail">
                    <strong>Status</strong>
                    <span class="status-badge-subscription" data-status="${subscriptionDetails.status}">${subscriptionDetails.status}</span>
                </div>
                <div class="subscription-detail">
                    <strong>Próximo Vencimento</strong>
                    <span>${formattedDueDate}</span>
                </div>
                <div class="subscription-actions">
                    <p>Para gerir os seus pagamentos, alterar o cartão ou emitir segunda via, aceda ao seu portal do cliente.</p>
                    <button class="btn btn-primary" onclick="window.open('${asaasPortalUrl}', '_blank')">Gerir Pagamentos</button>
                </div>
            `;
        } else {
            infoContainer.innerHTML = `
                <div class="subscription-detail">
                    <strong>Plano Atual</strong>
                    <span>Nenhuma assinatura ativa.</span>
                </div>
                <div class="subscription-actions">
                    <p>Para escolher ou alterar o seu plano, por favor, entre em contacto com o nosso suporte.</p>
                    <button class="btn btn-secondary" id="contactSupportBtn">Falar com o Suporte</button>
                </div>
            `;
        }
    } catch (error) {
        console.error('[OREH] Erro ao carregar assinatura:', error);
        infoContainer.innerHTML = `<p class="loading-message error">Não foi possível carregar os dados da sua assinatura.</p>`;
        logEvent('ERROR', 'Falha ao carregar página de finanças', { errorMessage: error.message });
    }
}

