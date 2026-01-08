/**
 * Video routes - video info and progress endpoints
 */
const express = require('express');
const ytdl = require('@distube/ytdl-core');
const state = require('../state');
const { fetchVideoInfo } = require('../utils/youtubeInfo');

const router = express.Router();

/**
 * GET /api/progress - Get current progress
 */
router.get('/progress', (req, res) => {
  res.json(state.currentProgress);
});

/**
 * POST /api/video-info - Get video information
 */
router.post('/video-info', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url || !ytdl.validateURL(url)) {
      return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    const info = await fetchVideoInfo(url);
    const duration = parseInt(info.videoDetails.lengthSeconds || '0');
    const isLive = !!info.videoDetails.isLiveContent;
    const title = info.videoDetails.title;
    const thumbnail = info.videoDetails.thumbnails[0]?.url;

    res.json({
      duration,
      title,
      thumbnail,
      videoId: info.videoDetails.videoId,
      isLive
    });
  } catch (error) {
    console.error('Error fetching video info:', error);
    if (error && error.code === 'ENOTFOUND') {
      return res.status(502).json({ error: error.message || 'DNS resolution failed for youtube' });
    }
    res.status(500).json({ error: error.message || 'Failed to fetch video information' });
  }
});

module.exports = router;
