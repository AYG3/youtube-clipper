const ytdl = require('@distube/ytdl-core');
const util = require('util');
const { execFile } = require('child_process');
const execFileAsync = util.promisify(execFile);

/**
 * fetchVideoInfo(url)
 * Uses ytdl-core first (better for datacenter IPs), with yt-dlp fallback
 * Implements retry logic with exponential backoff for rate limiting
 * Returns an object compatible with the shape used by existing code (videoDetails...).
 * 
 * IMPORTANT: isLiveContent should only be true for CURRENTLY live streams,
 * NOT for completed/archived livestreams (was_live).
 */
async function fetchVideoInfo(url, retryCount = 0, maxRetries = 3) {
  const baseDelay = 2000; // Start with 2 seconds
  
  // Try ytdl-core FIRST (more reliable on datacenter IPs)
  try {
    console.log(`Attempting ytdl-core (attempt ${retryCount + 1}/${maxRetries + 1})...`);
    const info = await ytdl.getInfo(url);
    
    // ytdl-core's isLiveContent is true for BOTH currently live AND archived livestreams
    // We need to check if the video has a duration - if it does, it's archived (not currently live)
    const duration = parseInt(info.videoDetails.lengthSeconds || '0');
    const ytdlIsLive = !!info.videoDetails.isLiveContent;
    
    // If ytdl says it's live but it has a duration, it's actually an archived livestream
    const isCurrentlyLive = ytdlIsLive && duration === 0;
    
    console.log(`✅ Video info from ytdl-core: isLiveContent=${ytdlIsLive}, duration=${duration}, treating as live=${isCurrentlyLive}`);
    
    // Override isLiveContent with our corrected value
    return {
      videoDetails: {
        ...info.videoDetails,
        isLiveContent: isCurrentlyLive
      }
    };
  } catch (ytdlErr) {
    console.warn('⚠️  ytdl-core failed:', ytdlErr && (ytdlErr.message || ytdlErr));
    
    // Check if it's a rate limit error
    if (ytdlErr && (ytdlErr.statusCode === 429 || ytdlErr.message?.includes('429') || ytdlErr.message?.includes('Too Many Requests'))) {
      if (retryCount < maxRetries) {
        const delay = baseDelay * Math.pow(2, retryCount);
        console.log(`⏳ Rate limited (429). Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return fetchVideoInfo(url, retryCount + 1, maxRetries);
      }
      console.error('❌ Rate limit exceeded after retries');
    }
  }

  // Fallback to yt-dlp with retry logic
  let ytdlpError = null;
  try {
    console.log(`Attempting yt-dlp (attempt ${retryCount + 1}/${maxRetries + 1})...`);
    const ytdlpArgs = [
      '-j',
      '--extractor-args', 'youtube:player_client=android,tv,web;po_token=web+https://www.youtube.com',
      '--user-agent', 'com.google.android.youtube/19.09.36 (Linux; U; Android 13) gzip',
      '--no-check-certificates',
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

    console.log(`✅ Video info from yt-dlp: is_live=${meta.is_live}, was_live=${meta.was_live}, live_status=${meta.live_status}`);
    return info;
  } catch (ytErr) {
    ytdlpError = ytErr;
    const errorMsg = ytErr.stderr || ytErr.message || String(ytErr);
    console.error('⚠️  yt-dlp failed:', errorMsg);
    
    // Check for rate limiting in yt-dlp
    if (errorMsg.includes('429') || errorMsg.includes('Too Many Requests')) {
      if (retryCount < maxRetries) {
        const delay = baseDelay * Math.pow(2, retryCount);
        console.log(`⏳ Rate limited (429). Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return fetchVideoInfo(url, retryCount + 1, maxRetries);
      }
    }
  }

  // Both methods failed - provide comprehensive error message
  const ytdlpMsg = ytdlpError ? (ytdlpError.stderr || ytdlpError.message || String(ytdlpError)) : '';
  
  // Provide a helpful DNS-specific message when possible
  if (ytdlpError && ytdlpError.code === 'ENOTFOUND') {
    const e = new Error(`DNS resolution failed for ${ytdlpError.hostname || 'www.youtube.com'} (ENOTFOUND). Check your network or DNS settings.`);
    e.code = 'ENOTFOUND';
    throw e;
  }

  // Check for specific error patterns to provide better user feedback
  const isRateLimited = ytdlpMsg.includes('429') || ytdlpMsg.includes('Too Many Requests');
  const isBotDetection = ytdlpMsg.includes('Sign in to confirm') || ytdlpMsg.includes('bot');
  
  let userMessage = 'Failed to get video info';
  
  if (isRateLimited) {
    userMessage = 'YouTube rate limit exceeded (HTTP 429). This often happens on cloud hosting. The service will retry automatically, or please try again in a few minutes.';
  } else if (isBotDetection) {
    userMessage = 'YouTube has detected automated access from this server. This is common on cloud hosting platforms. Please try a different video or wait a few minutes before trying again.';
  }
  
  const detailedError = `${userMessage}${ytdlpMsg ? ': ' + ytdlpMsg : ''}`;
  
  throw new Error(detailedError);
}

module.exports = { fetchVideoInfo };
