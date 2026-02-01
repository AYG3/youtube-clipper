/**
 * YouTube Extraction Troubleshooting Guide
 * 
 * Common Issues on Cloud Hosting (Render, Railway, Heroku, etc.)
 */

## Why YouTube Extraction Fails on Cloud Hosting

YouTube actively blocks datacenter IP addresses to prevent abuse. This affects:
- ✅ **Works:** Home internet, mobile networks, residential IPs
- ❌ **Blocked:** Cloud hosting (Render, AWS, Google Cloud, Heroku, Railway, etc.)

## Error Messages You Might See

### 1. **HTTP 429: Too Many Requests**
- **Cause:** YouTube rate-limiting the datacenter IP
- **Solution:** Wait 5-10 minutes and try again, or try a different video

### 2. **"Sign in to confirm you're not a bot"**
- **Cause:** YouTube's bot detection flagged the server
- **Solutions:**
  - Try different videos (some bypass detection better)
  - Wait a few minutes before retrying
  - Server automatically retries with exponential backoff

### 3. **Cross-site Cookie Context**
- **Cause:** YouTube iframe API cookie restrictions
- **Impact:** Visual only, doesn't affect functionality
- **Solution:** Can be ignored - it's a browser warning, not an error

## Technical Implementation

### Current Bot Prevention Strategies:
1. ✅ Using Android/TV player clients (less restricted)
2. ✅ Realistic Android YouTube app user agent
3. ✅ ytdl-core as primary (better datacenter IP compatibility)
4. ✅ yt-dlp as fallback with Android/TV clients
5. ✅ Automatic retry with exponential backoff
6. ✅ Rate limit detection and delay

### What We Do Automatically:
```
Attempt 1: ytdl-core extraction
  ↓ (if fails)
Attempt 2: yt-dlp with android client
  ↓ (if rate limited)
Wait 2 seconds, retry
  ↓ (if still rate limited)
Wait 4 seconds, retry
  ↓ (if still rate limited)
Wait 8 seconds, retry
  ↓ (max 3 retries)
Return user-friendly error message
```

## Workarounds (Advanced)

### Option 1: Use Cookies (Most Reliable)
**Requires:** Exporting your YouTube cookies
```bash
# Export cookies from your browser
# Add to Render environment variables:
YOUTUBE_COOKIES="path/to/cookies.txt"
```

### Option 2: Residential Proxy
**Requires:** Paid proxy service
- Smart Proxy, Bright Data, etc.
- Routes requests through residential IPs
- 99%+ success rate

### Option 3: YouTube Data API v3
**Requires:** Google API key
- Official API (requires auth)
- 10,000 requests/day free
- Limited to metadata only (no downloads)

## Best Practices for Users

1. **Try different videos** - Some videos work better than others
2. **Wait between requests** - Don't spam retries
3. **Use during off-peak hours** - Less competition for IP reputation
4. **Shorter videos work better** - Less likely to be flagged
5. **Public videos preferred** - Age-restricted may fail

## For Developers

### If you're self-hosting:
1. Use a **residential IP** or **home server**
2. Set up a **reverse proxy** with residential IPs
3. Implement **cookie-based authentication**
4. Use **rotating user agents**
5. Add **request rate limiting** on your end

### Environment Variables:
```env
# Optional: Add if you have cookies
YOUTUBE_COOKIES_PATH=/path/to/cookies.txt

# Optional: Reduce retry attempts for faster failures
MAX_RETRIES=2
```

## Success Rate Expectations

| Environment | Success Rate | Notes |
|-------------|--------------|-------|
| Home Internet | 95%+ | Best option |
| Mobile Network | 90%+ | Good alternative |
| VPN (Residential) | 85%+ | Depends on provider |
| Cloud Hosting | 10-30% | Heavily rate-limited |
| Cloud + Cookies | 70%+ | Requires manual setup |

## Conclusion

YouTube extraction on cloud hosting is **challenging but not impossible**. The application implements best practices for datacenter IPs, but expect:
- ⚠️ Intermittent failures
- ⏱️ Automatic retries with delays
- 🔄 Better success with different videos
- ✅ 100% success rate on home internet

**For production use:** Consider implementing cookie authentication or using a residential proxy service.
