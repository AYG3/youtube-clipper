let videoDuration = 0;
let videoInfo = null;
let player = null;
let syncInterval = null;
let isUserDraggingStart = false;
let lastSliderInteraction = 0;
let isStartPinned = false;
let wasPlayingBeforePin = false;
let isUserDraggingEnd = false;
let lastEndSliderInteraction = 0;
let transcriptSearch = null;

// ========== Video History Management Module ==========
const VideoHistory = {
    STORAGE_KEY: 'youtube_clipper_history',
    MAX_HISTORY_ITEMS: 3,

    // Get history from localStorage
    getHistory() {
        try {
            const history = localStorage.getItem(this.STORAGE_KEY);
            return history ? JSON.parse(history) : [];
        } catch (error) {
            console.error('Error reading history:', error);
            return [];
        }
    },

    // Save history to localStorage
    saveHistory(history) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(history));
        } catch (error) {
            console.error('Error saving history:', error);
        }
    },

    // Add video to history
    addVideo(videoData) {
        if (!videoData || !videoData.url || !videoData.videoId) return;

        let history = this.getHistory();
        
        // Remove duplicate if exists
        history = history.filter(item => item.videoId !== videoData.videoId);
        
        // Add to beginning
        history.unshift({
            url: videoData.url,
            videoId: videoData.videoId,
            title: videoData.title || 'Untitled Video',
            duration: videoData.duration || 0,
            timestamp: new Date().toISOString()
        });
        
        // Keep only last MAX_HISTORY_ITEMS
        history = history.slice(0, this.MAX_HISTORY_ITEMS);
        
        this.saveHistory(history);
        this.renderHistoryDropdown();
    },

    // Clear all history
    clearHistory() {
        this.saveHistory([]);
        this.renderHistoryDropdown();
    },

    // Render history dropdown
    renderHistoryDropdown() {
        const dropdown = document.getElementById('historyDropdown');
        const history = this.getHistory();

        if (history.length === 0) {
            dropdown.innerHTML = '<div class="history-empty">No recent videos</div>';
            return;
        }

        dropdown.innerHTML = history.map((item, index) => `
            <div class="history-item" data-url="${item.url}" data-index="${index}">
                <div class="history-item-title">${this.truncateTitle(item.title, 40)}</div>
                <div class="history-item-meta">
                    ${this.formatDuration(item.duration)} • ${this.timeAgo(item.timestamp)}
                </div>
            </div>
        `).join('');

        // Add click handlers
        dropdown.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', () => {
                const url = item.getAttribute('data-url');
                this.loadFromHistory(url);
            });
        });
    },

    // Load video from history
    loadFromHistory(url) {
        if (!url) return;
        
        // Set URL and trigger load
        youtubeUrlInput.value = url;
        document.getElementById('historyDropdown').classList.add('hidden');
        loadVideoBtn.click();
    },

    // Helper: Truncate title
    truncateTitle(title, maxLength) {
        if (title.length <= maxLength) return title;
        return title.substring(0, maxLength) + '...';
    },

    // Helper: Format duration
    formatDuration(seconds) {
        if (!seconds || seconds === 0) return '0:00';
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        if (hrs > 0) {
            return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    },

    // Helper: Time ago
    timeAgo(timestamp) {
        const now = new Date();
        const past = new Date(timestamp);
        const diffMs = now - past;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return past.toLocaleDateString();
    }
};

// DOM elements
const youtubeUrlInput = document.getElementById('youtubeUrl');
const loadVideoBtn = document.getElementById('loadVideoBtn');
const clearVideoBtn = document.getElementById('clearVideoBtn');
const historyToggleBtn = document.getElementById('historyToggleBtn');
const historyDropdown = document.getElementById('historyDropdown');
const videoPreview = document.getElementById('videoPreview');
const clipControls = document.getElementById('clipControls');
const youtubePlayer = document.getElementById('youtubePlayer');
const videoTitle = document.getElementById('videoTitle');
const videoDurationEl = document.getElementById('videoDuration');
const startSlider = document.getElementById('startSlider');
const endSlider = document.getElementById('endSlider');
const startTime = document.getElementById('startTime');
const endTime = document.getElementById('endTime');
const clipDuration = document.getElementById('clipDuration');
const downloadBtn = document.getElementById('downloadBtn');
const status = document.getElementById('status');
const qualitySelect = document.getElementById('qualitySelect');
const qualityNotice = document.querySelector('.select-notice');
const qualityBadge = document.getElementById('qualityBadge');
const backgroundCheckbox = document.getElementById('backgroundCheckbox');
const resumeBtn = document.getElementById('resumeBtn');
const viewLogBtn = document.getElementById('viewLogBtn');
const clipLog = document.getElementById('clipLog');
const clipResumeStatus = document.getElementById('clipResumeStatus');
const pinStartBtn = document.getElementById('pinStartBtn');
const progressContainer = document.getElementById('progressContainer');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const startRecordBtn = document.getElementById('startRecordBtn');
const stopRecordBtn = document.getElementById('stopRecordBtn');
const recordStatusEl = document.getElementById('recordStatus');
const recordingsList = document.getElementById('recordingsList');

let currentRecordingId = null;
let recordingPollInterval = null;

// Parse time string (supports "123", "1:23", "1:23:45") to seconds
function parseTimeInput(timeStr) {
    timeStr = timeStr.trim();
    
    // If it's just a number, return it
    if (/^\d+(\.\d+)?$/.test(timeStr)) {
        return parseFloat(timeStr);
    }
    
    // Parse MM:SS or HH:MM:SS format
    const parts = timeStr.split(':').map(p => parseInt(p));
    
    if (parts.length === 2) {
        // MM:SS
        return parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
        // HH:MM:SS
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    
    return 0;
}

// Format seconds to HH:MM:SS or MM:SS
function formatTime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hrs > 0) {
        return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Show status message
function showStatus(message, type = 'info') {
    status.textContent = message;
    status.className = `status ${type}`;
    status.classList.remove('hidden');
}

// Hide status message
function hideStatus() {
    status.classList.add('hidden');
}

// Clear video and reset state
function clearVideo() {
    // Clear input
    youtubeUrlInput.value = '';
    
    // Hide UI elements
    videoPreview.classList.add('hidden');
    clipControls.classList.add('hidden');
    document.getElementById('transcriptSearchContainer')?.classList.add('hidden');
    document.getElementById('recordControls')?.classList.add('hidden');
    hideStatus();
    
    // Destroy player
    if (player) {
        try {
            player.destroy();
        } catch (e) {
            console.log('Error destroying player:', e);
        }
        player = null;
    }
    
    // Clear player container
    youtubePlayer.innerHTML = '';
    
    // Reset transcript search
    if (transcriptSearch) {
        transcriptSearch = null;
    }
    
    // Reset video info and duration
    videoInfo = null;
    videoDuration = 0;
    
    // Reset sliders
    startSlider.value = 0;
    endSlider.value = 10;
    startSlider.max = 100;
    endSlider.max = 100;
    
    // Reset time inputs
    startTime.value = '0';
    endTime.value = '10';
    clipDuration.textContent = '10s';
    
    // Reset pin state
    isStartPinned = false;
    pinStartBtn.textContent = '📌';
    pinStartBtn.classList.remove('pinned');
    
    // Clear recording state if any
    if (currentRecordingId) {
        currentRecordingId = null;
    }
    if (recordingPollInterval) {
        clearInterval(recordingPollInterval);
        recordingPollInterval = null;
    }
    
    // Clear sync interval
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
    }
    
    console.log('Video cleared successfully');
}

// Update clip duration display
function updateClipDuration() {
    const start = parseFloat(startSlider.value);
    const end = parseFloat(endSlider.value);
    const duration = end - start;
    
    startTime.value = formatTime(start);
    endTime.value = formatTime(end);
    clipDuration.textContent = formatTime(duration);
}

youtubeUrlInput.addEventListener("input",  () => {
    if (youtubeUrlInput.value.startsWith("https://")) loadVideoBtn.click()
})


// Load video information
loadVideoBtn.addEventListener('click', async () => {
    const url = youtubeUrlInput.value.trim();
    
    if (!url) {
        showStatus('Please enter a YouTube URL', 'error');
        return;
    }

    loadVideoBtn.disabled = true;
    loadVideoBtn.textContent = 'Loading...';
    hideStatus();

    try {
        const response = await fetch('/api/video-info', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to load video');
        }

        videoInfo = data;
        videoDuration = data.duration;

        // Clear existing player and transcript search if video changed
        if (player) {
            try {
                player.destroy();
            } catch (e) {
                console.log('Error destroying player:', e);
            }
            player = null;
        }
        
        // Clear the player container
        youtubePlayer.innerHTML = '';
        
        // Hide old transcript search
        if (transcriptSearch) {
            document.getElementById('transcriptSearchContainer').classList.add('hidden');
            transcriptSearch = null;
        }

        // Initialize YouTube player if API is loaded, otherwise fallback to iframe
        if (typeof YT !== 'undefined' && YT.Player) {
            player = new YT.Player('youtubePlayer', {
                videoId: data.videoId,
                events: {
                    'onReady': onPlayerReady,
                    'onStateChange': onPlayerStateChange
                }
            });
        } else {
            // Fallback: create iframe manually
            const iframe = document.createElement('iframe');
            iframe.src = `https://www.youtube.com/embed/${data.videoId}`;
            iframe.width = '100%';
            iframe.height = '315';
            iframe.frameBorder = '0';
            iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
            iframe.allowFullscreen = true;
            youtubePlayer.appendChild(iframe);
        }

        // Update UI
        videoTitle.textContent = data.title;
        if (data.isLive) {
            videoDurationEl.textContent = `Live stream`;
            // Hide clip controls for live, show record controls
            clipControls.classList.add('hidden');
        } else {
            videoDurationEl.textContent = `Duration: ${formatTime(data.duration)}`;
            // Set slider ranges
            startSlider.max = data.duration;
            endSlider.max = data.duration;
            endSlider.value = Math.min(10, data.duration);
            startSlider.value = 0;
            clipControls.classList.remove('hidden');
        }

        // Set slider ranges
        startSlider.max = videoDuration;
        endSlider.max = videoDuration;
        endSlider.value = Math.min(10, videoDuration);
        startSlider.value = 0;

        // Show preview and controls
        videoPreview.classList.remove('hidden');
        clipControls.classList.remove('hidden');

        // Reset pin state for new video
        isStartPinned = false;
        pinStartBtn.textContent = '📌';
        pinStartBtn.classList.remove('pinned');

        updateClipDuration();
        showStatus('Video loaded successfully!', 'success');
        setTimeout(hideStatus, 3000);
        
        // Add to history
        VideoHistory.addVideo({
            url: url,
            videoId: data.videoId,
            title: data.title,
            duration: data.duration
        });

        // Initialize transcript search for non-live videos
        if (!data.isLive && window.TranscriptSearch) {
            document.getElementById('transcriptSearchContainer').classList.remove('hidden');
            transcriptSearch = new TranscriptSearch(data.videoId);
        } else {
            document.getElementById('transcriptSearchContainer').classList.add('hidden');
        }

            // Show recording controls if the video is a live stream
            if (data.isLive) {
                document.getElementById('recordControls').classList.remove('hidden');
                startRecordBtn.disabled = false;
            } else {
                document.getElementById('recordControls').classList.add('hidden');
                startRecordBtn.disabled = true;
            }

    } catch (error) {
        console.error('Error loading video:', error);
        showStatus(error.message, 'error');
    } finally {
        loadVideoBtn.disabled = false;
        loadVideoBtn.textContent = 'Load Video';
    }
});

// Slider event listeners
startSlider.addEventListener('mousedown', () => {
    isUserDraggingStart = true;
});

startSlider.addEventListener('mouseup', () => {
    isUserDraggingStart = false;
    lastSliderInteraction = Date.now();
});

startSlider.addEventListener('input', () => {
    const start = parseFloat(startSlider.value);
    const end = parseFloat(endSlider.value);
    
    // Ensure start is before end
    if (start >= end) {
        startSlider.value = Math.max(0, end - 1);
    }
    
    // Seek video to new start time
    if (player && player.seekTo) {
        player.seekTo(start);
    }
    
    updateClipDuration();
});

endSlider.addEventListener('mousedown', () => {
    isUserDraggingEnd = true;
});

endSlider.addEventListener('mouseup', () => {
    isUserDraggingEnd = false;
    lastEndSliderInteraction = Date.now();
});

endSlider.addEventListener('input', () => {
    const start = parseFloat(startSlider.value);
    const end = parseFloat(endSlider.value);
    
    // Ensure end is after start
    if (end <= start) {
        endSlider.value = Math.min(videoDuration, start + 1);
    }
    
    // If start is pinned, seek video to end time
    if (isStartPinned && player && player.seekTo) {
        player.seekTo(end);
    }
    
    updateClipDuration();
});

// Pin start time button
pinStartBtn.addEventListener('click', () => {
    if (isStartPinned) {
        // Unpin
        isStartPinned = false;
        pinStartBtn.textContent = '📌';
        pinStartBtn.classList.remove('pinned');
        // Resume sync if video was playing
        if (wasPlayingBeforePin && player) {
            player.playVideo();
        }
    } else {
        // Pin
        isStartPinned = true;
        pinStartBtn.textContent = '📍';
        pinStartBtn.classList.add('pinned');
        // Pause video and seek to current start time
        if (player) {
            wasPlayingBeforePin = (player.getPlayerState() === YT.PlayerState.PLAYING);
            player.pauseVideo();
            player.seekTo(parseFloat(startSlider.value));
        }
    }
});

// Manual time input for start time
startTime.addEventListener('input', () => {
    const seconds = parseTimeInput(startTime.value);
    
    if (seconds >= 0 && seconds < videoDuration) {
        startSlider.value = seconds;
        
        // Seek video to new start time
        if (player && player.seekTo) {
            player.seekTo(seconds);
        }
        lastSliderInteraction = Date.now();
        
        // Ensure start is before end
        const end = parseFloat(endSlider.value);
        if (seconds >= end) {
            const newEnd = Math.min(videoDuration, seconds + 1);
            endSlider.value = newEnd;
            endTime.value = formatTime(newEnd);
        }
        
        updateClipDuration();
    }
});

// Manual time input for end time
endTime.addEventListener('input', () => {
    const seconds = parseTimeInput(endTime.value);
    
    if (seconds > 0 && seconds <= videoDuration) {
        endSlider.value = seconds;
        
        // Seek video if start is pinned
        if (isStartPinned && player && player.seekTo) {
            player.seekTo(seconds);
        }
        lastEndSliderInteraction = Date.now();
        
        // Ensure end is after start
        const start = parseFloat(startSlider.value);
        if (seconds <= start) {
            const newStart = Math.max(0, seconds - 1);
            startSlider.value = newStart;
            startTime.value = formatTime(newStart);
        }
        
        updateClipDuration();
    }
});

// Allow Enter key to apply time changes
startTime.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        startTime.blur();
    }
});

endTime.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        endTime.blur();
    }
});

// Download clip
downloadBtn.addEventListener('click', async () => {
    const url = youtubeUrlInput.value.trim();
    const start = parseFloat(startSlider.value);
    const end = parseFloat(endSlider.value);

    if (!url || !videoInfo) {
        showStatus('Please load a video first', 'error');
        return;
    }

    if (start >= end) {
        showStatus('Start time must be before end time', 'error');
        return;
    }

    downloadBtn.disabled = true;
    document.querySelector('.btn-text').textContent = 'Processing...';
    document.querySelector('.spinner').classList.remove('hidden');
    showStatus('📥 Downloading and clipping video... This may take a few minutes.', 'info');

    // Show and start progress polling
    progressContainer.classList.remove('hidden');
    let progressInterval = setInterval(async () => {
        try {
            const res = await fetch('/api/progress');
            const prog = await res.json();
            progressFill.style.width = `${prog.percent}%`;
            progressText.textContent = `${prog.message}: ${prog.percent.toFixed(1)}%`;
        } catch (e) {
            // ignore
        }
    }, 1000);

    try {
        const background = !!(backgroundCheckbox && backgroundCheckbox.checked);
        const response = await fetch('/api/clip', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url, start, end, quality: (qualitySelect ? qualitySelect.value : 'best'), background }),
            // Prevent CORS issues
            mode: 'cors',
            credentials: 'same-origin'
        });

        if (!response.ok) {
            const data = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(data.error || 'Failed to clip video');
        }

        // If background download was requested, server returns JSON with id and status
        if (background) {
            const j = await response.json();
            showStatus(`Background download started (id: ${j.id})`, 'info');
            startClipStatusPolling({ url, start, end, quality: (qualitySelect ? qualitySelect.value : 'best') });
        } else {
            // Get the filename from Content-Disposition header
            const contentDisposition = response.headers.get('Content-Disposition');
            const filename = contentDisposition
                ? contentDisposition.split('filename=')[1].replace(/"/g, '')
                : 'clip.mp4';

            // Download the file
            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(downloadUrl);

            showStatus('✅ Clip downloaded successfully!', 'success');
        }

    } catch (error) {
        console.error('Error downloading clip:', error);
        showStatus(error.message, 'error');
    } finally {
        downloadBtn.disabled = false;
        document.querySelector('.btn-text').textContent = 'Download Clip';
        document.querySelector('.spinner').classList.add('hidden');
        // Stop progress polling and hide
        clearInterval(progressInterval);
        progressContainer.classList.add('hidden');
    }
});

// Start recording button
startRecordBtn.addEventListener('click', async () => {
    const url = youtubeUrlInput.value.trim();
    if (!url) { showStatus('Please enter a YouTube URL', 'error'); return; }
    startRecordBtn.disabled = true;
    startRecordBtn.textContent = 'Starting...';
    try {
        const res = await fetch('/api/record/start', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, quality: (qualitySelect ? qualitySelect.value : 'best') })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to start recording');
        currentRecordingId = data.id;
        recordStatusEl.textContent = `Recording started (id: ${data.id})`;
        stopRecordBtn.disabled = false;
        startRecordBtn.disabled = true;
        // Start polling recording status
        if (recordingPollInterval) clearInterval(recordingPollInterval);
        recordingPollInterval = setInterval(async () => {
            if (!currentRecordingId) return;
            try {
                const s = await fetch(`/api/record/${currentRecordingId}/status`);
                const stat = await s.json();
                const elapsed = stat.elapsed || 0;
                recordStatusEl.textContent = `Recording: ${stat.status} (${elapsed}s, ${stat.sizeMB} MB)`;
                // update list of recordings
                refreshRecordingsList();
            } catch (e) { console.warn('record status poll error', e); }
        }, 1000);
    } catch (error) {
        console.error('Start record failed:', error);
        showStatus(error.message, 'error');
        startRecordBtn.disabled = false;
        startRecordBtn.textContent = 'Start Recording';
    }
});

// Stop recording button
stopRecordBtn.addEventListener('click', async () => {
    if (!currentRecordingId) return;
    stopRecordBtn.disabled = true;
    stopRecordBtn.textContent = 'Stopping...';
    try {
        const res = await fetch(`/api/record/${currentRecordingId}/stop`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to stop recording');
        recordStatusEl.textContent = `Recording stopped: ${data.outPath}`;
        startRecordBtn.disabled = false;
        startRecordBtn.textContent = 'Start Recording';
        stopRecordBtn.disabled = true;
        if (recordingPollInterval) clearInterval(recordingPollInterval);
        currentRecordingId = null;
        // Refresh list
        refreshRecordingsList();
    } catch (error) {
        console.error('Stop record failed:', error);
        showStatus(error.message, 'error');
        stopRecordBtn.disabled = false;
        stopRecordBtn.textContent = 'Stop Recording';
    }
});

async function refreshRecordingsList() {
    try {
        const res = await fetch('/api/records');
        const list = await res.json();
        recordingsList.innerHTML = '';
        list.forEach(r => {
            const div = document.createElement('div');
            div.className = 'rec-item';
            const left = document.createElement('div');
            left.innerHTML = `<strong>${r.title}</strong><br/><small>${r.id}</small>`;
            const right = document.createElement('div');
            const status = document.createElement('small'); status.textContent = `${r.status} • ${Math.round((r.sizeBytes||0)/1024/1024)} MB`;
            const downloadBtn = document.createElement('button');
            downloadBtn.textContent = 'Download';
            downloadBtn.className = 'btn-secondary';
            downloadBtn.style.padding = '8px 10px';
            downloadBtn.addEventListener('click', async () => {
                // Ask server to stream the recorded file; direct link
                try {
                    const dl = await fetch(`/api/record/${r.id}/download`);
                    if (!dl.ok) { const d = await dl.json().catch(() =>{}); throw new Error(d?.error || 'Download failed'); }
                    const blob = await dl.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a'); a.href = url; a.download = `${r.title || 'recording'}.mp4`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
                } catch (e) {
                    showStatus('Download failed: ' + e.message, 'error');
                }
            });
            right.appendChild(status);
            right.appendChild(downloadBtn);
            div.appendChild(left);
            div.appendChild(right);
            recordingsList.appendChild(div);
        });
    } catch (e) {
        console.warn('refreshRecordingsList error', e);
    }
}

// Allow Enter key to load video
youtubeUrlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        loadVideoBtn.click();
    }
});

// Update quality notice and accessible label when selection changes
function updateQualityNotice() {
    if (!qualitySelect) return;
    const selectedOpt = qualitySelect.options[qualitySelect.selectedIndex];
    const value = selectedOpt.value;
    let label = selectedOpt.textContent || value;
    // Simplify label for compact display
    if (value === 'best') label = 'Best (Auto)';
    if (value === 'audio') label = 'Audio (M4A)';
    if (qualityNotice) qualityNotice.textContent = `Selected: ${label}`;
    if (qualityBadge) qualityBadge.textContent = label;
    // Update ARIA attribute for screen readers
    qualitySelect.setAttribute('aria-label', `Quality: ${label}`);
}

// initialize quality notice on page load
if (qualitySelect && qualityNotice) {
    updateQualityNotice();
    qualitySelect.addEventListener('change', updateQualityNotice);
}

// YouTube Player API functions
function onPlayerReady(event) {
    // Player is ready
}

function onPlayerStateChange(event) {
    if (event.data == YT.PlayerState.PLAYING) {
        // Start syncing start slider with current time
        startSync();
    } else {
        // Stop syncing
        stopSync();
    }
}

function startSync() {
    if (syncInterval) clearInterval(syncInterval);
    syncInterval = setInterval(() => {
        if (player && player.getCurrentTime) {
            const currentTime = player.getCurrentTime();
            if (isStartPinned) {
                // Sync end slider
                if (!isUserDraggingEnd && Date.now() - lastEndSliderInteraction > 500) {
                    endSlider.value = currentTime;
                    updateClipDuration();
                }
            } else {
                // Sync start slider
                if (!isUserDraggingStart && Date.now() - lastSliderInteraction > 500) {
                    startSlider.value = currentTime;
                    updateClipDuration();
                }
            }
        }
    }, 100); // Update every 100ms
}

function stopSync() {
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
    }
}

// Start periodic list refresh
refreshRecordingsList();
setInterval(refreshRecordingsList, 10000);

// ========== Clip from Recording UI ==========
const clipFromRecordingSection = document.getElementById('clipFromRecordingSection');
const clipRecordingSelect = document.getElementById('clipRecordingSelect');
const clipStartTimeInput = document.getElementById('clipStartTime');
const clipEndTimeInput = document.getElementById('clipEndTime');
const saveClipFromRecordingBtn = document.getElementById('saveClipFromRecordingBtn');

// Populate recording dropdown
async function populateClipRecordingSelect() {
    try {
        const res = await fetch('/api/records');
        const list = await res.json();
        clipRecordingSelect.innerHTML = '';
        const finishedRecs = list.filter(r => r.status === 'finished' || r.status === 'stopped');
        if (finishedRecs.length === 0) {
            clipFromRecordingSection.classList.add('hidden');
            return;
        }
        clipFromRecordingSection.classList.remove('hidden');
        finishedRecs.forEach(r => {
            const opt = document.createElement('option');
            opt.value = r.id;
            opt.textContent = `${r.title} (${Math.round((r.sizeBytes || 0) / 1024 / 1024)} MB)`;
            clipRecordingSelect.appendChild(opt);
        });
    } catch (e) {
        console.warn('populateClipRecordingSelect error', e);
    }
}
populateClipRecordingSelect();
setInterval(populateClipRecordingSelect, 10000);

// Save clip from recording
saveClipFromRecordingBtn.addEventListener('click', async () => {
    const id = clipRecordingSelect.value;
    const start = clipStartTimeInput.value.trim();
    const end = clipEndTimeInput.value.trim();
    if (!id) { showStatus('Select a recording first', 'error'); return; }
    saveClipFromRecordingBtn.disabled = true;
    saveClipFromRecordingBtn.textContent = 'Processing...';
    try {
        const res = await fetch('/api/clip-from-recording', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, start, end })
        });
        if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            throw new Error(d.error || 'Failed to create clip');
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'clip.mp4';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showStatus('Clip downloaded!', 'success');
    } catch (e) {
        showStatus(e.message, 'error');
    } finally {
        saveClipFromRecordingBtn.disabled = false;
        saveClipFromRecordingBtn.textContent = 'Save Clip';
    }
});

// ========== WebSocket for real-time progress ==========
let ws = null;
function connectWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${protocol}://${location.host}/ws`);
    ws.onopen = () => console.log('WebSocket connected');
    ws.onclose = () => { console.log('WebSocket closed, reconnecting...'); setTimeout(connectWebSocket, 2000); };
    ws.onerror = (e) => console.warn('WebSocket error', e);
    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleWsMessage(data);
        } catch (e) { /* ignore */ }
    };
}

function handleWsMessage(data) {
    if (data.type === 'progress') {
        // Update progress UI
        progressFill.style.width = `${data.percent}%`;
        progressText.textContent = `${data.message}: ${data.percent.toFixed(1)}%`;
    } else if (data.type === 'recording-progress') {
        // Update recording status in real-time
        if (currentRecordingId && data.id === currentRecordingId) {
            recordStatusEl.textContent = `Recording: ${data.status} (${data.elapsed}s, ${data.sizeMB} MB)`;
        }
    } else if (data.type === 'recording-status') {
        // Refresh recordings list when a recording status changes
        refreshRecordingsList();
        populateClipRecordingSelect();
        if (data.status === 'finished' || data.status === 'stopped') {
            recordStatusEl.textContent = `Recording ${data.id} ${data.status}`;
        }
    } else if (data.type === 'recording-removed') {
        refreshRecordingsList();
        populateClipRecordingSelect();
    }
}

connectWebSocket();

// Clip status polling and resume UI
let clipStatusInterval = null;
function startClipStatusPolling(params) {
    if (clipStatusInterval) clearInterval(clipStatusInterval);
    clipStatusInterval = setInterval(async () => {
        try {
            const res = await fetch('/api/clip/status', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(params) });
            const stat = await res.json();
            if (!stat) return;
            if (stat.inProgress) {
                clipResumeStatus.textContent = `In progress: ${stat.percent.toFixed(1)}%`;
                resumeBtn.classList.remove('hidden');
                resumeBtn.textContent = 'Resume (foreground)';
            } else if (stat.exists) {
                clipResumeStatus.textContent = `Ready: ${Math.round(stat.sizeBytes/1024/1024)} MB`;
                resumeBtn.classList.remove('hidden');
                resumeBtn.textContent = 'Resume (download)';
            } else {
                clipResumeStatus.textContent = '';
                resumeBtn.classList.add('hidden');
            }

            // Show log button when yt-dlp wrote a log for this clip
            if (stat.hasLog) {
                viewLogBtn.classList.remove('hidden');
                viewLogBtn.disabled = false;
                viewLogBtn.onclick = async () => {
                    try {
                        viewLogBtn.disabled = true;
                        const r = await fetch(`/api/clip/${stat.clipId}/log`);
                        if (!r.ok) throw new Error('No log available');
                        const txt = await r.text();
                        clipLog.textContent = txt;
                        clipLog.classList.remove('hidden');
                    } catch (e) {
                        showStatus('Could not fetch clip log: ' + e.message, 'error');
                    } finally { viewLogBtn.disabled = false; }
                };
            } else {
                viewLogBtn.classList.add('hidden');
                clipLog.classList.add('hidden');
            }
            if (stat.exists && stat.inProgress === false) {
                // stop polling when ready
                clearInterval(clipStatusInterval);
                clipStatusInterval = null;
            }
        } catch (e) { console.warn('clip status poll failed', e); }
    }, 2000);
}

// Debounced status check when params change
let statusCheckTimeout = null;
function checkClipStatusDebounced() {
    if (statusCheckTimeout) clearTimeout(statusCheckTimeout);
    statusCheckTimeout = setTimeout(() => {
        const url = youtubeUrlInput.value.trim();
        const start = parseFloat(startSlider.value);
        const end = parseFloat(endSlider.value);
        if (!url) return;
        startClipStatusPolling({ url, start, end, quality: (qualitySelect ? qualitySelect.value : 'best') });
    }, 400);
}

// Wire status checks to inputs
if (youtubeUrlInput) youtubeUrlInput.addEventListener('input', checkClipStatusDebounced);
startSlider.addEventListener('change', checkClipStatusDebounced);
endSlider.addEventListener('change', checkClipStatusDebounced);
if (qualitySelect) qualitySelect.addEventListener('change', checkClipStatusDebounced);

// Resume button behavior
if (resumeBtn) resumeBtn.addEventListener('click', async () => {
    const url = youtubeUrlInput.value.trim();
    const start = parseFloat(startSlider.value);
    const end = parseFloat(endSlider.value);
    const quality = (qualitySelect ? qualitySelect.value : 'best');
    const bg = !!(backgroundCheckbox && backgroundCheckbox.checked);
    resumeBtn.disabled = true;
    try {
        const res = await fetch('/api/clip/resume', {
            method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ url, start, end, quality, background: bg })
        });
        if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            throw new Error(j.error || 'Resume failed');
        }
        if (bg) {
            const j = await res.json();
            showStatus(`Background resume started (id: ${j.id})`, 'info');
            startClipStatusPolling({ url, start, end, quality });
        } else {
            // foreground, server will stream file
            const blob = await res.blob();
            const contentDisposition = res.headers.get('Content-Disposition');
            const filename = contentDisposition ? contentDisposition.split('filename=')[1].replace(/"/g,'') : 'clip.mp4';
            const urlObj = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = urlObj; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(urlObj);
            showStatus('✅ Clip downloaded via resume', 'success');
        }
    } catch (e) {
        showStatus('Resume failed: ' + e.message, 'error');
    } finally { resumeBtn.disabled = false; }
});

// ========== Clear Video Button ==========
clearVideoBtn.addEventListener('click', () => {
    if (videoInfo) {
        // Confirm if video is loaded
        if (confirm('Clear the current video and start fresh?')) {
            clearVideo();
        }
    } else {
        // Just clear input if no video loaded
        clearVideo();
    }
});

// ========== History Dropdown Toggle ==========
historyToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    historyDropdown.classList.toggle('hidden');
    
    // Render history when opening
    if (!historyDropdown.classList.contains('hidden')) {
        VideoHistory.renderHistoryDropdown();
    }
});

// Close history dropdown when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.history-dropdown-container')) {
        historyDropdown.classList.add('hidden');
    }
});

// Prevent dropdown from closing when clicking inside it
historyDropdown.addEventListener('click', (e) => {
    e.stopPropagation();
});

// ========== Initialize History on Page Load ==========
document.addEventListener('DOMContentLoaded', () => {
    VideoHistory.renderHistoryDropdown();
});
