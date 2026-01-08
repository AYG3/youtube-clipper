/**
 * Database layer - SQLite connection and schema initialization
 */
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

let db = null;

/**
 * Get or create database connection
 */
function getDatabase() {
  if (db) return db;
  
  const dbPath = path.join(__dirname, '../../data/transcripts.db');
  const dbDir = path.dirname(dbPath);
  
  // Ensure data directory exists
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    console.log('📁 Created data directory for transcripts database');
  }
  
  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('❌ Failed to connect to database:', err);
      throw err;
    }
    console.log('✅ Connected to transcripts database');
  });
  
  initializeSchema();
  return db;
}

/**
 * Initialize database schema
 */
function initializeSchema() {
  db.serialize(() => {
    // Videos table
    db.run(`
      CREATE TABLE IF NOT EXISTS videos (
        video_id TEXT PRIMARY KEY,
        title TEXT,
        duration INTEGER,
        fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error('Error creating videos table:', err);
    });
    
    // Transcript segments with timestamps
    db.run(`
      CREATE TABLE IF NOT EXISTS transcript_segments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        video_id TEXT NOT NULL,
        start_time REAL NOT NULL,
        end_time REAL NOT NULL,
        text TEXT NOT NULL,
        FOREIGN KEY (video_id) REFERENCES videos(video_id)
      )
    `, (err) => {
      if (err) console.error('Error creating transcript_segments table:', err);
    });
    
    // Index for fast timestamp lookups
    db.run(`
      CREATE INDEX IF NOT EXISTS idx_video_time 
      ON transcript_segments(video_id, start_time)
    `, (err) => {
      if (err) console.error('Error creating index:', err);
    });
    
    // Full-text search virtual table for exact keyword matching
    db.run(`
      CREATE VIRTUAL TABLE IF NOT EXISTS transcript_fts 
      USING fts5(video_id, text, start_time, content=transcript_segments, content_rowid=id)
    `, (err) => {
      if (err) console.error('Error creating FTS table:', err);
    });
    
    // Embeddings table for semantic search
    db.run(`
      CREATE TABLE IF NOT EXISTS transcript_embeddings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        segment_id INTEGER NOT NULL UNIQUE,
        embedding BLOB NOT NULL,
        FOREIGN KEY (segment_id) REFERENCES transcript_segments(id)
      )
    `, (err) => {
      if (err) console.error('Error creating embeddings table:', err);
      else console.log('✅ Database schema initialized');
    });
  });
}

/**
 * Close database connection
 */
function closeDatabase() {
  if (db) {
    db.close((err) => {
      if (err) console.error('Error closing database:', err);
      else console.log('Database connection closed');
    });
    db = null;
  }
}

module.exports = {
  getDatabase,
  closeDatabase
};
