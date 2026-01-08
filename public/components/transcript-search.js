/**
 * Transcript Search Component
 * Provides UI for searching transcripts with exact and semantic search
 */

class TranscriptSearch {
  constructor(videoId) {
    this.videoId = videoId;
    this.container = document.getElementById('transcriptSearchContainer');
    this.transcriptStatus = null;
    this.init();
  }

  async init() {
    // Check transcript status
    await this.checkStatus();
    
    // Render UI
    this.render();
    
    // Attach event listeners
    this.attachEventListeners();
  }

  async checkStatus() {
    try {
      const response = await fetch(`/api/transcript/${this.videoId}/status`);
      const data = await response.json();
      this.transcriptStatus = data;
    } catch (error) {
      console.error('Error checking transcript status:', error);
      this.transcriptStatus = { hasTranscript: false, isIndexed: false };
    }
  }

  render() {
    const hasTranscript = this.transcriptStatus && this.transcriptStatus.hasTranscript;
    const isIndexed = this.transcriptStatus && this.transcriptStatus.isIndexed;
    
    this.container.innerHTML = `
      <div class="transcript-search-panel">
        <div class="transcript-header">
          <h3>🔍 Transcript Search</h3>
          ${hasTranscript ? 
            `<span class="transcript-badge success">✓ Loaded (${this.transcriptStatus.segmentCount} segments)</span>` : 
            `<span class="transcript-badge pending">Not loaded</span>`
          }
          ${isIndexed ? 
            `<span class="transcript-badge success">✓ Indexed (${this.transcriptStatus.indexedCount}/${this.transcriptStatus.segmentCount})</span>` : 
            hasTranscript ? `<span class="transcript-badge warning">⚠ Not indexed</span>` : ''
          }
        </div>
        
        ${!hasTranscript ? `
          <div class="transcript-actions">
            <button id="fetchTranscriptBtn" class="btn-primary">
              📥 Fetch Transcript
            </button>
            <span class="info-text">Load transcript from video captions</span>
          </div>
        ` : ''}
        
        ${hasTranscript && !isIndexed ? `
          <div class="transcript-actions">
            <button id="indexTranscriptBtn" class="btn-secondary">
              🧠 Enable Semantic Search
            </button>
            <span class="info-text">Generate embeddings for AI-powered search (requires Ollama)</span>
          </div>
        ` : ''}
        
        ${hasTranscript ? `
          <div class="search-controls">
            <input 
              type="text" 
              id="transcriptSearchInput" 
              placeholder="Search for words or phrases..."
              class="search-input"
            />
            <select id="searchType" class="search-type-select">
              <option value="exact">Exact Match</option>
              <option value="multi-word">Multi-word</option>
              ${isIndexed ? '<option value="semantic">Semantic (AI)</option>' : ''}
            </select>
            <button id="searchBtn" class="btn-primary">Search</button>
          </div>
          <div id="searchResults" class="search-results"></div>
        ` : ''}
        
        <div id="transcriptStatus" class="transcript-status hidden"></div>
      </div>
    `;
  }

  attachEventListeners() {
    // Fetch transcript button
    const fetchBtn = document.getElementById('fetchTranscriptBtn');
    if (fetchBtn) {
      fetchBtn.addEventListener('click', () => this.fetchTranscript());
    }
    
    // Index transcript button
    const indexBtn = document.getElementById('indexTranscriptBtn');
    if (indexBtn) {
      indexBtn.addEventListener('click', () => this.indexTranscript());
    }
    
    // Search button
    const searchBtn = document.getElementById('searchBtn');
    if (searchBtn) {
      searchBtn.addEventListener('click', () => this.performSearch());
    }
    
    // Search on Enter key
    const searchInput = document.getElementById('transcriptSearchInput');
    if (searchInput) {
      searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') this.performSearch();
      });
    }
  }

  async fetchTranscript() {
    const statusEl = document.getElementById('transcriptStatus');
    const fetchBtn = document.getElementById('fetchTranscriptBtn');
    
    statusEl.classList.remove('hidden');
    statusEl.innerHTML = '<div class="loading">📥 Fetching transcript...</div>';
    fetchBtn.disabled = true;
    
    try {
      const url = document.getElementById('youtubeUrl').value;
      
      const response = await fetch('/api/transcript/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        statusEl.innerHTML = `<div class="success">✅ Transcript loaded! (${data.segmentCount} segments)</div>`;
        
        // Refresh status and re-render
        setTimeout(async () => {
          await this.checkStatus();
          this.render();
          this.attachEventListeners();
        }, 1500);
      } else {
        throw new Error(data.error || 'Failed to fetch transcript');
      }
    } catch (error) {
      statusEl.innerHTML = `<div class="error">❌ ${error.message}</div>`;
      fetchBtn.disabled = false;
    }
  }

  async indexTranscript() {
    const statusEl = document.getElementById('transcriptStatus');
    const indexBtn = document.getElementById('indexTranscriptBtn');
    
    statusEl.classList.remove('hidden');
    statusEl.innerHTML = '<div class="loading">🧠 Generating embeddings... This may take a minute.</div>';
    indexBtn.disabled = true;
    
    try {
      const response = await fetch('/api/transcript/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: this.videoId })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        statusEl.innerHTML = `<div class="success">✅ Semantic search enabled! (Indexed ${data.indexed} segments)</div>`;
        
        // Refresh status and re-render
        setTimeout(async () => {
          await this.checkStatus();
          this.render();
          this.attachEventListeners();
        }, 1500);
      } else {
        throw new Error(data.error || 'Failed to index transcript');
      }
    } catch (error) {
      statusEl.innerHTML = `<div class="error">❌ ${error.message}</div>`;
      indexBtn.disabled = false;
    }
  }

  async performSearch() {
    const query = document.getElementById('transcriptSearchInput').value.trim();
    const type = document.getElementById('searchType').value;
    const resultsContainer = document.getElementById('searchResults');

    if (!query) {
      resultsContainer.innerHTML = '<div class="info-message">Please enter a search query</div>';
      return;
    }

    resultsContainer.innerHTML = '<div class="loading">🔍 Searching...</div>';

    try {
      const response = await fetch(
        `/api/transcript/search?videoId=${this.videoId}&query=${encodeURIComponent(query)}&type=${type}&limit=20`
      );
      
      const data = await response.json();

      if (response.ok) {
        this.displayResults(data.results, query);
      } else {
        throw new Error(data.error || 'Search failed');
      }
    } catch (error) {
      resultsContainer.innerHTML = `<div class="error">❌ Search failed: ${error.message}</div>`;
    }
  }

  displayResults(results, query) {
    const resultsContainer = document.getElementById('searchResults');

    if (results.length === 0) {
      resultsContainer.innerHTML = '<div class="no-results">No matches found</div>';
      return;
    }

    const html = `
      <div class="results-header">Found ${results.length} match${results.length !== 1 ? 'es' : ''}</div>
      ${results.map(result => `
        <div class="search-result-item" data-time="${result.startTime}">
          <a href="#" class="timestamp-link" data-time="${result.startTime}">
            ⏱ ${this.formatTimestamp(result.startTime)}
          </a>
          <div class="result-text">${this.highlightText(result.text, query)}</div>
          ${result.similarity ? 
            `<div class="similarity-score">Relevance: ${(result.similarity * 100).toFixed(0)}%</div>` : 
            ''
          }
        </div>
      `).join('')}
    `;

    resultsContainer.innerHTML = html;

    // Attach click handlers for timestamp links
    document.querySelectorAll('.timestamp-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const time = parseFloat(e.target.dataset.time);
        this.seekToTime(time);
      });
    });
  }

  formatTimestamp(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  highlightText(text, query) {
    // Simple highlighting - wrap query matches in <mark> tags
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
  }

  seekToTime(seconds) {
    // Integrate with existing YouTube player
    // Access the global player variable from script.js
    const player = window.player;
    
    if (player && typeof player.seekTo === 'function') {
      player.seekTo(seconds, true);
      
      // Play video if not already playing
      if (typeof player.getPlayerState === 'function' && player.getPlayerState() !== 1) {
        player.playVideo();
      }
      
      // Scroll to video player
      const playerEl = document.getElementById('youtubePlayer');
      if (playerEl) {
        playerEl.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
      }
      
      console.log(`Seeked to ${seconds}s`);
    } else {
      console.warn('YouTube player not available or not ready');
      console.log('Player:', player);
    }
  }
}

// Export for use in main script
window.TranscriptSearch = TranscriptSearch;
