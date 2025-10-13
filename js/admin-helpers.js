// admin-helpers.js

// --- Shared State ---
let allPlans = [];
let allAffiliates = [];

export function setAllPlans(plans) {
    console.log('[Admin-Helpers] A definir planos globais:', plans);
    allPlans = plans;
}

export function getAllPlans() {
    return allPlans;
}

export function setAllAffiliates(affiliates) {
    console.log('[Admin-Helpers] A definir afiliados globais:', affiliates);
    allAffiliates = affiliates;
}

export function getAllAffiliates() {
    return allAffiliates;
}

// --- UI Helpers ---
export function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (toast) {
        toast.textContent = message;
        toast.className = `toast ${type} show`;
        setTimeout(() => {
            toast.className = toast.className.replace('show', '');
        }, 3000);
    }
}

export function setTableLoading(tableBodyId) {
    const tableBody = document.getElementById(tableBodyId);
    if (tableBody) {
        const colCount = tableBody.previousElementSibling?.firstElementChild?.childElementCount || 5;
        tableBody.innerHTML = `<tr><td colspan="${colCount}" style="text-align: center; padding: 40px;">A carregar...</td></tr>`;
    }
}

