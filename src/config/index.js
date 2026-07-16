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
  // Prefer pre-muxed/progressive mp4 streams first (no ffmpeg remux needed),
  // fall back to separate video+audio streams merged into mp4 if no
  // progressive stream is available at the requested quality.
  QUALITY_FORMAT_MAP: {
    'best': 'best[ext=mp4]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best',
    '2160': 'best[ext=mp4][height<=2160]/bestvideo[height<=2160]+bestaudio/bestvideo+bestaudio/best',
    '1440': 'best[ext=mp4][height<=1440]/bestvideo[height<=1440]+bestaudio/bestvideo+bestaudio/best',
    '1080': 'best[ext=mp4][height<=1080]/bestvideo[height<=1080]+bestaudio/bestvideo+bestaudio/best',
    '720': 'best[ext=mp4][height<=720]/bestvideo[height<=720]+bestaudio/bestvideo+bestaudio/best',
    '480': 'best[ext=mp4][height<=480]/bestvideo[height<=480]+bestaudio/bestvideo+bestaudio/best',
    '360': 'best[ext=mp4][height<=360]/bestvideo[height<=360]+bestaudio/bestvideo+bestaudio/best',
    'audio': 'bestaudio/best'  // Simplified - accept any format, yt-dlp will pick best available
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