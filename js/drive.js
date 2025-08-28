import { supabaseClient } from './api.js';
import { showToast } from './ui.js';

const BUCKET_NAME = 'rag_docs';

// --- FUNÇÃO AUXILIAR PARA LIMPAR NOMES DE ARQUIVO ---
function sanitizeFileName(fileName) {
    let sanitized = fileName.toLowerCase();
    sanitized = sanitized.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    sanitized = sanitized.replace(/[^a-z0-9.-]/g, '-');
    sanitized = sanitized.replace(/-+/g, '-');
    sanitized = sanitized.replace(/^-|-$/g, '');
    return sanitized;
}

// --- RENDERIZAÇÃO ---

function createFileCard(file) {
    const fileGrid = document.getElementById('fileGrid');
    if (!fileGrid) return;

    // O 'file.name' agora contém o caminho completo (ex: 'company_id/arquivo.pdf')
    const { data } = supabaseClient.storage.from(BUCKET_NAME).getPublicUrl(file.name);
    
    // Mostra apenas o nome do arquivo, sem a pasta
    const displayName = file.name.split('/').pop();

    const card = document.createElement('div');
    card.className = 'file-card';
    card.innerHTML = `
        <a href="${data.publicUrl}" class="file-card-link" download>
            <i class="file-icon fas fa-file-alt"></i>
            <span class="file-name">${displayName}</span>
        </a>
        <button class="delete-file-btn" data-filename="${file.name}">&times;</button>
    `;
    fileGrid.appendChild(card);
}

function renderDrive(files) {
    const fileGrid = document.getElementById('fileGrid');
    fileGrid.innerHTML = ''; 

    if (!files || files.length === 0) {
        fileGrid.innerHTML = '<p class="loading-message">Nenhum arquivo encontrado.</p>';
        return;
    }

    files.forEach(file => {
        // Ignora o arquivo de placeholder que o Supabase cria em pastas vazias
        if (file.name !== '.emptyFolderPlaceholder') {
             createFileCard(file);
        }
    });
}


// --- LÓGICA DE DADOS (SUPABASE STORAGE) ---

export async function loadDriveFiles() {
    console.log('[OREH] A carregar arquivos do Supabase Storage...');
    const fileGrid = document.getElementById('fileGrid');
    fileGrid.innerHTML = '<p class="loading-message">A carregar arquivos...</p>';

    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error("Utilizador não autenticado.");
        const { data: profile } = await supabaseClient.from('users').select('company_id').eq('id', user.id).single();
        if (!profile) throw new Error("Perfil do utilizador não encontrado.");

        // ✅ CORREÇÃO PRINCIPAL: Lista os arquivos de dentro da pasta da empresa
        const { data, error } = await supabaseClient
            .storage
            .from(BUCKET_NAME)
            .list(profile.company_id, { // <--- A MUDANÇA ESTÁ AQUI
                limit: 100,
                offset: 0,
                sortBy: { column: 'created_at', order: 'desc' },
            });

        if (error) throw error;
        
        // Adiciona o caminho completo ao nome do arquivo para as funções de download/delete
        const filesWithFullPath = data.map(file => ({
            ...file,
            name: `${profile.company_id}/${file.name}`
        }));
        
        renderDrive(filesWithFullPath);

    } catch (error) {
        console.error('Erro ao carregar arquivos:', error);
        showToast('Não foi possível carregar os arquivos.', 'error');
        fileGrid.innerHTML = `<p class="loading-message error">${error.message}</p>`;
    }
}

export async function uploadFile(event) {
    event.preventDefault();
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];
    
    if (!file) {
        showToast('Por favor, selecione um arquivo.', 'error');
        return;
    }

    const uploadBtn = event.target.querySelector('button[type="submit"]');
    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Enviando...';

    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error("Utilizador não autenticado.");
        const { data: profile } = await supabaseClient.from('users').select('company_id').eq('id', user.id).single();
        if (!profile) throw new Error("Perfil do utilizador não encontrado.");
        
        // Limpa o nome do arquivo para evitar erros de URL
        const cleanFileName = sanitizeFileName(file.name);
        const filePath = `${profile.company_id}/${cleanFileName}`;

        const { error } = await supabaseClient
            .storage
            .from(BUCKET_NAME)
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: false
            });

        if (error) throw error;

        showToast('Arquivo enviado com sucesso!', 'success');
        document.getElementById('uploadModal').style.display = 'none';
        document.getElementById('uploadForm').reset();
        loadDriveFiles();

    } catch (error) {
        console.error('Erro no upload:', error);
        showToast(`Falha no upload: ${error.message}`, 'error');
    } finally {
        uploadBtn.disabled = false;
        uploadBtn.textContent = 'Enviar';
    }
}

export async function deleteFile(fullPath) {
    if (!confirm(`Tem certeza de que deseja excluir o arquivo?`)) {
        return;
    }

    try {
        // ✅ CORREÇÃO: Usa o caminho completo recebido para deletar
        const { error } = await supabaseClient
            .storage
            .from(BUCKET_NAME)
            .remove([fullPath]);

        if (error) throw error;

        showToast('Arquivo excluído com sucesso!', 'success');
        loadDriveFiles();

    } catch (error) {
        console.error('Erro ao excluir:', error);
        showToast(`Falha ao excluir o arquivo: ${error.message}`, 'error');
    }
}