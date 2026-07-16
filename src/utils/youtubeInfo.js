const ytdl = require('@distube/ytdl-core');
const util = require('util');
const { execFile } = require('child_process');
const dns = require('dns').promises;
const execFileAsync = util.promisify(execFile);
const state = require('../state');

/**
 * Check network connectivity before attempting downloads
 * Returns { connected: boolean, error?: string }
 */
async function checkNetworkConnectivity() {
  try {
    // Try to resolve YouTube's domain
    const addresses = await dns.resolve4('www.youtube.com');
    if (addresses && addresses.length > 0) {
      console.log(`✅ DNS resolution successful: www.youtube.com -> ${addresses[0]}`);
      return { connected: true };
    }
    return { connected: false, error: 'DNS resolution returned no addresses' };
  } catch (err) {
    console.error('❌ DNS resolution failed:', err.code, err.message);
    return { 
      connected: false, 
      error: `DNS lookup failed (${err.code}): ${err.message}`,
      code: err.code
    };
  }
}

/**
 * fetchVideoInfo(url)
 * Uses yt-dlp FIRST (actively maintained, far more reliable against current
 * YouTube changes), with ytdl-core as a lightweight fallback.
 * Implements retry logic with exponential backoff for rate limiting and network issues
 * Returns an object compatible with the shape used by existing code (videoDetails...).
 * 
 * IMPORTANT: isLiveContent should only be true for CURRENTLY live streams,
 * NOT for completed/archived livestreams (was_live).
 *
 * NOTE: ytdl-core frequently fails outright against current YouTube (bot
 * detection / signature changes), so trying it first wasted a full failing
 * attempt on nearly every request before. yt-dlp is now tried first.
 */
async function fetchVideoInfo(url, retryCount = 0, maxRetries = 3) {
  const baseDelay = 2000; // Start with 2 seconds

  // Serve from cache if we've looked this URL up recently. This is the
  // single biggest lever against redundant YouTube calls: history auto-load,
  // slider adjustments, transcript fetch, clip download, and status polling
  // can all trigger fetchVideoInfo() for the same video within seconds.
  if (retryCount === 0) {
    const cached = state.getCachedVideoInfo(url);
    if (cached) {
      console.log(`⚡ Video info cache hit for ${url}`);
      return cached;
    }
  }
  
  // Pre-flight network connectivity check (only on first attempt)
  if (retryCount === 0) {
    const netCheck = await checkNetworkConnectivity();
    if (!netCheck.connected) {
      console.error('❌ Network connectivity check failed before download attempt');
      
      // If DNS fails, provide actionable error message
      if (netCheck.code === 'ENOTFOUND' || netCheck.code === 'EAI_AGAIN') {
        throw new Error(
          `Network connection unavailable. Unable to resolve www.youtube.com. ` +
          `Please check your internet connection and DNS settings. (${netCheck.code})`
        );
      }
      
      // For other network issues, still try but warn user
      console.warn('⚠️  Network pre-check failed, but attempting download anyway:', netCheck.error);
    }
  }

  // Try yt-dlp FIRST (actively maintained, handles current YouTube changes best)
  let ytdlpError = null;
  try {
    console.log(`Attempting yt-dlp (attempt ${retryCount + 1}/${maxRetries + 1})...`);
    const ytdlpArgs = [
      '-j',
      '--skip-download',                   // Only fetch metadata, don't download
      '--socket-timeout', '30',            // 30s socket timeout
      '--retry-sleep', '5',                // Sleep between retries
      // Use android_vr client which doesn't require n-parameter decoding
      '--extractor-args', 'youtube:player_client=android_vr,web',
      '--no-check-certificates',
      url
    ];
    
    const { stdout } = await execFileAsync('yt-dlp', ytdlpArgs, { 
      timeout: 45000,                      // Increased timeout for network issues
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
    state.setCachedVideoInfo(url, info);
    return info;
  } catch (ytErr) {
    ytdlpError = ytErr;
    const errorMsg = ytErr.stderr || ytErr.message || String(ytErr);
    console.warn('⚠️  yt-dlp failed:', errorMsg);
    
    // Check for network/DNS errors and retry with backoff
    const isNetworkError = 
      errorMsg.includes('Failed to resolve') ||
      errorMsg.includes('nodename nor servname') ||
      errorMsg.includes('Unable to download') ||
      errorMsg.includes('ENOTFOUND') ||
      errorMsg.includes('EAI_AGAIN') ||
      errorMsg.includes('Connection') ||
      ytErr.code === 'ENOTFOUND' ||
      ytErr.code === 'EAI_AGAIN';
    
    // Check for rate limiting
    const isRateLimited = errorMsg.includes('429') || errorMsg.includes('Too Many Requests');
    
    if ((isNetworkError || isRateLimited) && retryCount < maxRetries) {
      const delay = baseDelay * Math.pow(2, retryCount);
      const reason = isRateLimited ? 'Rate limited (429)' : 'Network/DNS error';
      console.log(`⏳ ${reason}. Retrying in ${delay}ms... (attempt ${retryCount + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchVideoInfo(url, retryCount + 1, maxRetries);
    }
  }

  // Fallback to ytdl-core
  try {
    console.log(`Attempting ytdl-core fallback (attempt ${retryCount + 1}/${maxRetries + 1})...`);
    const info = await ytdl.getInfo(url);
    
    // ytdl-core's isLiveContent is true for BOTH currently live AND archived livestreams
    // We need to check if the video has a duration - if it does, it's archived (not currently live)
    const duration = parseInt(info.videoDetails.lengthSeconds || '0');
    const ytdlIsLive = !!info.videoDetails.isLiveContent;
    
    // If ytdl says it's live but it has a duration, it's actually an archived livestream
    const isCurrentlyLive = ytdlIsLive && duration === 0;
    
    console.log(`✅ Video info from ytdl-core: isLiveContent=${ytdlIsLive}, duration=${duration}, treating as live=${isCurrentlyLive}`);
    
    // Override isLiveContent with our corrected value
    const result = {
      videoDetails: {
        ...info.videoDetails,
        isLiveContent: isCurrentlyLive
      }
    };
    state.setCachedVideoInfo(url, result);
    return result;
  } catch (ytdlErr) {
    console.error('❌ ytdl-core fallback also failed:', ytdlErr && (ytdlErr.message || ytdlErr));
    
    // Check if it's a rate limit error worth retrying the whole chain for
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

  // Both methods failed - provide comprehensive error message
  const ytdlpMsg = ytdlpError ? (ytdlpError.stderr || ytdlpError.message || String(ytdlpError)) : '';
  
  // Check for DNS/Network errors
  const isDNSError = 
    ytdlpMsg.includes('Failed to resolve') ||
    ytdlpMsg.includes('nodename nor servname') ||
    ytdlpMsg.includes('ENOTFOUND') ||
    ytdlpMsg.includes('EAI_AGAIN') ||
    (ytdlpError && (ytdlpError.code === 'ENOTFOUND' || ytdlpError.code === 'EAI_AGAIN'));
  
  if (isDNSError) {
    const e = new Error(
      `Network Unavailable: Cannot connect to YouTube. ` +
      `This is likely due to: (1) No internet connection, (2) DNS server issues, or (3) Firewall/VPN blocking YouTube. ` +
      `Please verify your network connection and try again. ` +
      `Troubleshooting: Run 'ping www.youtube.com' or 'nslookup www.youtube.com' to diagnose.`
    );
    e.code = 'NETWORK_ERROR';
    throw e;
  }

  // Check for specific error patterns to provide better user feedback
  const isRateLimited = ytdlpMsg.includes('429') || ytdlpMsg.includes('Too Many Requests');
  const isBotDetection = ytdlpMsg.includes('Sign in to confirm') || ytdlpMsg.includes('bot');
  const isTimeout = ytdlpMsg.includes('timeout') || ytdlpMsg.includes('timed out');
  
  let userMessage = 'Failed to get video info';
  
  if (isRateLimited) {
    userMessage = 'YouTube rate limit exceeded (HTTP 429). This often happens on cloud hosting. The service will retry automatically, or please try again in a few minutes.';
  } else if (isBotDetection) {
    userMessage = 'YouTube has detected automated access from this server. This is common on cloud hosting platforms. Please try a different video or wait a few minutes before trying again.';
  } else if (isTimeout) {
    userMessage = 'Connection timeout. YouTube may be slow or unreachable. Please check your network connection and try again.';
  }
  
  // Only include raw error for debugging if it's not too verbose
  const debugInfo = ytdlpMsg.length < 500 ? ytdlpMsg : ytdlpMsg.substring(0, 500) + '...';
  const detailedError = `${userMessage}${debugInfo ? ' [Debug: ' + debugInfo + ']' : ''}`;
  
  throw new Error(detailedError);
}

module.exports = { fetchVideoInfo, checkNetworkConnectivity };