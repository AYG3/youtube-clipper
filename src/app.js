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

// CORS configuration
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',') 
    : '*',
  credentials: true
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));
app.use(timeoutMiddleware);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Diagnostic endpoint to verify YouTube extraction tools
app.get('/api/diagnostic', async (req, res) => {
  const { execFile } = require('child_process');
  const util = require('util');
  const execFileAsync = util.promisify(execFile);
  
  const results = {
    timestamp: new Date().toISOString(),
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      env: {
        PORT: process.env.PORT,
        NODE_ENV: process.env.NODE_ENV,
        RENDER: process.env.RENDER || 'false'
      }
    },
    tools: {
      ytdlCore: { available: false, version: null, error: null },
      ytdlp: { available: false, version: null, error: null },
      ffmpeg: { available: false, version: null, error: null }
    }
  };

  // Test ytdl-core
  try {
    const ytdl = require('@distube/ytdl-core');
    results.tools.ytdlCore.available = true;
    results.tools.ytdlCore.version = 'loaded';
  } catch (err) {
    results.tools.ytdlCore.error = err.message;
  }

  // Test yt-dlp
  try {
    const { stdout } = await execFileAsync('yt-dlp', ['--version'], { timeout: 5000 });
    results.tools.ytdlp.available = true;
    results.tools.ytdlp.version = stdout.trim();
  } catch (err) {
    results.tools.ytdlp.error = err.message || String(err);
  }

  // Test ffmpeg
  try {
    const { stdout } = await execFileAsync('ffmpeg', ['-version'], { timeout: 5000 });
    const versionMatch = stdout.match(/ffmpeg version ([^\s]+)/);
    results.tools.ffmpeg.available = true;
    results.tools.ffmpeg.version = versionMatch ? versionMatch[1] : 'unknown';
  } catch (err) {
    results.tools.ffmpeg.error = err.message || String(err);
  }

  res.status(200).json(results);
});

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
