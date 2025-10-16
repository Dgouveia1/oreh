// affiliates.js - Lógica para a seção de afiliados do painel Superadmin

import { supabaseClient } from './api.js';
import { showToast, setTableLoading } from './admin-helpers.js';


export async function renderAffiliatesTable() {
    console.log('[Admin] Rendering affiliates table...');
    setTableLoading('affiliatesTableBody');
    const tableBody = document.getElementById('affiliatesTableBody');
     try {
        const { data, error } = await supabaseClient.rpc('get_affiliates_details');
        if (error) throw error;
        
        tableBody.innerHTML = '';
        if(!data || data.length === 0) {
             tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 40px;">Nenhum afiliado encontrado.</td></tr>`;
             return;
        }

        data.forEach(affiliate => {
            const row = document.createElement('tr');
            // Armazenar todos os dados do afiliado no dataset da linha
            Object.keys(affiliate).forEach(key => {
                 // Converte a taxa de comissão para percentagem para o dataset
                if (key === 'commission_rate' && affiliate[key] !== null) {
                    row.dataset[key] = affiliate[key] * 100;
                } else {
                    row.dataset[key] = affiliate[key];
                }
            });

            const registrationDate = new Date(affiliate.registration_date).toLocaleDateString('pt-BR');
            row.innerHTML = `
                <td data-label="Nome">${affiliate.affiliate_name}</td>
                <td data-label="E-mail">${affiliate.contact_email}</td>
                <td data-label="Data Cadastro">${registrationDate}</td>
                <td data-label="Comissão">${(affiliate.commission_rate * 100).toFixed(0)}%</td>
                <td class="table-actions" data-label="Ações">
                    <button class="btn btn-small btn-secondary" data-action="edit-affiliate"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-small btn-danger" data-action="delete-affiliate"><i class="fas fa-trash"></i></button>
                </td>
            `;
            tableBody.appendChild(row);
        });
    } catch (error) {
         console.error("Erro ao carregar afiliados:", error);
        tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--danger);">Falha ao carregar afiliados.</td></tr>`;
    }
}

function openAffiliateEditModal(affiliateData) {
    const modal = document.getElementById('affiliateModal');
    document.getElementById('affiliateModalTitle').textContent = 'Editar Afiliado';
    
    // Preenche os campos do formulário de edição
    document.getElementById('affiliateUserId').value = affiliateData.affiliate_id;
    document.getElementById('affiliateName').value = affiliateData.affiliate_name;
    document.getElementById('affiliateEmail').value = affiliateData.contact_email;
    document.getElementById('affiliateCommission').value = affiliateData.commission_rate; // Já está em percentagem no dataset

    modal.style.display = 'flex';
}


export function setupAffiliateModal() {
    // A criação agora é pública, então o modal é apenas para edição e deleção
    document.getElementById('affiliatesTableBody').addEventListener('click', (e) => {
        const button = e.target.closest('button[data-action]');
        if (!button) return;

        const row = button.closest('tr');
        const action = button.dataset.action;

        if (action === 'edit-affiliate') {
            // A função de edição agora só precisa dos dados da linha
            openAffiliateEditModal(row.dataset);
        } else if (action === 'delete-affiliate') {
            deleteAffiliate(row.dataset.affiliate_id, row.dataset.affiliate_name);
        }
    });

    const affiliateForm = document.getElementById('affiliateForm');
    if(affiliateForm) {
        affiliateForm.addEventListener('submit', handleAffiliateFormSubmit);
    }
}

// Função para lidar com a submissão do formulário de EDIÇÃO
export async function handleAffiliateFormSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const saveBtn = form.querySelector('button[type="submit"]');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Salvando...';

    const userId = document.getElementById('affiliateUserId').value;
    const commissionRate = parseFloat(document.getElementById('affiliateCommission').value) / 100;
    
    if (!userId) {
        showToast('ID do afiliado não encontrado.', 'error');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Salvar Alterações';
        return;
    }

    try {
        const { error } = await supabaseClient
            .from('affiliates')
            .update({ commission_rate: commissionRate })
            .eq('id', userId);

        if (error) throw error;

        showToast('Comissão do afiliado atualizada com sucesso!', 'success');
        document.getElementById('affiliateModal').style.display = 'none';
        await renderAffiliatesTable(); // Atualiza a tabela

    } catch (error) {
        console.error('Erro ao atualizar afiliado:', error);
        showToast(`Erro ao atualizar afiliado: ${error.message}`, 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Salvar Alterações';
    }
}


async function deleteAffiliate(affiliateId, affiliateName) {
    if (!confirm(`Tem certeza que deseja remover "${affiliateName}" como afiliado? Ele voltará a ser um usuário comum.`)) {
        return;
    }

    try {
        // Transação para garantir consistência
        // Passo 1: Reverter a role do usuário para 'app_user'
        const { error: userError } = await supabaseClient
            .from('users')
            .update({ role: 'app_user' })
            .eq('id', affiliateId);
        
        if (userError) throw userError;

        // Passo 2: Deletar o registro da tabela 'affiliates'
        const { error: affiliateError } = await supabaseClient
            .from('affiliates')
            .delete()
            .eq('id', affiliateId);

        if (affiliateError) throw affiliateError;

        showToast('Afiliado removido com sucesso!', 'success');
        renderAffiliatesTable();

    } catch (error) {
        console.error('Erro ao remover afiliado:', error);
        showToast(`Erro ao remover afiliado: ${error.message}`, 'error');
    }
}

