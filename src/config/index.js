/**
 * Application configuration
 */
const path = require('path');

module.exports = {
  PORT: process.env.PORT || 3005,
  TEMP_DIR: path.join(__dirname, '../../temp'),
  
  // Timeouts (ms)
  DEFAULT_TIMEOUT_MS: 7200000, // 2 hours
  MIN_CLIP_TIMEOUT_MS: 1800000, // 30 minutes
  CLIP_TIMEOUT_MULTIPLIER: 3000, // 3s per second of clip
  
  // Recording cleanup
  RECORDING_CLEANUP_TIMEOUT_MS: 30 * 60 * 1000, // 30 minutes
  
  // yt-dlp quality format map
  //
  // We use bestvideo+bestaudio as the primary format selection because:
  // - `best[ext=mp4]` biases toward h264/mp4 formats which are the ones
  //   most frequently blocked by YouTube's SABR-only streaming experiment
  //   (format listed via -F but not actually downloadable with a URL).
  // - bestvideo+bestaudio picks the highest-quality format that is
  //   ACTUALLY downloadable, which is typically AV1 (av01) or VP9 when
  //   h264 is blocked. This reliably produces real 1080p+.
  // - The "best" fallback at the end of each chain catches any edge case
  //   where separate streams can't be selected (e.g. old progressive-only
  //   videos, live streams).
  QUALITY_FORMAT_MAP: {
    'best': 'bestvideo+bestaudio/best',
    '2160': 'bestvideo[height<=2160]+bestaudio/bestvideo+bestaudio/best',
    '1440': 'bestvideo[height<=1440]+bestaudio/bestvideo+bestaudio/best',
    '1080': 'bestvideo[height<=1080]+bestaudio/bestvideo+bestaudio/best',
    '720': 'bestvideo[height<=720]+bestaudio/bestvideo+bestaudio/best',
    '480': 'bestvideo[height<=480]+bestaudio/bestvideo+bestaudio/best',
    '360': 'bestvideo[height<=360]+bestaudio/bestvideo+bestaudio/best',
    'audio': 'bestaudio/best'
  },
  
  // Valid video extensions (for fallback file detection)
  VALID_VIDEO_EXTENSIONS: ['.mp4', '.mkv', '.mov', '.avi', '.m4a', '.mp3'],
  
  // Max total size allowed in TEMP_DIR before oldest partial downloads get
  // evicted to make room (bytes). Tune based on available disk. This is a
  // safeguard against a stuck/crashed partial slowly filling the disk and
  // causing every future download to fail with a confusing disk-full error.
  MAX_TEMP_DIR_BYTES: 5 * 1024 * 1024 * 1024, // 5GB
  
  // Stderr buffer max size
  STDERR_MAX_BYTES: 100 * 1024 // 100KB
};