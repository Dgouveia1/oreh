import { supabaseClient, logEvent } from './api.js';
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
    const saveBtn = event.target.querySelector('button[type="submit"]');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Salvando...';

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
        logEvent('INFO', `Evento '${newEvent.assunto}' criado na agenda.`);
        document.getElementById('eventFormModal').style.display = 'none';
        document.getElementById('eventForm').reset();
        loadAgenda();
    } catch (error) {
        console.error('Erro ao salvar evento:', error);
        showToast(error.message, 'error');
        logEvent('ERROR', `Falha ao criar evento '${newEvent.assunto}'`, { errorMessage: error.message, stack: error.stack });
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Salvar Evento';
    }
}

export async function loadAgenda() {
    console.log("[OREH] Carregando a agenda do Supabase...");
    
    const agendaBody = document.getElementById('agendaBody');
    if (agendaBody) {
        agendaBody.innerHTML = ''; // Limpa o corpo para reconstrução
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
        logEvent('ERROR', 'Falha ao carregar eventos da agenda', { errorMessage: error.message, stack: error.stack });
    }
}


// --- RENDERIZAÇÃO DA GRELHA E EVENTOS ---

function renderSchedule(events) {
    const timeline = document.getElementById('agendaTimeline');
    const header = document.getElementById('agendaHeader');
    const body = document.getElementById('agendaBody');

    if (!timeline || !header || !body) {
        console.error("Elementos essenciais da agenda não encontrados para renderização.");
        return;
    }

    timeline.innerHTML = '';
    header.innerHTML = '';
    body.innerHTML = ''; // Limpa o corpo da agenda

    // Cria a linha do tempo (horas)
    for (let hour = agendaStartHour; hour <= agendaEndHour; hour++) {
        const timeSlot = document.createElement('div');
        timeSlot.className = 'time-slot';
        timeSlot.textContent = `${hour.toString().padStart(2, '0')}:00`;
        timeline.appendChild(timeSlot);
    }
    
    // Cria o cabeçalho e as colunas dos dias
    for (let i = 0; i < 7; i++) {
        const dayDate = new Date(currentScheduleDate);
        dayDate.setDate(currentScheduleDate.getDate() - currentScheduleDate.getDay() + i);

        // Cabeçalho
        const dayHeader = document.createElement('div');
        dayHeader.className = 'day-header';
        const dayName = dayDate.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').toUpperCase();
        const dayNumber = dayDate.getDate();
        dayHeader.innerHTML = `${dayName} <strong>${dayNumber}</strong>`;
        header.appendChild(dayHeader);

        // Coluna do corpo
        const dayColumn = document.createElement('div');
        dayColumn.className = 'day-column';
        dayColumn.dataset.date = dayDate.toISOString().split('T')[0];
        body.appendChild(dayColumn);
    }
    
    // Renderiza os eventos nas colunas corretas
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
                
                const startTotalMinutes = (startHour * 60) + startMinute;
                const endTotalMinutes = (endHour * 60) + endMinute;
                const durationInMinutes = Math.max(30, endTotalMinutes - startTotalMinutes);
                
                // 1 hora = 6rem, então 1 minuto = 0.1rem.
                const minuteToRem = 6 / 60; 
                eventCard.style.top = `${startMinutesSinceStart * minuteToRem}rem`;
                eventCard.style.height = `${durationInMinutes * minuteToRem}rem`;

                event.formatted_date = new Date(`${event.data}T00:00:00`).toLocaleDateString('pt-BR', {timeZone: 'UTC'});
                Object.keys(event).forEach(key => {
                    if(event[key] !== null) eventCard.dataset[key] = event[key];
                });

                targetColumn.appendChild(eventCard);
            }
        });
    }

    updateDateDisplay();
}

export { changeDay };
