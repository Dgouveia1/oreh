// affiliates.js - Lógica para a seção de afiliados do painel Superadmin

import { supabaseClient } from './api.js';
import { showToast, setTableLoading } from './admin-helpers.js';


export async function renderAffiliatesTable() {
    console.log('[Admin] Rendering affiliates table...');
    setTableLoading('affiliatesTableBody');
    const tableBody = document.getElementById('affiliatesTableBody');
     try {
        // MODIFICAÇÃO: Trocamos a RPC 'get_affiliates_details' por uma query direta
        // para buscar os novos campos (phone, payment_info) e fazer o join com
        // users (para email de login) e companies (para contagem de clientes).
        const { data, error } = await supabaseClient
            .from('affiliates')
            .select(`
                id,
                name,
                contact_email,
                phone,
                payment_info,
                commission_rate,
                created_at,
                users ( email ),
                companies ( count )
            `)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        tableBody.innerHTML = '';
        if(!data || data.length === 0) {
             // ATUALIZADO: Colspan aumentado para 8 colunas
             tableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 40px;">Nenhum afiliado encontrado.</td></tr>`;
             return;
        }

        data.forEach(affiliate => {
            const row = document.createElement('tr');

            // Processar dados brutos
            // 'created_at' em vez de 'registration_date'
            const registrationDate = new Date(affiliate.created_at).toLocaleDateString('pt-BR'); 
            const commissionPercent = (affiliate.commission_rate * 100).toFixed(0);
             // 'companies.count' para o total de clientes
            const totalClients = affiliate.companies?.count || 0;
            // 'payment_info.pix_key' para a chave PIX
            const pixKey = affiliate.payment_info?.pix_key || 'N/A';
            const phone = affiliate.phone || 'N/A';
             // 'name' em vez de 'affiliate_name'
            const affiliateName = affiliate.name || 'N/A';
            // Usa o email de contato primeiro, se não houver, usa o email de login (users.email)
            const contactEmail = affiliate.contact_email || affiliate.users?.email || 'N/A'; 

            // Armazenar dados no dataset para o modal de edição
            // O modal de edição (openAffiliateEditModal) usa:
            // affiliate_id, affiliate_name, contact_email, commission_rate
            row.dataset.affiliate_id = affiliate.id;
            row.dataset.affiliate_name = affiliateName;
            row.dataset.contact_email = contactEmail;
             // O modal espera a % (multiplicado por 100)
            row.dataset.commission_rate = commissionPercent;

            // ATUALIZADO: Novo HTML da linha com as colunas adicionais
            row.innerHTML = `
                <td data-label="Nome">${affiliateName}</td>
                <td data-label="E-mail">${contactEmail}</td>
                <td data-label="Telefone">${phone}</td>
                <td data-label="Clientes">${totalClients}</td>
                <td data-label="Chave PIX">${pixKey}</td>
                <td data-label="Data Cadastro">${registrationDate}</td>
                <td data-label="Comissão">${commissionPercent}%</td>
                <td class="table-actions" data-label="Ações">
                    <button class="btn btn-small btn-secondary" data-action="edit-affiliate"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-small btn-danger" data-action="delete-affiliate"><i class="fas fa-trash"></i></button>
                </td>
            `;
            tableBody.appendChild(row);
        });
    } catch (error) {
         console.error("Erro ao carregar afiliados:", error);
         // ATUALIZADO: Colspan aumentado para 8 colunas
        tableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--danger);">Falha ao carregar afiliados.</td></tr>`;
    }
}

function openAffiliateEditModal(affiliateData) {
    const modal = document.getElementById('affiliateModal');
    document.getElementById('affiliateModalTitle').textContent = 'Editar Afiliado';
    
    // Preenche os campos do formulário de edição
    // Os nomes no dataset (ex: affiliate_name) foram mantidos para compatibilidade com esta função
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
    if (window.confirm(`Tem certeza que deseja remover "${affiliateName}" como afiliado? Ele voltará a ser um usuário comum.`)) {
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
}
