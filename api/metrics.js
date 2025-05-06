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

// Функция для повторных попыток запроса к Prometheus
async function fetchWithRetry(url, retries = 3, delay = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await axios.get(url, { timeout: 5000 });
            return response;
        } catch (error) {
            console.warn(`Retry ${i + 1}/${retries} failed for ${url}: ${error.message}. Retrying in ${delay}ms...`);
            if (i === retries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

module.exports = async (req, res) => {
    console.log(`Received ${req.method} request for ${req.path}`);

    if (req.method === 'GET' && req.path === '/metrics') {
        try {
            console.log(`Fetching metrics from http://85.209.2.112:9000/metrics`);
            const startTime = Date.now();
            const response = await fetchWithRetry('http://85.209.2.112:9000/metrics');
            const responseTimeMs = Date.now() - startTime;

            if (!response.data || typeof response.data !== 'string') {
                throw new Error('Invalid response data from Prometheus');
            }

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

            console.log('Metrics parsed successfully:', metrics);
            res.status(200).json({
                metrics,
                chartData: statsStore.chartData,
                apiStats
            });
        } catch (error) {
            console.error(`Failed to fetch or parse metrics: ${error.message}`, error.stack);
            res.status(500).json({ error: `Ошибка при получении метрик: ${error.message}` });
        }
    } else if (req.method === 'POST' && req.path === '/metrics') {
        try {
            const { chartData, apiStats } = req.body;
            if (!chartData || !apiStats) {
                throw new Error('Invalid request body');
            }
            statsStore.chartData = chartData;
            statsStore.apiStats.requests = apiStats.requests || [];
            cleanOldRequests();
            console.log('Statistics updated in server store');
            res.status(200).json({ message: 'Statistics saved' });
        } catch (error) {
            console.error(`Error saving statistics: ${error.message}`, error.stack);
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
            console.error(`Error clearing statistics: ${error.message}`, error.stack);
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
            const [key, value] = line.split(' ');
            if (!key || !value) {
                console.warn(`Skipping invalid line: ${line}`);
                continue;
            }
            if (key.startsWith('go_memstats_heap_objects')) {
                metrics.heap_objects = parseFloat(value);
            } else if (key.startsWith('promhttp_metric_handler_requests_total{code="200"}')) {
                metrics.requests_total = parseFloat(value);
            } else if (key.startsWith('process_start_time_seconds')) {
                const startTimeSeconds = parseFloat(value);
                const currentTimeSeconds = Date.now() / 1000;
                metrics.uptime = Math.max(0, currentTimeSeconds - startTimeSeconds);
            }
        } catch (error) {
            console.error(`Error parsing line: ${line}. Error: ${error.message}`);
        }
    }

    if (!metrics.heap_objects && !metrics.requests_total && !metrics.uptime) {
        console.warn('No valid metrics parsed');
    }
    return metrics;
}
