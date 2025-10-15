import { supabaseClient } from './api.js';

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (toast) {
        toast.textContent = message;
        toast.className = `toast ${type} show`;
        setTimeout(() => {
            toast.className = toast.className.replace('show', '');
        }, 5000);
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

    if (password !== passwordConfirm) {
        showToast('As senhas não coincidem.', 'error');
        registerBtn.disabled = false;
        registerBtn.textContent = 'Finalizar Cadastro';
        return;
    }

    try {
        // Etapa 1: Criar o usuário no Supabase Auth.
        // A 'role' é passada nos metadados, mas o trigger 'handle_new_user'
        // pode estar a sobrepor com 'app_user' por defeito.
        // O novo trigger 'on_affiliate_insert_set_role' irá corrigir isso.
        const { data: authData, error: authError } = await supabaseClient.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    full_name: fullName
                    // A role 'admin' é passada aqui, mas o novo trigger de banco de dados
                    // garante a atribuição correta da função, tornando esta linha opcional.
                }
            }
        });

        if (authError) throw authError;
        if (!authData.user) throw new Error("Não foi possível criar o usuário.");

        const userId = authData.user.id;

        // Etapa 2: Inserir os detalhes na tabela 'affiliates'.
        // Esta ação irá acionar o novo trigger no banco de dados, que atualizará
        // a 'role' do usuário para 'admin' na tabela 'users'.
        const { error: affiliateError } = await supabaseClient
            .from('affiliates')
            .insert({
                id: userId,
                name: fullName,
                contact_email: email,
                cpf_cnpj: cpfCnpj,
                phone: phone,
                payment_info: { pix_key: paymentAccount }
            });

        if (affiliateError) {
            // Se a inserção do afiliado falhar, o usuário foi criado mas não terá a role de admin.
            // A lógica de limpeza deve ser tratada no backend, se necessário.
            throw affiliateError;
        }

        // A Etapa 3 (update explícito da role) foi removida.
        // O trigger no banco de dados agora lida com a atualização da role de forma mais confiável,
        // pois executa com permissões elevadas (SECURITY DEFINER).

        showToast('Cadastro realizado com sucesso! Você será redirecionado.', 'success');
        setTimeout(() => {
            window.location.href = 'index.html'; // Redireciona para a página de login
        }, 3000);

    } catch (error) {
        console.error('Erro no cadastro de afiliado:', error);
        // O Supabase pode retornar um erro de "User already registered" que é mais amigável.
        if (error.message.includes("User already registered")) {
            showToast('Este e-mail já está cadastrado. Tente fazer login.', 'error');
        } else {
            showToast(`Erro: ${error.message}`, 'error');
        }
        registerBtn.disabled = false;
        registerBtn.textContent = 'Finalizar Cadastro';
    }
}


document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('affiliateRegisterForm');
    if (form) {
        form.addEventListener('submit', handleAffiliateRegistration);
    }
});
