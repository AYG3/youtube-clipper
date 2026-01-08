/**
 * WebSocket broadcast utility
 */
const state = require('../state');

/**
 * Broadcast a message to all connected WebSocket clients
 * @param {object} data
 */
function wsBroadcast(data) {
  const msg = JSON.stringify(data);
  for (const ws of state.wsClients) {
    if (ws.readyState === 1) { // OPEN
      try { ws.send(msg); } catch (e) { /* ignore */ }
    }
  }
}

module.exports = { wsBroadcast };
