/**
 * Health check routes - for diagnosing network and service health
 */
const express = require('express');
const dns = require('dns').promises;
const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);
const { checkNetworkConnectivity } = require('../utils/youtubeInfo');

const router = express.Router();

/**
 * GET /api/health - Basic health check
 */
router.get('/', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      unit: 'MB'
    }
  };
  
  res.json(health);
});

/**
 * GET /api/health/network - Network connectivity diagnostics
 */
router.get('/network', async (req, res) => {
  const diagnostics = {
    timestamp: new Date().toISOString(),
    checks: {}
  };
  
  // Check DNS resolution for YouTube
  try {
    const netCheck = await checkNetworkConnectivity();
    diagnostics.checks.youtube_dns = {
      status: netCheck.connected ? 'ok' : 'failed',
      message: netCheck.connected ? 'YouTube DNS resolves successfully' : netCheck.error,
      code: netCheck.code
    };
  } catch (err) {
    diagnostics.checks.youtube_dns = {
      status: 'error',
      message: err.message,
      code: err.code
    };
  }
  
  // Check if yt-dlp is installed
  try {
    const { stdout } = await execFileAsync('yt-dlp', ['--version'], { timeout: 5000 });
    diagnostics.checks.ytdlp = {
      status: 'ok',
      version: stdout.trim()
    };
  } catch (err) {
    diagnostics.checks.ytdlp = {
      status: 'error',
      message: err.code === 'ENOENT' ? 'yt-dlp not installed' : err.message,
      code: err.code
    };
  }
  
  // Check DNS servers
  try {
    const servers = dns.getServers();
    diagnostics.checks.dns_servers = {
      status: servers.length > 0 ? 'ok' : 'warning',
      servers
    };
  } catch (err) {
    diagnostics.checks.dns_servers = {
      status: 'error',
      message: err.message
    };
  }
  
  // Overall status
  const allOk = Object.values(diagnostics.checks).every(c => c.status === 'ok');
  diagnostics.overall = allOk ? 'healthy' : 'degraded';
  
  res.json(diagnostics);
});

/**
 * POST /api/health/test-video - Test video info fetching with a specific URL
 */
router.post('/test-video', async (req, res) => {
  const { url } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }
  
  const result = {
    url,
    timestamp: new Date().toISOString(),
    success: false
  };
  
  try {
    const { fetchVideoInfo } = require('../utils/youtubeInfo');
    const startTime = Date.now();
    const info = await fetchVideoInfo(url);
    const elapsed = Date.now() - startTime;
    
    result.success = true;
    result.elapsed_ms = elapsed;
    result.video = {
      title: info.videoDetails.title,
      duration: info.videoDetails.lengthSeconds,
      isLive: info.videoDetails.isLiveContent,
      videoId: info.videoDetails.videoId
    };
  } catch (err) {
    result.success = false;
    result.error = err.message;
    result.code = err.code;
  }
  
  res.json(result);
});

module.exports = router;
