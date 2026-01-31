FROM node:20-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# Configure yt-dlp to use Node.js runtime and set better user agent
RUN mkdir -p /root/.config/yt-dlp && \
    echo '--extractor-args "youtube:player_client=android,tv,web;po_token=web+https://www.youtube.com"' > /root/.config/yt-dlp/config && \
    echo '--user-agent "com.google.android.youtube/19.09.36 (Linux; U; Android 13) gzip"' >> /root/.config/yt-dlp/config && \
    echo '--add-header "Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"' >> /root/.config/yt-dlp/config && \
    echo '--add-header "Accept-Language:en-us,en;q=0.5"' >> /root/.config/yt-dlp/config && \
    echo '--no-check-certificates' >> /root/.config/yt-dlp/config

# Set NODE_PATH for yt-dlp to find Node.js
ENV NODE_PATH=/usr/local/bin/node

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p data temp

# Expose port (Render will override with PORT env var)
EXPOSE 3005

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3005) + '/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the application
CMD ["npm", "start"]
