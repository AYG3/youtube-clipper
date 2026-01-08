/**
 * Clip service - core clipping logic
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const state = require('../state');
const { wsBroadcast } = require('../utils/broadcast');
const { killChildProcess } = require('../utils/process');
const { parseFFmpegTime } = require('../utils/time');
const { getClipIdAndPath, waitForFile, findFallbackOutputFile, ensureTempDir, validateResumable } = require('../utils/file');

/**
 * Spawn yt-dlp to download a clip segment
 * @param {object} options
 * @returns {Promise<string>} outputPath
 */
async function downloadClip({
  url,
  startSeconds,
  endSeconds,
  quality = 'best',
  background = false,
  onProgress,
  onKillRequested
}) {
  ensureTempDir();
  const { clipId, outputPath, filename, ext } = getClipIdAndPath({ url, startSeconds, endSeconds, quality });
  const clipDuration = endSeconds - startSeconds;

  // Enhanced resume detection with validation
  let resumeInfo = null;
  if (fs.existsSync(outputPath)) {
    try {
      const st = fs.statSync(outputPath);
      const isPartial = outputPath.endsWith('.part');
      const ageMinutes = (Date.now() - st.mtimeMs) / 60000;
      
      // Check if file is stale (older than 24 hours and no active process)
      const isStale = ageMinutes > 1440 && !state.activeClips.has(clipId);
      
      if (isStale && st.size < 1024) {
        // Delete tiny stale files
        console.log(`Removing stale partial file (${st.size} bytes, ${ageMinutes.toFixed(0)}min old)`);
        fs.unlinkSync(outputPath);
      } else {
        resumeInfo = {
          size: st.size,
          sizeMB: (st.size / (1024 * 1024)).toFixed(2),
          isPartial,
          ageMinutes: ageMinutes.toFixed(1)
        };
        console.log(`Resume: Found ${isPartial ? 'partial' : 'existing'} file (${resumeInfo.sizeMB} MB, ${resumeInfo.ageMinutes}min old)`);
      }
    } catch (e) {
      console.warn('Error checking existing file:', e.message);
    }
  }

  const chosenFormat = config.QUALITY_FORMAT_MAP[quality] || config.QUALITY_FORMAT_MAP['best'];
  const args = [
    '-f', chosenFormat,
    '--download-sections', `*${startSeconds}-${endSeconds}`,
    '--force-keyframes-at-cuts',
    // Enhanced retry configuration for better resume reliability
    '--retries', '15',                    // Increased from 10
    '--fragment-retries', '20',           // Increased from 10 for fragment failures
    '--retry-sleep', '3',                 // Faster retry (was 5s)
    '--file-access-retries', '5',         // New: retry file system operations
    '--continue',                          // Resume partial downloads
    '--no-overwrites',                     // Don't restart complete downloads
    '--concurrent-fragments', '3',         // Parallel fragment downloads for speed
    '--throttled-rate', '100K',           // Minimum rate before considering connection stuck
    '--merge-output-format', 'mp4',
    '--progress',
    '--newline',
    '--progress-template', '%(progress._percent_str)s %(progress.speed)s',  // Better progress info
    '-o', outputPath,
    url
  ];

  console.log('Spawning yt-dlp with args:', args.join(' '));
  const proc = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  try { proc.unref(); } catch (e) { /* ignore */ }

  // Register in activeClips
  state.activeClips.set(clipId, { proc, outputPath, percent: 0, message: 'Starting', background: !!background, filename });

  // Allow caller to request kill
  if (typeof onKillRequested === 'function') {
    onKillRequested(() => killChildProcess(proc, 'caller_request'));
  }

  // Enhanced monitoring for resume reliability
  let stderrBuf = '';
  let lastPercentLogged = -1;
  let lastProgressTime = Date.now();
  let lastPercent = 0;
  let stallCheckInterval = null;

  // Detect stalled downloads and restart if needed
  const STALL_TIMEOUT_MS = 120000; // 2 minutes without progress
  stallCheckInterval = setInterval(() => {
    const timeSinceProgress = Date.now() - lastProgressTime;
    if (timeSinceProgress > STALL_TIMEOUT_MS && lastPercent < 100) {
      console.warn(`⚠️  Download stalled for ${(timeSinceProgress/1000).toFixed(0)}s at ${lastPercent}% - process may be hung`);
      // Don't auto-kill, let yt-dlp's own retry logic handle it
    }
  }, 30000); // Check every 30 seconds

  function renderProgressBar(percent) {
    const barWidth = 30;
    const filled = Math.round((percent / 100) * barWidth);
    const empty = barWidth - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }

  proc.stderr.on('data', (data) => {
    const s = data.toString();
    stderrBuf = (stderrBuf + s).slice(-config.STDERR_MAX_BYTES);

    // Download progress with speed monitoring
    const downloadMatch = s.match(/\[download\]\s*([0-9]{1,3}(?:\.[0-9]+)?)%/);
    if (downloadMatch) {
      const pct = Number(downloadMatch[1]);
      const speedMatch = s.match(/([0-9.]+(?:K|M|G)iB\/s)/);
      const speed = speedMatch ? speedMatch[1] : '';
      
      // Track progress for stall detection
      if (pct > lastPercent) {
        lastProgressTime = Date.now();
        lastPercent = pct;
      }
      
      const message = speed ? `Downloading (${speed})` : 'Downloading';
      state.currentProgress = { percent: pct, message };
      const clip = state.activeClips.get(clipId);
      if (clip) { clip.percent = pct; clip.message = message; }
      wsBroadcast({ type: 'progress', ...state.currentProgress });
      if (typeof onProgress === 'function') onProgress(pct, message);

      if (Math.abs(pct - lastPercentLogged) >= 1) {
        lastPercentLogged = pct;
        const speedInfo = speed ? ` @ ${speed}` : '';
        process.stdout.write(`\r📥 Downloading: [${renderProgressBar(pct)}] ${pct.toFixed(1)}%${speedInfo}`);
        if (pct >= 100) process.stdout.write('\n');
      }
    }

    // ffmpeg processing progress
    const timeMatch = s.match(/time=([0-9:.]+)/);
    if (timeMatch && clipDuration > 0) {
      const secs = parseFFmpegTime(timeMatch[1]);
      let percent = (secs / clipDuration) * 100;
      if (percent > 100) percent = 100;
      state.currentProgress = { percent, message: 'Processing' };
      const clip = state.activeClips.get(clipId);
      if (clip) { clip.percent = percent; clip.message = 'Processing'; }
      wsBroadcast({ type: 'progress', ...state.currentProgress });
      if (typeof onProgress === 'function') onProgress(percent, 'Processing');

      if (Math.abs(percent - lastPercentLogged) >= 1) {
        lastPercentLogged = Math.floor(percent);
        process.stdout.write(`\r🎬 Processing: [${renderProgressBar(percent)}] ${percent.toFixed(1)}%`);
        if (percent >= 100) process.stdout.write('\n');
      }
    }
  });

  proc.stdout.on('data', (data) => {
    const s = data.toString();
    if (s.includes('[download]') && s.includes('100%')) {
      console.log('✓ Download complete');
    }
  });

  return new Promise((resolve, reject) => {
    proc.on('close', (code, signal) => {
      // Cleanup stall detection
      if (stallCheckInterval) {
        clearInterval(stallCheckInterval);
        stallCheckInterval = null;
      }
      
      const clip = state.activeClips.get(clipId);
      if (clip) {
        clip.proc = null;
        clip.percent = 100;
        clip.message = code === 0 ? 'Complete' : 'Error';
        clip.ready = code === 0;
        clip.stderr = stderrBuf;
      }

      if (code === 0) {
        console.log('Clip created successfully');
        state.currentProgress = { percent: 100, message: 'Complete' };
        wsBroadcast({ type: 'progress', ...state.currentProgress });
        resolve({ clipId, outputPath, filename, ext });
      } else {
        const msg = `yt-dlp exited with code ${code} signal ${signal}`;
        console.error(msg);
        
        // Enhanced error logging with resume context
        try {
          const logPath = outputPath + '.yt-dlp.log';
          const partialSize = fs.existsSync(outputPath) ? fs.statSync(outputPath).size : 0;
          const header = [
            `Exit code: ${code} signal: ${signal}`,
            `Timestamp: ${new Date().toISOString()}`,
            `Resume info: ${resumeInfo ? `${resumeInfo.sizeMB} MB (${resumeInfo.ageMinutes}min old)` : 'new download'}`,
            `Partial file size: ${(partialSize / (1024*1024)).toFixed(2)} MB`,
            `Can resume: ${partialSize > 0 ? 'yes' : 'no'}`,
            '--- stderr ---\n'
          ].join('\n');
          fs.writeFileSync(logPath, header + stderrBuf, 'utf8');
          console.log('Wrote yt-dlp stderr log to', logPath);
        } catch (e) { /* ignore */ }

        // DO NOT delete partial/failed files - preserve for resume/debug
        if (fs.existsSync(outputPath)) {
          const sz = fs.statSync(outputPath).size;
          console.log(`Preserving partial file for resume: ${(sz/(1024*1024)).toFixed(2)} MB at ${outputPath}`);
        }
        reject(new Error(msg));
      }
    });

    proc.on('error', (err) => {
      console.error('yt-dlp spawn error:', err);
      const clip = state.activeClips.get(clipId);
      if (clip) { clip.message = 'Error'; }
      reject(err);
    });
  });
}

/**
 * Get clip status
 */
function getClipStatus({ url, startSeconds, endSeconds, quality = 'best' }) {
  const { clipId, outputPath, filename } = getClipIdAndPath({ url, startSeconds, endSeconds, quality });
  const exists = fs.existsSync(outputPath);
  const stats = exists ? fs.statSync(outputPath) : null;
  const sizeBytes = stats ? stats.size : 0;
  const sizeMB = sizeBytes / (1024 * 1024);
  
  // Check if this is a partial download
  const isPartial = outputPath.includes('.part');
  const validation = exists ? validateResumable(outputPath) : { resumable: false, reason: 'No file' };
  
  const logPath = outputPath + '.yt-dlp.log';
  const hasLog = fs.existsSync(logPath);
  let logSnippet = '';
  if (hasLog) {
    try {
      const content = fs.readFileSync(logPath, 'utf8');
      const lines = content.trim().split('\n');
      logSnippet = lines.slice(-20).join('\n');
    } catch (e) { /* ignore */ }
  }
  
  const active = state.activeClips.has(clipId) && !!state.activeClips.get(clipId).proc;
  const clip = state.activeClips.get(clipId) || {};
  
  return {
    clipId,
    exists,
    sizeBytes,
    sizeMB: sizeMB.toFixed(2),
    isPartial,
    resumable: validation.resumable,
    resumeReason: validation.reason,
    inProgress: active,
    percent: clip.percent || 0,
    message: clip.message || '',
    filename,
    hasLog,
    logSnippet
  };
}

module.exports = {
  downloadClip,
  getClipStatus,
  getClipIdAndPath
};
