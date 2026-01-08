/**
 * Transcript service - Fetching and storing transcripts from YouTube
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const Transcript = require('../models/Transcript');

/**
 * Fetch transcript using yt-dlp and store in database
 * @param {string} videoId - YouTube video ID
 * @param {string} url - Full YouTube URL
 * @param {string} videoTitle - Video title
 * @param {number} videoDuration - Video duration in seconds
 * @returns {Promise<Object>} Result with segment count
 */
async function fetchAndStoreTranscript(videoId, url, videoTitle, videoDuration) {
  try {
    console.log(`\n📝 Fetching transcript for video: ${videoId}`);
    
    // Check if transcript already exists
    const exists = await Transcript.hasTranscript(videoId);
    if (exists) {
      console.log('✅ Transcript already exists in database');
      const segments = await Transcript.getAllSegments(videoId);
      return { success: true, videoId, segmentCount: segments.length, cached: true };
    }
    
    // Fetch transcript from YouTube
    const segments = await fetchTranscriptFromYoutube(videoId, url);
    
    if (!segments || segments.length === 0) {
      throw new Error('No transcript available for this video');
    }
    
    console.log(`📊 Retrieved ${segments.length} transcript segments`);
    
    // Store in database
    await storeTranscript(videoId, videoTitle, videoDuration, segments);
    
    console.log('✅ Transcript stored successfully');
    
    return {
      success: true,
      videoId,
      segmentCount: segments.length,
      cached: false
    };
  } catch (error) {
    console.error('❌ Error fetching transcript:', error.message);
    throw error;
  }
}

/**
 * Fetch transcript from YouTube using yt-dlp
 * @param {string} videoId - YouTube video ID
 * @param {string} url - Full YouTube URL
 * @returns {Promise<Array>} Array of transcript segments
 */
async function fetchTranscriptFromYoutube(videoId, url) {
  const tempDir = path.join(__dirname, '../../temp');
  
  // Ensure temp directory exists
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  const subtitlePath = path.join(tempDir, `${videoId}.json3`);
  
  // Clean up any existing subtitle file
  if (fs.existsSync(subtitlePath)) {
    fs.unlinkSync(subtitlePath);
  }
  
  return new Promise((resolve, reject) => {
    console.log('🔄 Downloading subtitles with yt-dlp...');
    
    const args = [
      '--write-auto-subs',
      '--write-subs',
      '--sub-langs', 'en',
      '--sub-format', 'json3',
      '--skip-download',
      '--output', path.join(tempDir, `${videoId}.%(ext)s`),
      url
    ];
    
    const proc = spawn('yt-dlp', args);
    let stderr = '';
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
      // Show progress
      const progress = data.toString();
      if (progress.includes('Downloading') || progress.includes('Writing')) {
        process.stdout.write('.');
      }
    });
    
    proc.on('close', (code) => {
      console.log(''); // New line after progress dots
      
      if (code !== 0) {
        return reject(new Error(`yt-dlp failed with code ${code}: ${stderr}`));
      }
      
      // Try to find the subtitle file (could be .en.json3 or similar)
      const possibleFiles = [
        path.join(tempDir, `${videoId}.en.json3`),
        path.join(tempDir, `${videoId}.en-US.json3`),
        path.join(tempDir, `${videoId}.en-GB.json3`)
      ];
      
      let foundFile = null;
      for (const file of possibleFiles) {
        if (fs.existsSync(file)) {
          foundFile = file;
          break;
        }
      }
      
      if (!foundFile) {
        // Try to find any .json3 file for this video
        const files = fs.readdirSync(tempDir);
        const jsonFile = files.find(f => f.startsWith(videoId) && f.endsWith('.json3'));
        if (jsonFile) {
          foundFile = path.join(tempDir, jsonFile);
        }
      }
      
      if (!foundFile) {
        return reject(new Error('No English subtitles available for this video'));
      }
      
      try {
        // Parse the JSON subtitle file
        const data = JSON.parse(fs.readFileSync(foundFile, 'utf8'));
        const segments = parseJson3Subtitles(data);
        
        // Clean up temp file
        fs.unlinkSync(foundFile);
        
        resolve(segments);
      } catch (err) {
        console.error('Error parsing subtitle file:', err);
        reject(new Error('Failed to parse subtitle file'));
      }
    });
    
    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn yt-dlp: ${err.message}`));
    });
  });
}

/**
 * Parse JSON3 subtitle format from yt-dlp
 * @param {Object} data - JSON3 subtitle data
 * @returns {Array} Array of segments with start, end, text
 */
function parseJson3Subtitles(data) {
  const segments = [];
  
  if (!data.events) {
    throw new Error('Invalid subtitle format: no events found');
  }
  
  for (const event of data.events) {
    // Skip events without segments (e.g., formatting events)
    if (!event.segs || event.segs.length === 0) {
      continue;
    }
    
    const startTime = (event.tStartMs || 0) / 1000;
    const duration = (event.dDurationMs || 0) / 1000;
    const endTime = startTime + duration;
    
    // Combine all text segments
    const text = event.segs
      .map(seg => seg.utf8 || '')
      .join('')
      .trim();
    
    if (text) {
      segments.push({
        start: startTime,
        end: endTime,
        text: text
      });
    }
  }
  
  return segments;
}

/**
 * Store transcript in database
 * @param {string} videoId - YouTube video ID
 * @param {string} title - Video title
 * @param {number} duration - Video duration in seconds
 * @param {Array} segments - Transcript segments
 */
async function storeTranscript(videoId, title, duration, segments) {
  // Save video metadata
  await Transcript.saveVideo(videoId, title, duration);
  
  // Save all segments
  await Transcript.saveSegments(videoId, segments);
  
  console.log(`💾 Stored ${segments.length} segments for video ${videoId}`);
}

/**
 * Get transcript for a video (from database)
 * @param {string} videoId - YouTube video ID
 * @returns {Promise<Array>} Array of transcript segments
 */
async function getTranscript(videoId) {
  return await Transcript.getAllSegments(videoId);
}

module.exports = {
  fetchAndStoreTranscript,
  getTranscript,
  fetchTranscriptFromYoutube,
  storeTranscript
};
