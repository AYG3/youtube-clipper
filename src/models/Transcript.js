/**
 * Transcript model - Data access layer for transcript operations
 */
const { getDatabase } = require('../database');

class Transcript {
  /**
   * Save video metadata
   */
  static async saveVideo(videoId, title, duration) {
    const db = getDatabase();
    return new Promise((resolve, reject) => {
      db.run(
        'INSERT OR REPLACE INTO videos (video_id, title, duration) VALUES (?, ?, ?)',
        [videoId, title, duration],
        function(err) {
          if (err) {
            console.error('Error saving video:', err);
            reject(err);
          } else {
            resolve(this.lastID);
          }
        }
      );
    });
  }

  /**
   * Save transcript segments in batch
   */
  static async saveSegments(videoId, segments) {
    const db = getDatabase();
    
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        const stmt = db.prepare(
          'INSERT INTO transcript_segments (video_id, start_time, end_time, text) VALUES (?, ?, ?, ?)'
        );

        let errorOccurred = false;
        
        segments.forEach(seg => {
          stmt.run([videoId, seg.start, seg.end, seg.text], (err) => {
            if (err && !errorOccurred) {
              errorOccurred = true;
              console.error('Error inserting segment:', err);
            }
          });
        });

        stmt.finalize((err) => {
          if (err || errorOccurred) {
            db.run('ROLLBACK');
            reject(err || new Error('Failed to insert segments'));
          } else {
            db.run('COMMIT', (commitErr) => {
              if (commitErr) reject(commitErr);
              else resolve();
            });
          }
        });
      });
    });
  }

  /**
   * Exact keyword search in transcript
   */
  static async exactSearch(videoId, keyword) {
    const db = getDatabase();
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT ts.id, ts.start_time, ts.end_time, ts.text
         FROM transcript_segments ts
         WHERE ts.video_id = ? AND LOWER(ts.text) LIKE LOWER(?)
         ORDER BY ts.start_time`,
        [videoId, `%${keyword}%`],
        (err, rows) => {
          if (err) {
            console.error('Error in exact search:', err);
            reject(err);
          } else {
            resolve(rows || []);
          }
        }
      );
    });
  }

  /**
   * Get single segment by ID
   */
  static async getSegment(segmentId) {
    const db = getDatabase();
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM transcript_segments WHERE id = ?',
        [segmentId],
        (err, row) => {
          if (err) {
            console.error('Error getting segment:', err);
            reject(err);
          } else {
            resolve(row);
          }
        }
      );
    });
  }

  /**
   * Get all segments for a video
   */
  static async getAllSegments(videoId) {
    const db = getDatabase();
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM transcript_segments WHERE video_id = ? ORDER BY start_time',
        [videoId],
        (err, rows) => {
          if (err) {
            console.error('Error getting segments:', err);
            reject(err);
          } else {
            resolve(rows || []);
          }
        }
      );
    });
  }

  /**
   * Check if video transcript exists
   */
  static async hasTranscript(videoId) {
    const db = getDatabase();
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT COUNT(*) as count FROM transcript_segments WHERE video_id = ?',
        [videoId],
        (err, row) => {
          if (err) {
            console.error('Error checking transcript:', err);
            reject(err);
          } else {
            resolve(row && row.count > 0);
          }
        }
      );
    });
  }

  /**
   * Save embedding for a segment
   */
  static async saveEmbedding(segmentId, embedding) {
    const db = getDatabase();
    const buffer = Buffer.from(new Float32Array(embedding).buffer);
    
    return new Promise((resolve, reject) => {
      db.run(
        'INSERT OR REPLACE INTO transcript_embeddings (segment_id, embedding) VALUES (?, ?)',
        [segmentId, buffer],
        function(err) {
          if (err) {
            console.error('Error saving embedding:', err);
            reject(err);
          } else {
            resolve(this.lastID);
          }
        }
      );
    });
  }

  /**
   * Get embedding for a segment
   */
  static async getEmbedding(segmentId) {
    const db = getDatabase();
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT embedding FROM transcript_embeddings WHERE segment_id = ?',
        [segmentId],
        (err, row) => {
          if (err) {
            console.error('Error getting embedding:', err);
            reject(err);
          } else if (!row) {
            resolve(null);
          } else {
            // Convert blob back to Float32Array
            const buffer = Buffer.from(row.embedding);
            const embedding = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / Float32Array.BYTES_PER_ELEMENT);
            resolve(Array.from(embedding));
          }
        }
      );
    });
  }

  /**
   * Check if segment has embedding
   */
  static async hasEmbedding(segmentId) {
    const db = getDatabase();
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT 1 FROM transcript_embeddings WHERE segment_id = ?',
        [segmentId],
        (err, row) => {
          if (err) {
            console.error('Error checking embedding:', err);
            reject(err);
          } else {
            resolve(!!row);
          }
        }
      );
    });
  }

  /**
   * Delete transcript for a video
   */
  static async deleteTranscript(videoId) {
    const db = getDatabase();
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        // Delete embeddings first (foreign key constraint)
        db.run(
          `DELETE FROM transcript_embeddings 
           WHERE segment_id IN (SELECT id FROM transcript_segments WHERE video_id = ?)`,
          [videoId]
        );
        
        // Delete segments
        db.run('DELETE FROM transcript_segments WHERE video_id = ?', [videoId]);
        
        // Delete video
        db.run('DELETE FROM videos WHERE video_id = ?', [videoId], (err) => {
          if (err) {
            db.run('ROLLBACK');
            reject(err);
          } else {
            db.run('COMMIT', (commitErr) => {
              if (commitErr) reject(commitErr);
              else resolve();
            });
          }
        });
      });
    });
  }
}

module.exports = Transcript;
