/**
 * Global application state
 */

// Current progress for client polling
let currentProgress = { percent: 0, message: 'Idle' };

// In-memory map of active recordings: id -> { proc, outPath, status, ... }
const recordings = new Map();

// In-memory map of active clip downloads: clipId -> { proc, outputPath, percent, message, background }
const activeClips = new Map();

// WebSocket clients set for broadcasting progress
const wsClients = new Set();

// Recording cleanup timeout (ms), mutable via config endpoint
let recordingCleanupTimeoutMs = 30 * 60 * 1000;

module.exports = {
  get currentProgress() { return currentProgress; },
  set currentProgress(val) { currentProgress = val; },
  recordings,
  activeClips,
  wsClients,
  get recordingCleanupTimeoutMs() { return recordingCleanupTimeoutMs; },
  set recordingCleanupTimeoutMs(val) { recordingCleanupTimeoutMs = val; }
};
