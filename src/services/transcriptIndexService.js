/**
 * Transcript indexing service - Generate embeddings for semantic search
 */
const axios = require('axios');
const Transcript = require('../models/Transcript');

const OLLAMA_API = 'http://localhost:11434/api/embeddings';
const MODEL = 'nomic-embed-text'; // Fast and efficient embedding model

/**
 * Generate embeddings for all segments of a video
 * @param {string} videoId - YouTube video ID
 * @returns {Promise<Object>} Result with indexed count
 */
async function indexTranscript(videoId) {
  try {
    console.log(`\n🔍 Indexing transcript for video: ${videoId}`);
    
    const segments = await Transcript.getAllSegments(videoId);
    
    if (!segments || segments.length === 0) {
      throw new Error('No transcript found for this video');
    }
    
    console.log(`📊 Generating embeddings for ${segments.length} segments...`);
    
    let indexed = 0;
    let skipped = 0;
    
    for (const segment of segments) {
      // Check if already indexed
      const hasEmbedding = await Transcript.hasEmbedding(segment.id);
      if (hasEmbedding) {
        skipped++;
        continue;
      }
      
      try {
        const embedding = await generateEmbedding(segment.text);
        await Transcript.saveEmbedding(segment.id, embedding);
        indexed++;
        
        // Progress indicator
        if (indexed % 10 === 0) {
          console.log(`  Indexed ${indexed}/${segments.length} segments...`);
        }
      } catch (err) {
        console.error(`Failed to index segment ${segment.id}:`, err.message);
        // Continue with next segment
      }
    }
    
    console.log(`✅ Indexing complete: ${indexed} new, ${skipped} already indexed`);
    
    return {
      success: true,
      videoId,
      indexed,
      skipped,
      total: segments.length
    };
  } catch (error) {
    console.error('❌ Error indexing transcript:', error.message);
    throw error;
  }
}

/**
 * Generate embedding using Ollama
 * @param {string} text - Text to embed
 * @returns {Promise<Array>} Embedding vector
 */
async function generateEmbedding(text) {
  try {
    const response = await axios.post(
      OLLAMA_API,
      {
        model: MODEL,
        prompt: text
      },
      {
        timeout: 30000 // 30 second timeout
      }
    );
    
    if (!response.data || !response.data.embedding) {
      throw new Error('Invalid response from Ollama API');
    }
    
    return response.data.embedding;
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      throw new Error('Cannot connect to Ollama. Make sure Ollama is running on localhost:11434');
    }
    if (error.response && error.response.status === 404) {
      throw new Error(`Model "${MODEL}" not found. Run: ollama pull ${MODEL}`);
    }
    throw new Error(`Ollama API error: ${error.message}`);
  }
}

/**
 * Check if Ollama is available
 * @returns {Promise<boolean>} True if Ollama is running
 */
async function checkOllamaAvailable() {
  try {
    const response = await axios.get('http://localhost:11434/api/tags', {
      timeout: 5000
    });
    return response.status === 200;
  } catch (error) {
    return false;
  }
}

/**
 * Check if embedding model is available
 * @returns {Promise<boolean>} True if model is available
 */
async function checkModelAvailable() {
  try {
    const response = await axios.get('http://localhost:11434/api/tags', {
      timeout: 5000
    });
    
    if (response.data && response.data.models) {
      const hasModel = response.data.models.some(m => m.name.includes(MODEL));
      return hasModel;
    }
    return false;
  } catch (error) {
    return false;
  }
}

module.exports = {
  indexTranscript,
  generateEmbedding,
  checkOllamaAvailable,
  checkModelAvailable
};
