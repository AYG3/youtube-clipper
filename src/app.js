/**
 * Express application setup
 */
const express = require('express');
const cors = require('cors');
const path = require('path');

const timeoutMiddleware = require('./middleware/timeout');
const videoRoutes = require('./routes/videoRoutes');
const clipRoutes = require('./routes/clipRoutes');
const recordRoutes = require('./routes/recordRoutes');
const configRoutes = require('./routes/configRoutes');
const transcriptRoutes = require('./routes/transcriptRoutes');
const { cleanupStalePartials } = require('./utils/file');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));
app.use(timeoutMiddleware);

// Routes
app.use('/api', videoRoutes);
app.use('/api/clip', clipRoutes);
app.use('/api/record', recordRoutes);
app.use('/api/records', recordRoutes);
app.use('/api/clip-from-recording', (req, res, next) => {
  // Forward to record routes
  req.url = '/clip-from-recording';
  recordRoutes(req, res, next);
});
app.use('/api/config', configRoutes);
app.use('/api/transcript', transcriptRoutes);

// Cleanup stale partial downloads on startup
setTimeout(() => {
  const deleted = cleanupStalePartials(24); // Clean files older than 24 hours
  if (deleted > 0) {
    console.log(`🧹 Cleaned up ${deleted} stale partial download(s)`);
  }
}, 5000); // Wait 5s after startup

// Schedule periodic cleanup every 6 hours
setInterval(() => {
  const deleted = cleanupStalePartials(24);
  if (deleted > 0) {
    console.log(`🧹 Periodic cleanup: removed ${deleted} stale partial(s)`);
  }
}, 6 * 60 * 60 * 1000);

module.exports = app;
