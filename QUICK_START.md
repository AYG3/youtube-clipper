# Quick Start Guide - Transcript Feature

## 🚀 Quick Start (5 minutes)

### 1. Start the Server
```bash
npm start
```

### 2. Open Browser
Navigate to: http://localhost:3000

### 3. Load a Video
- Paste a YouTube URL
- Click "Load Video"

### 4. Fetch Transcript (Basic Search)
- Click "📥 Fetch Transcript"
- Wait for captions to download
- Use exact keyword search immediately!

### 5. (Optional) Enable AI Search
```bash
# Terminal 1 - Start Ollama
ollama serve

# Terminal 2 - Download model (one-time, ~275MB)
ollama pull nomic-embed-text

# Back to browser
# Click "🧠 Enable Semantic Search"
# Wait ~1-2 minutes for indexing
# Now try semantic search!
```

## 🎯 Try These Examples

### Exact Search
Search for: `"machine learning"`
- Finds exact phrase matches
- Fast (< 10ms)
- Highlights matched text

### Multi-Word Search
Search for: `python tutorial basics`
- Finds segments with any of these words
- Ranks by number of matches
- Great for broad searches

### Semantic Search (Requires Ollama)
Search for: `"how to train models"`
- Finds conceptually similar content
- Even if exact words don't match
- Understands context and meaning

## 📊 What Gets Searched?

The transcript includes:
- Auto-generated captions
- Manual captions (if available)
- Timestamps accurate to 0.1 seconds
- Full video context

## 🎬 Using Search Results

1. **Click any timestamp** to jump to that moment
2. Video automatically seeks and plays
3. Context shows words before/after match
4. See relevance score for semantic matches

## 💡 Tips

- **Large videos**: Indexing takes ~1-2 min per 10 min of video
- **No captions?**: Try a different video with captions enabled
- **Exact vs Semantic**: Use exact for specific terms, semantic for concepts
- **Background indexing**: Indexing happens in background, check back later

## 🔧 Troubleshooting

### "No English subtitles available"
→ Not all videos have captions. Try: https://www.youtube.com/watch?v=aircAruvnKk

### "Cannot connect to Ollama"
→ Start Ollama first: `ollama serve`

### "Model not found"
→ Pull the model: `ollama pull nomic-embed-text`

### Transcript takes long time
→ Normal for first fetch. Cached after first download.

## 🎓 Best Practices

### For Lectures/Tutorials
- Use semantic search to find topic explanations
- Search for concepts, not just exact terms
- Example: "gradient descent" finds related optimization discussions

### For Interviews/Podcasts
- Use exact search for quotes
- Multi-word search for themes
- Example: "startup funding venture" finds all related discussions

### For How-To Videos
- Exact search for specific steps
- Semantic search for alternative approaches
- Example: "install dependencies" vs "setup environment"

## 📈 Performance

| Operation | Speed | Notes |
|-----------|-------|-------|
| Fetch transcript | 5-15s | Depends on video length |
| Exact search | < 10ms | Very fast (indexed) |
| Multi-word search | < 50ms | Fast |
| Semantic search | 100-500ms | Depends on segments |
| Indexing | ~100 segments/min | One-time per video |

## 🧪 Test Videos

Try these videos with good captions:

**Short (~10 min)**
- https://www.youtube.com/watch?v=aircAruvnKk (3Blue1Brown - Neural Networks)
- Quick to index, great for testing

**Medium (~30 min)**
- https://www.youtube.com/watch?v=videoid (Your favorite tech talk)
- Good for realistic use case

**Note**: Use videos you have permission to access and download.

## 🎉 You're Ready!

You now have:
- ✅ Transcript fetching
- ✅ Exact keyword search
- ✅ Multi-word search
- ✅ Semantic AI search (with Ollama)
- ✅ Timestamp navigation

Start searching! 🔍
