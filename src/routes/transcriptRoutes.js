/**
 * Transcript routes - API endpoints for transcript operations
 */
const express = require('express');
const ytdl = require('@distube/ytdl-core');
const transcriptService = require('../services/transcriptService');
const indexService = require('../services/transcriptIndexService');
const searchService = require('../services/transcriptSearchService');
const { fetchVideoInfo } = require('../utils/youtubeInfo');
const Transcript = require('../models/Transcript');

const router = express.Router();

/**
 * POST /api/transcript/fetch - Fetch and store transcript
 */
router.post('/fetch', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url || !ytdl.validateURL(url)) {
      return res.status(400).json({ error: 'Invalid YouTube URL' });
    }
    
    // Get video info
    const info = await fetchVideoInfo(url);
    const videoId = info.videoDetails.videoId;
    const title = info.videoDetails.title;
    const duration = parseInt(info.videoDetails.lengthSeconds);
    
    // Fetch and store transcript
    const result = await transcriptService.fetchAndStoreTranscript(
      videoId,
      url,
      title,
      duration
    );
    
    res.json(result);
  } catch (error) {
    console.error('Transcript fetch error:', error);
    res.status(500).json({ 
      error: error.message,
      details: 'Failed to fetch transcript. The video may not have captions available.'
    });
  }
});

/**
 * POST /api/transcript/index - Generate embeddings for semantic search
 */
router.post('/index', async (req, res) => {
  try {
    const { videoId } = req.body;
    
    if (!videoId) {
      return res.status(400).json({ error: 'Video ID required' });
    }
    
    // Check if Ollama is available
    const ollamaAvailable = await indexService.checkOllamaAvailable();
    if (!ollamaAvailable) {
      return res.status(503).json({ 
        error: 'Ollama is not running',
        details: 'Please start Ollama to enable semantic search. Run: ollama serve'
      });
    }
    
    // Check if model is available
    const modelAvailable = await indexService.checkModelAvailable();
    if (!modelAvailable) {
      return res.status(503).json({ 
        error: 'Embedding model not found',
        details: 'Please install the embedding model. Run: ollama pull nomic-embed-text'
      });
    }
    
    // Index transcript
    const result = await indexService.indexTranscript(videoId);
    
    res.json(result);
  } catch (error) {
    console.error('Indexing error:', error);
    res.status(500).json({ 
      error: error.message,
      details: 'Failed to generate embeddings for transcript'
    });
  }
});

/**
 * GET /api/transcript/search - Search transcript (exact, semantic, or multi-word)
 */
router.get('/search', async (req, res) => {
  try {
    const { videoId, query, type = 'exact', limit = 10 } = req.query;
    
    if (!videoId || !query) {
      return res.status(400).json({ error: 'Video ID and query required' });
    }
    
    let results;
    
    if (type === 'semantic') {
      results = await searchService.searchSemantic(videoId, query, parseInt(limit));
    } else if (type === 'multi-word') {
      results = await searchService.searchMultiWord(videoId, query);
    } else {
      results = await searchService.searchExact(videoId, query);
    }
    
    res.json({ 
      results,
      count: results.length,
      query,
      type
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ 
      error: error.message,
      details: 'Failed to search transcript'
    });
  }
});

/**
 * GET /api/transcript/:videoId - Get full transcript for a video
 */
router.get('/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    
    const segments = await transcriptService.getTranscript(videoId);
    
    if (!segments || segments.length === 0) {
      return res.status(404).json({ 
        error: 'Transcript not found',
        details: 'No transcript available for this video. Try fetching it first.'
      });
    }
    
    res.json({ 
      videoId,
      segments,
      count: segments.length
    });
  } catch (error) {
    console.error('Error getting transcript:', error);
    res.status(500).json({ 
      error: error.message,
      details: 'Failed to retrieve transcript'
    });
  }
});

/**
 * GET /api/transcript/:videoId/status - Check if transcript exists and is indexed
 */
router.get('/:videoId/status', async (req, res) => {
  try {
    const { videoId } = req.params;
    
    const hasTranscript = await Transcript.hasTranscript(videoId);
    
    if (!hasTranscript) {
      return res.json({
        videoId,
        hasTranscript: false,
        isIndexed: false,
        segmentCount: 0
      });
    }
    
    const segments = await Transcript.getAllSegments(videoId);
    
    // Check if any segments are indexed
    let indexedCount = 0;
    for (const segment of segments) {
      const hasEmbedding = await Transcript.hasEmbedding(segment.id);
      if (hasEmbedding) indexedCount++;
    }
    
    res.json({
      videoId,
      hasTranscript: true,
      isIndexed: indexedCount > 0,
      segmentCount: segments.length,
      indexedCount,
      indexProgress: segments.length > 0 ? (indexedCount / segments.length * 100).toFixed(1) : 0
    });
  } catch (error) {
    console.error('Error checking transcript status:', error);
    res.status(500).json({ 
      error: error.message
    });
  }
});

/**
 * DELETE /api/transcript/:videoId - Delete transcript for a video
 */
router.delete('/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    
    await Transcript.deleteTranscript(videoId);
    
    res.json({ 
      success: true,
      videoId,
      message: 'Transcript deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting transcript:', error);
    res.status(500).json({ 
      error: error.message,
      details: 'Failed to delete transcript'
    });
  }
});

/**
 * GET /api/transcript/context/:videoId - Get transcript context around timestamp
 */
router.get('/context/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    const { timestamp, contextSeconds = 30 } = req.query;
    
    if (!timestamp) {
      return res.status(400).json({ error: 'Timestamp required' });
    }
    
    const results = await searchService.getContextAtTimestamp(
      videoId,
      parseFloat(timestamp),
      parseInt(contextSeconds)
    );
    
    res.json({ 
      videoId,
      timestamp: parseFloat(timestamp),
      contextSeconds: parseInt(contextSeconds),
      segments: results
    });
  } catch (error) {
    console.error('Error getting context:', error);
    res.status(500).json({ 
      error: error.message
    });
  }
});

module.exports = router;
