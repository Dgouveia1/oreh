import { supabaseClient, logEvent } from './api.js';
import { showToast } from './ui.js';

let productsSubscription = null;
const BUCKET_NAME = 'product_images';

function stopProductsSubscription() {
    if (productsSubscription) {
        supabaseClient.removeChannel(productsSubscription);
        productsSubscription = null;
    }
}

export function cleanupProducts() {
    stopProductsSubscription();
}

function getFilePreviewHTML(url, isEditable = false) {
    // A 'url' pode ser uma URL pública completa ou um nome de arquivo local
    const isPdf = typeof url === 'string' && url.toLowerCase().endsWith('.pdf');
    const fileName = typeof url === 'string' ? url.split('/').pop().split('?')[0] : 'arquivo';
    const removeButton = isEditable ? `<button type="button" class="remove-img-btn" data-url-to-remove="${url}">&times;</button>` : '';

    if (isPdf) {
        return `
            <div class="file-preview" data-url="${url}" title="${fileName}">
                <i class="fas fa-file-pdf"></i>
                ${removeButton}
            </div>
        `;
    }
    // Para previews de imagem local, a URL será um data URI base64
    return `
        <div class="img-preview" data-url="${url}">
            <img src="${url}" alt="Product image">
            ${removeButton}
        </div>
    `;
}


function renderProductsTable(products) {
    const tableBody = document.getElementById('productTableBody');
    if (!tableBody) return;
    
    tableBody.innerHTML = ''; 

    if (!products || products.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Nenhum produto cadastrado.</td></tr>';
        return;
    }

    products.forEach(product => {
        const row = document.createElement('tr');
        Object.keys(product).forEach(key => {
            const value = product[key];
            row.dataset[key] = typeof value === 'object' ? JSON.stringify(value) : value;
        });
        row.dataset.productId = product.id;

        const photoUrls = product.photo_urls || [];
        const filesHtml = photoUrls.map(url => {
            if (url.toLowerCase().endsWith('.pdf')) {
                return `<div class="product-file-icon" title="PDF"><i class="fas fa-file-pdf"></i></div>`;
            }
            return `<img src="${url}" alt="${product.name}">`;
        }).join('');

        const purchaseLinkHtml = product.purchase_link 
            ? `<a href="${product.purchase_link}" target="_blank" class="btn-link">Ver Link</a>`
            : 'N/A';

        row.innerHTML = `
            <td data-label="Produto">
                <div class="product-info">
                    <div class="product-media-cell">${filesHtml || '<div class="no-image-placeholder"></div>'}</div>
                    <div>
                        <strong>${product.name}</strong>
                    </div>
                </div>
            </td>
            <td data-label="Descrição">${product.description || 'N/A'}</td>
            <td data-label="Valor">R$ ${parseFloat(product.value || 0).toFixed(2).replace('.', ',')}</td>
            <td data-label="Link">${purchaseLinkHtml}</td>
            <td class="product-actions" data-label="Ações">
                <button class="btn btn-sm btn-edit" data-action="edit"><i class="fas fa-pencil-alt"></i></button>
                <button class="btn btn-sm btn-delete" data-action="delete"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tableBody.appendChild(row);
    });
}


export async function loadProducts() {
    stopProductsSubscription(); 
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error("Utilizador não autenticado.");
        const { data: profile } = await supabaseClient.from('users').select('company_id').eq('id', user.id).single();
        if (!profile) throw new Error("Perfil do utilizador não encontrado.");
        
        const { data: initialProducts, error } = await supabaseClient
            .from('products').select('*').eq('company_id', profile.company_id).order('created_at', { ascending: false });

        if (error) throw error;
        renderProductsTable(initialProducts);

        productsSubscription = supabaseClient
            .channel(`public:products:company_id=eq.${profile.company_id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter: `company_id=eq.${profile.company_id}`}, 
            () => loadProducts()) 
            .subscribe();

    } catch (error) {
        console.error('[OREH] Erro ao carregar produtos:', error);
        logEvent('ERROR', 'Falha ao carregar/subscrever produtos', { errorMessage: error.message });
    }
}


export function openEditModal(productData) {
    const modal = document.getElementById('productFormModal');
    const form = document.getElementById('productForm');
    form.reset();
    
    document.getElementById('productModalTitle').textContent = 'Editar Produto';
    document.getElementById('productId').value = productData.id;
    document.getElementById('productName').value = productData.name;
    document.getElementById('productDescription').value = productData.description;
    document.getElementById('productValue').value = productData.value;
    document.getElementById('productPurchaseLink').value = productData.purchase_link || '';
    
    const photoUrls = JSON.parse(productData.photo_urls || '[]');
    form.dataset.existingPhotos = JSON.stringify(photoUrls);

    const previewContainer = document.getElementById('imagePreviewContainer');
    if (photoUrls.length > 0) {
        previewContainer.innerHTML = photoUrls.map(url => getFilePreviewHTML(url, true)).join('');
    } else {
        previewContainer.innerHTML = '<p>Nenhuma imagem ou arquivo existente.</p>';
    }

    modal.style.display = 'flex';
}

export async function handleProductFormSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const saveBtn = form.querySelector('button[type="submit"]');
    saveBtn.disabled = true;
    saveBtn.textContent = 'A guardar...';

    const productId = document.getElementById('productId').value;
    
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error("Utilizador não autenticado.");
        const { data: profile } = await supabaseClient.from('users').select('company_id').eq('id', user.id).single();
        if (!profile) throw new Error("Perfil do utilizador não encontrado.");
        
        const imageInputElement = document.getElementById('productPhotos');
        const imageFiles = Array.from(imageInputElement.files);
        let finalPhotoUrls = JSON.parse(form.dataset.existingPhotos || '[]');

        if (imageFiles.length > 0) {
            finalPhotoUrls = []; // Substitui as fotos antigas se novas forem enviadas
            for (const file of imageFiles) {
                const fileName = `${Date.now()}-${file.name}`;
                const filePath = `${profile.company_id}/${fileName}`;
                const { error: uploadError } = await supabaseClient.storage.from(BUCKET_NAME).upload(filePath, file);
                if (uploadError) throw uploadError;
                const { data: { publicUrl } } = supabaseClient.storage.from(BUCKET_NAME).getPublicUrl(filePath);
                finalPhotoUrls.push(publicUrl);
            }
        }

        const productData = {
            company_id: profile.company_id,
            name: document.getElementById('productName').value,
            description: document.getElementById('productDescription').value,
            value: parseFloat(document.getElementById('productValue').value),
            purchase_link: document.getElementById('productPurchaseLink').value,
            photo_urls: finalPhotoUrls,
        };

        if (productId) {
            productData.id = productId;
        }

        const { error } = await supabaseClient.from('products').upsert(productData, { onConflict: 'id' });
        if (error) throw error;

        showToast(productId ? 'Produto atualizado!' : 'Produto criado!', 'success');
        document.getElementById('productFormModal').style.display = 'none';
        form.reset();
        form.dataset.existingPhotos = '[]';
        loadProducts();

    } catch (error) {
        console.error('Erro ao guardar produto:', error);
        showToast(`Erro ao guardar produto: ${error.message}`, 'error');
        logEvent('ERROR', 'Falha ao guardar produto', { errorMessage: error.message });
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Salvar Produto';
    }
}


export async function deleteProduct(productId) {
    if (!confirm('Tem a certeza de que deseja apagar este produto?')) return;

    try {
        const { error } = await supabaseClient.from('products').delete().eq('id', productId);
        if (error) throw error;
        showToast('Produto apagado com sucesso!', 'success');
        loadProducts(); // ✅ RECARREGA A LISTA APÓS DELETAR
    } catch (error) {
        console.error('Erro ao apagar produto:', error);
        showToast(`Erro ao apagar produto: ${error.message}`, 'error');
    }
}

// ✅ NOVA FUNÇÃO: Configura os event listeners para a página de produtos
export function setupProductEventListeners() {
    const previewContainer = document.getElementById('imagePreviewContainer');
    if(previewContainer) {
        previewContainer.addEventListener('click', (e) => {
            const removeBtn = e.target.closest('.remove-img-btn');
            if (removeBtn) {
                const urlToRemove = removeBtn.dataset.urlToRemove;
                const form = document.getElementById('productForm');
                let existingPhotos = JSON.parse(form.dataset.existingPhotos || '[]');
                
                // Remove a URL do array
                existingPhotos = existingPhotos.filter(url => url !== urlToRemove);
                
                // Atualiza o dataset e remove o elemento do DOM
                form.dataset.existingPhotos = JSON.stringify(existingPhotos);
                removeBtn.parentElement.remove();

                if (previewContainer.children.length === 0) {
                     previewContainer.innerHTML = '<p>Nenhuma imagem ou arquivo existente.</p>';
                }
            }
        });
    }

    const imageInputElement = document.getElementById('productPhotos');
    if(imageInputElement) {
        imageInputElement.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            const previewContainer = document.getElementById('imagePreviewContainer');
            previewContainer.innerHTML = ''; // Limpa previews de fotos existentes

            if (files.length > 0) {
                 files.forEach(file => {
                    // Para arquivos de imagem, gera um preview local
                    if (file.type.startsWith('image/')) {
                        const reader = new FileReader();
                        reader.onload = function(e) {
                            previewContainer.innerHTML += getFilePreviewHTML(e.target.result, false);
                        }
                        reader.readAsDataURL(file);
                    } else if (file.type === 'application/pdf') {
                         previewContainer.innerHTML += getFilePreviewHTML(file.name, false);
                    }
                });
            } else {
                // Se nenhum arquivo for selecionado, volta a mostrar os existentes
                const form = document.getElementById('productForm');
                const existingPhotos = JSON.parse(form.dataset.existingPhotos || '[]');
                 if (existingPhotos.length > 0) {
                    previewContainer.innerHTML = existingPhotos.map(url => getFilePreviewHTML(url, true)).join('');
                } else {
                    previewContainer.innerHTML = '<p>Nenhuma imagem ou arquivo selecionado.</p>';
                }
            }
        });
    }
}

