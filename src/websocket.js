/**
 * WebSocket server setup
 */
const { WebSocketServer } = require('ws');
const state = require('./state');

/**
 * Attach WebSocket server to HTTP server
 * @param {http.Server} server
 */
function setupWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    state.wsClients.add(ws);

    ws.on('close', () => state.wsClients.delete(ws));
    ws.on('error', () => state.wsClients.delete(ws));

    // Send current progress immediately
    ws.send(JSON.stringify({ type: 'progress', ...state.currentProgress }));
  });

  return wss;
}

module.exports = { setupWebSocket };
