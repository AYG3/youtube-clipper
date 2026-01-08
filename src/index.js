/**
 * Server entry point
 */
const app = require('./app');
const config = require('./config');
const { setupWebSocket } = require('./websocket');

// Start server
const server = app.listen(config.PORT, () => {
  console.log(`🚀 YouTube Clipper server running at http://localhost:${config.PORT}`);
  console.log(`📝 Open http://localhost:${config.PORT} in your browser`);
});

// Setup WebSocket
setupWebSocket(server);

// Set server timeouts (2 hours for long clips)
server.keepAliveTimeout = config.DEFAULT_TIMEOUT_MS;
server.headersTimeout = config.DEFAULT_TIMEOUT_MS;
server.requestTimeout = config.DEFAULT_TIMEOUT_MS;
server.timeout = config.DEFAULT_TIMEOUT_MS;

// Handle port in use
server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`\n⚠️  Port ${config.PORT} is already in use.`);
    console.error('   Example: lsof -ti:3000 | xargs kill -9');
    process.exit(1);
  }
  console.error('Server error:', err);
});

// Graceful shutdown
function gracefulShutdown() {
  console.log('\n🛑 Shutting down server...');
  server.close(() => {
    console.log('Server stopped.');
    process.exit(0);
  });
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Nodemon SIGUSR2
process.once('SIGUSR2', function () {
  server.close(function () {
    process.kill(process.pid, 'SIGUSR2');
  });
});

// Handle unexpected errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  gracefulShutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  gracefulShutdown();
});

module.exports = server;
