/**
 * Config routes - cleanup timeout configuration
 */
const express = require('express');
const state = require('../state');

const router = express.Router();

/**
 * POST /api/config/cleanup-timeout - Set cleanup timeout
 */
router.post('/cleanup-timeout', (req, res) => {
  const { minutes } = req.body || {};
  if (typeof minutes !== 'number' || minutes < 1) {
    return res.status(400).json({ error: 'minutes must be a positive number' });
  }
  state.recordingCleanupTimeoutMs = minutes * 60 * 1000;
  console.log(`Recording cleanup timeout set to ${minutes} minutes`);
  res.json({ cleanupTimeoutMinutes: minutes });
});

/**
 * GET /api/config/cleanup-timeout - Get cleanup timeout
 */
router.get('/cleanup-timeout', (req, res) => {
  res.json({ cleanupTimeoutMinutes: state.recordingCleanupTimeoutMs / 60000 });
});

module.exports = router;
