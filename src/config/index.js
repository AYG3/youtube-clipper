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
  QUALITY_FORMAT_MAP: {
    'best': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
    '2160': 'bestvideo[height<=2160]+bestaudio/best',
    '1440': 'bestvideo[height<=1440]+bestaudio/best',
    '1080': 'bestvideo[height<=1080]+bestaudio/best',
    '720': 'bestvideo[height<=720]+bestaudio/best',
    '480': 'bestvideo[height<=480]+bestaudio/best',
    '360': 'bestvideo[height<=360]+bestaudio/best',
    'audio': 'bestaudio[ext=m4a]/bestaudio'
  },
  
  // Valid video extensions (for fallback file detection)
  VALID_VIDEO_EXTENSIONS: ['.mp4', '.mkv', '.mov', '.avi', '.m4a', '.mp3'],
  
  // Stderr buffer max size
  STDERR_MAX_BYTES: 100 * 1024 // 100KB
};
