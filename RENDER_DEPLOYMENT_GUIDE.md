# Deploying YouTube Clipper to Render.com (Docker)

This guide will walk you through deploying your YouTube Clipper application to Render.com using Docker.

## Prerequisites

- A GitHub account
- A Render.com account (free tier available at https://render.com)
- Your code pushed to a GitHub repository
- Git installed on your local machine

## Step 1: Prepare Your Repository

1. **Push your code to GitHub** (if not already done):
   ```bash
   git add .
   git commit -m "Prepare for Render deployment with Docker"
   git push origin main
   ```

## Step 2: Create a Render Account

1. Go to https://render.com
2. Click **"Get Started"** or **"Sign Up"**
3. Sign up with your GitHub account (recommended for easier integration)
4. Authorize Render to access your GitHub repositories

## Step 3: Create a New Web Service

1. From your Render Dashboard, click **"New +"** button (top right)
2. Select **"Web Service"**
3. Connect your GitHub repository:
   - If first time: Click **"Connect GitHub"** and authorize Render
   - Find and select your `youtube-clipper` repository
   - Click **"Connect"**

## Step 4: Configure Your Web Service

Fill in the following settings:

### Basic Settings

| Field | Value | Notes |
|-------|-------|-------|
| **Name** | `youtube-clipper` | (or your preferred name) |
| **Region** | Choose closest to you | e.g., Oregon (US West) |
| **Branch** | `main` | (or your default branch) |
| **Runtime** | **Docker** | ⚠️ IMPORTANT: Select Docker, not Node |
| **Root Directory** | (leave blank) | Unless code is in a subdirectory |

### Docker Settings

Render will automatically detect your `Dockerfile` - no additional configuration needed!

### Instance Settings

For **Free Tier**:
- **Instance Type**: Select **"Free"**
- Note: Free instances spin down after 15 minutes of inactivity (cold starts ~30-60 seconds)

For **Paid Tier** (recommended for production):
- **Instance Type**: Select **"Starter"** ($7/month) or higher
- Benefits: No spin down, faster performance, more resources

### Environment Variables

Click **"Advanced"** to add environment variables:

| Key | Value | Required | Notes |
|-----|-------|----------|-------|
| `PORT` | (leave blank) | No | Render auto-sets this |
| `NODE_ENV` | `production` | Yes | Optimizes Node.js |
| `ALLOWED_ORIGINS` | Your domain(s) | Optional | e.g., `https://youtube-clipper.onrender.com` |

**To add environment variables:**
1. Click **"Add Environment Variable"**
2. Enter the Key and Value
3. Repeat for each variable

### Health Check Path

1. Scroll down to **"Health Check Path"**
2. Enter: `/health`
3. This tells Render to check if your app is running properly

## Step 5: Add Persistent Storage (Important!)

Your app uses SQLite database and stores temporary files. These need persistent storage.

1. Scroll down to **"Disks"**
2. Click **"Add Disk"**
3. Configure the disk:
   - **Name**: `app-data`
   - **Mount Path**: `/app/data`
   - **Size**: 1 GB (free tier) or more
4. Click **"Add Disk"** again for temp storage:
   - **Name**: `app-temp`
   - **Mount Path**: `/app/temp`
   - **Size**: 5 GB (recommended for video clips)

**Important Notes:**
- Free tier gets 1GB persistent disk
- Paid tiers get more storage
- Disks persist between deployments

## Step 6: Deploy!

1. Click **"Create Web Service"** at the bottom
2. Render will now:
   - Clone your repository
   - Build your Docker image (this takes 5-10 minutes first time)
   - Start your container
   - Assign you a URL like `https://youtube-clipper-xyz.onrender.com`

## Step 7: Monitor Deployment

Watch the build logs in real-time:

1. You'll see Docker building your image:
   ```
   ==> Building with Dockerfile...
   ==> Installing ffmpeg and yt-dlp...
   ==> Installing Node.js dependencies...
   ==> Starting application...
   ```

2. Look for success messages:
   ```
   🚀 YouTube Clipper server running at http://localhost:10000
   📝 Open http://localhost:10000 in your browser
   ```

3. Your service URL will be shown at the top (e.g., `https://youtube-clipper-xyz.onrender.com`)

## Step 8: Verify Deployment

1. **Test Health Endpoint:**
   - Visit: `https://your-app.onrender.com/health`
   - Should return:
     ```json
     {
       "status": "healthy",
       "timestamp": "2026-01-31T...",
       "uptime": 123.456
     }
     ```

2. **Test Main App:**
   - Visit: `https://your-app.onrender.com`
   - You should see the YouTube Clipper interface

3. **Test Functionality:**
   - Enter a YouTube URL and click "Load Video"
   - Try creating a clip
   - Check if downloads work

## Step 9: Configure Custom Domain (Optional)

1. In your Render service, go to **"Settings"**
2. Scroll to **"Custom Domains"**
3. Click **"Add Custom Domain"**
4. Enter your domain (e.g., `clipper.yourdomain.com`)
5. Render will provide DNS records to add to your domain registrar:
   - Add a CNAME record pointing to your Render URL
6. Wait for DNS propagation (up to 48 hours, usually much faster)
7. Render automatically provisions SSL certificate (HTTPS)

## Step 10: Update Environment Variables for Custom Domain

1. Go to **"Environment"** tab
2. Update `ALLOWED_ORIGINS`:
   ```
   ALLOWED_ORIGINS=https://clipper.yourdomain.com
   ```
3. Click **"Save Changes"**
4. Render will automatically redeploy

## Troubleshooting

### Issue: Build Fails with "yt-dlp not found"

**Solution:** Ensure your Dockerfile includes:
```dockerfile
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp
```

### Issue: Database Not Persisting

**Solution:** 
- Ensure you added a disk mounted at `/app/data`
- Check the "Disks" section in your service settings

### Issue: "Out of Memory" Errors

**Solution:**
- Free tier has limited memory (512MB)
- Upgrade to Starter ($7/month) for 1GB RAM
- Or optimize your app to use less memory

### Issue: Cold Starts (Free Tier)

**Behavior:**
- Free services spin down after 15 minutes
- First request after spin-down takes 30-60 seconds

**Solutions:**
1. **Upgrade to paid tier** ($7/month) - no spin downs
2. **Use a uptime monitor** (free options):
   - UptimeRobot (https://uptimerobot.com)
   - Cron-job.org (https://cron-job.org)
   - Configure to ping `/health` every 10-14 minutes

### Issue: CORS Errors

**Solution:**
Add your domain to `ALLOWED_ORIGINS`:
```
ALLOWED_ORIGINS=https://your-app.onrender.com,https://www.your-app.onrender.com
```

### Issue: WebSocket Connection Fails

**Solution:**
- Render supports WebSockets by default
- Ensure you're using `wss://` (not `ws://`) for HTTPS domains
- Your code already handles this correctly with `location.host`

### Issue: File Upload/Download Fails

**Solution:**
- Check disk mount paths are correct: `/app/data` and `/app/temp`
- Verify disk size isn't full in Render dashboard
- Check logs for permission errors

## Viewing Logs

1. In your Render service dashboard, click **"Logs"** tab
2. View real-time logs
3. Filter by log level (Info, Error, etc.)
4. Download logs if needed

## Updating Your App

To deploy updates:

1. **Push changes to GitHub:**
   ```bash
   git add .
   git commit -m "Your update message"
   git push origin main
   ```

2. **Render auto-deploys:**
   - Render detects the push
   - Automatically rebuilds and deploys
   - Zero-downtime deployment

3. **Manual deploy (if auto-deploy disabled):**
   - Go to your service dashboard
   - Click **"Manual Deploy"**
   - Select **"Deploy latest commit"**

## Performance Optimization Tips

1. **Enable HTTP/2:**
   - Automatically enabled by Render for HTTPS

2. **Use Environment Variables:**
   - Store sensitive data in environment variables
   - Never commit secrets to Git

3. **Monitor Resource Usage:**
   - Check "Metrics" tab in Render dashboard
   - Monitor CPU, memory, bandwidth usage
   - Upgrade if consistently hitting limits

4. **Database Optimization:**
   - SQLite works well for small-medium traffic
   - For high traffic, consider PostgreSQL (Render offers managed PostgreSQL)

## Costs (as of January 2026)

| Tier | Price | Resources | Best For |
|------|-------|-----------|----------|
| **Free** | $0 | 512MB RAM, shared CPU, spins down | Testing, personal use |
| **Starter** | $7/mo | 1GB RAM, shared CPU, always on | Small apps, demos |
| **Standard** | $25/mo | 2GB RAM, dedicated CPU | Production apps |
| **Pro** | $85/mo | 4GB RAM, dedicated CPU | High-traffic apps |

**Additional Costs:**
- **Persistent Disks**: $0.25/GB/month (after 1GB free)
- **Bandwidth**: $0.10/GB (after 100GB free)

## Security Best Practices

1. **Use Environment Variables:**
   ```bash
   # Never commit these to Git
   API_KEY=your_secret_key
   DATABASE_PASSWORD=secure_password
   ```

2. **Enable HTTPS Only:**
   - Render provides free SSL automatically
   - Force HTTPS redirects (automatic on Render)

3. **Update Dependencies Regularly:**
   ```bash
   npm audit fix
   npm update
   ```

4. **Set CORS Properly:**
   - Only allow your domains in `ALLOWED_ORIGINS`
   - Never use `*` in production

## Support and Resources

- **Render Documentation**: https://render.com/docs
- **Render Status Page**: https://status.render.com
- **Render Community**: https://community.render.com
- **Support Email**: support@render.com (paid plans)

## Next Steps

After successful deployment:

1. ✅ Set up monitoring (UptimeRobot, etc.)
2. ✅ Configure backup strategy for SQLite database
3. ✅ Add analytics (Google Analytics, Plausible, etc.)
4. ✅ Set up error tracking (Sentry, etc.)
5. ✅ Create a staging environment (duplicate service)
6. ✅ Document your custom domain and API endpoints

## Summary

You've successfully deployed your YouTube Clipper app to Render.com! 🎉

Your app is now:
- ✅ Running on Render's infrastructure
- ✅ Accessible via HTTPS
- ✅ Automatically deploying from GitHub
- ✅ Monitored with health checks
- ✅ Using persistent storage for data
- ✅ Optimized for mobile with PWA support

**Your Live URL:** `https://your-app-name.onrender.com`

Enjoy your deployed application! 🚀
