import {masterMixer} from './masterMixer.js'

export class MasterMixerUI {
    constructor() {
        this.panel = null
        this.isInitialized = false
    }
    
    init() {
        if (this.isInitialized) return
        
        this._adjustBodyLayout()
        this.panel = this._createPanel()
        document.body.appendChild(this.panel)
        this.isInitialized = true
        console.log('Master Mixer UI initialized')
    }
    
    _adjustBodyLayout() {
        // Reserve space for mixer panel so editor doesn't overlap
        document.body.style.marginRight = '320px'
    }
    
    _createPanel() {
        const panel = document.createElement('div')
        panel.className = 'master-mixer-panel'
        panel.innerHTML = `
            <div class="mixer-header">
                <h3>Master Mixer</h3>
            </div>
            <div class="mixer-content">
                <div class="channel-section">
                    <h4>Channel A</h4>
                    <div class="channel-preview" id="preview-a"></div>
                    <div class="channel-status" id="status-a">No Assignment</div>
                </div>
                <div class="channel-section">
                    <h4>Channel B</h4>
                    <div class="channel-preview" id="preview-b"></div>
                    <div class="channel-status" id="status-b">No Assignment</div>
                </div>
                <div class="mix-controls">
                    <label>Mix</label>
                    <div class="mix-slider-container">
                        <span>A</span>
                        <s-number value="0" min="0" max="1" step="0.01" id="mix-slider"></s-number>
                        <span>B</span>
                    </div>
                </div>
                <div class="resolution-controls">
                    <label>Resolution</label>
                    <select id="resolution-select">
                        <option value="viewport" selected>Match Viewport</option>
                        <option value="1280x720">16:9 (1280x720)</option>
                        <option value="1920x1080">16:9 (1920x1080)</option>
                        <option value="3440x1440">21:9 (3440x1440)</option>
                        <option value="1024x768">4:3 (1024x768)</option>
                        <option value="1080x1080">1:1 (1080x1080)</option>
                        <option value="720x1280">9:16 (720x1280)</option>
                        <option value="1080x1920">9:16 (1080x1920)</option>
                    </select>
                </div>
                <div class="crossfade-controls">
                    <label>Crossfade Method</label>
                    <div class="crossfade-select-container">
                        <select id="crossfade-select">
                            <option value="0" selected>Simple Mix</option>
                            <option value="1">Horizontal Wipe</option>
                            <option value="2">Vertical Wipe</option>
                            <option value="3">Radial Wipe</option>
                            <option value="4">Dark Fade First</option>
                            <option value="5">Light Fade First</option>
                            <option value="6">Checkerboard</option>
                            <option value="7">Horizontal Lines</option>
                        </select>
                    </div>
                </div>
                <div class="background-controls">
                    <label>
                        <input type="checkbox" checked id="bg-toggle"> Background Visible
                    </label>
                </div>
            </div>
        `
        
        this._setupEventListeners(panel)
        return panel
    }
    
    _setupEventListeners(panel) {
        const mixSlider = panel.querySelector('#mix-slider')
        
        mixSlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value)
            masterMixer.setMixValue(value)
        })
        
        const resolutionSelect = panel.querySelector('#resolution-select')
        resolutionSelect.addEventListener('change', (e) => {
            if (e.target.value === 'viewport') {
                masterMixer.setViewportResolution()
            } else {
                masterMixer.setResolution(e.target.value)
            }
        })
        
        // Initialize with viewport resolution
        masterMixer.setViewportResolution()
        
        const bgToggle = panel.querySelector('#bg-toggle')
        bgToggle.addEventListener('change', (e) => {
            masterMixer.setBackgroundVisible(e.target.checked)
        })
        
        const crossfadeSelect = panel.querySelector('#crossfade-select')
        crossfadeSelect.addEventListener('change', (e) => {
            masterMixer.setCrossfadeMethod(parseInt(e.target.value))
        })
    }
    
    updateChannelStatus(channel, node) {
        if (!this.panel) return

        const channelLower = channel.toLowerCase()
        const statusElement = this.panel.querySelector(`#status-${channelLower}`)
        const previewElement = this.panel.querySelector(`#preview-${channelLower}`)

        if (statusElement && previewElement) {
            if (node) {
                // Update status - show workspace number
                const displayName = `Workspace ${node.workspace}`
                statusElement.textContent = displayName
                statusElement.style.color = '#10b981' // Green for assigned

                // Create or update preview canvas
                this._updateChannelPreview(previewElement, node)
            } else {
                // Clear assignment
                statusElement.textContent = 'No Assignment'
                statusElement.style.color = '#6b7280' // Gray for unassigned

                // Clear preview
                this._clearChannelPreview(previewElement)
            }
        }
    }
    
    _updateChannelPreview(previewElement, node) {
        // Clear existing content
        previewElement.innerHTML = ''

        // Only create preview if node is active (has compiled shader rendering)
        if (node && node.elements && node.elements.canvas && node.runtimeState?.isActive) {
            // Create a video element for stream preview
            const previewVideo = document.createElement('video')
            previewVideo.style.width = '100%'
            previewVideo.style.height = '100%'
            previewVideo.style.objectFit = 'cover'
            previewVideo.muted = true
            previewVideo.autoplay = true
            previewVideo.playsInline = true
            
            previewElement.appendChild(previewVideo)
            
            // Start video stream preview
            this._startVideoPreview(previewVideo, node.elements.canvas)
        } else {
            previewElement.innerHTML = ''
        }
    }
    
    _clearChannelPreview(previewElement) {
        previewElement.innerHTML = ''
    }
    
    _startVideoPreview(previewVideo, sourceCanvas) {
        try {
            // Capture stream directly from source canvas (GPU-accelerated)
            const stream = sourceCanvas.captureStream(30) // 30fps stream
            previewVideo.srcObject = stream
            previewVideo.play().catch(e => {
                console.warn('Preview video play failed:', e)
            })
            
            // Store stream reference for cleanup
            previewVideo._previewStream = stream
            
        } catch (error) {
            console.warn('Failed to create preview stream:', error)
            // Fallback to placeholder on capture failure
            previewVideo.innerHTML = '<span>Preview Unavailable</span>'
        }
    }
    
    destroy() {
        // Clean up preview video streams
        if (this.panel) {
            const previewVideos = this.panel.querySelectorAll('.channel-preview video')
            previewVideos.forEach(video => {
                if (video._previewStream) {
                    video._previewStream.getTracks().forEach(track => track.stop())
                }
                video.srcObject = null
            })
        }
        
        // Restore body layout when destroying mixer
        document.body.style.marginRight = '0'
        if (this.panel && this.panel.parentNode) {
            this.panel.parentNode.removeChild(this.panel)
        }
        this.isInitialized = false
    }
}

// Global instance
export const masterMixerUI = new MasterMixerUI()