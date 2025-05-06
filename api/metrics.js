const axios = require('axios');

module.exports = async (req, res) => {
  console.log('Received request for /metrics');
  
  try {
    console.log(`Fetching metrics from http://85.209.2.112:9000/metrics`);
    const response = await axios.get('http://85.209.2.112:9000/metrics', { timeout: 5000 });
    const metrics = parsePrometheusMetrics(response.data);
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
      if (line.startsWith('coredns_cache_entries{server="dns://0.0.0.0:5333",type="success"')) {
        metrics.cache_success = parseFloat(line.split(' ')[1]);
      } else if (line.startsWith('coredns_cache_entries{server="dns://0.0.0.0:5333",type="denial"')) {
        metrics.cache_denial = parseFloat(line.split(' ')[1]);
      } else if (line.startsWith('coredns_cache_hits_total{server="dns://0.0.0.0:5333",type="success"')) {
        metrics.cache_hits_success = parseFloat(line.split(' ')[1]);
      } else if (line.startsWith('coredns_cache_hits_total{server="dns://0.0.0.0:5333",type="denial"')) {
        metrics.cache_hits_denial = parseFloat(line.split(' ')[1]);
      } else if (line.startsWith('coredns_cache_misses_total{server="dns://0.0.0.0:5333"')) {
        metrics.cache_misses = parseFloat(line.split(' ')[1]);
      } else if (line.startsWith('coredns_cache_requests_total{server="dns://0.0.0.0:5333"')) {
        metrics.cache_requests = parseFloat(line.split(' ')[1]);
      } else if (line.startsWith('coredns_dns_do_requests_total{server="dns://0.0.0.0:5333",view="",zone=".""')) {
        metrics.dns_do_requests = parseFloat(line.split(' ')[1]);
      } else if (line.startsWith('coredns_dns_request_duration_seconds_sum{server="dns://0.0.0.0:5333",view="",zone=".""')) {
        metrics.request_duration_sum = parseFloat(line.split(' ')[1]);
      } else if (line.startsWith('coredns_dns_request_duration_seconds_count{server="dns://0.0.0.0:5333",view="",zone=".""')) {
        metrics.request_duration_count = parseFloat(line.split(' ')[1]);
      } else if (line.startsWith('coredns_dns_request_size_bytes_sum{proto="udp",server="dns://0.0.0.0:5333",view="",zone=".""')) {
        metrics.request_size = parseFloat(line.split(' ')[1]);
      } else if (line.startsWith('coredns_dns_response_size_bytes_sum{proto="udp",server="dns://0.0.0.0:5333",view="",zone=".""')) {
        metrics.response_size = parseFloat(line.split(' ')[1]);
      } else if (line.startsWith('coredns_dns_responses_total{plugin="cloudflared",rcode="NOERROR"')) {
        metrics.responses_noerror = parseFloat(line.split(' ')[1]);
      } else if (line.startsWith('coredns_dns_responses_total{plugin="cloudflared",rcode="NXDOMAIN"')) {
        metrics.responses_nxdomain = parseFloat(line.split(' ')[1]);
      } else if (line.startsWith('coredns_dns_responses_total{plugin="cloudflared",rcode="SERVFAIL"')) {
        metrics.responses_servfail = parseFloat(line.split(' ')[1]);
      }
    } catch (error) {
      console.error(`Error parsing line: ${line}. Error: ${error.message}`);
    }
  }

  if (metrics.request_duration_sum && metrics.request_duration_count && metrics.request_duration_count > 0) {
    metrics.request_duration = metrics.request_duration_sum / metrics.request_duration_count;
  } else {
    metrics.request_duration = 0.0;
  }

  delete metrics.request_duration_sum;
  delete metrics.request_duration_count;

  return metrics;
}
