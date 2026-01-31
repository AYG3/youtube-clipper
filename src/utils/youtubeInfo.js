const ytdl = require('@distube/ytdl-core');
const util = require('util');
const { execFile } = require('child_process');
const execFileAsync = util.promisify(execFile);

/**
 * fetchVideoInfo(url)
 * Always uses yt-dlp first (more reliable), falls back to ytdl-core.
 * Returns an object compatible with the shape used by existing code (videoDetails...).
 * 
 * IMPORTANT: isLiveContent should only be true for CURRENTLY live streams,
 * NOT for completed/archived livestreams (was_live).
 */
async function fetchVideoInfo(url) {
  let ytdlpError = null;
  
  // Try yt-dlp first (more reliable and has better live detection)
  try {
    const ytdlpArgs = [
      '-j',
      '--extractor-args', 'youtube:player_client=ios,web',
      '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      url
    ];
    
    const { stdout } = await execFileAsync('yt-dlp', ytdlpArgs, { 
      timeout: 30000, 
      maxBuffer: 10 * 1024 * 1024 
    });
    const meta = JSON.parse(stdout);

    // yt-dlp provides:
    // - is_live: true if CURRENTLY broadcasting
    // - was_live: true if this was a livestream (but now archived)
    // - live_status: "is_live", "was_live", "not_live", "is_upcoming", etc.
    const isCurrentlyLive = meta.is_live === true || meta.live_status === 'is_live';

    const info = {
      videoDetails: {
        lengthSeconds: meta.duration ? String(meta.duration) : '0',
        isLiveContent: isCurrentlyLive, // Only true for CURRENTLY live streams
        title: meta.title || '',
        thumbnails: (meta.thumbnails && meta.thumbnails.length)
          ? meta.thumbnails.map(t => ({ url: t.url || t }))
          : (meta.thumbnail ? [{ url: meta.thumbnail }] : []),
        videoId: meta.id || ''
      },
      // Extra metadata for debugging
      _ytdlp: {
        is_live: meta.is_live,
        was_live: meta.was_live,
        live_status: meta.live_status
      }
    };

    console.log(`Video info from yt-dlp: is_live=${meta.is_live}, was_live=${meta.was_live}, live_status=${meta.live_status}`);
    return info;
  } catch (ytErr) {
    ytdlpError = ytErr;
    console.warn('yt-dlp failed, trying ytdl-core:', ytErr && (ytErr.message || ytErr.stderr) || ytErr);
  }

  // Fallback to ytdl-core
  try {
    const info = await ytdl.getInfo(url);
    
    // ytdl-core's isLiveContent is true for BOTH currently live AND archived livestreams
    // We need to check if the video has a duration - if it does, it's archived (not currently live)
    const duration = parseInt(info.videoDetails.lengthSeconds || '0');
    const ytdlIsLive = !!info.videoDetails.isLiveContent;
    
    // If ytdl says it's live but it has a duration, it's actually an archived livestream
    const isCurrentlyLive = ytdlIsLive && duration === 0;
    
    console.log(`Video info from ytdl-core: isLiveContent=${ytdlIsLive}, duration=${duration}, treating as live=${isCurrentlyLive}`);
    
    // Override isLiveContent with our corrected value
    return {
      videoDetails: {
        ...info.videoDetails,
        isLiveContent: isCurrentlyLive
      }
    };
  } catch (err) {
    console.error('ytdl-core also failed:', err && (err.message || err));

    // Provide a helpful DNS-specific message when possible
    if (err && err.code === 'ENOTFOUND') {
      const e = new Error(`DNS resolution failed for ${err.hostname || 'www.youtube.com'} (ENOTFOUND). Check your network or DNS settings.`);
      e.code = 'ENOTFOUND';
      throw e;
    }

    // Return the yt-dlp error if both failed
    throw new Error('Failed to get video info via yt-dlp and ytdl-core: ' + 
      (ytdlpError && (ytdlpError.message || ytdlpError.stderr) || 'unknown error'));
  }
}

module.exports = { fetchVideoInfo };
