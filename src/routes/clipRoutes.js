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

  const killYtdlp = (reason) => {
    if (killFn) killFn();
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

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📹 Clipping video segment: ${startSeconds}s to ${endSeconds}s (${clipDuration}s duration)`);
    console.log(`${'='.repeat(60)}\n`);

    // Reset progress
    state.currentProgress = { percent: 0, message: 'Starting' };
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
      const { clipId, filename } = getClipIdAndPath({ url, startSeconds, endSeconds, quality });
      // Start download in background (don't await)
      clipService.downloadClip({
        url,
        startSeconds,
        endSeconds,
        quality,
        background: true,
        onKillRequested: (fn) => { killFn = fn; }
      }).catch(err => console.error('Background clip error:', err.message));

      return res.json({ id: clipId, status: 'started', filename });
    }

    // Foreground: wait for download to complete
    const result = await clipService.downloadClip({
      url,
      startSeconds,
      endSeconds,
      quality,
      background: false,
      onKillRequested: (fn) => { killFn = fn; }
    });

    outputPath = result.outputPath;
    const ext = result.ext;

    // Handle client disconnect
    res.on('close', () => { console.warn('Response closed by client'); killYtdlp('client_close'); });
    req.on('aborted', () => { console.warn('Request aborted by client'); killYtdlp('client_aborted'); });

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

    // DO NOT delete partial/failed files - preserve for resume
    if (outputPath && fs.existsSync(outputPath)) {
      console.log('Preserving failed/partial output file for resume/debug:', outputPath);
    }

    res.status(500).json({ error: 'Failed to process video clip: ' + error.message });
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

    // Start or resume download
    const action = fs.existsSync(outputPath) ? 'Resuming' : 'Starting';
    console.log(`${action} clip:`, clipId);
    
    clipService.downloadClip({
      url,
      startSeconds,
      endSeconds,
      quality,
      background: true
    }).catch(err => console.error('Resume error:', err.message));

    if (background) {
      return res.json({ id: clipId, status: 'started', filename, action: action.toLowerCase() });
    }

    // Foreground: wait for completion
    const result = await clipService.downloadClip({
      url,
      startSeconds,
      endSeconds,
      quality,
      background: false
    });

    if (!fs.existsSync(result.outputPath)) {
      return res.status(500).json({ error: 'Output file not found after resume' });
    }
    return res.download(result.outputPath, result.filename);
  } catch (err) {
    console.error('Resume error:', err);
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
