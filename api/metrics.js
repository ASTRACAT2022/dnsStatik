const axios = require('axios');

// Временное хранилище в памяти сервера
let statsStore = {
    chartData: {
        labels: [],
        heapObjects: [],
        requestsTotal: []
    },
    apiStats: {
        requests: []
    }
};

// Фильтрация записей старше 24 часов
function cleanOldRequests() {
    const now = Date.now();
    statsStore.apiStats.requests = statsStore.apiStats.requests.filter(req => {
        const timestamp = new Date(req.timestamp).getTime();
        return now - timestamp < 24 * 60 * 60 * 1000;
    });
    if (statsStore.apiStats.requests.length > 1000) {
        statsStore.apiStats.requests = statsStore.apiStats.requests.slice(-1000);
    }
}

module.exports = async (req, res) => {
    console.log(`Received ${req.method} request for ${req.path}`);

    if (req.method === 'GET' && req.path === '/metrics') {
        try {
            console.log(`Fetching metrics from http://85.209.2.112:9000/metrics`);
            const startTime = Date.now();
            const response = await axios.get('http://85.209.2.112:9000/metrics', { timeout: 5000 });
            const responseTimeMs = Date.now() - startTime;

            const metrics = parsePrometheusMetrics(response.data);
            metrics.response_time_ms = responseTimeMs;

            // Очищаем старые записи
            cleanOldRequests();

            // Агрегируем apiStats
            const apiStats = {
                successCount: statsStore.apiStats.requests.filter(r => r.success).length,
                errorCount: statsStore.apiStats.requests.filter(r => !r.success).length,
                lastResponseTime: statsStore.apiStats.requests.length > 0 ? statsStore.apiStats.requests[statsStore.apiStats.requests.length - 1].responseTime : 0,
                lastStatus: statsStore.apiStats.requests.length > 0 ? statsStore.apiStats.requests[statsStore.apiStats.requests.length - 1].status : 'Ожидание',
                requests: statsStore.apiStats.requests
            };

            console.log('Metrics parsed successfully');
            res.status(200).json({
                metrics,
                chartData: statsStore.chartData,
                apiStats
            });
        } catch (error) {
            console.error(`Failed to fetch or parse metrics: ${error.message}`);
            res.status(500).json({ error: `Ошибка при получении метрик: ${error.message}` });
        }
    } else if (req.method === 'POST' && req.path === '/metrics') {
        try {
            const { chartData, apiStats } = req.body;
            if (chartData) {
                statsStore.chartData = chartData;
            }
            if (apiStats && apiStats.requests) {
                statsStore.apiStats.requests = apiStats.requests;
                cleanOldRequests();
            }
            console.log('Statistics updated in server store');
            res.status(200).json({ message: 'Statistics saved' });
        } catch (error) {
            console.error(`Error saving statistics: ${error.message}`);
            res.status(500).json({ error: `Ошибка при сохранении статистики: ${error.message}` });
        }
    } else if (req.method === 'POST' && req.path === '/metrics/clear') {
        try {
            statsStore = {
                chartData: { labels: [], heapObjects: [], requestsTotal: [] },
                apiStats: { requests: [] }
            };
            console.log('Statistics cleared in server store');
            res.status(200).json({ message: 'Statistics cleared' });
        } catch (error) {
            console.error(`Error clearing statistics: ${error.message}`);
            res.status(500).json({ error: `Ошибка при очистке статистики: ${error.message}` });
        }
    } else {
        res.status(405).json({ error: 'Method not allowed' });
    }
};

function parsePrometheusMetrics(data) {
    const metrics = {};
    const lines = data.split('\n');

    console.log('Parsing Prometheus metrics');
    for (const line of lines) {
        if (line.startsWith('#') || !line.trim()) continue;
        try {
            if (line.startsWith('go_memstats_heap_objects')) {
                metrics.heap_objects = parseFloat(line.split(' ')[1]);
            } else if (line.startsWith('promhttp_metric_handler_requests_total{code="200"}')) {
                metrics.requests_total = parseFloat(line.split(' ')[1]);
            } else if (line.startsWith('process_start_time_seconds')) {
                const startTimeSeconds = parseFloat(line.split(' ')[1]);
                const currentTimeSeconds = Date.now() / 1000;
                metrics.uptime = Math.max(0, currentTimeSeconds - startTimeSeconds);
            }
        } catch (error) {
            console.error(`Error parsing line: ${line}. Error: ${error.message}`);
        }
    }

    return metrics;
}
