# YouTube Clipper

A simple Node.js application that allows you to download specific segments from YouTube videos with advanced transcript search capabilities.

> **⚠️ IMPORTANT:** This application requires `yt-dlp` and `ffmpeg` to be installed on your system BEFORE running `npm install`. See [Prerequisites](#prerequisites) section below.

## Features

- 🎬 Download clips from any YouTube video
- ⏱️ Interactive sliders to select start and end times
- 🎥 Video preview with thumbnail and duration
- 📥 Automatic download of clipped segment
- 🎨 Clean, modern UI
- 📝 **Transcript fetching and storage**
- 🔍 **Exact keyword search in transcripts**
- 🧠 **Semantic AI-powered search (with Ollama)**
- 🎯 **Timestamp-accurate search results**
- 🔗 **Clickable timestamps to navigate video**

## Prerequisites

- **Node.js** (v14 or higher)
- **FFmpeg** - Required for video processing
- **yt-dlp** - Required for downloading YouTube videos
- **Ollama** (optional) - For semantic search functionality

### Install Dependencies

**macOS:**
```bash
brew install ffmpeg yt-dlp
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install ffmpeg
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
```

**Windows:**
- FFmpeg: Download from [ffmpeg.org](https://ffmpeg.org/download.html) or use `choco install ffmpeg`
- yt-dlp: Download from [yt-dlp releases](https://github.com/yt-dlp/yt-dlp/releases) or use `choco install yt-dlp`

## Installation

1. Clone or download this repository

2. Install dependencies:
```bash
npm install
```

## Usage

1. Start the server:
```bash
npm start
```

For development with auto-restart:
```bash
npm run dev
```

2. Open your browser and navigate to:
```
http://localhost:3000
```

3. Enter a YouTube URL and click "Load Video"

4. Use the sliders to select start and end times

5. Click "Download Clip" to process and download your clip

### Transcript Search (New!)

1. After loading a video, click "📥 Fetch Transcript" to download captions
2. Use exact keyword search to find specific words or phrases
3. (Optional) Enable semantic search:
   - Install Ollama: `brew install ollama` (macOS)
   - Start Ollama: `ollama serve`
   - Pull model: `ollama pull nomic-embed-text`
   - Click "🧠 Enable Semantic Search" in the UI
4. Click timestamps in search results to jump to that moment in the video

**📖 See [TRANSCRIPT_FEATURE.md](TRANSCRIPT_FEATURE.md) for detailed documentation on the transcript feature.**

### Live recording workflow

1. Load a YouTube live stream URL (the UI will indicate "Live stream")
2. Click "Start Recording" to begin recording the live stream on the server
3. Monitor recording status and file size in the app
4. Click "Stop Recording" to finalize the recording; the server will remux to MP4 and provide a download link
5. Optionally, use `/api/clip-from-recording` to extract a specific clip from the recorded file

## How It Works

### Backend (`server.js`)
- **Express server** handles API requests
- **ytdl-core** (for video metadata) and **yt-dlp** (for downloading)
- **yt-dlp** downloads and clips videos in one efficient command
- Temporary files are automatically cleaned up after download

### Frontend (`public/`)
- **index.html** - Main UI with form inputs and sliders
- **styles.css** - Modern, responsive styling
- **script.js** - Handles user interactions and API calls

## API Endpoints

### Video Endpoints

### POST `/api/video-info`
Get video metadata (duration, title, thumbnail)

**Request:**
```json
{
  "url": "https://youtube.com/watch?v=..."
}
```

**Response:**
```json
{
  "duration": 120,
  "title": "Video Title",
  "thumbnail": "https://...",
  "videoId": "..."
}
```

### POST `/api/clip`
Download a clipped segment

**Request:**
```json
{
  "url": "https://youtube.com/watch?v=...",
  "start": 10,
  "end": 30
}
```

**Response:** Binary video file (MP4)

### POST `/api/record/start`
Start recording a live YouTube stream. Returns a recording id which you can use to check status or stop the recording later.

Request JSON:
```json
{ "url": "https://youtube.com/watch?v=...", "quality": "best", "maxDuration": 3600 }
```
Response:
```json
{ "id": "rec_12345_6789", "outPath": "temp/video_rec_ts", "startedAt": 167888 } 
```

### POST `/api/record/:id/stop`
Stop a running recording. Returns final status and file path.

### GET `/api/record/:id/status`
Get current status (recording/finished), file size, and elapsed time.

### GET `/api/record/:id/download`
Download the recorded file once the recording is finished (or while still present in temp). Useful if server remuxed the file to MP4 on stop.

### POST `/api/clip-from-recording`
Create a clip from a recorded file. Request body is similar to `/api/clip` but you pass `id` instead of `url`.

### Transcript Endpoints

### POST `/api/transcript/fetch`
Fetch and store transcript for a video

### POST `/api/transcript/index`
Generate embeddings for semantic search (requires Ollama)

### GET `/api/transcript/search`
Search transcript with exact or semantic search

### GET `/api/transcript/:videoId`
Get full transcript for a video

### GET `/api/transcript/:videoId/status`
Check transcript and indexing status

**📖 See [TRANSCRIPT_FEATURE.md](TRANSCRIPT_FEATURE.md) for complete API documentation.**


## Project Structure

```
youtube-clipper/
├── server.js              # Main server entry point
├── package.json           # Dependencies and scripts
├── src/
│   ├── app.js            # Express app setup
│   ├── database/         # SQLite database layer
│   ├── models/           # Data models (Transcript)
│   ├── services/         # Business logic (transcript, search, indexing)
│   ├── routes/           # API route handlers
│   ├── middleware/       # Custom middleware
│   ├── state/            # Application state management
│   └── utils/            # Utility functions
├── public/
│   ├── index.html        # Frontend UI
│   ├── styles.css        # Styling
│   ├── script.js         # Frontend logic
│   └── components/       # UI components (transcript-search)
├── data/                 # SQLite database (auto-created)
├── temp/                 # Temporary video files (auto-created)
├── README.md             # Main documentation
└── TRANSCRIPT_FEATURE.md # Transcript feature documentation
```

## Notes

- The application creates a `temp/` directory for processing videos
- Temporary files are automatically deleted after download
- Video quality: Downloads highest available quality with audio
- Supported formats: Output is MP4 with H.264 video and AAC audio
    
⚠️ Live recordings: recording live streams can produce very large files; consider using the `maxDuration` parameter when starting a recording to prevent unbounded disk use.

## Troubleshooting

**"FFmpeg not found" or "yt-dlp not found" error:**
- Make sure both FFmpeg and yt-dlp are installed and available in your PATH
- Test by running `ffmpeg -version` and `yt-dlp --version` in your terminal

**"Invalid YouTube URL" error:**
- Ensure the URL is a valid YouTube link
- Supported formats: `youtube.com/watch?v=...` or `youtu.be/...`

**Long processing time:**
- Processing time depends on video length and quality
- Longer videos take more time to download and clip

## License

MIT
