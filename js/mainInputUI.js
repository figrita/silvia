/**
 * Main Input UI Panel
 *
 * Left-side panel for configuring global video and audio input sources.
 * Mirrors the structure of mainMixerUI.js for consistency.
 */

import {mainInput} from './mainInput.js'
import {AssetManager} from './assetManager.js'
import {setupHistogramCanvas, drawHistogram, DEFAULT_BAND_CONFIG} from './audioHistogram.js'

// Use the global isElectronMode set in index.html, with fallback
const isElectronMode = typeof window !== 'undefined' && (window.isElectronMode || window.electronAPI)

export class MainInputUI {
    constructor() {
        this.panel = null
        this.isInitialized = false
        this.isCollapsed = false
        this.videoDevices = []
        this.audioDevices = []

        // UI element references
        this.elements = {}

        // Tracks whether the user is dragging the seek bar
        this._seekingVideo = false
        this._updateLoopId = null
    }

    async init() {
        if (this.isInitialized) return

        // Enumerate devices first
        if (isElectronMode) {
            this.videoDevices = await mainInput.enumerateVideoDevices()
            this.audioDevices = await mainInput.enumerateAudioDevices()
        }

        this._adjustBodyLayout()
        this.panel = this._createPanel()
        document.body.appendChild(this.panel)

        // Set up state change callback
        mainInput.onStateChange = () => this._updateUI()

        this.isInitialized = true
        console.log('Main Input UI initialized')
    }

    _adjustBodyLayout() {
        const width = this.isCollapsed ? '40px' : '240px'
        document.documentElement.style.setProperty('--panel-left-width', width)
    }

    _createPanel() {
        const panel = document.createElement('div')
        panel.className = 'main-input-panel'
        panel.innerHTML = `
            <div class="main-input-header">
                <button class="collapse-btn" id="main-input-collapse-btn" title="Toggle panel">◀</button>
                <h3>Main Input</h3>
            </div>
            <div class="main-input-content">
                <!-- Video Source Section -->
                <div class="input-section">
                    <h4>Video Source</h4>
                    <select id="main-input-video-type" class="source-select">
                        <option value="none">None</option>
                        <option value="video">Video File</option>
                        <option value="webcam">Webcam</option>
                        <option value="screencapture">Screen Capture</option>
                    </select>
                    <div id="video-preview-container" class="video-preview-container" style="display: none;">
                        <canvas id="video-preview-canvas" class="video-preview-canvas"></canvas>
                    </div>
                    <div id="video-controls" class="source-controls"></div>
                    <div id="video-playback" class="video-playback" style="display: none;">
                        <div class="playback-row">
                            <button id="video-play-pause" class="btn btn-small playback-btn">⏸</button>
                            <input type="range" id="video-seek" class="seek-bar" min="0" max="1000" value="0" step="1">
                        </div>
                    </div>
                    <div id="video-status" class="source-status">No video source</div>
                </div>

                <!-- Audio Source Section -->
                <div class="input-section">
                    <h4>Audio Source</h4>
                    <select id="main-input-audio-type" class="source-select">
                        <option value="none">None</option>
                        <option value="audio">Audio File</option>
                        <option value="mic">Mic/Line In</option>
                        <option value="video">Video Audio</option>
                    </select>
                    <div id="audio-controls" class="source-controls"></div>
                    <div id="audio-status" class="source-status">No audio source</div>
                </div>

                <!-- Audio Analyzer Section -->
                <div id="audio-analyzer-section" class="input-section" style="display: none;">
                    <h4>Audio Analyzer</h4>

                    <!-- Histogram Canvas -->
                    <canvas id="main-input-histogram" class="histogram-canvas"></canvas>

                    <!-- Audio Meters -->
                    <div class="meters-section">
                        <div class="meter-row">
                            <span class="meter-label" style="color: #ff6666;">Bass</span>
                            <span id="meter-bass" class="meter-value">0.00</span>
                        </div>
                        <div class="meter-row">
                            <span class="meter-label" style="color: #ff9966;">Bass+</span>
                            <span id="meter-bass-exciter" class="meter-value">0.00</span>
                        </div>
                        <div class="meter-row">
                            <span class="meter-label" style="color: #66ff66;">Mid</span>
                            <span id="meter-mid" class="meter-value">0.00</span>
                        </div>
                        <div class="meter-row">
                            <span class="meter-label" style="color: #6666ff;">High</span>
                            <span id="meter-high" class="meter-value">0.00</span>
                        </div>
                    </div>

                    <!-- Gain Control -->
                    <div class="control-row">
                        <label>Gain</label>
                        <s-number id="main-input-gain" value="1" min="0.1" max="5" step="0.1"></s-number>
                    </div>

                    <!-- EQ Controls (collapsible) -->
                    <details class="eq-details">
                        <summary>Spectrum EQ</summary>
                        <div class="eq-controls">
                            <div class="eq-band">
                                <span class="eq-label" style="color: #ff6666;">Bass</span>
                                <div class="control-row">
                                    <label>Freq</label>
                                    <s-number id="eq-bass-freq" value="${DEFAULT_BAND_CONFIG.bass.freq}" min="20" max="500" step="1" unit="Hz"></s-number>
                                </div>
                                <div class="control-row">
                                    <label>Q</label>
                                    <s-number id="eq-bass-q" value="${DEFAULT_BAND_CONFIG.bass.q}" min="0.5" max="10" step="0.1"></s-number>
                                </div>
                            </div>
                            <div class="eq-band">
                                <span class="eq-label" style="color: #66ff66;">Mid</span>
                                <div class="control-row">
                                    <label>Freq</label>
                                    <s-number id="eq-mid-freq" value="${DEFAULT_BAND_CONFIG.mid.freq}" min="200" max="5000" step="10" unit="Hz"></s-number>
                                </div>
                                <div class="control-row">
                                    <label>Q</label>
                                    <s-number id="eq-mid-q" value="${DEFAULT_BAND_CONFIG.mid.q}" min="0.5" max="10" step="0.1"></s-number>
                                </div>
                            </div>
                            <div class="eq-band">
                                <span class="eq-label" style="color: #6666ff;">High</span>
                                <div class="control-row">
                                    <label>Freq</label>
                                    <s-number id="eq-high-freq" value="${DEFAULT_BAND_CONFIG.high.freq}" min="2000" max="20000" step="100" unit="Hz"></s-number>
                                </div>
                                <div class="control-row">
                                    <label>Q</label>
                                    <s-number id="eq-high-q" value="${DEFAULT_BAND_CONFIG.high.q}" min="0.5" max="10" step="0.1"></s-number>
                                </div>
                            </div>
                        </div>
                    </details>
                </div>
            </div>
        `

        this._cacheElements(panel)
        this._setupEventListeners(panel)
        this._updateVideoControls()
        this._updateAudioControls()

        return panel
    }

    _cacheElements(panel) {
        this.elements = {
            collapseBtn: panel.querySelector('#main-input-collapse-btn'),
            header: panel.querySelector('.main-input-header'),
            content: panel.querySelector('.main-input-content'),
            videoTypeSelect: panel.querySelector('#main-input-video-type'),
            videoControls: panel.querySelector('#video-controls'),
            videoPreviewContainer: panel.querySelector('#video-preview-container'),
            videoPreviewCanvas: panel.querySelector('#video-preview-canvas'),
            videoPlayback: panel.querySelector('#video-playback'),
            videoPlayPause: panel.querySelector('#video-play-pause'),
            videoSeek: panel.querySelector('#video-seek'),
            videoStatus: panel.querySelector('#video-status'),
            audioTypeSelect: panel.querySelector('#main-input-audio-type'),
            audioControls: panel.querySelector('#audio-controls'),
            audioStatus: panel.querySelector('#audio-status'),
            audioAnalyzerSection: panel.querySelector('#audio-analyzer-section'),
            histogramCanvas: panel.querySelector('#main-input-histogram'),
            gainControl: panel.querySelector('#main-input-gain'),
            meterBass: panel.querySelector('#meter-bass'),
            meterBassExciter: panel.querySelector('#meter-bass-exciter'),
            meterMid: panel.querySelector('#meter-mid'),
            meterHigh: panel.querySelector('#meter-high'),
            // EQ controls
            eqBassFreq: panel.querySelector('#eq-bass-freq'),
            eqBassQ: panel.querySelector('#eq-bass-q'),
            eqMidFreq: panel.querySelector('#eq-mid-freq'),
            eqMidQ: panel.querySelector('#eq-mid-q'),
            eqHighFreq: panel.querySelector('#eq-high-freq'),
            eqHighQ: panel.querySelector('#eq-high-q')
        }
    }

    _setupEventListeners(panel) {
        // Collapse/expand toggle
        this.elements.collapseBtn.addEventListener('click', () => {
            this._toggleCollapse()
        })

        // Video source type change
        this.elements.videoTypeSelect.addEventListener('change', async (e) => {
            const type = e.target.value
            this._updateVideoControls()

            if (type === 'none') {
                await mainInput.setVideoSource('none')
            }
            // Other types require user action (button click)
        })

        // Audio source type change
        this.elements.audioTypeSelect.addEventListener('change', async (e) => {
            const type = e.target.value
            this._updateAudioControls()

            if (type === 'none') {
                await mainInput.setAudioSource('none')
            } else if (type === 'video') {
                await mainInput.setAudioSource('video')
            }
            // Other types require user action (button click)
        })

        // Video playback controls
        this.elements.videoPlayPause.addEventListener('click', () => {
            if (!mainInput.videoElement) return
            if (mainInput.videoElement.paused) {
                mainInput.videoElement.play()
            } else {
                mainInput.videoElement.pause()
            }
        })

        this.elements.videoSeek.addEventListener('mousedown', () => { this._seekingVideo = true })
        this.elements.videoSeek.addEventListener('touchstart', () => { this._seekingVideo = true })
        this.elements.videoSeek.addEventListener('input', () => {
            if (!mainInput.videoElement || !mainInput.videoElement.duration) return
            const time = (this.elements.videoSeek.value / 1000) * mainInput.videoElement.duration
            mainInput.videoElement.currentTime = time
        })
        this.elements.videoSeek.addEventListener('mouseup', () => { this._seekingVideo = false })
        this.elements.videoSeek.addEventListener('touchend', () => { this._seekingVideo = false })

        // Gain control
        this.elements.gainControl.addEventListener('input', (e) => {
            mainInput.setGain(parseFloat(e.target.value))
        })

        // EQ controls
        this._setupEQListeners()

        // Start combined update loop (meters + video preview + playback state)
        this._startUpdateLoop()
    }

    _setupEQListeners() {
        const eqControls = [
            ['eqBassFreq', 'bass', 'freq'],
            ['eqBassQ', 'bass', 'q'],
            ['eqMidFreq', 'mid', 'freq'],
            ['eqMidQ', 'mid', 'q'],
            ['eqHighFreq', 'high', 'freq'],
            ['eqHighQ', 'high', 'q']
        ]

        eqControls.forEach(([elementName, band, param]) => {
            const element = this.elements[elementName]
            if (element) {
                element.addEventListener('input', (e) => {
                    const value = parseFloat(e.target.value)
                    const config = {...mainInput.bandConfig}
                    config[band] = {...config[band], [param]: value}
                    mainInput.setBandConfig(config)
                })
            }
        })
    }

    _updateVideoControls() {
        const type = this.elements.videoTypeSelect.value
        let html = ''

        switch (type) {
            case 'none':
                html = ''
                break

            case 'video':
                html = `
                    <div class="button-row">
                        <button class="btn btn-small" id="video-upload-btn">📁 Upload</button>
                        ${isElectronMode ? '<button class="btn btn-small" id="video-assets-btn">📂 Assets</button>' : ''}
                    </div>
                    <input type="file" id="video-file-input" accept="video/*" style="display: none;">
                `
                break

            case 'webcam':
                html = `
                    <button class="btn" id="webcam-start-btn">Start Webcam</button>
                    ${this.videoDevices.length > 0 ? `
                        <select id="webcam-device-select" class="device-select">
                            ${this.videoDevices.map(d => `<option value="${d.deviceId}">${d.label || 'Camera'}</option>`).join('')}
                        </select>
                    ` : ''}
                `
                break

            case 'screencapture':
                html = `
                    <button class="btn" id="screen-start-btn">Start Screen Capture</button>
                `
                break
        }

        this.elements.videoControls.innerHTML = html
        this._attachVideoControlListeners()
    }

    _attachVideoControlListeners() {
        const type = this.elements.videoTypeSelect.value

        if (type === 'video') {
            const uploadBtn = this.panel.querySelector('#video-upload-btn')
            const assetsBtn = this.panel.querySelector('#video-assets-btn')
            const fileInput = this.panel.querySelector('#video-file-input')

            uploadBtn?.addEventListener('click', () => fileInput.click())

            fileInput?.addEventListener('change', async (e) => {
                const file = e.target.files[0]
                if (file) {
                    await mainInput.setVideoSource('video', {file})
                }
            })

            assetsBtn?.addEventListener('click', () => {
                AssetManager.showGlobalAssetManager({
                    nodeType: 'video',
                    onSelect: async (assetPath) => {
                        await mainInput.setVideoSource('video', {assetPath})
                    }
                })
            })
        }

        if (type === 'webcam') {
            const startBtn = this.panel.querySelector('#webcam-start-btn')
            const deviceSelect = this.panel.querySelector('#webcam-device-select')

            startBtn?.addEventListener('click', async () => {
                const deviceId = deviceSelect?.value
                try {
                    await mainInput.setVideoSource('webcam', {deviceId})
                } catch (err) {
                    this.elements.videoStatus.textContent = 'Permission denied'
                }
            })
        }

        if (type === 'screencapture') {
            const startBtn = this.panel.querySelector('#screen-start-btn')

            startBtn?.addEventListener('click', async () => {
                try {
                    await mainInput.setVideoSource('screencapture')
                } catch (err) {
                    this.elements.videoStatus.textContent = 'Capture cancelled'
                }
            })
        }
    }

    _updateAudioControls() {
        const type = this.elements.audioTypeSelect.value
        let html = ''

        switch (type) {
            case 'none':
                html = ''
                break

            case 'audio':
                html = `
                    <div class="button-row">
                        <button class="btn btn-small" id="audio-upload-btn">📁 Upload</button>
                        ${isElectronMode ? '<button class="btn btn-small" id="audio-assets-btn">📂 Assets</button>' : ''}
                    </div>
                    <input type="file" id="audio-file-input" accept="audio/*" style="display: none;">
                    <audio id="main-input-audio-player" controls class="audio-player"></audio>
                `
                break

            case 'mic':
                html = `
                    <button class="btn" id="mic-start-btn">Start Mic/Line</button>
                    ${this.audioDevices.length > 0 ? `
                        <select id="mic-device-select" class="device-select">
                            <option value="default">Default</option>
                            ${this.audioDevices.map(d => `<option value="${d.deviceId}">${d.label || 'Audio Input'}</option>`).join('')}
                        </select>
                    ` : ''}
                `
                break

            case 'video':
                html = `<p class="hint-text">Uses audio from video source</p>`
                break
        }

        this.elements.audioControls.innerHTML = html
        this._attachAudioControlListeners()
    }

    _attachAudioControlListeners() {
        const type = this.elements.audioTypeSelect.value

        if (type === 'audio') {
            const uploadBtn = this.panel.querySelector('#audio-upload-btn')
            const assetsBtn = this.panel.querySelector('#audio-assets-btn')
            const fileInput = this.panel.querySelector('#audio-file-input')
            const audioPlayer = this.panel.querySelector('#main-input-audio-player')

            // Set up sync between UI player and hidden element ONCE.
            // These listeners live on the audioPlayer element which is recreated
            // whenever _updateAudioControls rebuilds the HTML, so no stacking.
            if (audioPlayer) {
                audioPlayer.addEventListener('play', () => {
                    const el = mainInput.getAudioElement()
                    if (el) el.play()
                })
                audioPlayer.addEventListener('pause', () => {
                    const el = mainInput.getAudioElement()
                    if (el) el.pause()
                })
                audioPlayer.addEventListener('seeked', () => {
                    const el = mainInput.getAudioElement()
                    if (el) el.currentTime = audioPlayer.currentTime
                })
            }

            const loadAudioIntoPlayer = () => {
                const audioEl = mainInput.getAudioElement()
                if (audioEl && audioPlayer) {
                    audioPlayer.src = audioEl.src
                }
            }

            uploadBtn?.addEventListener('click', () => fileInput.click())

            fileInput?.addEventListener('change', async (e) => {
                const file = e.target.files[0]
                if (file) {
                    await mainInput.setAudioSource('audio', {file})
                    loadAudioIntoPlayer()
                }
            })

            assetsBtn?.addEventListener('click', () => {
                AssetManager.showGlobalAssetManager({
                    nodeType: 'audio',
                    onSelect: async (assetPath) => {
                        await mainInput.setAudioSource('audio', {assetPath})
                        loadAudioIntoPlayer()
                    }
                })
            })
        }

        if (type === 'mic') {
            const startBtn = this.panel.querySelector('#mic-start-btn')
            const deviceSelect = this.panel.querySelector('#mic-device-select')

            startBtn?.addEventListener('click', async () => {
                const deviceId = deviceSelect?.value
                try {
                    await mainInput.setAudioSource('mic', {deviceId})
                } catch (err) {
                    this.elements.audioStatus.textContent = 'Permission denied'
                }
            })
        }
    }

    _updateUI() {
        // Update video status and preview visibility
        const hasVideo = mainInput.hasVideo()
        this.elements.videoPreviewContainer.style.display = hasVideo ? 'block' : 'none'

        // Show playback controls only for video files (not webcam/screencapture)
        const isVideoFile = mainInput.videoSourceType === 'video'
        this.elements.videoPlayback.style.display = isVideoFile ? 'block' : 'none'

        switch (mainInput.videoSourceType) {
            case 'none':
                this.elements.videoStatus.textContent = 'No video source'
                this.elements.videoStatus.style.color = 'var(--text-muted)'
                break
            case 'video':
                this.elements.videoStatus.textContent = 'Video loaded'
                this.elements.videoStatus.style.color = 'var(--color-number)'
                break
            case 'webcam':
                this.elements.videoStatus.textContent = 'Webcam active'
                this.elements.videoStatus.style.color = 'var(--color-number)'
                break
            case 'screencapture':
                this.elements.videoStatus.textContent = 'Screen sharing'
                this.elements.videoStatus.style.color = 'var(--color-number)'
                break
        }

        // Update audio status
        switch (mainInput.audioSourceType) {
            case 'none':
                this.elements.audioStatus.textContent = 'No audio source'
                this.elements.audioStatus.style.color = 'var(--text-muted)'
                break
            case 'audio':
                this.elements.audioStatus.textContent = 'Audio loaded'
                this.elements.audioStatus.style.color = 'var(--color-number)'
                break
            case 'mic':
                this.elements.audioStatus.textContent = 'Mic active'
                this.elements.audioStatus.style.color = 'var(--color-number)'
                break
            case 'video':
                if (mainInput.hasAudio()) {
                    this.elements.audioStatus.textContent = 'Linked to video'
                    this.elements.audioStatus.style.color = 'var(--color-number)'
                } else {
                    this.elements.audioStatus.textContent = 'No audio in video'
                    this.elements.audioStatus.style.color = 'var(--text-muted)'
                }
                break
        }

        // Show/hide audio analyzer section
        const hasAudio = mainInput.hasAudio()
        this.elements.audioAnalyzerSection.style.display = hasAudio ? 'block' : 'none'

        // Setup histogram canvas when audio becomes active
        if (hasAudio && this.elements.histogramCanvas) {
            setupHistogramCanvas(this.elements.histogramCanvas)
        }

        // Sync dropdown selections with actual state
        this.elements.videoTypeSelect.value = mainInput.videoSourceType
        this.elements.audioTypeSelect.value = mainInput.audioSourceType
    }

    _startUpdateLoop() {
        if (this._updateLoopId) {
            cancelAnimationFrame(this._updateLoopId)
        }

        const update = () => {
            if (!this.isInitialized) return

            // --- Video preview ---
            if (mainInput.hasVideo()) {
                const srcCanvas = mainInput.canvas
                const preview = this.elements.videoPreviewCanvas
                if (srcCanvas && preview && srcCanvas.width > 1) {
                    // Match aspect ratio
                    const aspect = srcCanvas.width / srcCanvas.height
                    const w = preview.parentElement.clientWidth
                    const h = Math.round(w / aspect)
                    if (preview.width !== w || preview.height !== h) {
                        preview.width = w
                        preview.height = h
                    }
                    const ctx = preview.getContext('2d')
                    ctx.drawImage(srcCanvas, 0, 0, w, h)
                }
            }

            // --- Video playback state ---
            if (mainInput.videoSourceType === 'video' && mainInput.videoElement) {
                const vid = mainInput.videoElement
                this.elements.videoPlayPause.textContent = vid.paused ? '▶' : '⏸'

                // Update seek bar unless user is dragging
                if (!this._seekingVideo && vid.duration) {
                    this.elements.videoSeek.value = Math.round((vid.currentTime / vid.duration) * 1000)
                }
            }

            // --- Audio meters ---
            if (mainInput.hasAudio()) {
                const values = mainInput.getAudioValues()
                this.elements.meterBass.textContent = values.bass.toFixed(2)
                this.elements.meterBassExciter.textContent = values.bassExciter.toFixed(2)
                this.elements.meterMid.textContent = values.mid.toFixed(2)
                this.elements.meterHigh.textContent = values.high.toFixed(2)

                // Draw histogram
                if (this.elements.histogramCanvas && mainInput.audioAnalyzer) {
                    drawHistogram(this.elements.histogramCanvas, mainInput.audioAnalyzer)
                }
            }

            this._updateLoopId = requestAnimationFrame(update)
        }

        this._updateLoopId = requestAnimationFrame(update)
    }

    _toggleCollapse() {
        this.isCollapsed = !this.isCollapsed

        if (this.isCollapsed) {
            this.panel.classList.add('collapsed')
            this.elements.collapseBtn.textContent = '▶'
            this.elements.collapseBtn.title = 'Expand panel'
        } else {
            this.panel.classList.remove('collapsed')
            this.elements.collapseBtn.textContent = '◀'
            this.elements.collapseBtn.title = 'Collapse panel'
        }

        this._adjustBodyLayout()
    }

    destroy() {
        mainInput.onStateChange = null

        if (this._updateLoopId) {
            cancelAnimationFrame(this._updateLoopId)
            this._updateLoopId = null
        }

        document.documentElement.style.setProperty('--panel-left-width', '0px')

        if (this.panel && this.panel.parentNode) {
            this.panel.parentNode.removeChild(this.panel)
        }

        this.isInitialized = false
    }
}

// Global instance
export const mainInputUI = new MainInputUI()
