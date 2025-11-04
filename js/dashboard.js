import { supabaseClient, logEvent } from './api.js';
import { showToast } from './ui.js';

// Variáveis para armazenar as instâncias dos gráficos e a subscrição do Supabase
let funilChart = null;
let volumeChart = null;
let chatsSubscription = null;

// Função para atualizar um card de métrica
function updateMetricCard(id, value, prefix = '', suffix = '') {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = `${prefix}${value}${suffix}`;
    }
}

// Função para renderizar o gráfico de funil
function renderFunilChart(data) {
    const ctx = document.getElementById('funilVendasChart')?.getContext('2d');
    if (!ctx) return;

    const chartData = {
        labels: ['Novo', 'Atendimento', 'Agendado'],
        datasets: [{
            label: 'Leads por Etapa',
            data: [data.topo, data.meio, data.fundo],
            backgroundColor: [
                'rgba(52, 152, 219, 0.7)',
                'rgba(241, 196, 15, 0.7)',
                'rgba(46, 204, 113, 0.7)'
            ],
            borderColor: [
                'rgba(52, 152, 219, 1)',
                'rgba(241, 196, 15, 1)',
                'rgba(46, 204, 113, 1)'
            ],
            borderWidth: 1
        }]
    };

    if (funilChart) {
        funilChart.data = chartData;
        funilChart.update();
    } else {
        funilChart = new Chart(ctx, {
            type: 'bar', // Pode ser 'doughnut' ou 'pie' também
            data: chartData,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }
}

// Função para renderizar o gráfico de volume
function renderVolumeChart(dailyData) {
    const ctx = document.getElementById('volumeAtendimentosChart')?.getContext('2d');
    if (!ctx) return;

    const labels = dailyData.map(d => new Date(d.day).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }));
    const dataPoints = dailyData.map(d => d.count);
    
    const chartData = {
        labels: labels,
        datasets: [{
            label: 'Atendimentos',
            data: dataPoints,
            backgroundColor: 'rgba(255, 127, 64, 0.2)',
            borderColor: 'rgba(255, 127, 64, 1)',
            borderWidth: 2,
            tension: 0.4,
            fill: true
        }]
    };

    if (volumeChart) {
        volumeChart.data = chartData;
        volumeChart.update();
    } else {
        volumeChart = new Chart(ctx, {
            type: 'line',
            data: chartData,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });
    }
}

// Função principal que busca todos os dados e renderiza o dashboard
async function fetchAndRenderDashboard() {
    console.log('[OREH] Buscando dados iniciais do Dashboard...');
    try {
        // NOTA: 'get_dashboard_metrics' é uma função (RPC) que precisaremos criar no Supabase.
        // Ela deve calcular e retornar todas as métricas de uma só vez para otimização.
        const { data, error } = await supabaseClient.rpc('get_dashboard_metrics');
        if (error) throw error;

        // Atualiza os cards
        updateMetricCard('totalAtendimentos', data.total_atendimentos_mes);
        updateMetricCard('resolvidosIA', data.resolvidos_ia_percent, '', '%');
        updateMetricCard('leadsQualificados', data.leads_qualificados);

        // Renderiza os gráficos
        renderFunilChart(data.funil_data); // Ex: { topo: 50, meio: 25, fundo: 10 }
        renderVolumeChart(data.volume_ultimos_7_dias); // Ex: [{ day: '2023-10-27', count: 12 }, ...]

    } catch (error) {
        console.error('Erro ao buscar dados do dashboard:', error);
        showToast('Não foi possível carregar as métricas do dashboard.', 'error');
        logEvent('ERROR', 'Falha ao carregar RPC get_dashboard_metrics', { errorMessage: error.message });
    }
}

// ✅ CORREÇÃO: Função modificada para incluir async e filtro de RLS
async function subscribeToChanges() {
    // Garante que não haja subscrições duplicadas
    if (chatsSubscription) {
        supabaseClient.removeChannel(chatsSubscription);
    }

    console.log('[OREH] Iniciando subscrição em tempo real para o Dashboard...');
    
    try {
        // 1. Obter o company_id para o filtro (igual ao atendimentos.js)
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return; // Não está logado, não pode subscrever

        const { data: profile } = await supabaseClient.from('users').select('company_id').eq('id', user.id).single();
        if (!profile || !profile.company_id) return; // Sem empresa

        const companyId = profile.company_id;

        // 2. Escuta por alterações na tabela 'chats' com o filtro de RLS
        chatsSubscription = supabaseClient
            .channel(`dashboard-chats-realtime:${companyId}`) // Nome de canal único
            .on('postgres_changes', 
                { 
                    event: '*', 
                    schema: 'public', 
                    table: 'chats',
                    filter: `company_id=eq.${companyId}` // ✅ O FILTRO EM FALTA
                },
                (payload) => {
                    console.log('Alteração recebida em tempo real:', payload);
                    showToast('O Dashboard foi atualizado!', 'info');
                    // Quando qualquer chat for alterado, simplesmente re-calculamos TODAS as métricas.
                    fetchAndRenderDashboard();
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log(`Conectado ao canal de chats para o dashboard (Empresa: ${companyId}).`);
                } else {
                     console.log('Status da subscrição:', status);
                }
            });

    } catch (error) {
         console.error('[OREH] Falha ao iniciar subscrição do Dashboard:', error);
         logEvent('ERROR', 'Falha ao iniciar subscrição do Dashboard', { error: error });
    }
}

// Função de inicialização do módulo
export function loadDashboard() {
    fetchAndRenderDashboard();
    subscribeToChanges();
}

// Função de limpeza para quando o usuário navegar para outra página
export function cleanupDashboard() {
    if (chatsSubscription) {
        supabaseClient.removeChannel(chatsSubscription);
        chatsSubscription = null;
        console.log('[OREH] Subscrição do Dashboard encerrada.');
    }
}
