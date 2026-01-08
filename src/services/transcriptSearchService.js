/**
 * Transcript search service - Exact and semantic search operations
 */
const Transcript = require('../models/Transcript');
const { generateEmbedding } = require('./transcriptIndexService');

/**
 * Perform exact keyword search
 * @param {string} videoId - YouTube video ID
 * @param {string} query - Search query
 * @returns {Promise<Array>} Search results with context
 */
async function searchExact(videoId, query) {
  try {
    console.log(`🔎 Exact search for "${query}" in video ${videoId}`);
    
    const results = await Transcript.exactSearch(videoId, query);
    
    console.log(`✅ Found ${results.length} matches`);
    
    return results.map(result => formatSearchResult(result, query));
  } catch (error) {
    console.error('Error in exact search:', error);
    throw error;
  }
}

/**
 * Perform semantic search using embeddings
 * @param {string} videoId - YouTube video ID
 * @param {string} query - Search query
 * @param {number} limit - Maximum number of results
 * @returns {Promise<Array>} Search results sorted by similarity
 */
async function searchSemantic(videoId, query, limit = 10) {
  try {
    console.log(`🧠 Semantic search for "${query}" in video ${videoId}`);
    
    // Generate embedding for query
    const queryEmbedding = await generateEmbedding(query);
    
    // Get all segments
    const segments = await Transcript.getAllSegments(videoId);
    
    if (!segments || segments.length === 0) {
      return [];
    }
    
    console.log(`📊 Computing similarity for ${segments.length} segments...`);
    
    // Compute similarity for each segment
    const results = await Promise.all(
      segments.map(async (segment) => {
        try {
          const embedding = await Transcript.getEmbedding(segment.id);
          
          if (!embedding) {
            return null; // Skip segments without embeddings
          }
          
          const similarity = cosineSimilarity(queryEmbedding, embedding);
          
          return {
            ...segment,
            similarity
          };
        } catch (err) {
          console.error(`Error processing segment ${segment.id}:`, err.message);
          return null;
        }
      })
    );
    
    // Filter out null results, sort by similarity, take top N
    const validResults = results
      .filter(r => r !== null)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
    
    console.log(`✅ Found ${validResults.length} semantic matches`);
    
    return validResults.map(r => formatSearchResult(r, query, r.similarity));
  } catch (error) {
    console.error('Error in semantic search:', error);
    throw error;
  }
}

/**
 * Multi-word search (combines results from multiple keywords)
 * @param {string} videoId - YouTube video ID
 * @param {string} query - Search query with multiple words
 * @returns {Promise<Array>} Combined search results
 */
async function searchMultiWord(videoId, query) {
  const words = query.trim().split(/\s+/).filter(w => w.length > 2);
  
  if (words.length === 0) {
    return [];
  }
  
  console.log(`🔍 Multi-word search for: ${words.join(', ')}`);
  
  // Search for each word
  const allResults = await Promise.all(
    words.map(word => searchExact(videoId, word))
  );
  
  // Flatten and deduplicate results
  const resultMap = new Map();
  
  allResults.forEach(wordResults => {
    wordResults.forEach(result => {
      const key = result.segmentId;
      if (!resultMap.has(key)) {
        resultMap.set(key, result);
      } else {
        // Merge match counts if segment appears multiple times
        const existing = resultMap.get(key);
        existing.matchCount = (existing.matchCount || 1) + 1;
      }
    });
  });
  
  // Sort by match count (segments matching more words rank higher)
  const results = Array.from(resultMap.values())
    .sort((a, b) => (b.matchCount || 1) - (a.matchCount || 1));
  
  console.log(`✅ Found ${results.length} unique segments`);
  
  return results;
}

/**
 * Cosine similarity between two vectors
 * @param {Array} a - First vector
 * @param {Array} b - Second vector
 * @returns {number} Similarity score (0-1)
 */
function cosineSimilarity(a, b) {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same length');
  }
  
  let dotProduct = 0;
  let magA = 0;
  let magB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  
  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);
  
  if (magA === 0 || magB === 0) {
    return 0;
  }
  
  return dotProduct / (magA * magB);
}

/**
 * Format search result with context snippet
 * @param {Object} segment - Transcript segment
 * @param {string} query - Search query
 * @param {number} similarity - Similarity score (optional)
 * @returns {Object} Formatted result
 */
function formatSearchResult(segment, query, similarity = null) {
  const contextWindow = 80; // characters before/after match
  const text = segment.text;
  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();
  
  let snippet = text;
  let highlightStart = -1;
  let highlightEnd = -1;
  
  // Try to find query in text for highlighting
  const matchIndex = textLower.indexOf(queryLower);
  
  if (matchIndex !== -1) {
    // Found exact match - create snippet around it
    const start = Math.max(0, matchIndex - contextWindow);
    const end = Math.min(text.length, matchIndex + query.length + contextWindow);
    
    snippet = (start > 0 ? '...' : '') + 
              text.substring(start, end) + 
              (end < text.length ? '...' : '');
    
    // Adjust highlight positions for snippet
    highlightStart = matchIndex - start + (start > 0 ? 3 : 0);
    highlightEnd = highlightStart + query.length;
  } else if (text.length > contextWindow * 2) {
    // No exact match (semantic search) - show beginning of text
    snippet = text.substring(0, contextWindow * 2) + '...';
  }
  
  const result = {
    segmentId: segment.id,
    startTime: segment.start_time,
    endTime: segment.end_time,
    text: snippet,
    fullText: text
  };
  
  if (similarity !== null) {
    result.similarity = similarity;
  }
  
  if (highlightStart >= 0) {
    result.highlightStart = highlightStart;
    result.highlightEnd = highlightEnd;
  }
  
  return result;
}

/**
 * Get transcript context around a specific timestamp
 * @param {string} videoId - YouTube video ID
 * @param {number} timestamp - Timestamp in seconds
 * @param {number} contextSeconds - Seconds of context before/after
 * @returns {Promise<Array>} Segments around the timestamp
 */
async function getContextAtTimestamp(videoId, timestamp, contextSeconds = 30) {
  const segments = await Transcript.getAllSegments(videoId);
  
  const startTime = timestamp - contextSeconds;
  const endTime = timestamp + contextSeconds;
  
  return segments.filter(seg => 
    (seg.start_time >= startTime && seg.start_time <= endTime) ||
    (seg.end_time >= startTime && seg.end_time <= endTime)
  );
}

module.exports = {
  searchExact,
  searchSemantic,
  searchMultiWord,
  getContextAtTimestamp
};
