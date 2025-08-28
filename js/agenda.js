import { supabaseClient } from './api.js';
import { showToast } from './ui.js';

const agendaStartHour = 7;
const agendaEndHour = 22;
let currentScheduleDate = new Date();

// --- FUNÇÕES DE CONTROLO ---

function changeDay(offset) {
    currentScheduleDate.setDate(currentScheduleDate.getDate() + offset);
    loadAgenda();
}

function updateDateDisplay() {
    const display = document.getElementById('currentDateDisplay');
    if (!display) return;

    const startOfWeek = new Date(currentScheduleDate);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);

    const startMonth = startOfWeek.toLocaleString('pt-BR', { month: 'short' });
    const endMonth = endOfWeek.toLocaleString('pt-BR', { month: 'short' });

    if (startMonth === endMonth) {
        display.textContent = `${startOfWeek.getDate()} - ${endOfWeek.getDate()} de ${startOfWeek.toLocaleString('pt-BR', { month: 'long' })}`;
    } else {
        display.textContent = `${startOfWeek.getDate()} de ${startMonth} - ${endOfWeek.getDate()} de ${endMonth}`;
    }
}


// --- LÓGICA DE DADOS (SUPABASE) ---

export async function saveEvent(event) {
    event.preventDefault();
    const newEvent = {
        assunto: document.getElementById('eventAssunto').value,
        cliente: document.getElementById('eventCliente').value,
        telefone: document.getElementById('eventTelefone').value,
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

        const { error } = await supabaseClient.from('events').insert([newEvent]);
        if (error) throw error;

        showToast('Evento criado com sucesso!', 'success');
        document.getElementById('eventFormModal').style.display = 'none';
        document.getElementById('eventForm').reset();
        loadAgenda();
    } catch (error) {
        console.error('Erro ao salvar evento:', error);
        showToast(error.message, 'error');
    }
}

export async function loadAgenda() {
    console.log("[OREH] A carregar a agenda do Supabase...");
    
    const agendaBody = document.getElementById('agendaBody');
    if (agendaBody) {
        agendaBody.innerHTML = '<p class="loading-message">A carregar agenda...</p>';
    } else {
        console.error("O corpo da agenda ('agendaBody') não foi encontrado!");
        return;
    }

    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error("Utilizador não autenticado.");

        const { data: profile } = await supabaseClient.from('users').select('company_id').eq('id', user.id).single();
        if (!profile) throw new Error("Perfil do utilizador não encontrado.");

        const startOfWeek = new Date(currentScheduleDate);
        startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
        startOfWeek.setHours(0, 0, 0, 0);

        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);

        const { data: events, error } = await supabaseClient
            .from('events')
            .select('*')
            .eq('company_id', profile.company_id)
            .gte('data', startOfWeek.toISOString().split('T')[0])
            .lte('data', endOfWeek.toISOString().split('T')[0]);

        if (error) throw error;
        
        renderSchedule(events || []);

    } catch (error) {
        console.error("Erro ao carregar a agenda:", error);
        showToast("Falha ao carregar os eventos da agenda.", 'error');
        if (agendaBody) agendaBody.innerHTML = `<p class="loading-message error">${error.message}</p>`;
    }
}


// --- RENDERIZAÇÃO DA GRELHA E EVENTOS ---

function renderSchedule(events) {
    const timeline = document.getElementById('agendaTimeline');
    const header = document.getElementById('agendaHeader');
    const body = document.getElementById('agendaBody');
    const gridContainer = document.getElementById('agendaGridContainer');

    if (!timeline || !header || !body || !gridContainer) {
        console.error("Elementos essenciais da agenda não encontrados para renderização.");
        return;
    }

    timeline.innerHTML = '';
    header.innerHTML = '';
    body.innerHTML = '';

    for (let hour = agendaStartHour; hour <= agendaEndHour; hour++) {
        const timeSlot = document.createElement('div');
        timeSlot.className = 'time-slot';
        const timeSpan = document.createElement('span');
        timeSpan.textContent = `${hour.toString().padStart(2, '0')}:00`;
        timeSlot.appendChild(timeSpan);
        timeline.appendChild(timeSlot);
    }
    
    for (let i = 0; i < 7; i++) {
        const dayDate = new Date(currentScheduleDate);
        dayDate.setDate(currentScheduleDate.getDate() - currentScheduleDate.getDay() + i);

        const dayHeader = document.createElement('div');
        dayHeader.className = 'day-header';
        const dayName = dayDate.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').toUpperCase();
        const dayNumber = dayDate.getDate();
        dayHeader.innerHTML = `${dayName} <strong>${dayNumber}</strong>`;
        header.appendChild(dayHeader);

        const dayColumn = document.createElement('div');
        dayColumn.className = 'day-column';
        dayColumn.dataset.date = dayDate.toISOString().split('T')[0];
        body.appendChild(dayColumn);
    }
    
    if (events.length > 0) {
        events.forEach(event => {
            const targetColumn = body.querySelector(`.day-column[data-date="${event.data}"]`);
            if (targetColumn) {
                const eventCard = document.createElement('div');
                eventCard.className = 'event-card';
                eventCard.innerHTML = `<strong>${event.assunto}</strong><small>${event.cliente || ''}</small>`;

                const [startHour, startMinute] = event.hora_inicio.split(':').map(Number);
                const [endHour, endMinute] = event.hora_fim.split(':').map(Number);

                const startMinutesSinceStart = ((startHour - agendaStartHour) * 60) + startMinute;
                
                // ✅ CORREÇÃO DEFINITIVA NO CÁLCULO DA DURAÇÃO
                const startTotalMinutes = (startHour * 60) + startMinute;
                const endTotalMinutes = (endHour * 60) + endMinute;
                const durationInMinutes = Math.max(30, endTotalMinutes - startTotalMinutes);
                
                eventCard.style.top = `${startMinutesSinceStart}px`;
                eventCard.style.height = `${durationInMinutes}px`;

                event.formatted_date = new Date(`${event.data}T00:00:00`).toLocaleDateString('pt-BR', {timeZone: 'UTC'});
                Object.keys(event).forEach(key => {
                    if(event[key] !== null) eventCard.dataset[key] = event[key];
                });

                targetColumn.appendChild(eventCard);
            }
        });
    } else {
        const noEventsMessage = document.createElement('p');
        noEventsMessage.className = 'loading-message';
        noEventsMessage.textContent = 'Nenhum evento para esta semana.';
        body.appendChild(noEventsMessage);
    }

    requestAnimationFrame(() => {
        const headerHeight = header.offsetHeight;
        timeline.style.paddingTop = `${headerHeight}px`;
    });

    if (timeline.syncScrollListener) {
        gridContainer.removeEventListener('scroll', timeline.syncScrollListener);
    }
    timeline.syncScrollListener = () => {
        timeline.scrollTop = gridContainer.scrollTop;
    };
    gridContainer.addEventListener('scroll', timeline.syncScrollListener);

    updateDateDisplay();
}

export { changeDay };
