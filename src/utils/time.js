/**
 * Time parsing and formatting utilities
 */

/**
 * Convert time string (HH:MM:SS, MM:SS, or SS) to seconds
 * @param {string|number} timeStr
 * @returns {number}
 */
function timeToSeconds(timeStr) {
  if (typeof timeStr === 'number') return timeStr;
  const parts = String(timeStr).split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return parts[0] || 0;
}

/**
 * Parse ffmpeg time string (HH:MM:SS.xx) to seconds
 * @param {string} timeStr
 * @returns {number}
 */
function parseFFmpegTime(timeStr) {
  const parts = timeStr.split('.')[0].split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return Number(parts[0]) || 0;
}

/**
 * Format seconds to HH:MM:SS or MM:SS
 * @param {number} seconds
 * @returns {string}
 */
function formatTime(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

module.exports = {
  timeToSeconds,
  parseFFmpegTime,
  formatTime
};
