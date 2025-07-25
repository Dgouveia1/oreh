document.addEventListener('DOMContentLoaded', function () {
    
    // --- LÓGICA DE LOGIN E NAVEGAÇÃO ---
    function checkLogin() {
        if (localStorage.getItem('loggedIn') === 'true') {
            document.getElementById('loginPage').style.display = 'none';
            document.getElementById('appContainer').style.display = 'block';
        } else {
            document.getElementById('loginPage').style.display = 'flex';
            document.getElementById('appContainer').style.display = 'none';
        }
    }

    function login() {
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        if (username === 'admin' && password === 'admin') {
            localStorage.setItem('loggedIn', 'true');
            checkLogin();
        } else {
            alert('Usuário ou senha incorretos!');
        }
    }

    function logout() {
        localStorage.removeItem('loggedIn');
        checkLogin();
        document.getElementById('username').value = '';
        document.getElementById('password').value = '';
    }

    function setupNavigation() {
        const navLinks = document.querySelectorAll('.nav-link');
        const pageContents = document.querySelectorAll('.page-content');
        const pageTitle = document.getElementById('pageTitle');
        
        navLinks.forEach(link => {
            link.addEventListener('click', function (e) {
                e.preventDefault();
                const targetPage = this.getAttribute('data-page');
                
                navLinks.forEach(l => l.classList.remove('active'));
                this.classList.add('active');
                
                pageContents.forEach(page => {
                    if (page.id === `${targetPage}Page`) {
                        page.classList.add('active');
                    } else {
                        page.classList.remove('active');
                    }
                });
                
                pageTitle.textContent = this.querySelector('span').textContent;
                
                if (targetPage === 'status') updateConnectionStatus();
                if (targetPage === 'drive') loadDriveFiles();
                if (targetPage === 'agenda') loadAgenda();
            });
        });
    }

    // --- LÓGICA DA SEÇÃO STATUS DE CONEXÃO ---
    async function updateConnectionStatus() {
        const statusElement = document.getElementById('connectionStatus');
        const qrcodeContainer = document.querySelector('.qrcode-container');
        const qrcodeOutput = document.getElementById('qrcode-output');
        const disconnectBtn = document.getElementById('disconnectBtn');
        const webhookUrl = 'https://automacao-n8n-webhook.noijim.easypanel.host/webhook/conectar-whats';

        if (!statusElement) return;

        statusElement.textContent = 'VERIFICANDO...';
        statusElement.style.color = 'var(--warning)';
        disconnectBtn.style.display = 'none';
        qrcodeContainer.style.display = 'none';

        try {
            const response = await fetch(webhookUrl);
            if (!response.ok) throw new Error(`Erro de rede: ${response.status}`);
            
            const data = await response.json();
            const statusInfo = data[0];

            if (statusInfo && statusInfo.success) {
                if (statusInfo.data.instance && statusInfo.data.instance.state === 'open') {
                    statusElement.textContent = 'CONECTADO';
                    statusElement.style.color = 'var(--success)';
                    disconnectBtn.style.display = 'inline-block';
                    qrcodeContainer.style.display = 'none';
                } else if (statusInfo.data.base64) {
                    statusElement.textContent = 'AGUARDANDO CONEXÃO';
                    statusElement.style.color = 'var(--warning)';
                    qrcodeOutput.innerHTML = `<img src="${statusInfo.data.base64}" alt="QR Code para conectar">`;
                    qrcodeContainer.style.display = 'block';
                }
            } else {
                throw new Error('Resposta do webhook inválida.');
            }
        } catch (error) {
            console.error("Falha ao buscar status da conexão:", error);
            statusElement.textContent = 'ERRO DE CONEXÃO';
            statusElement.style.color = 'var(--danger)';
        }
    }

    async function disconnectWhatsapp() {
        const disconnectBtn = document.getElementById('disconnectBtn');
        disconnectBtn.disabled = true;
        disconnectBtn.textContent = 'Desconectando...';
        
        try {
            const response = await fetch('https://automacao-n8n-webhook.noijim.easypanel.host/webhook/desconectar-whats', {
                method: 'POST'
            });
            if (!response.ok) throw new Error("Falha ao enviar comando.");

            alert("Comando de desconexão enviado!");
            setTimeout(updateConnectionStatus, 1000);

        } catch (error) {
            alert("Erro ao tentar desconectar.");
            console.error(error);
        } finally {
            disconnectBtn.disabled = false;
            disconnectBtn.textContent = 'Desconectar';
        }
    }

    // --- LÓGICA DA AGENDA ---
    async function loadAgenda() {
        const webhookUrl = 'https://automacao-n8n-webhook.noijim.easypanel.host/webhook/dados-agenda';
        const timelineEl = document.getElementById('agendaTimeline');
        const headerEl = document.getElementById('agendaHeader');
        const bodyEl = document.getElementById('agendaBody');
        
        timelineEl.innerHTML = '';
        headerEl.innerHTML = '';
        bodyEl.innerHTML = '';

        for (let hour = 7; hour <= 22; hour++) {
            const hourEl = document.createElement('div');
            hourEl.className = 'timeline-hour';
            hourEl.textContent = `${hour.toString().padStart(2, '0')}:00`;
            timelineEl.appendChild(hourEl);
        }

        const days = [];
        for (let i = 0; i < 7; i++) {
            const date = new Date();
            date.setDate(date.getDate() + i);
            days.push(date);

            const dayHeader = document.createElement('div');
            dayHeader.className = 'day-header';
            dayHeader.innerHTML = `${date.toLocaleDateString('pt-BR', { weekday: 'short' })}<br>${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
            headerEl.appendChild(dayHeader);

            const dayColumn = document.createElement('div');
            dayColumn.className = 'day-column';
            dayColumn.setAttribute('data-date', date.toISOString().split('T')[0]);
            bodyEl.appendChild(dayColumn);
        }
        
        try {
            const response = await fetch(webhookUrl);
            if (!response.ok) throw new Error("Erro ao buscar dados da agenda.");
            const events = await response.json();

            events.forEach(event => {
                const [day, month, year] = event.Data.split('/');
                const [startHour, startMinute] = event.hora_inicio.split(':');
                const [endHour, endMinute] = event.hora_fim.split(':');
                
                const eventDateStr = `${year}-${month}-${day}`;
                const column = bodyEl.querySelector(`.day-column[data-date="${eventDateStr}"]`);

                if (column) {
                    const totalMinutesStart = (parseInt(startHour) - 7) * 60 + parseInt(startMinute);
                    const totalMinutesEnd = (parseInt(endHour) - 7) * 60 + parseInt(endMinute);
                    const durationMinutes = totalMinutesEnd - totalMinutesStart;

                    const eventCard = document.createElement('div');
                    eventCard.className = 'event-card';
                    eventCard.textContent = event.assunto;
                    
                    const topPosition = (totalMinutesStart / ((22 - 7) * 60)) * 100;
                    const height = (durationMinutes / ((22 - 7) * 60)) * 100;

                    eventCard.style.top = `${topPosition}%`;
                    eventCard.style.height = `${height}%`;

                    eventCard.dataset.details = JSON.stringify(event);
                    column.appendChild(eventCard);
                }
            });
        } catch(error) {
            console.error("Erro ao carregar eventos:", error);
            bodyEl.innerHTML = "<p>Não foi possível carregar os eventos.</p>";
        }
    }
    
    function showEventDetails(eventData) {
        const event = JSON.parse(eventData);
        document.getElementById('eventDetailAssunto').textContent = event.assunto;
        document.getElementById('eventDetailData').textContent = event.Data;
        document.getElementById('eventDetailHorario').textContent = `${event.hora_inicio} - ${event.hora_fim}`;
        document.getElementById('eventDetailCliente').textContent = event.cliente;
        document.getElementById('eventDetailTelefone').textContent = event.telefone;
        document.getElementById('eventDetailLocal').textContent = event.local;
        
        document.getElementById('eventDetailModal').style.display = 'flex';
    }

    // --- CÓDIGO DO DRIVE RESTAURADO ---
    async function loadDriveFiles() {
        const fileGrid = document.getElementById('fileGrid');
        if (!fileGrid) return;
        
        fileGrid.innerHTML = '<p>Carregando arquivos...</p>';
        try {
            const response = await fetch('https://automacao-n8n-webhook.noijim.easypanel.host/webhook/coleta-arquivos-drive');
            if (!response.ok) throw new Error(`Erro na requisição: ${response.statusText}`);
            
            const files = await response.json();
            fileGrid.innerHTML = '';
            
            const filesArray = Array.isArray(files) ? files : [files];
            if (filesArray.length === 0) {
                fileGrid.innerHTML = '<p>Nenhum arquivo encontrado.</p>';
                return;
            }

            filesArray.forEach(file => {
                const fileLink = `https://drive.google.com/file/d/${file.id}/view`;
                const fileCard = document.createElement('div');
                fileCard.className = 'file-card';
                fileCard.setAttribute('data-file-id', file.id);
                fileCard.innerHTML = `
                    <a href="${fileLink}" target="_blank" class="file-card-link">
                        <div class="file-icon"><i class="fab fa-google-drive"></i></div>
                        <div class="file-name">${file.name}</div>
                    </a>
                    <button class="delete-file-btn" data-id="${file.id}" data-name="${file.name}">
                        <i class="fas fa-trash"></i> Deletar
                    </button>`;
                fileGrid.appendChild(fileCard);
            });
        } catch (error) {
            console.error('Falha ao buscar arquivos do Drive:', error);
            fileGrid.innerHTML = '<p>Não foi possível carregar os arquivos. Tente novamente mais tarde.</p>';
        }
    }

    async function deleteFile(fileId, buttonElement) {
        const webhookUrl = 'https://automacao-n8n-webhook.noijim.easypanel.host/webhook/deleta-arquivos-drive';
        try {
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: fileId }),
            });
            if (!response.ok) throw new Error(`Falha no webhook: ${response.statusText}`);
            
            const fileCard = buttonElement.closest('.file-card');
            fileCard.style.transform = 'scale(0)';
            setTimeout(() => fileCard.remove(), 300);
        } catch (error) {
            console.error('Erro ao deletar arquivo:', error);
            alert('Não foi possível deletar o arquivo. Tente novamente.');
        }
    }

    function setupUploadModal() {
        const uploadModal = document.getElementById('uploadModal');
        const openBtn = document.getElementById('openUploadModalBtn');
        const closeBtn = document.getElementById('closeUploadModalBtn');
        const cancelBtn = document.getElementById('cancelUploadBtn');
        const form = document.getElementById('uploadFileForm');

        if (!uploadModal || !openBtn || !closeBtn || !cancelBtn || !form) return;

        openBtn.addEventListener('click', () => {
            uploadModal.style.display = 'flex';
        });

        const closeModal = () => {
            uploadModal.style.display = 'none';
            form.reset();
        };
        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);

        form.addEventListener('submit', async function(event) {
            event.preventDefault();
            const fileName = document.getElementById('fileNameInput').value;
            const fileInput = document.getElementById('fileUploadInput');
            
            if (fileInput.files.length === 0) {
                alert('Por favor, selecione um arquivo.');
                return;
            }
            
            const file = fileInput.files[0];
            const formData = new FormData();
            formData.append('fileName', fileName);
            formData.append('file', file);

            const submitButton = form.querySelector('button[type="submit"]');
            submitButton.disabled = true;
            submitButton.textContent = 'Enviando...';
            
            try {
                const response = await fetch('https://automacao-n8n-editor.noijim.easypanel.host/webhook-test/upload-arquivos-drive', {
                    method: 'POST',
                    body: formData,
                });
                if (!response.ok) throw new Error('Falha ao enviar o arquivo.');
                
                alert('Arquivo enviado com sucesso!');
                closeModal();
                loadDriveFiles();

            } catch (error) {
                console.error('Erro no upload:', error);
                alert('Ocorreu um erro ao enviar o arquivo.');
            } finally {
                submitButton.disabled = false;
                submitButton.textContent = 'Salvar';
            }
        });
    }

    // --- INICIALIZAÇÃO ---
    checkLogin();
    setupNavigation();
    setupUploadModal();

    // --- LISTENERS DE EVENTOS GLOBAIS ---
    document.getElementById('loginBtn').addEventListener('click', login);
    document.getElementById('logoutBtn').addEventListener('click', logout);
    document.getElementById('password').addEventListener('keypress', e => { if (e.key === 'Enter') login(); });
    
    document.getElementById('disconnectBtn').addEventListener('click', disconnectWhatsapp);
    
    document.getElementById('closeEventDetailModalBtn').addEventListener('click', () => {
        document.getElementById('eventDetailModal').style.display = 'none';
    });
    
    document.body.addEventListener('click', function(event) {
        const eventCard = event.target.closest('.event-card');
        if (eventCard && eventCard.dataset.details) {
            showEventDetails(eventCard.dataset.details);
        }

        const deleteButton = event.target.closest('.delete-file-btn');
        if (deleteButton) {
            const fileId = deleteButton.getAttribute('data-id');
            const fileName = deleteButton.getAttribute('data-name');
            if (confirm(`Tem certeza que deseja excluir o arquivo "${fileName}"?`)) {
                deleteFile(fileId, deleteButton);
            }
        }
    });
});
