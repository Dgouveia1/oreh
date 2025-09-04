// Importa as funções dos novos módulos para serem usadas na navegação
import { updateConnectionStatus, stopStatusPolling } from './status.js';
import { loadAgenda } from './agenda.js';
import { loadAtendimentos } from './atendimentos.js';
import { loadAiSettings } from './ia.js';
import { loadDriveFiles } from './drive.js';
import { loadSettings } from './settings.js';



// =================================================================================
// FUNÇÕES DE UI GENÉRICAS
// =================================================================================

export function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    setTimeout(() => {
        toast.className = toast.className.replace('show', '');
    }, 3000);
}

export function setupNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    const pageContents = document.querySelectorAll('.page-content');
    const pageTitle = document.getElementById('pageTitle');

    navLinks.forEach(link => {
        link.addEventListener('click', function (e) {
            e.preventDefault();
            const targetPage = this.getAttribute('data-page');
            
            if (targetPage !== 'status') {
                stopStatusPolling();
            }

            navLinks.forEach(l => l.classList.remove('active'));
            this.classList.add('active');

            pageContents.forEach(page => {
                page.classList.toggle('active', page.id === `${targetPage}Page`);
            });

            pageTitle.textContent = this.querySelector('span')?.textContent || 'Dashboard';

            switch (targetPage) {
                case 'status':
                    updateConnectionStatus();
                    break;
                case 'agenda':
                    loadAgenda();
                    break;
                case 'atendimentos':
                    loadAtendimentos();
                    break;
                case 'drive':
                    loadDriveFiles();
                    break;
                case 'ia':
                    loadAiSettings();
                    break;
                case 'settings':
                    loadSettings();
                    break;
            }
        });
    });
}
export function setupUploadModal() {
    const openUploadModalBtn = document.getElementById('openUploadModalBtn');
    const uploadModal = document.getElementById('uploadModal');
    if (openUploadModalBtn) {
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
            if (event.target == modal) {
                modal.style.display = 'none';
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
    const adminLink = document.getElementById('adminNav');
    if (!adminLink) return;

    if (userProfile && userProfile.role === 'admin') {
        adminLink.style.display = 'block';
    } else {
        adminLink.style.display = 'none';
    }
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