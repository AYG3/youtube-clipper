/**
 * Express application setup
 */
const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');

const timeoutMiddleware = require('./middleware/timeout');
const videoRoutes = require('./routes/videoRoutes');
const clipRoutes = require('./routes/clipRoutes');
const recordRoutes = require('./routes/recordRoutes');
const configRoutes = require('./routes/configRoutes');
const transcriptRoutes = require('./routes/transcriptRoutes');
const healthRoutes = require('./routes/healthRoutes');
const { cleanupStalePartials, enforceTempDirSizeLimit } = require('./utils/file');

const app = express();

// CORS configuration
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',') 
    : '*',
  credentials: true,
  exposedHeaders: ['X-Clip-Id', 'X-Quality-Warning'] // let the front-end read these for progress and quality info
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
app.use('/api/health', healthRoutes);
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

/**
 * Check yt-dlp version at startup and auto-update if stale.
 * YouTube changes its streaming/anti-bot behaviour frequently — a yt-dlp
 * that is more than ~30 days old will start missing high-resolution formats
 * (SABR-only streaming, DRM experiments, JS challenge changes, etc.).
 * We attempt an auto-update via both pip and brew to keep the app
 * self-healing without manual intervention, and log clear guidance if
 * neither method succeeds.
 */
(async () => {
  const { execFile } = require('child_process');
  const { promisify } = require('util');
  const execFileAsync = promisify(execFile);

  let version;
  try {
    const { stdout } = await execFileAsync('yt-dlp', ['--version'], { timeout: 10000 });
    version = stdout.trim();
    console.log(`📦 yt-dlp version: ${version}`);
  } catch (e) {
    console.warn('⚠️  Could not determine yt-dlp version:', e.message);
    return;
  }

  // Parse the date from the nightly version string (e.g. "2026.07.04")
  const match = version.match(/^(\d{4})\.(\d{2})\.(\d{2})/);
  if (!match) return;

  const versionDate = new Date(`${match[1]}-${match[2]}-${match[3]}`);
  const ageDays = Math.floor((Date.now() - versionDate.getTime()) / (1000 * 60 * 60 * 24));

  if (ageDays <= 14) {
    console.log(`✅ yt-dlp is ${ageDays}d old — up to date`);
    return;
  }

  const staleLabel = ageDays > 60 ? `very stale (${ageDays}d)` : `${ageDays}d`;

  // Attempt auto-update via pip first (covers pip-installed and Homebrew's
  // vendored pip inside the formula), then brew as a fallback.
  let updated = false;

  // --- pip ---
  try {
    console.log(`🔄 yt-dlp is ${staleLabel} old — attempting auto-update via pip...`);
    const pipResult = await execFileAsync('pip', ['install', '--upgrade', 'yt-dlp'], { timeout: 120000 });
    updated = true;
    console.log('✅ yt-dlp auto-updated via pip');
    if (pipResult.stdout) {
      const newVerMatch = pipResult.stdout.match(/Successfully installed yt-dlp-([^\s]+)/);
      if (newVerMatch) console.log(`   New version: ${newVerMatch[1]}`);
    }
  } catch (e) {
    const msg = (e.stderr || e.message || '').toString();
    if (msg.includes('externally-managed-environment') || msg.includes('--break-system-packages')) {
      console.log('ℹ️  pip blocked by externally-managed-environment — will try brew fallback');
    } else {
      console.log(`ℹ️  pip auto-update failed: ${msg.slice(0, 120).replace(/\n/g, ' ')}`);
    }
  }

  // --- brew (fallback) ---
  if (!updated) {
    try {
      // Quick check: is yt-dlp managed by brew?
      const whichResult = await execFileAsync('which', ['yt-dlp'], { timeout: 5000 });
      const ytdlpPath = whichResult.stdout.trim();
      if (ytdlpPath.includes('/homebrew/') || ytdlpPath.includes('/opt/homebrew/')) {
        console.log('🔄 Attempting auto-update via brew...');
        await execFileAsync('brew', ['upgrade', 'yt-dlp'], { timeout: 300000 });
        updated = true;
        console.log('✅ yt-dlp auto-updated via brew');
      }
    } catch (e) {
      console.log(`ℹ️  brew auto-update not applicable or failed: ${(e.message || '').slice(0, 80)}`);
    }
  }

  if (!updated) {
    if (ageDays > 30) {
      console.warn(`⚠️  yt-dlp is ${ageDays}d old and auto-update failed.`);
      console.warn('   Please update manually: pip install --upgrade yt-dlp  OR  brew upgrade yt-dlp');
    } else {
      console.log(`ℹ️  yt-dlp is ${ageDays}d old — auto-update skipped (still within grace window)`);
    }
  }
})();

/**
 * Check that the JS challenge solver runtime is available.
 * yt-dlp uses a JS runtime (deno or node) + the EJS challenge solver to
 * solve YouTube's "n-challenge" JavaScript puzzles. When this solver is
 * missing, some adaptive video formats are dropped with a warning like:
 * "n challenge solving failed: Some formats may be missing."
 * Deno is preferred (runs natively, no npm installs needed); node + a
 * yt-dlp-compatible solver script is the fallback.
 */
(async () => {
  const { execFile } = require('child_process');
  const { promisify } = require('util');
  const execFileAsync = promisify(execFile);

  // Check for deno (preferred — yt-dlp auto-detects it)
  let hasDeno = false;
  try {
    await execFileAsync('deno', ['--version'], { timeout: 10000 });
    hasDeno = true;
  } catch (e) { /* not present */ }

  if (hasDeno) {
    console.log('✅ JS challenge solver: deno detected (n-challenge will work)');
    return;
  }

  // Fallback: check for node
  let hasNode = false;
  try {
    await execFileAsync('node', ['--version'], { timeout: 5000 });
    hasNode = true;
  } catch (e) { /* not present */ }

  if (hasNode) {
    // node is present — check if user has installed a yt-dlp solver script
    // (yt-dlp looks for node_modules/@distube/ytdl-core or similar)
    const fs = require('fs');
    const genericSolverPath = path.join(require('os').homedir(), '.cache', 'yt-dlp', 'ejs');
    const hasSolver =
      fs.existsSync(path.join(__dirname, '../../node_modules/@distube/ytdl-core')) ||
      fs.existsSync(genericSolverPath);
    if (hasSolver) {
      console.log('✅ JS challenge solver: node detected with solver script');
    } else {
      console.log('🔧 node detected, but no challenge solver script found.');
      console.log('   Install deno for best results: brew install deno');
      console.log('   (yt-dlp auto-detects deno and uses it for n-challenge solving)');
      console.log('   This may cause some high-res formats to be dropped.');
    }
    return;
  }

  // Neither deno nor node found
  console.warn('⚠️  No JS runtime (deno or node) found. YouTube n-challenge formats');
  console.warn('   may be dropped, which can reduce available quality options.');
  console.warn('   Install deno: brew install deno');
})();

// Cleanup stale partial downloads on startup
setTimeout(() => {
  const deleted = cleanupStalePartials(24); // Clean files older than 24 hours
  if (deleted > 0) {
    console.log(`🧹 Cleaned up ${deleted} stale partial download(s)`);
  }
  // Also enforce an overall disk-usage cap - catches large stuck partials
  // that the age+size based cleanup above wouldn't touch.
  enforceTempDirSizeLimit(config.MAX_TEMP_DIR_BYTES);
}, 5000); // Wait 5s after startup

// Schedule periodic cleanup every 6 hours
setInterval(() => {
  const deleted = cleanupStalePartials(24);
  if (deleted > 0) {
    console.log(`🧹 Periodic cleanup: removed ${deleted} stale partial(s)`);
  }
  enforceTempDirSizeLimit(config.MAX_TEMP_DIR_BYTES);
}, 6 * 60 * 60 * 1000);

// Also check the disk usage cap more frequently (every 15 minutes) since a
// single large stuck download can fill the disk well within a 6 hour window.
setInterval(() => {
  enforceTempDirSizeLimit(config.MAX_TEMP_DIR_BYTES);
}, 15 * 60 * 1000);

module.exports = app;