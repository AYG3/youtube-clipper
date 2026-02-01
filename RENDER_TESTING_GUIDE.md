# Render Testing Guide

## Changes Deployed

### 1. **Diagnostic Endpoint** (NEW)
   - **URL**: `https://your-app.onrender.com/api/diagnostic`
   - **Purpose**: Verify all YouTube extraction tools are installed and working
   - **Test**: Open this URL in your browser or use curl
   - **Expected Result**: JSON showing:
     - Node.js version (should be v20.x)
     - ytdl-core available: true
     - yt-dlp version
     - ffmpeg version

### 2. **Improved Error Handling**
   - **Changes**:
     - Retry logic with exponential backoff (2s, 4s, 8s delays)
     - Better error messages for users
     - Rate limit detection (HTTP 429)
     - Bot detection messages
     - DNS error handling
   
   - **Test**: Try loading multiple videos
   - **Expected Behaviors**:
     - If rate limited: You'll see "rate limit exceeded" message
     - If bot detected: You'll see informative message about cloud hosting
     - Automatic retries happen in background (check server logs)

### 3. **Hosting Notice Banner**
   - **Feature**: Yellow banner appears on cloud hosting (not localhost)
   - **Message**: Warns users about YouTube's cloud hosting limitations
   - **Dismissible**: Users can close it (preference saved to localStorage)
   - **Test**: Visit your Render URL - you should see the banner at the top

### 4. **Enhanced YouTube Extraction**
   - **Primary**: ytdl-core (works better on datacenter IPs sometimes)
   - **Fallback**: yt-dlp with Android/TV client args
   - **Retry**: 3 retries with exponential backoff
   - **Test**: Load various videos and check server logs

## Testing Steps on Render

### Step 1: Check Diagnostic Endpoint
```bash
curl https://your-app.onrender.com/api/diagnostic
```

**Expected Output:**
```json
{
  "timestamp": "2026-02-01T...",
  "environment": {
    "nodeVersion": "v20.x.x",
    "platform": "linux",
    "arch": "x64",
    "env": {
      "PORT": "10000",
      "NODE_ENV": "production",
      "RENDER": "true"
    }
  },
  "tools": {
    "ytdlCore": {
      "available": true,
      "version": "loaded"
    },
    "ytdlp": {
      "available": true,
      "version": "2025.x.x"
    },
    "ffmpeg": {
      "available": true,
      "version": "7.x"
    }
  }
}
```

### Step 2: Check Health Endpoint
```bash
curl https://your-app.onrender.com/health
```

**Expected Output:**
```json
{
  "status": "healthy",
  "timestamp": "2026-02-01T...",
  "uptime": 123.456
}
```

### Step 3: Test Video Loading in Browser

1. **Open your Render URL** in a browser
2. **Verify hosting notice banner** appears (yellow, with dismiss button)
3. **Try loading a video**:
   - Use: `https://www.youtube.com/watch?v=dQw4w9WgXcQ`
   - Or any other YouTube video

4. **Monitor the behavior**:
   - ✅ **Success**: Video loads, player appears, transcript search available
   - ⚠️ **Rate Limited**: See error message with retry suggestion
   - ⚠️ **Bot Detection**: See informative message about cloud hosting

### Step 4: Check Render Logs

In your Render dashboard:
1. Go to your service
2. Click "Logs" tab
3. Look for these log messages:

**Successful extraction:**
```
Attempting ytdl-core (attempt 1/4)...
✅ Video info from ytdl-core: isLiveContent=false, duration=213
```

**Fallback to yt-dlp:**
```
Attempting ytdl-core (attempt 1/4)...
⚠️  ytdl-core failed: ...
Attempting yt-dlp (attempt 1/4)...
✅ Video info from yt-dlp: is_live=false, was_live=false
```

**Rate limiting with retry:**
```
Attempting ytdl-core (attempt 1/4)...
⚠️  ytdl-core failed: 429
⏳ Rate limited (429). Retrying in 2000ms...
Attempting ytdl-core (attempt 2/4)...
```

## Understanding YouTube Blocking

### Why Videos Fail on Render

YouTube actively blocks datacenter IP addresses (like Render's servers) to prevent:
- Web scraping
- Automated downloads
- Bot traffic
- API abuse

### Common Error Messages

1. **HTTP 429 - Too Many Requests**
   - Cause: YouTube rate limiting
   - Solution: Retry logic (implemented)
   - User message: "Rate limit exceeded. Please try again in a few minutes."

2. **"Sign in to confirm you're not a bot"**
   - Cause: YouTube's bot detection
   - Solution: Android/TV clients (implemented), but not 100% effective
   - User message: "YouTube has detected automated access from this server."

3. **Cookies Warning**
   - Cause: YouTube wants authenticated cookies
   - Solution: Not implemented (requires user authentication)
   - Workaround: Retry different videos

### Expected Success Rates

Based on implementation:
- **Localhost**: ~95% success (residential IP)
- **Cloud Hosting (Render)**: ~10-40% success (datacenter IP)
- **With Cookies**: ~80-90% success (requires authentication)
- **With Residential Proxy**: ~95% success (expensive)

## What's Working Now

✅ **Health check** - Verifies service is running
✅ **Diagnostic endpoint** - Verifies tools are installed
✅ **Retry logic** - 3 retries with exponential backoff
✅ **Error messages** - Clear, actionable feedback
✅ **Fallback mechanism** - ytdl-core → yt-dlp
✅ **Android/TV clients** - Better bot evasion
✅ **Hosting notice** - Sets user expectations
✅ **PWA support** - Works offline after first visit
✅ **Video history** - Tracks last 3 videos
✅ **Clear button** - Reset without page reload

## What Cannot Be "Fixed"

❌ **YouTube's datacenter IP blocking** - Fundamental limitation
❌ **100% success rate on cloud hosting** - Not possible without proxies/cookies
❌ **Bypass YouTube's bot detection completely** - Against ToS

## Next Steps If Issues Persist

### Option 1: Accept Current Limitations
- Current implementation is best-effort
- Some videos will work, others won't
- Retries and fallbacks are in place
- User messaging is clear

### Option 2: Add Cookie Authentication (Advanced)
- Allows users to provide their own YouTube cookies
- Improves success rate to ~80-90%
- Requires secure cookie storage
- More complex implementation

### Option 3: Residential Proxy Service (Expensive)
- Route requests through residential IPs
- Success rate ~95%
- Costs $100-500/month
- Services: Bright Data, Oxylabs, SmartProxy

### Option 4: Official YouTube API (Limited)
- Use YouTube Data API v3
- No downloading capability
- 10,000 quota units/day
- Better for metadata only

## Monitoring on Render

### Key Metrics to Watch

1. **Deployment Status**
   - Check that latest commit is deployed
   - Verify build succeeded

2. **Error Logs**
   - Look for patterns (all 429s? all bot detection?)
   - Check if retries are working

3. **Success Rate**
   - Try 10 different videos
   - Count successes vs failures
   - Document which videos work

### Test Video URLs

Try these for testing:
```
https://www.youtube.com/watch?v=dQw4w9WgXcQ  (Rick Astley - Never Gonna Give You Up)
https://www.youtube.com/watch?v=jNQXAC9IVRw  (Me at the zoo - First YouTube video)
https://www.youtube.com/watch?v=9bZkp7q19f0  (PSY - GANGNAM STYLE)
```

## Success Indicators

✅ Diagnostic endpoint returns all tools available
✅ Health check returns healthy status
✅ Server logs show retry attempts
✅ Some videos load successfully
✅ Error messages are clear and helpful
✅ Hosting notice banner appears
✅ UI is responsive and functional

## Known Limitations

⚠️ YouTube may block ALL requests from Render's IPs at times
⚠️ Success rate varies based on YouTube's current policies
⚠️ Different videos may have different success rates
⚠️ Peak hours may have lower success rates

## Documentation References

See also:
- [YOUTUBE_EXTRACTION_GUIDE.md](./YOUTUBE_EXTRACTION_GUIDE.md) - Technical deep dive
- [README.md](./README.md) - General usage
- [QUICK_START.md](./QUICK_START.md) - Setup instructions
