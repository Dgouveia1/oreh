import { supabaseClient } from './api.js';
// Importa showToast de ui.js
import { showToast } from './ui.js';

// // Função showToast local (removida, agora importada de ui.js)
// function showToast(message, type = 'info') { ... }

// --- Função Auxiliar para Logar Aceite (Via Edge Function) ---
async function logAffiliateTermsAcceptanceEdge(userId, email, termsVersion) {
    try {
        // Chama a Edge Function 'log-terms-acceptance'
        const { data, error } = await supabaseClient.functions.invoke('log-terms-acceptance', {
            body: {
                userId: userId,
                email: email,
                termsVersion: termsVersion,
                acceptanceType: 'affiliate' // Tipo específico para afiliados
            }
        });

        if (error) {
            console.error("Erro ao chamar Edge Function (afiliado):", error);
            showToast(`Erro ao registrar aceite dos termos: ${error.message || 'Erro desconhecido'}`, 'error');
        } else {
            console.log(`Aceite de termos (afiliado) logado via Edge Function para ${email}`, data);
        }
    } catch (e) {
        console.error("Exceção ao chamar Edge Function (afiliado):", e);
        showToast(`Erro inesperado ao registrar aceite dos termos.`, 'error');
    }
}


async function handleAffiliateRegistration(event) {
    event.preventDefault();
    const registerBtn = document.getElementById('registerBtn');
    registerBtn.disabled = true;
    registerBtn.textContent = 'Registrando...';

    const form = event.target;
    const fullName = form.querySelector('#fullName').value;
    const cpfCnpj = form.querySelector('#cpfCnpj').value;
    const phone = form.querySelector('#phone').value;
    const email = form.querySelector('#email').value;
    const paymentAccount = form.querySelector('#paymentAccount').value;
    const password = form.querySelector('#password').value;
    const passwordConfirm = form.querySelector('#passwordConfirm').value;
    const acceptTerms = form.querySelector('#acceptAffiliateTerms').checked; // Verifica checkbox

    // Verifica se os termos foram aceitos
    if (!acceptTerms) {
        showToast('Você precisa aceitar os termos do programa para continuar.', 'error');
        registerBtn.disabled = false;
        registerBtn.textContent = 'Finalizar Cadastro';
        return;
    }

    if (password !== passwordConfirm) {
        showToast('As senhas não coincidem.', 'error');
        registerBtn.disabled = false;
        registerBtn.textContent = 'Finalizar Cadastro';
        return;
    }

    let newUser = null; // Variável para armazenar o usuário criado

    try {
        // Etapa 1: Criar o usuário no Supabase Auth.
        const { data: authData, error: authError } = await supabaseClient.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    full_name: fullName
                }
            }
        });

        if (authError) throw authError;
        if (!authData.user) throw new Error("Não foi possível criar o usuário.");

        newUser = authData.user;
        const userId = newUser.id;

        // Etapa 2: Busca a data da última atualização dos termos de afiliado
         const { data: legalDoc, error: legalError } = await supabaseClient
            .from('affiliate_legal_documents') // Busca na tabela de afiliados
            .select('last_updated_at')
            .eq('id', 1)
            .single();

         let termsVersion = new Date().toISOString(); // Fallback para data atual
         if (legalError) {
             console.error("Erro ao buscar versão dos termos de afiliado:", legalError);
         } else if (legalDoc) {
             termsVersion = legalDoc.last_updated_at;
         }

        // Etapa 3: Loga o aceite dos termos CHAMANDO A EDGE FUNCTION
        await logAffiliateTermsAcceptanceEdge(userId, newUser.email, termsVersion);

        // Etapa 4: Inserir os detalhes na tabela 'affiliates'.
        // Isso acionará o trigger 'on_affiliate_insert_set_role' no banco,
        // que define a role do usuário como 'admin'.
        const { error: affiliateError } = await supabaseClient
            .from('affiliates')
            .insert({
                id: userId,
                name: fullName,
                contact_email: email,
                cpf_cnpj: cpfCnpj,
                phone: phone,
                payment_info: { pix_key: paymentAccount } // Armazena como JSON
            });

        if (affiliateError) {
            // Se a inserção do afiliado falhar, o log de aceite já foi feito.
            // O usuário foi criado, mas o trigger pode não ter rodado para definir a role.
            throw affiliateError;
        }

        showToast('Cadastro realizado com sucesso! Você será redirecionado.', 'success');
        setTimeout(() => {
            window.location.href = 'index.html'; // Redireciona para a página de login
        }, 3000);

    } catch (error) {
        console.error('Erro no cadastro de afiliado:', error);
        if (error.message.includes("User already registered")) {
            showToast('Este e-mail já está cadastrado. Tente fazer login.', 'error');
        } else {
            showToast(`Erro: ${error.message}`, 'error');
        }
        registerBtn.disabled = false;
        registerBtn.textContent = 'Finalizar Cadastro';
        // Se o erro ocorreu após o signUp, pode ser útil deslogar
        if (newUser) {
            await supabaseClient.auth.signOut();
        }
    }
}


document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('affiliateRegisterForm');
    if (form) {
        form.addEventListener('submit', handleAffiliateRegistration);
    }
});

