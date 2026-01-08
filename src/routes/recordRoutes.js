/**
 * Recording routes - live recording endpoints
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const ytdl = require('@distube/ytdl-core');
const config = require('../config');
const state = require('../state');
const { fetchVideoInfo } = require('../utils/youtubeInfo');
const { timeToSeconds } = require('../utils/time');
const recordService = require('../services/recordService');

const router = express.Router();

/**
 * POST /api/record/start - Start a live recording
 */
router.post('/start', async (req, res) => {
  try {
    const { url, quality = 'best', maxDuration = 0 } = req.body || {};

    if (!url || !ytdl.validateURL(url)) {
      return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    const info = await fetchVideoInfo(url);
    const title = info.videoDetails.title;

    const result = await recordService.startRecording({ url, quality, maxDuration, title });
    res.json(result);
  } catch (err) {
    console.error('Error starting recording:', err);
    res.status(500).json({ error: 'Failed to start recording: ' + (err.message || err) });
  }
});

/**
 * POST /api/record/:id/stop - Stop a recording
 */
router.post('/:id/stop', async (req, res) => {
  try {
    const result = await recordService.stopRecording(req.params.id);
    res.json(result);
  } catch (err) {
    console.error('Error stopping recording:', err);
    res.status(500).json({ error: 'Failed to stop recording: ' + (err.message || err) });
  }
});

/**
 * GET /api/record/:id/status - Get recording status
 */
router.get('/:id/status', (req, res) => {
  const id = req.params.id;
  if (!state.recordings.has(id)) {
    return res.status(404).json({ error: 'Recording not found' });
  }
  const rec = state.recordings.get(id);
  const elapsed = rec.startedAt ? Math.floor((Date.now() - rec.startedAt) / 1000) : 0;
  const sizeMB = rec.sizeBytes ? (rec.sizeBytes / (1024 * 1024)).toFixed(2) : '0.00';
  res.json({ id: rec.id, status: rec.status, startedAt: rec.startedAt, elapsed, sizeMB, outPath: rec.outPath });
});

/**
 * GET /api/record/:id/download - Download recording file
 */
router.get('/:id/download', (req, res) => {
  const id = req.params.id;
  if (!state.recordings.has(id)) {
    return res.status(404).json({ error: 'Recording not found' });
  }
  const rec = state.recordings.get(id);
  if (!rec.outPath || !fs.existsSync(rec.outPath)) {
    return res.status(404).json({ error: 'Recorded file not found' });
  }
  res.download(rec.outPath, `${rec.title || 'recording'}.${path.extname(rec.outPath).replace('.', '')}`);
});

/**
 * GET /api/records - List all recordings
 */
router.get('/', (req, res) => {
  const arr = Array.from(state.recordings.values()).map(r => ({
    id: r.id,
    status: r.status,
    title: r.title,
    startedAt: r.startedAt,
    sizeBytes: r.sizeBytes,
    outPath: r.outPath
  }));
  res.json(arr);
});

/**
 * POST /api/clip-from-recording - Clip from a recorded file
 */
router.post('/clip-from-recording', async (req, res) => {
  try {
    const { id, start, end } = req.body || {};

    if (!id || !state.recordings.has(id)) {
      return res.status(400).json({ error: 'Missing or invalid recording id' });
    }

    const startSec = timeToSeconds(start);
    const endSec = timeToSeconds(end);

    if (startSec >= endSec) {
      return res.status(400).json({ error: 'Start time must be before end time' });
    }

    const result = await recordService.clipFromRecording({ id, startSec, endSec });
    
    res.setHeader('Content-Type', 'video/mp4');
    res.download(result.outputPath, result.filename, (err) => {
      if (err) console.error('Error sending clip-from-recording:', err);
      // Cleanup temp clip
      if (fs.existsSync(result.outputPath)) {
        try { fs.unlinkSync(result.outputPath); } catch (e) { /* ignore */ }
      }
    });
  } catch (err) {
    console.error('Error clipping from recording:', err);
    res.status(500).json({ error: 'Failed to clip from recording: ' + (err.message || err) });
  }
});

module.exports = router;
