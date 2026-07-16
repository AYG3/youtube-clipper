/**
 * Global application state
 */

// Current progress for client polling
let currentProgress = { percent: 0, message: 'Idle' };

// In-memory map of active recordings: id -> { proc, outPath, status, ... }
const recordings = new Map();

// In-memory map of active clip downloads: clipId -> { proc, outputPath, percent, message, background }
const activeClips = new Map();

// WebSocket clients set for broadcasting progress
const wsClients = new Set();

// Recording cleanup timeout (ms), mutable via config endpoint
let recordingCleanupTimeoutMs = 30 * 60 * 1000;

// ---------------------------------------------------------------------------
// Concurrent download queue (per client IP)
//
// Without this, a client double-clicking Download, or the history/slider UI
// firing off overlapping requests, could spawn multiple simultaneous yt-dlp
// processes that all compete for the same outbound bandwidth - slowing every
// one of them down. This tracks how many downloads are active per IP and
// lets routes reject/queue additional requests instead.
// ---------------------------------------------------------------------------
const MAX_CONCURRENT_DOWNLOADS_PER_IP = 1;
const activeDownloadsByIp = new Map(); // ip -> count

/**
 * Check whether a given client (by IP) is allowed to start a new download.
 * @param {string} ip
 * @returns {boolean}
 */
function canStartDownload(ip) {
  const count = activeDownloadsByIp.get(ip) || 0;
  return count < MAX_CONCURRENT_DOWNLOADS_PER_IP;
}

/**
 * Register the start of a download for a given client IP.
 * @param {string} ip
 */
function startDownload(ip) {
  const count = activeDownloadsByIp.get(ip) || 0;
  activeDownloadsByIp.set(ip, count + 1);
}

/**
 * Register the end of a download for a given client IP (always call this
 * exactly once per matching startDownload, in both success and failure paths).
 * @param {string} ip
 */
function endDownload(ip) {
  const count = activeDownloadsByIp.get(ip) || 0;
  if (count <= 1) {
    activeDownloadsByIp.delete(ip);
  } else {
    activeDownloadsByIp.set(ip, count - 1);
  }
}

/**
 * Get current active download count for a given IP (for status/debugging).
 * @param {string} ip
 */
function getActiveDownloadCount(ip) {
  return activeDownloadsByIp.get(ip) || 0;
}

// ---------------------------------------------------------------------------
// Video info cache
//
// fetchVideoInfo() gets called far more often than most users realize -
// history auto-load, slider adjustments, transcript fetch, clip download,
// resume polling can all trigger it for the *same* video within seconds of
// each other. Every one of those was hitting YouTube fresh, which is slow
// and also the main way this app trips YouTube's bot/rate-limit detection.
// This caches results per URL for a short TTL so repeat calls are instant.
// ---------------------------------------------------------------------------
const VIDEO_INFO_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const VIDEO_INFO_CACHE_MAX_ENTRIES = 200; // simple cap to avoid unbounded growth
const videoInfoCache = new Map(); // url -> { data, expiresAt }

/**
 * Get cached video info for a URL, if present and not expired.
 * @param {string} url
 * @returns {object|null}
 */
function getCachedVideoInfo(url) {
  const entry = videoInfoCache.get(url);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    videoInfoCache.delete(url);
    return null;
  }
  return entry.data;
}

/**
 * Store video info for a URL in the cache.
 * @param {string} url
 * @param {object} data
 */
function setCachedVideoInfo(url, data) {
  // Evict oldest entry if at capacity (Map preserves insertion order)
  if (videoInfoCache.size >= VIDEO_INFO_CACHE_MAX_ENTRIES && !videoInfoCache.has(url)) {
    const oldestKey = videoInfoCache.keys().next().value;
    videoInfoCache.delete(oldestKey);
  }
  videoInfoCache.set(url, { data, expiresAt: Date.now() + VIDEO_INFO_CACHE_TTL_MS });
}

/**
 * Manually invalidate a cached entry (e.g. if a fetch is known to be stale).
 * @param {string} url
 */
function clearCachedVideoInfo(url) {
  videoInfoCache.delete(url);
}

module.exports = {
  get currentProgress() { return currentProgress; },
  set currentProgress(val) { currentProgress = val; },
  recordings,
  activeClips,
  wsClients,
  get recordingCleanupTimeoutMs() { return recordingCleanupTimeoutMs; },
  set recordingCleanupTimeoutMs(val) { recordingCleanupTimeoutMs = val; },

  // Download queue
  MAX_CONCURRENT_DOWNLOADS_PER_IP,
  canStartDownload,
  startDownload,
  endDownload,
  getActiveDownloadCount,

  // Video info cache
  getCachedVideoInfo,
  setCachedVideoInfo,
  clearCachedVideoInfo
};