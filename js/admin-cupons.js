import { supabaseClient } from './api.js';
import { showToast, setTableLoading, getAllPlans } from './admin-helpers.js';

export async function renderCouponsTable() {
    console.log('[Admin] Renderizando tabela de cupons...');
    setTableLoading('couponsTableBody');
    const tableBody = document.getElementById('couponsTableBody');

    try {
        const { data, error } = await supabaseClient
            .from('coupons')
            .select(`
                *,
                plans (name)
            `)
            .order('created_at', { ascending: false });
        
        if (error) throw error;

        if (!data || data.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 40px;">Nenhum cupom encontrado.</td></tr>`;
            return;
        }

        tableBody.innerHTML = data.map(coupon => {
            const discount = coupon.discount_type === 'percentage'
                ? `${coupon.discount_value}%`
                : `R$ ${parseFloat(coupon.discount_value).toFixed(2).replace('.', ',')}`;
            
            const usage = coupon.usage_limit
                ? `${coupon.usage_count} / ${coupon.usage_limit}`
                : `${coupon.usage_count} / ∞`;
            
            const expires = coupon.expires_at
                ? new Date(coupon.expires_at).toLocaleDateString('pt-BR')
                : 'Nunca';

            const status = coupon.is_active ? '<span class="status-badge-admin active">Ativo</span>' : '<span class="status-badge-admin inactive">Inativo</span>';

            const planName = coupon.plans ? coupon.plans.name : 'Todos os Planos';

            return `
                <tr data-coupon='${JSON.stringify(coupon)}'>
                    <td data-label="Campanha">${coupon.campaign_name}</td>
                    <td data-label="Código"><strong>${coupon.code}</strong></td>
                    <td data-label="Desconto">${discount}</td>
                    <td data-label="Plano">${planName}</td>
                    <td data-label="Uso">${usage}</td>
                    <td data-label="Expira em">${expires}</td>
                    <td data-label="Status">${status}</td>
                    <td class="table-actions" data-label="Ações">
                        <button class="btn btn-small btn-secondary" data-action="edit-coupon"><i class="fas fa-edit"></i></button>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error("Erro ao carregar cupons:", error);
        tableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--danger);">Falha ao carregar cupons.</td></tr>`;
    }
}

function openCouponModal(couponData = null) {
    const modal = document.getElementById('couponModal');
    const form = document.getElementById('couponForm');
    form.reset();

    const plans = getAllPlans();
    const planSelect = document.getElementById('couponApplicablePlan');
    planSelect.innerHTML = '<option value="">Todos os Planos</option>';
    plans.forEach(plan => {
        planSelect.innerHTML += `<option value="${plan.id}">${plan.name}</option>`;
    });
    
    if (couponData) {
        // Editando cupom existente
        document.getElementById('couponModalTitle').textContent = 'Editar Cupom';
        document.getElementById('couponId').value = couponData.id;
        document.getElementById('couponCampaignName').value = couponData.campaign_name;
        document.getElementById('couponCode').value = couponData.code;
        document.getElementById('couponDiscountType').value = couponData.discount_type;
        document.getElementById('couponDiscountValue').value = couponData.discount_value;
        document.getElementById('couponUsageLimit').value = couponData.usage_limit;
        document.getElementById('couponExpiresAt').value = couponData.expires_at ? couponData.expires_at.split('T')[0] : '';
        planSelect.value = couponData.applicable_plan_id || '';
        document.getElementById('couponIsActive').checked = couponData.is_active;

    } else {
        // Criando novo cupom
        document.getElementById('couponModalTitle').textContent = 'Novo Cupom';
        document.getElementById('couponId').value = '';
        document.getElementById('couponIsActive').checked = true;
    }

    modal.style.display = 'flex';
}

async function handleCouponFormSubmit(event) {
    event.preventDefault();
    const saveBtn = event.target.querySelector('button[type="submit"]');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Salvando...';

    const couponId = document.getElementById('couponId').value;
    const expiresAt = document.getElementById('couponExpiresAt').value;

    const couponData = {
        campaign_name: document.getElementById('couponCampaignName').value,
        code: document.getElementById('couponCode').value.toUpperCase().trim(),
        discount_type: document.getElementById('couponDiscountType').value,
        discount_value: parseFloat(document.getElementById('couponDiscountValue').value),
        usage_limit: parseInt(document.getElementById('couponUsageLimit').value, 10) || null,
        applicable_plan_id: document.getElementById('couponApplicablePlan').value || null,
        expires_at: expiresAt ? expiresAt : null,
        is_active: document.getElementById('couponIsActive').checked
    };

    if (couponId) {
        couponData.id = couponId;
    }

    try {
        const { error } = await supabaseClient.from('coupons').upsert(couponData, { onConflict: 'id' });
        if (error) throw error;
        showToast(couponId ? 'Cupom atualizado!' : 'Cupom criado!', 'success');
        document.getElementById('couponModal').style.display = 'none';
        renderCouponsTable();
    } catch (error) {
        console.error('Erro ao salvar cupom:', error);
        showToast('Erro ao salvar cupom.', 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Salvar Cupom';
    }
}

export function setupCouponModalListeners() {
    document.getElementById('openCouponModalBtn')?.addEventListener('click', () => openCouponModal());

    document.getElementById('couponsTableBody')?.addEventListener('click', e => {
        const editBtn = e.target.closest('button[data-action="edit-coupon"]');
        if (editBtn) {
            const row = editBtn.closest('tr');
            const couponData = JSON.parse(row.dataset.coupon);
            openCouponModal(couponData);
        }
    });

    document.getElementById('couponForm')?.addEventListener('submit', handleCouponFormSubmit);
}
