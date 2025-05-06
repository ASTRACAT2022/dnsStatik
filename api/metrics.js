const axios = require('axios');

module.exports = async (req, res) => {
  console.log('Received request for /metrics');
  
  try {
    console.log(`Fetching metrics from http://85.209.2.112:9000/metrics`);
    const startTime = Date.now();
    const response = await axios.get('http://85.209.2.112:9000/metrics', { timeout: 5000 });
    const responseTimeMs = Date.now() - startTime;
    
    const metrics = parsePrometheusMetrics(response.data);
    metrics.response_time_ms = responseTimeMs; // Добавляем время ответа
    
    console.log('Metrics parsed successfully');
    res.status(200).json(metrics);
  } catch (error) {
    console.error(`Failed to fetch or parse metrics: ${error.message}`);
    res.status(500).json({ error: `Ошибка при получении метрик: ${error.message}` });
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
      }
    } catch (error) {
      console.error(`Error parsing line: ${line}. Error: ${error.message}`);
    }
  }

  return metrics;
}
