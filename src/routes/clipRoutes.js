/**
 * Clip routes - clip download, status, resume endpoints
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const ytdl = require('@distube/ytdl-core');
const config = require('../config');
const state = require('../state');
const { timeToSeconds } = require('../utils/time');
const { killChildProcess } = require('../utils/process');
const { waitForFile, findFallbackOutputFile, getClipIdAndPath, validateResumable } = require('../utils/file');
const { wsBroadcast } = require('../utils/broadcast');
const clipService = require('../services/clipService');
const { fetchVideoInfo } = require('../utils/youtubeInfo');

const router = express.Router();

/**
 * POST /api/clip - Download a clip
 */
router.post('/', async (req, res) => {
  let outputPath = null;
  let killFn = null;
  let downloadSlotAcquired = false;
  let downloadSlotReleased = false;
  const clientIp = req.ip;
  const releaseDownloadSlot = () => {
    if (downloadSlotAcquired && !downloadSlotReleased) {
      downloadSlotReleased = true;
      state.endDownload(clientIp);
    }
  };

  // NOTE: We intentionally do NOT kill the yt-dlp process here on client
  // disconnect anymore. A wifi blip, phone lock, or backgrounded tab used to
  // SIGINT a perfectly healthy download, throwing away real progress even
  // though the app already has --continue/resume support and a
  // /api/clip/status + /api/clip/resume flow built for exactly this case.
  // Disconnects are now just logged; the download keeps running server-side
  // and the client (or a future request) can resume/reattach to it.
  const killYtdlp = (reason) => {
    console.warn(`Client disconnect (${reason}) - download continues in background, use /api/clip/status or /api/clip/resume to reattach.`);
  };

  try {
    const { url, start, end, background = false, quality = 'best' } = req.body;

    // Validation
    if (!url || !ytdl.validateURL(url)) {
      return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    const startSeconds = timeToSeconds(start);
    const endSeconds = timeToSeconds(end);

    if (startSeconds >= endSeconds) {
      return res.status(400).json({ error: 'Start time must be before end time' });
    }
    if (startSeconds < 0 || endSeconds < 0) {
      return res.status(400).json({ error: 'Times must be positive' });
    }

    // Get video info (uses ytdl with yt-dlp fallback)
    const info = await fetchVideoInfo(url);
    const title = info.videoDetails.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const duration = parseInt(info.videoDetails.lengthSeconds);

    if (info.videoDetails && info.videoDetails.isLiveContent) {
      return res.status(400).json({ error: 'Video appears to be a live stream. Use /api/record/start to record live streams.' });
    }
    if (endSeconds > duration) {
      return res.status(400).json({ error: `End time exceeds video duration (${duration}s)` });
    }

    const clipDuration = endSeconds - startSeconds;

    // Compute clipId early (deterministic hash of url/start/end/quality) so
    // we can tag every progress broadcast with it - lets clients filter to
    // only their own download instead of showing whatever the most recent
    // progress update was across all users/tabs on the server.
    const { clipId } = getClipIdAndPath({ url, startSeconds, endSeconds, quality });

    // Concurrent download queue - reject a second simultaneous download from
    // the same client instead of letting two yt-dlp processes fight for the
    // same outbound bandwidth (which slows both down and makes drops more
    // likely). Check /api/clip/status or /api/records to see what's active.
    if (!state.canStartDownload(clientIp)) {
      return res.status(429).json({
        error: 'You already have a download in progress. Please wait for it to finish, or check its status, before starting another.',
        retryable: true
      });
    }
    state.startDownload(clientIp);
    downloadSlotAcquired = true;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📹 Clipping video segment: ${startSeconds}s to ${endSeconds}s (${clipDuration}s duration)`);
    console.log(`${'='.repeat(60)}\n`);

    // Reset progress
    state.currentProgress = { percent: 0, message: 'Starting', clipId };
    wsBroadcast({ type: 'progress', ...state.currentProgress });

    // Set timeout
    try {
      const timeoutMs = Math.max(config.MIN_CLIP_TIMEOUT_MS, clipDuration * config.CLIP_TIMEOUT_MULTIPLIER);
      req.setTimeout(timeoutMs);
      res.setTimeout(timeoutMs);
      req.socket.setKeepAlive(true, 60000);
      console.log(`Set request timeout to ${Math.round(timeoutMs / 1000)}s`);
    } catch (err) {
      console.warn('Could not set custom request timeout:', err.message);
    }

    // If background mode, start and return immediately
    if (background) {
      const { filename } = getClipIdAndPath({ url, startSeconds, endSeconds, quality });
      // Start download in background (don't await)
      clipService.downloadClip({
        url,
        startSeconds,
        endSeconds,
        quality,
        background: true,
        onKillRequested: (fn) => { killFn = fn; }
      })
        .catch(err => console.error('Background clip error:', err.message))
        .finally(releaseDownloadSlot);

      return res.json({ id: clipId, status: 'started', filename });
    }

    // Foreground: wait for download to complete
    let result;
    try {
      result = await clipService.downloadClip({
        url,
        startSeconds,
        endSeconds,
        quality,
        background: false,
        onKillRequested: (fn) => { killFn = fn; }
      });
    } finally {
      // The yt-dlp process itself is done at this point (success or error);
      // release the slot now rather than waiting for the file to be sent.
      releaseDownloadSlot();
    }

    outputPath = result.outputPath;
    const ext = result.ext;

    // Handle client disconnect (log only - download is NOT killed, see killYtdlp above)
    res.on('close', () => { killYtdlp('client_close'); });
    req.on('aborted', () => { killYtdlp('client_aborted'); });

    // Wait for file
    try {
      await waitForFile(outputPath, 30000);
    } catch (err) {
      console.warn('Output file not ready:', outputPath, err.message);
      const fallback = findFallbackOutputFile(outputPath, ext);
      if (fallback) {
        outputPath = fallback;
        console.log('Found fallback output file:', outputPath);
      }
    }

    // Set content type
    const mimeType = (ext === 'm4a' || ext === 'mp3') ? 'audio/mp4' : 'video/mp4';
    res.setHeader('Content-Type', mimeType);
    res.setHeader('X-Clip-Id', clipId);
    // Surface quality downgrade warning to the frontend
    if (result.qualityWarning) {
      res.setHeader('X-Quality-Warning', result.qualityWarning);
    }

    if (!fs.existsSync(outputPath)) {
      console.error('Output file not found:', outputPath);
      return res.status(500).json({ error: 'Output file not found' });
    }

    res.download(outputPath, `${title}_clip.${ext}`, (err) => {
      // Only cleanup on successful download
      if (!err && outputPath && fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
      if (err) {
        console.error('Error sending file:', err);
      }
    });

  } catch (error) {
    console.error('Error processing clip:', error);
    // Safety net: release the queue slot if it was acquired but we hit an
    // unexpected error before the normal release points ran.
    releaseDownloadSlot();

    // DO NOT delete partial/failed files - preserve for resume
    if (outputPath && fs.existsSync(outputPath)) {
      console.log('Preserving failed/partial output file for resume/debug:', outputPath);
    }

    // Determine appropriate HTTP status based on error type
    let statusCode = 500;
    if (error.code === 'NETWORK_ERROR' || error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') {
      statusCode = 503; // Service Unavailable (network issue)
    } else if (error.message?.includes('rate limit') || error.message?.includes('429')) {
      statusCode = 429; // Too Many Requests
    } else if (error.message?.includes('Invalid') || error.message?.includes('validation')) {
      statusCode = 400; // Bad Request
    }

    res.status(statusCode).json({ 
      error: 'Failed to process video clip: ' + error.message,
      code: error.code || 'UNKNOWN_ERROR',
      retryable: statusCode === 503 || statusCode === 429
    });
  }
});

/**
 * ALL /api/clip/status - Get clip status
 */
router.all('/status', async (req, res) => {
  try {
    const params = req.method === 'GET' ? req.query : req.body || {};
    const { url, start, end, quality = 'best' } = params;

    if (!url || start == null || end == null) {
      return res.status(400).json({ error: 'Missing url/start/end' });
    }

    const startSeconds = timeToSeconds(start);
    const endSeconds = timeToSeconds(end);

    const status = clipService.getClipStatus({ url, startSeconds, endSeconds, quality });
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/clip/resume - Resume or start a clip
 */
router.post('/resume', async (req, res) => {
  const clientIp = req.ip;
  let downloadSlotAcquired = false;
  let downloadSlotReleased = false;
  const releaseDownloadSlot = () => {
    if (downloadSlotAcquired && !downloadSlotReleased) {
      downloadSlotReleased = true;
      state.endDownload(clientIp);
    }
  };

  try {
    const { url, start, end, quality = 'best', background = true } = req.body || {};

    if (!url || start == null || end == null) {
      return res.status(400).json({ error: 'Missing url/start/end' });
    }

    const startSeconds = timeToSeconds(start);
    const endSeconds = timeToSeconds(end);
    const { clipId, outputPath, filename } = getClipIdAndPath({ url, startSeconds, endSeconds, quality });

    // If already active, return current status
    if (state.activeClips.has(clipId) && state.activeClips.get(clipId).proc) {
      const clip = state.activeClips.get(clipId);
      return res.json({ id: clipId, status: 'in_progress', percent: clip.percent || 0, message: clip.message || '' });
    }

    // Validate resumability of existing partial downloads
    if (fs.existsSync(outputPath)) {
      const validation = validateResumable(outputPath);
      
      // Complete file exists
      if (!outputPath.includes('.part')) {
        console.log(`Resume: Complete file already exists (${validation.sizeMB.toFixed(2)} MB)`);
        if (background) {
          return res.json({ id: clipId, status: 'ready', filename, sizeMB: validation.sizeMB });
        } else {
          return res.download(outputPath, filename);
        }
      }
      
      // Check if partial is resumable
      if (!validation.resumable) {
        console.log(`Resume: Partial file not resumable (${validation.reason}), deleting...`);
        try {
          fs.unlinkSync(outputPath);
        } catch (e) {
          console.warn('Failed to delete corrupted partial:', e.message);
        }
      } else {
        console.log(`Resume: Valid partial file found (${validation.sizeMB.toFixed(2)} MB) - ${validation.reason}`);
      }
    }

    // Concurrent download queue - same protection as the main /api/clip route.
    if (!state.canStartDownload(clientIp)) {
      return res.status(429).json({
        error: 'You already have a download in progress. Please wait for it to finish, or check its status, before starting another.',
        retryable: true
      });
    }
    state.startDownload(clientIp);
    downloadSlotAcquired = true;

    // Start or resume download
    const action = fs.existsSync(outputPath) ? 'Resuming' : 'Starting';
    console.log(`${action} clip:`, clipId);

    // NOTE: previously this called downloadClip() once here (fire-and-forget,
    // background:true) and then AGAIN below when background=false, spawning
    // two yt-dlp processes for the same clip at once. Fixed to call it
    // exactly once, branching on the requested mode like the main route does.
    if (background) {
      clipService.downloadClip({
        url,
        startSeconds,
        endSeconds,
        quality,
        background: true
      })
        .catch(err => console.error('Resume error:', err.message))
        .finally(releaseDownloadSlot);

      return res.json({ id: clipId, status: 'started', filename, action: action.toLowerCase() });
    }

    // Foreground: wait for completion
    let result;
    try {
      result = await clipService.downloadClip({
        url,
        startSeconds,
        endSeconds,
        quality,
        background: false
      });
    } finally {
      releaseDownloadSlot();
    }

    if (!fs.existsSync(result.outputPath)) {
      return res.status(500).json({ error: 'Output file not found after resume' });
    }
    return res.download(result.outputPath, result.filename);
  } catch (err) {
    console.error('Resume error:', err);
    releaseDownloadSlot();
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/clip/:id/download - Download clip by ID
 */
router.get('/:id/download', (req, res) => {
  const id = req.params.id;
  const files = fs.readdirSync(config.TEMP_DIR);
  const match = files.find(f => f.includes(id) && !f.includes('.part'));
  if (!match) return res.status(404).json({ error: 'Clip not found' });
  const outPath = path.join(config.TEMP_DIR, match);
  res.download(outPath, match, (err) => { if (err) console.error('Error sending clip by id:', err); });
});

/**
 * GET /api/clip/:id/log - Get yt-dlp log for clip
 */
router.get('/:id/log', (req, res) => {
  const id = req.params.id;
  const files = fs.readdirSync(config.TEMP_DIR);
  const match = files.find(f => f.includes(id));
  if (!match) return res.status(404).json({ error: 'Clip not found' });
  const outPath = path.join(config.TEMP_DIR, match);
  const logPath = outPath + '.yt-dlp.log';
  if (!fs.existsSync(logPath)) return res.status(404).json({ error: 'Log not found' });
  res.setHeader('Content-Type', 'text/plain');
  fs.createReadStream(logPath).pipe(res);
});

module.exports = router;