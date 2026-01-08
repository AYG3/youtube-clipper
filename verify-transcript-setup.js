#!/usr/bin/env node

/**
 * Setup verification script for transcript feature
 * Checks all dependencies and configurations
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔍 Verifying Transcript Feature Setup\n');
console.log('='.repeat(50));

let allGood = true;

// 1. Check SQLite3 installation
console.log('\n1. Checking SQLite3 installation...');
try {
  require('sqlite3');
  console.log('   ✅ sqlite3 package installed');
} catch (err) {
  console.log('   ❌ sqlite3 package NOT installed');
  console.log('   Run: npm install sqlite3');
  allGood = false;
}

// 2. Check file structure
console.log('\n2. Checking file structure...');
const requiredFiles = [
  'src/database/index.js',
  'src/models/Transcript.js',
  'src/services/transcriptService.js',
  'src/services/transcriptIndexService.js',
  'src/services/transcriptSearchService.js',
  'src/routes/transcriptRoutes.js',
  'public/components/transcript-search.js'
];

for (const file of requiredFiles) {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    console.log(`   ✅ ${file}`);
  } else {
    console.log(`   ❌ ${file} NOT FOUND`);
    allGood = false;
  }
}

// 3. Check yt-dlp
console.log('\n3. Checking yt-dlp...');
try {
  execSync('which yt-dlp', { stdio: 'ignore' });
  const version = execSync('yt-dlp --version', { encoding: 'utf8' }).trim();
  console.log(`   ✅ yt-dlp installed (version ${version})`);
} catch (err) {
  console.log('   ❌ yt-dlp NOT installed');
  console.log('   Run: brew install yt-dlp  (macOS)');
  allGood = false;
}

// 4. Check Ollama (optional)
console.log('\n4. Checking Ollama (optional for semantic search)...');
try {
  execSync('which ollama', { stdio: 'ignore' });
  console.log('   ✅ Ollama installed');
  
  // Check if Ollama is running
  try {
    const axios = require('axios');
    // Note: This is async but we'll skip for now in sync script
    console.log('   ℹ️  Check if Ollama is running: ollama serve');
  } catch (err) {
    console.log('   ℹ️  Install axios to check Ollama status: npm install axios');
  }
} catch (err) {
  console.log('   ⚠️  Ollama NOT installed (optional)');
  console.log('   Semantic search will be disabled without Ollama');
  console.log('   Install: brew install ollama  (macOS)');
}

// 5. Check data directory
console.log('\n5. Checking data directory...');
const dataDir = path.join(__dirname, 'data');
if (fs.existsSync(dataDir)) {
  console.log('   ✅ data/ directory exists');
} else {
  console.log('   ℹ️  data/ directory will be created on first use');
}

// Summary
console.log('\n' + '='.repeat(50));
if (allGood) {
  console.log('\n✅ All required components are installed!');
  console.log('\nNext steps:');
  console.log('1. Start the server: npm start');
  console.log('2. Open http://localhost:3000');
  console.log('3. Load a YouTube video');
  console.log('4. Click "Fetch Transcript" to test\n');
  
  console.log('Optional (for semantic search):');
  console.log('1. Start Ollama: ollama serve');
  console.log('2. Pull model: ollama pull nomic-embed-text');
  console.log('3. Click "Enable Semantic Search" in the UI\n');
} else {
  console.log('\n⚠️  Some required components are missing.');
  console.log('Please install missing dependencies before proceeding.\n');
}

console.log('📖 See TRANSCRIPT_FEATURE.md for detailed documentation\n');
