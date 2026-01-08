/**
 * Recording service - core recording logic
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const config = require('../config');
const state = require('../state');
const { wsBroadcast } = require('../utils/broadcast');
const { killChildProcess } = require('../utils/process');
const { ensureTempDir } = require('../utils/file');

/**
 * Schedule cleanup of a finished recording
 */
function scheduleRecordingCleanup(id) {
  const rec = state.recordings.get(id);
  if (!rec) return;
  if (rec.cleanupTimer) clearTimeout(rec.cleanupTimer);
  rec.cleanupTimer = setTimeout(() => {
    console.log(`Auto-removing finished recording ${id} after ${state.recordingCleanupTimeoutMs / 60000} minutes`);
    if (rec.outPath && fs.existsSync(rec.outPath)) {
      try { fs.unlinkSync(rec.outPath); } catch (e) { console.warn('Failed to delete recording file', e.message); }
    }
    state.recordings.delete(id);
    wsBroadcast({ type: 'recording-removed', id });
  }, state.recordingCleanupTimeoutMs);
}

/**
 * Start a live recording
 */
async function startRecording({ url, quality = 'best', maxDuration = 0, title }) {
  ensureTempDir();
  const startedAt = Date.now();
  const id = `rec_${startedAt}_${Math.floor(Math.random() * 10000)}`;
  const titleSafe = (title || 'live').replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const outExt = 'ts';
  const outPath = path.join(config.TEMP_DIR, `${titleSafe}_${id}.${outExt}`);

  const chosenFormat = config.QUALITY_FORMAT_MAP[quality] || config.QUALITY_FORMAT_MAP['best'];
  const args = [
    '-f', chosenFormat,
    '--hls-use-mpegts',
    '--hls-prefer-ffmpeg',
    '--retries', '10',
    '--fragment-retries', '10',
    '--no-overwrites',
    '--continue',
    '--no-part',
    '-o', outPath,
    url
  ];

  const proc = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  
  // Handle spawn errors (e.g., yt-dlp not installed)
  proc.on('error', (err) => {
    if (err.code === 'ENOENT') {
      console.error('❌ yt-dlp is not installed. Please install it: https://github.com/yt-dlp/yt-dlp#installation');
    }
  });
  
  try { proc.unref(); } catch (e) { /* ignore */ }

  const rec = {
    id,
    url,
    title,
    startedAt,
    outPath,
    proc,
    status: 'recording',
    sizeBytes: 0,
    lastUpdate: Date.now(),
    maxDuration: Number(maxDuration) || 0,
    stderrTail: ''
  };
  state.recordings.set(id, rec);

  // Update size periodically
  const updateInterval = setInterval(() => {
    try {
      if (fs.existsSync(outPath)) {
        const stats = fs.statSync(outPath);
        rec.sizeBytes = stats.size;
      }
    } catch (e) { /* ignore */ }
    rec.lastUpdate = Date.now();
    const elapsed = Math.floor((Date.now() - rec.startedAt) / 1000);
    const sizeMB = (rec.sizeBytes / (1024 * 1024)).toFixed(2);
    wsBroadcast({ type: 'recording-progress', id, status: rec.status, elapsed, sizeMB });

    // Auto-stop at maxDuration
    if (rec.maxDuration > 0 && elapsed >= rec.maxDuration) {
      clearInterval(updateInterval);
      killChildProcess(proc, 'maxDuration');
    }
  }, 1000);
  rec.updateInterval = updateInterval;

  proc.on('close', (code, signal) => {
    rec.status = code === 0 ? 'finished' : 'stopped';
    rec.exitCode = code;
    rec.exitSignal = signal;
    rec.endedAt = Date.now();
    clearInterval(rec.updateInterval);
    scheduleRecordingCleanup(id);
    wsBroadcast({ type: 'recording-status', id, status: rec.status });
  });

  proc.stderr.on('data', (chunk) => {
    try {
      const s = chunk.toString().slice(0, 400);
      rec.stderrTail = (rec.stderrTail || '') + s;
      if (rec.stderrTail.length > 2000) rec.stderrTail = rec.stderrTail.slice(-2000);
    } catch (e) { /* ignore */ }
  });

  return { id, outPath, startedAt };
}

/**
 * Stop a recording
 */
async function stopRecording(id) {
  const rec = state.recordings.get(id);
  if (!rec) throw new Error('Recording not found');
  if (!rec.proc || rec.status !== 'recording') throw new Error('Recording not active');

  killChildProcess(rec.proc, 'user_stop');

  // Wait for process to exit
  await new Promise((resolve) => {
    const poll = setInterval(() => {
      if (rec.status !== 'recording') { clearInterval(poll); resolve(); }
    }, 200);
    setTimeout(() => { clearInterval(poll); resolve(); }, 10000);
  });

  if (rec.updateInterval) clearInterval(rec.updateInterval);

  // Remux to MP4
  const finalExt = 'mp4';
  const finalPath = rec.outPath.replace(/\.ts$/i, '.' + finalExt);
  try {
    if (fs.existsSync(rec.outPath)) {
      await new Promise((resolve, reject) => {
        ffmpeg(rec.outPath)
          .outputOptions('-c', 'copy')
          .on('end', resolve)
          .on('error', reject)
          .save(finalPath);
      });
      try { fs.unlinkSync(rec.outPath); } catch (e) { /* ignore */ }
      rec.outPath = finalPath;
    }
  } catch (e) {
    console.warn('Failed to remux recording file to mp4:', e.message || e);
  }

  rec.status = 'finished';
  scheduleRecordingCleanup(id);
  wsBroadcast({ type: 'recording-status', id, status: 'finished', outPath: rec.outPath });

  return { id, outPath: rec.outPath, status: rec.status };
}

/**
 * Clip from a recorded file using ffmpeg
 */
async function clipFromRecording({ id, startSec, endSec }) {
  const rec = state.recordings.get(id);
  if (!rec) throw new Error('Recording not found');
  if (!fs.existsSync(rec.outPath)) throw new Error('Recorded file does not exist yet');

  const clipDuration = endSec - startSec;
  const timestamp = Date.now();
  const ext = 'mp4';
  const titleSafe = (rec.title || 'recording').replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const outputPath = path.join(config.TEMP_DIR, `${titleSafe}_clip_${timestamp}.${ext}`);

  await new Promise((resolve, reject) => {
    ffmpeg(rec.outPath)
      .inputOptions(['-ss', String(startSec)])
      .outputOptions(['-t', String(clipDuration)])
      .outputOptions('-c', 'copy')
      .on('error', reject)
      .on('end', resolve)
      .save(outputPath);
  });

  return { outputPath, filename: `${titleSafe}_clip.${ext}` };
}

module.exports = {
  startRecording,
  stopRecording,
  clipFromRecording,
  scheduleRecordingCleanup
};
