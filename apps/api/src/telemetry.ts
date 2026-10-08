import client from "prom-client";

export const metricsRegistry = new client.Registry();

// Collect default runtime metrics (memory, event loop, CPU)
client.collectDefaultMetrics({ register: metricsRegistry, prefix: "suite_" });

export const httpRequestCounter = new client.Counter({
  name: "suite_http_requests_total",
  help: "Total count of HTTP requests processed by Business OS API",
  labelNames: ["method", "path", "status"],
  registers: [metricsRegistry],
});

export const httpRequestDurationHistogram = new client.Histogram({
  name: "suite_http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "path", "status"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [metricsRegistry],
});
