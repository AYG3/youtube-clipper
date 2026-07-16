/**
 * File utilities
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');

/**
 * Ensure temp directory exists
 */
function ensureTempDir() {
  if (!fs.existsSync(config.TEMP_DIR)) {
    fs.mkdirSync(config.TEMP_DIR, { recursive: true });
  }
}

/**
 * Generate deterministic clip ID and output path
 * @param {object} params
 * @param {string} params.url
 * @param {number} params.startSeconds
 * @param {number} params.endSeconds
 * @param {string} params.quality
 * @returns {{ clipId: string, outputPath: string, filename: string }}
 */
function getClipIdAndPath({ url, startSeconds, endSeconds, quality = 'best' }) {
  ensureTempDir();
  const hash = crypto.createHash('sha256')
    .update(`${url}|${startSeconds}|${endSeconds}|${quality}`)
    .digest('hex')
    .slice(0, 12);
  const titleSafe = (url || 'clip').replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const ext = (quality === 'audio') ? 'm4a' : 'mp4';
  const filename = `${titleSafe}_clip_${hash}.${ext}`;
  return { clipId: hash, outputPath: path.join(config.TEMP_DIR, filename), filename, ext };
}

/**
 * Wait for a file to exist (with timeout)
 * @param {string} filePath
 * @param {number} timeoutMs
 * @returns {Promise<boolean>}
 */
function waitForFile(filePath, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (fs.existsSync(filePath)) return resolve(true);
      if (Date.now() - start > timeoutMs) return reject(new Error('Timed out waiting for file'));
      setTimeout(check, 200);
    };
    check();
  });
}

/**
 * Find fallback output file matching prefix and extension
 * @param {string} outputPath - Expected output path
 * @param {string} ext - Expected extension
 * @returns {string|null} - Found path or null
 */
function findFallbackOutputFile(outputPath, ext) {
  const dir = path.dirname(outputPath);
  const prefix = path.basename(outputPath).split('_clip_')[0];
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir);
  // Only accept valid completed video files (no .part)
  let found = files.find(f => f.startsWith(prefix) && f.endsWith(`.${ext}`) && !f.includes('.part'));
  if (!found) {
    const candidates = files.filter(f =>
      f.includes(prefix) &&
      f.includes('_clip_') &&
      !f.includes('.part') &&
      config.VALID_VIDEO_EXTENSIONS.some(validExt => f.endsWith(validExt))
    );
    // Sort by mtime desc (newest first)
    candidates.sort((a, b) => fs.statSync(path.join(dir, b)).mtimeMs - fs.statSync(path.join(dir, a)).mtimeMs);
    found = candidates[0];
  }
  return found ? path.join(dir, found) : null;
}

/**
 * Check if file is a partial download
 * @param {string} filePath
 * @returns {boolean}
 */
function isPartialFile(filePath) {
  return filePath.endsWith('.part') || filePath.endsWith('.ytdl');
}

/**
 * Get file size in MB
 * @param {string} filePath
 * @returns {number|null}
 */
function getFileSizeMB(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const stats = fs.statSync(filePath);
    return stats.size / (1024 * 1024);
  } catch (e) {
    return null;
  }
}

/**
 * Clean up stale partial downloads
 * @param {number} maxAgeHours - Delete partials older than this
 * @returns {number} - Number of files deleted
 */
function cleanupStalePartials(maxAgeHours = 24) {
  let deletedCount = 0;
  try {
    if (!fs.existsSync(config.TEMP_DIR)) return 0;
    const files = fs.readdirSync(config.TEMP_DIR);
    const now = Date.now();
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
    
    for (const file of files) {
      if (isPartialFile(file)) {
        const filePath = path.join(config.TEMP_DIR, file);
        const stats = fs.statSync(filePath);
        const age = now - stats.mtimeMs;
        
        // Delete if old and small (likely corrupted)
        if (age > maxAgeMs && stats.size < 1024 * 1024) { // < 1MB
          try {
            fs.unlinkSync(filePath);
            deletedCount++;
            console.log(`Cleaned up stale partial: ${file} (${(age/3600000).toFixed(1)}h old, ${stats.size} bytes)`);
          } catch (e) {
            console.warn(`Failed to delete ${file}:`, e.message);
          }
        }
      }
    }
  } catch (e) {
    console.error('Error cleaning up partials:', e.message);
  }
  return deletedCount;
}

/**
 * Get total size (bytes) of all files currently in TEMP_DIR.
 * @returns {number}
 */
function getTempDirUsageBytes() {
  try {
    if (!fs.existsSync(config.TEMP_DIR)) return 0;
    const files = fs.readdirSync(config.TEMP_DIR);
    let total = 0;
    for (const file of files) {
      try {
        const filePath = path.join(config.TEMP_DIR, file);
        const stats = fs.statSync(filePath);
        if (stats.isFile()) total += stats.size;
      } catch (e) {
        // File may have been removed concurrently by another process - skip it
      }
    }
    return total;
  } catch (e) {
    console.error('Error computing temp dir usage:', e.message);
    return 0;
  }
}

/**
 * Enforce a maximum total disk usage for TEMP_DIR. If usage exceeds the
 * given limit, deletes the OLDEST partial/incomplete downloads first until
 * back under the limit. Never deletes completed (non-.part) files, since
 * those may be actively awaiting download/resume by a user.
 *
 * This exists because the age+size based cleanupStalePartials() above will
 * happily leave a large stuck/crashed partial (e.g. multiple GB) sitting
 * around indefinitely if it's under 24h old or over 1MB - which can slowly
 * fill the disk and cause every subsequent download to start failing with
 * a confusing "no space left on device" error instead of a clear one.
 *
 * @param {number} maxBytes
 * @returns {{ freedBytes: number, deletedFiles: string[], usageBeforeBytes: number, usageAfterBytes: number }}
 */
function enforceTempDirSizeLimit(maxBytes) {
  const result = { freedBytes: 0, deletedFiles: [], usageBeforeBytes: 0, usageAfterBytes: 0 };
  try {
    if (!fs.existsSync(config.TEMP_DIR)) return result;

    let totalBytes = getTempDirUsageBytes();
    result.usageBeforeBytes = totalBytes;

    if (totalBytes <= maxBytes) {
      result.usageAfterBytes = totalBytes;
      return result;
    }

    console.warn(
      `⚠️  Temp dir usage (${(totalBytes / (1024 * 1024 * 1024)).toFixed(2)} GB) exceeds limit ` +
      `(${(maxBytes / (1024 * 1024 * 1024)).toFixed(2)} GB) - freeing space by removing oldest partial downloads...`
    );

    // Only ever evict partial/incomplete files, oldest first. Completed
    // files are left alone - a user may be about to download/resume them.
    const candidates = fs.readdirSync(config.TEMP_DIR)
      .filter(f => isPartialFile(f))
      .map(f => {
        const filePath = path.join(config.TEMP_DIR, f);
        try {
          const stats = fs.statSync(filePath);
          return { file: f, filePath, size: stats.size, mtimeMs: stats.mtimeMs };
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => a.mtimeMs - b.mtimeMs); // oldest first

    for (const entry of candidates) {
      if (totalBytes <= maxBytes) break;
      try {
        fs.unlinkSync(entry.filePath);
        totalBytes -= entry.size;
        result.freedBytes += entry.size;
        result.deletedFiles.push(entry.file);
        console.log(`🧹 Freed ${(entry.size / (1024 * 1024)).toFixed(1)} MB by removing stale partial: ${entry.file}`);
      } catch (e) {
        console.warn(`Failed to delete ${entry.file} while enforcing disk limit:`, e.message);
      }
    }

    result.usageAfterBytes = totalBytes;

    if (totalBytes > maxBytes) {
      console.error(
        `⚠️  Temp dir still over limit after evicting all partials ` +
        `(${(totalBytes / (1024 * 1024 * 1024)).toFixed(2)} GB). Completed files are never ` +
        `auto-deleted here - consider raising MAX_TEMP_DIR_BYTES or clearing finished clips manually.`
      );
    }
  } catch (e) {
    console.error('Error enforcing temp dir size limit:', e.message);
  }
  return result;
}

/**
 * Validate if a download is resumable
 * @param {string} filePath
 * @returns {{ resumable: boolean, reason: string, sizeMB: number }}
 */
function validateResumable(filePath) {
  if (!fs.existsSync(filePath)) {
    return { resumable: false, reason: 'File does not exist', sizeMB: 0 };
  }
  
  const stats = fs.statSync(filePath);
  const sizeMB = stats.size / (1024 * 1024);
  const ageMinutes = (Date.now() - stats.mtimeMs) / 60000;
  
  // Too small - likely corrupted
  if (stats.size < 1024) {
    return { resumable: false, reason: 'File too small (corrupted)', sizeMB };
  }
  
  // Very old and small - probably failed
  if (ageMinutes > 1440 && sizeMB < 1) {
    return { resumable: false, reason: 'Stale and undersized', sizeMB };
  }
  
  return { resumable: true, reason: 'Valid partial download', sizeMB };
}

module.exports = {
  ensureTempDir,
  getClipIdAndPath,
  waitForFile,
  findFallbackOutputFile,
  isPartialFile,
  getFileSizeMB,
  cleanupStalePartials,
  getTempDirUsageBytes,
  enforceTempDirSizeLimit,
  validateResumable
};