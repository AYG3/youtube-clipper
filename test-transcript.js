#!/usr/bin/env node

/**
 * Test script for transcript functionality
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const TEST_VIDEO_URL = 'https://www.youtube.com/watch?v=videoid'; // Replace with actual video

async function testOllama() {
  console.log('\n1️⃣  Testing Ollama connection...');
  try {
    const response = await axios.get('http://localhost:11434/api/tags', { timeout: 5000 });
    console.log('   ✅ Ollama is running');
    
    const models = response.data.models || [];
    const hasNomicEmbed = models.some(m => m.name && m.name.includes('nomic-embed-text'));
    
    if (hasNomicEmbed) {
      console.log('   ✅ nomic-embed-text model found');
    } else {
      console.log('   ⚠️  nomic-embed-text model NOT found');
      console.log('   Available models:', models.map(m => m.name).join(', '));
    }
    
    return true;
  } catch (error) {
    console.log('   ❌ Ollama connection failed:', error.message);
    return false;
  }
}

async function testVideoInfo() {
  console.log('\n2️⃣  Testing video info endpoint...');
  try {
    const response = await axios.post(`${BASE_URL}/api/video-info`, {
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' // Rick Astley - Never Gonna Give You Up
    }, { timeout: 30000 });
    
    console.log('   ✅ Video info endpoint working');
    console.log('   Video:', response.data.title);
    console.log('   Duration:', response.data.duration, 'seconds');
    console.log('   Video ID:', response.data.videoId);
    
    return response.data.videoId;
  } catch (error) {
    console.log('   ❌ Video info failed:', error.response?.data?.error || error.message);
    return null;
  }
}

async function testTranscriptFetch(videoId) {
  console.log('\n3️⃣  Testing transcript fetch...');
  try {
    const response = await axios.post(`${BASE_URL}/api/transcript/fetch`, {
      url: `https://www.youtube.com/watch?v=${videoId}`
    }, { timeout: 60000 });
    
    console.log('   ✅ Transcript fetch successful');
    console.log('   Segments:', response.data.segmentCount);
    console.log('   Cached:', response.data.cached);
    
    return true;
  } catch (error) {
    console.log('   ❌ Transcript fetch failed:', error.response?.data?.error || error.message);
    if (error.response?.data?.details) {
      console.log('   Details:', error.response.data.details);
    }
    return false;
  }
}

async function testTranscriptStatus(videoId) {
  console.log('\n4️⃣  Testing transcript status...');
  try {
    const response = await axios.get(`${BASE_URL}/api/transcript/${videoId}/status`);
    
    console.log('   ✅ Status check successful');
    console.log('   Has transcript:', response.data.hasTranscript);
    console.log('   Is indexed:', response.data.isIndexed);
    console.log('   Segment count:', response.data.segmentCount);
    
    return response.data;
  } catch (error) {
    console.log('   ❌ Status check failed:', error.response?.data?.error || error.message);
    return null;
  }
}

async function testExactSearch(videoId) {
  console.log('\n5️⃣  Testing exact search...');
  try {
    const response = await axios.get(`${BASE_URL}/api/transcript/search`, {
      params: {
        videoId: videoId,
        query: 'never',
        type: 'exact'
      },
      timeout: 10000
    });
    
    console.log('   ✅ Exact search successful');
    console.log('   Results:', response.data.count);
    
    if (response.data.results.length > 0) {
      console.log('   First match at:', response.data.results[0].startTime, 'seconds');
      console.log('   Text:', response.data.results[0].text.substring(0, 60) + '...');
    }
    
    return true;
  } catch (error) {
    console.log('   ❌ Exact search failed:', error.response?.data?.error || error.message);
    return false;
  }
}

async function testTranscriptIndex(videoId) {
  console.log('\n6️⃣  Testing transcript indexing...');
  try {
    const response = await axios.post(`${BASE_URL}/api/transcript/index`, {
      videoId: videoId
    }, { timeout: 120000 }); // 2 minutes timeout for indexing
    
    console.log('   ✅ Indexing successful');
    console.log('   Indexed:', response.data.indexed, 'segments');
    console.log('   Skipped:', response.data.skipped, 'segments (already indexed)');
    
    return true;
  } catch (error) {
    console.log('   ❌ Indexing failed:', error.response?.data?.error || error.message);
    if (error.response?.data?.details) {
      console.log('   Details:', error.response.data.details);
    }
    return false;
  }
}

async function testSemanticSearch(videoId) {
  console.log('\n7️⃣  Testing semantic search...');
  try {
    const response = await axios.get(`${BASE_URL}/api/transcript/search`, {
      params: {
        videoId: videoId,
        query: 'commitment and love',
        type: 'semantic',
        limit: 5
      },
      timeout: 30000
    });
    
    console.log('   ✅ Semantic search successful');
    console.log('   Results:', response.data.count);
    
    if (response.data.results.length > 0) {
      console.log('   Top match:');
      console.log('     - Time:', response.data.results[0].startTime, 'seconds');
      console.log('     - Similarity:', (response.data.results[0].similarity * 100).toFixed(1) + '%');
      console.log('     - Text:', response.data.results[0].text.substring(0, 60) + '...');
    }
    
    return true;
  } catch (error) {
    console.log('   ❌ Semantic search failed:', error.response?.data?.error || error.message);
    return false;
  }
}

async function runTests() {
  console.log('🧪 Testing Transcript Functionality');
  console.log('='.repeat(50));
  
  // Test Ollama
  const ollamaOk = await testOllama();
  
  // Test video info
  const videoId = await testVideoInfo();
  if (!videoId) {
    console.log('\n❌ Cannot proceed without valid video ID');
    return;
  }
  
  // Test transcript fetch
  const fetchOk = await testTranscriptFetch(videoId);
  if (!fetchOk) {
    console.log('\n⚠️  Transcript fetch failed. This video may not have captions.');
    console.log('Try a different video with captions enabled.');
    return;
  }
  
  // Test status
  const status = await testTranscriptStatus(videoId);
  
  // Test exact search
  await testExactSearch(videoId);
  
  // Test indexing (if Ollama is available)
  if (ollamaOk && status && !status.isIndexed) {
    console.log('\n⏳ Starting indexing (this may take 1-2 minutes)...');
    await testTranscriptIndex(videoId);
  } else if (status?.isIndexed) {
    console.log('\n✓ Transcript already indexed, skipping...');
  }
  
  // Test semantic search (if indexed)
  if (ollamaOk) {
    await testSemanticSearch(videoId);
  } else {
    console.log('\n⚠️  Skipping semantic search (Ollama not available)');
  }
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('✅ Testing complete!');
  console.log('\nYou can now:');
  console.log('1. Open http://localhost:3000 in your browser');
  console.log('2. Load any YouTube video with captions');
  console.log('3. Use the transcript search feature');
}

// Run tests if server is available
runTests().catch(err => {
  console.error('\n❌ Test failed:', err.message);
  console.log('\nMake sure:');
  console.log('1. Server is running: npm start');
  console.log('2. Ollama is running: ollama serve');
  console.log('3. Model is installed: ollama pull nomic-embed-text');
});
