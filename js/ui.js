// Importa as funções dos novos módulos para serem usadas na navegação
import { updateConnectionStatus, stopStatusPolling } from './status.js';
import { loadAgenda } from './agenda.js';
import { loadAtendimentos, cleanupAtendimentos } from './atendimentos.js';
import { loadAiSettings } from './ia.js';
import { loadDriveFiles } from './drive.js';
import { loadSettings } from './settings.js';
import { loadFinancesPage } from './finances.js';
import { loadDashboard, cleanupDashboard } from './dashboard.js';
import { loadProducts, cleanupProducts } from './produtos.js';
import { loadClients, cleanupClients } from './clientes.js'; // ✅ NOVO IMPORT

// =================================================================================
// FUNÇÕES DE UI GENÉRICAS
// =================================================================================

export function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    setTimeout(() => {
        toast.className = toast.className.replace('show', '');
    }, 3000);
}

export function setupNavigation() {
    const navLinks = document.querySelectorAll('.sidebar .nav-links > li > .nav-link');
    const pageContents = document.querySelectorAll('.page-content');
    const pageTitle = document.getElementById('pageTitle');
    const moreMenuBtn = document.getElementById('moreMenuBtn');
    const moreMenuModal = document.getElementById('moreMenuModal');
    const moreMenuLinks = document.querySelectorAll('.more-menu-links .nav-link');

    // Função auxiliar para navegar entre as páginas
    const navigateToPage = (targetPage, linkElement) => {
        // Limpa subscrições/intervalos da página anterior
        cleanupDashboard();
        cleanupAtendimentos();
        cleanupProducts();
        cleanupClients();
        if (targetPage !== 'status') {
            stopStatusPolling();
        }

        // Mostra a página correta
        pageContents.forEach(page => {
            page.classList.toggle('active', page.id === `${targetPage}Page`);
        });

        // Atualiza o título da página
        pageTitle.textContent = linkElement.querySelector('span')?.textContent || 'Dashboard';

        // Carrega os dados da nova página
        switch (targetPage) {
            case 'dashboard': loadDashboard(); break;
            case 'clients': loadClients(); break;
            case 'status': updateConnectionStatus(); break;
            case 'agenda': loadAgenda(); break;
            case 'atendimentos': loadAtendimentos(); break;
            case 'produtos': loadProducts(); break;
            case 'drive': loadDriveFiles(); break;
            case 'ia': loadAiSettings(); break;
            case 'finances': loadFinancesPage(); break;
            case 'settings': loadSettings(); break;
        }
    };

    // Adiciona listeners para os links principais de navegação
    navLinks.forEach(link => {
        if (link.id === 'moreMenuBtn') return; // Ignora o botão "Mais" por enquanto
        
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetPage = this.getAttribute('data-page');
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            this.classList.add('active');
            navigateToPage(targetPage, this);
        });
    });

    // Listener para o botão "Mais" abrir o modal
    if (moreMenuBtn && moreMenuModal) {
        moreMenuBtn.addEventListener('click', (e) => {
            e.preventDefault();
            moreMenuModal.style.display = 'flex';
        });
    }

    // Listeners para os links dentro do modal "Mais"
    moreMenuLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetPage = this.getAttribute('data-page');

            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            if (moreMenuBtn) moreMenuBtn.classList.add('active');
            
            navigateToPage(targetPage, this);
            moreMenuModal.style.display = 'none'; // Fecha o modal
        });
    });

    setupScrollListener();
}

function setupScrollListener() {
    const sidebar = document.querySelector('.sidebar');
    const mainContent = document.querySelector('.main-content');
    if (!sidebar || !mainContent) return;

    let lastScrollY = mainContent.scrollTop;
    
    const handleScroll = () => {
        if (window.innerWidth > 768) { // Apenas em telas móveis
            sidebar.classList.remove('sidebar--hidden');
            return;
        }
        const currentScrollY = mainContent.scrollTop;
        if (currentScrollY > lastScrollY && currentScrollY > 80) { // Rolando para baixo
            sidebar.classList.add('sidebar--hidden');
        } else { // Rolando para cima
            sidebar.classList.remove('sidebar--hidden');
        }
        lastScrollY = currentScrollY;
    };

    let isThrottled = false;
    mainContent.addEventListener('scroll', () => {
        if (!isThrottled) {
            window.requestAnimationFrame(() => {
                handleScroll();
                isThrottled = false;
            });
            isThrottled = true;
        }
    });
}

export function setupUploadModal() {
    const openUploadModalBtn = document.getElementById('openUploadModalBtn');
    const uploadModal = document.getElementById('uploadModal');
    if (openUploadModalBtn && uploadModal) {
        openUploadModalBtn.addEventListener('click', () => {
            uploadModal.style.display = 'flex';
        });
    }
}

export function setupModals() {
    const modals = document.querySelectorAll('.modal');
    const closeButtons = document.querySelectorAll('.close-modal');

    closeButtons.forEach(button => {
        button.addEventListener('click', () => {
            button.closest('.modal').style.display = 'none';
        });
    });

    window.addEventListener('click', (event) => {
        modals.forEach(modal => {
            if (event.target === modal) {
                // Para modais que deslizam de baixo, permite fechar clicando no fundo
                if (!event.target.querySelector('.modal-content-bottom')) {
                    modal.style.display = 'none';
                }
            }
        });
    });
}


export function updateUserInfo(name, initial) {
    const userNameDisplay = document.getElementById('userNameDisplay');
    const userAvatar = document.querySelector('.user-avatar');

    if (userNameDisplay && name) {
        userNameDisplay.textContent = name;
    }

    if (userAvatar && initial) {
        userAvatar.textContent = initial;
    }
}

export function setupRoleBasedUI(userProfile) {
    // Lógica para UI baseada em roles (funções) pode ser adicionada aqui
}

export function setupThemeToggle() {
    const themeToggle = document.getElementById('themeToggle');
    if (!themeToggle) return;

    const applyTheme = (theme) => {
        if (theme === 'dark') {
            document.body.classList.add('dark-mode');
            themeToggle.checked = true;
        } else {
            document.body.classList.remove('dark-mode');
            themeToggle.checked = false;
        }
    };

    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        applyTheme(savedTheme);
    } else {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        applyTheme(prefersDark ? 'dark' : 'light');
    }

    themeToggle.addEventListener('change', () => {
        const newTheme = themeToggle.checked ? 'dark' : 'light';
        localStorage.setItem('theme', newTheme);
        applyTheme(newTheme);
    });
}
