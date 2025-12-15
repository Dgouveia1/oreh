import { supabaseClient, logEvent } from './api.js';
import { showToast } from './ui.js';

// Configurações
const agendaStartHour = 6;
const agendaEndHour = 23; // Vai até 23:59

// Estado
let currentScheduleDate = new Date();
let currentView = 'week'; // 'day', 'week', 'month'

// --- FUNÇÕES DE NAVEGAÇÃO E CONTROLE ---

export function switchView(view) {
    if (['day', 'week', 'month'].includes(view)) {
        currentView = view;

        // Atualiza UI dos botões
        document.querySelectorAll('.agenda-view-switcher .btn').forEach(btn => {
            if (btn.dataset.view === view) btn.classList.add('active');
            else btn.classList.remove('active');
        });

        loadAgenda();
    }
}

export function navigateAgenda(direction) {
    // direction: -1 (anterior) ou 1 (próximo)

    if (currentView === 'day') {
        currentScheduleDate.setDate(currentScheduleDate.getDate() + direction);
    } else if (currentView === 'week') {
        currentScheduleDate.setDate(currentScheduleDate.getDate() + (direction * 7));
    } else if (currentView === 'month') {
        currentScheduleDate.setMonth(currentScheduleDate.getMonth() + direction);
    }
    loadAgenda();
}

export function goToToday() {
    currentScheduleDate = new Date();
    loadAgenda();
}

function updateDateDisplay(start, end) {
    const display = document.getElementById('currentDateDisplay');
    if (!display) return;

    const optionsMonth = { month: 'long', year: 'numeric' };

    if (currentView === 'month') {
        // Exibe "Dezembro 2024"
        display.textContent = currentScheduleDate.toLocaleDateString('pt-BR', optionsMonth);
        // Capitalize first letter
        display.textContent = display.textContent.charAt(0).toUpperCase() + display.textContent.slice(1);
    } else if (currentView === 'day') {
        // Exibe "15 de Dezembro"
        const optionsDay = { day: 'numeric', month: 'long' };
        display.textContent = currentScheduleDate.toLocaleDateString('pt-BR', optionsDay);
    } else {
        // View Semana (Week)
        const startDay = start.getDate();
        const startMonth = start.toLocaleString('pt-BR', { month: 'short' });
        const endDay = end.getDate();
        const endMonth = end.toLocaleString('pt-BR', { month: 'short' });

        if (start.getMonth() === end.getMonth()) {
            display.textContent = `${startDay} - ${endDay} de ${start.toLocaleString('pt-BR', { month: 'long' })}`;
        } else {
            display.textContent = `${startDay} de ${startMonth} - ${endDay} de ${endMonth}`;
        }
    }
}

// --- LÓGICA DE DADOS (SUPABASE) ---

export async function saveEvent(event) {
    event.preventDefault();
    const saveBtn = event.target.querySelector('button[type="submit"]');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Salvando...';

    const clienteNome = document.getElementById('eventCliente').value;
    const clienteTelefone = document.getElementById('eventTelefone').value;

    const newEvent = {
        assunto: document.getElementById('eventAssunto').value,
        cliente: clienteNome,
        telefone: clienteTelefone,
        local: document.getElementById('eventLocal').value,
        data: document.getElementById('eventData').value,
        hora_inicio: document.getElementById('eventHoraInicio').value,
        hora_fim: document.getElementById('eventHoraFim').value,
    };

    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error("Utilizador não autenticado.");
        const { data: profile } = await supabaseClient.from('users').select('company_id').eq('id', user.id).single();
        if (!profile) throw new Error("Perfil do utilizador não encontrado.");

        newEvent.company_id = profile.company_id;

        // 1. Salva o evento na agenda
        const { error: eventError } = await supabaseClient.from('events').insert([newEvent]);
        if (eventError) throw eventError;

        // 2. Salva ou atualiza o cliente na tabela 'clients'
        if (clienteNome && clienteTelefone) {
            const { data: existingClient } = await supabaseClient
                .from('clients')
                .select('id')
                .eq('company_id', profile.company_id)
                .eq('phone', clienteTelefone.replace(/\D/g, ''))
                .single();

            if (!existingClient) {
                const { error: clientError } = await supabaseClient
                    .from('clients')
                    .insert([{
                        company_id: profile.company_id,
                        name: clienteNome,
                        phone: clienteTelefone.replace(/\D/g, ''),
                        origin: 'Agenda Manual',
                        status: 'Ativo',
                        created_at: new Date().toISOString()
                    }]);

                if (clientError) console.warn('Erro ao salvar cliente automático:', clientError);
            }
        }

        showToast('Evento criado com sucesso!', 'success');
        document.getElementById('eventFormModal').style.display = 'none';
        document.getElementById('eventForm').reset();
        loadAgenda(); // Recarrega a visualização atual
    } catch (error) {
        console.error('Erro ao salvar evento:', error);
        showToast(error.message, 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Salvar Evento';
    }
}

export async function deleteEvent(eventId) {
    if (!confirm('Tem certeza que deseja excluir este evento?')) return;

    const deleteBtn = document.getElementById('deleteEventBtn');
    if (deleteBtn) {
        deleteBtn.disabled = true;
        deleteBtn.textContent = 'Excluindo...';
    }

    try {
        const { error } = await supabaseClient.from('events').delete().eq('id', eventId);
        if (error) throw error;

        showToast('Evento excluído com sucesso!', 'success');
        document.getElementById('eventDetailModal').style.display = 'none';
        loadAgenda();
    } catch (error) {
        console.error('Erro ao excluir evento:', error);
        showToast('Falha ao excluir o evento.', 'error');
    } finally {
        if (deleteBtn) {
            deleteBtn.disabled = false;
            deleteBtn.textContent = 'Excluir Evento';
        }
    }
}

export async function loadAgenda() {
    const agendaWrapper = document.querySelector('.agenda-wrapper');
    if (!agendaWrapper) return;

    // Calcular range de datas baseado na view
    let startDate, endDate;

    if (currentView === 'day') {
        startDate = new Date(currentScheduleDate);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(currentScheduleDate);
        endDate.setHours(23, 59, 59, 999);
    } else if (currentView === 'week') {
        startDate = new Date(currentScheduleDate);
        startDate.setDate(startDate.getDate() - startDate.getDay()); // Domingo
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6); // Sábado
        endDate.setHours(23, 59, 59, 999);
    } else if (currentView === 'month') {
        startDate = new Date(currentScheduleDate.getFullYear(), currentScheduleDate.getMonth(), 1);
        endDate = new Date(currentScheduleDate.getFullYear(), currentScheduleDate.getMonth() + 1, 0);
        endDate.setHours(23, 59, 59, 999);

        // Ajuste para exibir dias da semana anterior/próxima na grid do mês
        // Mas para query no banco, isso já cobriria. 
        // Para renderizar a grid certinha (começando domingo), ajustamos o start render, mas query pode ser mais ampla.
        const startRender = new Date(startDate);
        startRender.setDate(startRender.getDate() - startRender.getDay());

        const endRender = new Date(endDate);
        // Completa a semana final
        if (endRender.getDay() < 6) {
            endRender.setDate(endRender.getDate() + (6 - endRender.getDay()));
        }

        // Vamos buscar eventos desse range estendido para a grid ficar bonita
        startDate = startRender;
        endDate = endRender;
    }

    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error("Utilizador não autenticado.");
        const { data: profile } = await supabaseClient.from('users').select('company_id').eq('id', user.id).single();

        const { data: events, error } = await supabaseClient
            .from('events')
            .select('*')
            .eq('company_id', profile.company_id)
            .gte('data', startDate.toISOString().split('T')[0])
            .lte('data', endDate.toISOString().split('T')[0]);

        if (error) throw error;

        // Renderiza
        if (currentView === 'month') {
            renderMonthView(events || [], startDate, endDate);
        } else {
            renderDayWeekView(events || [], currentView === 'day');
        }

        // Atualiza título da data (passamos as datas de referencia da view, não o range estendido da grid)
        if (currentView === 'month') {
            updateDateDisplay(null, null); // Usa currentScheduleDate interno
        } else {
            // Recalcula start/end oficiais da view para display (ignora grid padding)
            let displayStart = new Date(currentScheduleDate);
            let displayEnd = new Date(currentScheduleDate);
            if (currentView === 'week') {
                displayStart.setDate(displayStart.getDate() - displayStart.getDay());
                displayEnd.setDate(displayStart.getDate() + 6);
            }
            updateDateDisplay(displayStart, displayEnd);
        }

    } catch (error) {
        console.error("Erro ao carregar agenda:", error);
        showToast("Erro ao carregar agenda.", 'error');
    }
}

// --- RENDERIZAÇÃO ---

function renderDayWeekView(events, isDayView) {
    const wrapper = document.querySelector('.agenda-wrapper');
    wrapper.innerHTML = `
        <div class="agenda-view-container">
            <div class="agenda-timeline" id="agendaTimeline"></div>
            <div class="agenda-grid-scroll-area">
                <div class="agenda-header" id="agendaHeader"></div>
                <div class="agenda-body" id="agendaBody"></div>
            </div>
        </div>
    `;

    const timeline = document.getElementById('agendaTimeline');
    const header = document.getElementById('agendaHeader');
    const body = document.getElementById('agendaBody');

    // 1. Timeline (Horas)
    for (let hour = agendaStartHour; hour <= agendaEndHour; hour++) {
        const timeSlot = document.createElement('div');
        timeSlot.className = 'time-slot';
        timeSlot.textContent = `${hour.toString().padStart(2, '0')}:00`;
        timeline.appendChild(timeSlot);
    }

    // 2. Colunas
    const daysToShow = isDayView ? 1 : 7;
    const startDate = new Date(currentScheduleDate);
    if (!isDayView) {
        startDate.setDate(startDate.getDate() - startDate.getDay()); // Domingo
    }

    // Configura Grid CSS
    const colTemplate = `repeat(${daysToShow}, 1fr)`;
    header.style.gridTemplateColumns = colTemplate;
    body.style.gridTemplateColumns = colTemplate;

    // Altura mínima para mobile se for semana
    if (window.innerWidth <= 768 && !isDayView) {
        header.style.minWidth = '600px';
        body.style.minWidth = '600px';
    } else {
        header.style.minWidth = '100%';
        body.style.minWidth = '100%';
    }

    for (let i = 0; i < daysToShow; i++) {
        const dayDate = new Date(startDate);
        dayDate.setDate(startDate.getDate() + i);

        // Header
        const dayHeader = document.createElement('div');
        dayHeader.className = 'day-header';
        const isToday = new Date().toDateString() === dayDate.toDateString();
        if (isToday) dayHeader.classList.add('today');

        const dayName = dayDate.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').toUpperCase();
        const dayNumber = dayDate.getDate();

        // Se for view de dia, mostra dia da semana completo
        const headerText = isDayView
            ? `${dayDate.toLocaleDateString('pt-BR', { weekday: 'long' })}`
            : dayName;

        dayHeader.innerHTML = `<span style="font-size: 0.9em; text-transform: uppercase;">${headerText}</span> <strong>${dayNumber}</strong>`;
        header.appendChild(dayHeader);

        // Body Column
        const dayColumn = document.createElement('div');
        dayColumn.className = 'day-column';
        if (isToday) dayColumn.classList.add('today-column');
        dayColumn.dataset.date = dayDate.toLocaleDateString('en-CA'); // YYYY-MM-DD
        body.appendChild(dayColumn);
    }

    // 3. Eventos
    renderEventsOnColumns(events, body);
}

function renderEventsOnColumns(events, bodyContainer) {
    if (!events || events.length === 0) return;

    events.forEach(event => {
        const targetColumn = bodyContainer.querySelector(`.day-column[data-date="${event.data}"]`);
        if (targetColumn) {
            const eventCard = document.createElement('div');
            eventCard.className = 'event-card';
            eventCard.innerHTML = `<strong>${event.assunto}</strong><small>${event.cliente || ''}</small>`;

            const [startHour, startMinute] = event.hora_inicio.split(':').map(Number);
            const [endHour, endMinute] = event.hora_fim.split(':').map(Number);

            // Calcular posição e altura
            // agendaStartHour = 6. Se evento for 8:00 -> 2h depois do inicio
            const startMinutesSinceStart = ((startHour - agendaStartHour) * 60) + startMinute;

            // Duração
            const startTotalMinutes = (startHour * 60) + startMinute;
            const endTotalMinutes = (endHour * 60) + endMinute;
            const durationInMinutes = Math.max(30, endTotalMinutes - startTotalMinutes);

            // 1 hora = 6rem. 1 min = 0.1rem
            const minuteToRem = 6 / 60;

            if (startMinutesSinceStart < 0) {
                // Evento começa antes das 6am? Ignorar ou ajustar?
                // Por enquanto, ignora visualização se começar muito antes, ou clampa.
                return;
            }

            eventCard.style.top = `${startMinutesSinceStart * minuteToRem}rem`;
            eventCard.style.height = `${durationInMinutes * minuteToRem}rem`;

            // Metadata
            eventCard.dataset.id = event.id;
            eventCard.dataset.assunto = event.assunto;
            eventCard.dataset.cliente = event.cliente;
            eventCard.dataset.telefone = event.telefone;
            eventCard.dataset.local = event.local;
            eventCard.dataset.data = event.data;
            eventCard.dataset.hora_inicio = event.hora_inicio;
            eventCard.dataset.hora_fim = event.hora_fim;
            eventCard.dataset.formatted_date = new Date(`${event.data}T00:00:00`).toLocaleDateString('pt-BR');

            targetColumn.appendChild(eventCard);
        }
    });
}

function renderMonthView(events, startDate, endDate) {
    const wrapper = document.querySelector('.agenda-wrapper');
    wrapper.innerHTML = `
        <div class="month-view-container">
            <div class="month-header">
                <div class="month-header-cell">DOM</div>
                <div class="month-header-cell">SEG</div>
                <div class="month-header-cell">TER</div>
                <div class="month-header-cell">QUA</div>
                <div class="month-header-cell">QUI</div>
                <div class="month-header-cell">SEX</div>
                <div class="month-header-cell">SÁB</div>
            </div>
            <div class="month-grid" id="monthGrid"></div>
        </div>
    `;

    const grid = document.getElementById('monthGrid');

    // Loop de startDate até endDate (que cobre semanas completas)
    let iterDate = new Date(startDate);
    while (iterDate <= endDate) {
        const dayCell = document.createElement('div');
        dayCell.className = 'month-day';

        const isToday = new Date().toDateString() === iterDate.toDateString();
        if (isToday) dayCell.classList.add('today');

        // Se o mês não for o atual
        if (iterDate.getMonth() !== currentScheduleDate.getMonth()) {
            dayCell.classList.add('other-month');
        }

        const dateStr = iterDate.toLocaleDateString('en-CA');
        dayCell.dataset.date = dateStr;

        const dayNumber = document.createElement('div');
        dayNumber.className = 'month-day-number';
        dayNumber.textContent = iterDate.getDate();
        dayCell.appendChild(dayNumber);

        // Adicionar eventos do dia (pontinhos ou lista pequena)
        const dayEvents = events.filter(e => e.data === dateStr);
        dayEvents.sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));

        // Limite de display para não estourar a celula
        const maxDisplay = 3;
        dayEvents.slice(0, maxDisplay).forEach(event => {
            const dot = document.createElement('div');
            dot.className = 'month-event-dot';
            dot.textContent = `${event.hora_inicio} ${event.assunto}`;

            // Metadata para click
            dot.dataset.id = event.id;
            dot.dataset.assunto = event.assunto;
            dot.dataset.cliente = event.cliente;
            dot.dataset.telefone = event.telefone;
            dot.dataset.local = event.local;
            dot.dataset.data = event.data;
            dot.dataset.hora_inicio = event.hora_inicio;
            dot.dataset.hora_fim = event.hora_fim;
            dot.dataset.formatted_date = new Date(`${event.data}T00:00:00`).toLocaleDateString('pt-BR');

            // Evitar propagação do click no dot para o dia (se quisermos abrir o evento)
            // Mas vamos deixar o listener global lidar com isso
            dot.classList.add('event-card-trigger'); // Classe auxiliar para identificar click

            dayCell.appendChild(dot);
        });

        if (dayEvents.length > maxDisplay) {
            const more = document.createElement('small');
            more.style.color = 'var(--text-color-light)';
            more.style.paddingLeft = '0.5rem';
            more.textContent = `+${dayEvents.length - maxDisplay} mais`;
            dayCell.appendChild(more);
        }

        grid.appendChild(dayCell);
        iterDate.setDate(iterDate.getDate() + 1);
    }
}