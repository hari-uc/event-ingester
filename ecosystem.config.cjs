module.exports = {
  apps: [
    {
      name: "event-ingester-server",
      script: "dist/server.js",
      interpreter: "bun",
      env: { NODE_ENV: "production" },
      max_memory_restart: "300M",
    },
    {
      name: "event-ingester-worker",
      script: "dist/worker.js",
      interpreter: "bun",
      env: { NODE_ENV: "production" },
      max_memory_restart: "300M",
    },
  ],
};
