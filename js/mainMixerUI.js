import {mainMixer} from './mainMixer.js'
import {WorkspaceManager} from './workspaceManager.js'
import {SNode} from './snode.js'
import {BackgroundRenderer} from './nodes/_background.js'
import {iconHtml, setIcon} from './icons.js'
import {expandWorkspaceToViewport} from './editor.js'

export class MainMixerUI {
    constructor() {
        this.panel = null
        this.isInitialized = false
        this.isCollapsed = false
    }
    
    init() {
        if (this.isInitialized) return
        
        this._adjustBodyLayout()
        this.panel = this._createPanel()
        document.body.appendChild(this.panel)

        // Refresh channel labels when workspace context changes
        const refreshLabels = () => {
            this.updateChannelStatus('A', mainMixer.channelA)
            this.updateChannelStatus('B', mainMixer.channelB)
        }
        document.addEventListener('workspace-switched', refreshLabels)
        document.addEventListener('workspace-visibility-changed', refreshLabels)

        this.isInitialized = true
    }
    
    _adjustBodyLayout() {
        const width = this.isCollapsed ? '31px' : '320px'
        document.documentElement.style.setProperty('--panel-right-width', width)
    }
    
    _createPanel() {
        const panel = document.createElement('div')
        panel.className = 'main-mixer-panel'
        panel.innerHTML = `
            <div class="mixer-header">
                <div class="header-spacer"></div>
                <h3>Main Mixer</h3>
                <button class="collapse-btn" id="mixer-collapse-btn" title="Collapse panel">${iconHtml('chevron-right', 14)}</button>
            </div>
            <div class="panel-collapsed-label" id="mixer-collapsed-label">Main Mixer</div>
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
                <div class="projection-section">
                    <div class="projection-header">
                        <h4>Projection</h4>
                        <button class="projection-info-btn" id="projection-info-btn" title="About projection">${iconHtml('circle-help', 14)}</button>
                    </div>
                    <div class="projection-info" id="projection-info" style="display: none;">
                        <p>The projector opens a separate browser window that displays the final mixed output fullscreen. Place it on a second monitor or projector display.</p>
                        <p>Resolution controls the render size of the mix canvas. Match Viewport tracks the editor area; fixed presets let you target specific displays.</p>
                        <p>The projector streams directly from the mix canvas — no re-encoding, minimal latency.</p>
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
                    <div class="background-controls">
                        <label>
                            <input type="checkbox" checked id="bg-toggle"> Project to Background
                        </label>
                    </div>
                    <div class="projector-controls">
                        <button class="projector-btn" id="projector-open-btn">
                            <span class="projector-status-dot" id="projector-status-dot"></span>
                            Open Projector
                        </button>
                    </div>
                </div>
            </div>
        `
        
        this._setupEventListeners(panel)
        return panel
    }
    
    _setupEventListeners(panel) {
        // Collapse/expand toggle
        const collapseBtn = panel.querySelector('#mixer-collapse-btn')
        collapseBtn.addEventListener('click', () => {
            this._toggleCollapse()
        })

        const collapsedLabel = panel.querySelector('#mixer-collapsed-label')
        collapsedLabel.addEventListener('click', () => {
            this._toggleCollapse()
        })

        const mixSlider = panel.querySelector('#mix-slider')

        mixSlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value)
            mainMixer.setMixValue(value)
        })
        
        const resolutionSelect = panel.querySelector('#resolution-select')
        resolutionSelect.addEventListener('change', (e) => {
            if (e.target.value === 'viewport') {
                mainMixer.setViewportResolution()
            } else {
                mainMixer.setResolution(e.target.value)
            }
        })
        
        // Initialize with viewport resolution
        mainMixer.setViewportResolution()
        
        const bgToggle = panel.querySelector('#bg-toggle')
        bgToggle.addEventListener('change', (e) => {
            mainMixer.setBackgroundVisible(e.target.checked)
        })
        
        const crossfadeSelect = panel.querySelector('#crossfade-select')
        crossfadeSelect.addEventListener('change', (e) => {
            mainMixer.setCrossfadeMethod(parseInt(e.target.value))
        })

        // Projector controls
        const projectorBtn = panel.querySelector('#projector-open-btn')
        projectorBtn.addEventListener('click', () => {
            BackgroundRenderer.openProjector()
        })

        // Info toggle
        const infoBtn = panel.querySelector('#projection-info-btn')
        const infoPanel = panel.querySelector('#projection-info')
        infoBtn.addEventListener('click', () => {
            const visible = infoPanel.style.display !== 'none'
            infoPanel.style.display = visible ? 'none' : 'block'
            infoBtn.classList.toggle('active', !visible)
        })

        // Poll projector status
        this._projectorInterval = setInterval(() => {
            this._updateProjectorStatus()
        }, 1000)
    }

    _updateProjectorStatus() {
        if (!this.panel) return
        const dot = this.panel.querySelector('#projector-status-dot')
        const btn = this.panel.querySelector('#projector-open-btn')
        if (!dot || !btn) return

        // Check if projector window is open by trying to access BackgroundRenderer internals
        // We peek at the module-level variable via the openProjector behavior
        const isOpen = this._isProjectorOpen()
        dot.classList.toggle('connected', isOpen)
        btn.title = isOpen ? 'Projector window is open — click to focus' : 'Open a projector window'
    }

    _isProjectorOpen() {
        // BackgroundRenderer.openProjector checks/focuses if already open,
        // so we can detect state by checking if the projector window ref exists
        try {
            // The projector window variable is module-scoped in _background.js
            // We expose a status check via a lightweight probe
            return BackgroundRenderer._projectorWindow && !BackgroundRenderer._projectorWindow.closed
        } catch { return false }
    }
    
    updateChannelStatus(channel, node) {
        if (!this.panel) return

        const channelLower = channel.toLowerCase()
        const statusElement = this.panel.querySelector(`#status-${channelLower}`)
        const previewElement = this.panel.querySelector(`#preview-${channelLower}`)

        if (statusElement && previewElement) {
            if (node) {
                // Derive workspace ID from the node's current visibility
                const wsId = node.workspaceVisibility?.values().next().value ?? null
                this._updateStatusLabel(statusElement, wsId)

                // Only rebuild preview if the node actually changed
                if (previewElement._currentNode !== node) {
                    this._updateChannelPreview(previewElement, node)
                    previewElement._currentNode = node
                }
            } else {
                // Clear assignment
                statusElement.textContent = 'No Assignment'
                statusElement.style.color = '#6b7280'
                statusElement.classList.remove('clickable')
                statusElement.onclick = null

                this._clearChannelPreview(previewElement)
                previewElement._currentNode = null
            }
        }
    }

    _updateStatusLabel(statusElement, wsId) {
        const ws = wsId != null ? WorkspaceManager.workspaces.get(wsId) : null
        const displayName = ws ? ws.name : 'Workspace'
        statusElement.textContent = displayName
        statusElement.style.color = '#10b981'
        statusElement.title = ws ? `Switch to ${displayName}` : ''

        if (ws) {
            statusElement.classList.add('clickable')
            statusElement.onclick = () => {
                if (WorkspaceManager.activeWorkspaceId === wsId) return
                WorkspaceManager.setActive(wsId)
                SNode.updateVisibility()
                document.dispatchEvent(new CustomEvent('workspace-switched'))
                window.markDirty()
            }
        } else {
            statusElement.classList.remove('clickable')
            statusElement.onclick = null
        }
    }
    
    _stopPreviewStream(previewElement) {
        const video = previewElement.querySelector('video')
        if (video) {
            if (video._previewStream) {
                video._previewStream.getTracks().forEach(track => track.stop())
                video._previewStream = null
            }
            video.srcObject = null
        }
    }

    _updateChannelPreview(previewElement, node) {
        // Stop existing stream before clearing to prevent leak
        this._stopPreviewStream(previewElement)
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
        }
    }

    _clearChannelPreview(previewElement) {
        this._stopPreviewStream(previewElement)
        previewElement.innerHTML = ''
    }

    _toggleCollapse() {
        this.isCollapsed = !this.isCollapsed

        const collapseBtn = this.panel.querySelector('#mixer-collapse-btn')

        if (this.isCollapsed) {
            this.panel.classList.add('collapsed')
            setIcon(collapseBtn, 'chevron-left', 14)
            collapseBtn.title = 'Expand panel'
        } else {
            this.panel.classList.remove('collapsed')
            setIcon(collapseBtn, 'chevron-right', 14)
            collapseBtn.title = 'Collapse panel'
        }

        this._adjustBodyLayout()
        expandWorkspaceToViewport()
        window.dispatchEvent(new Event('resize'))
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
            const placeholder = document.createElement('span')
            placeholder.textContent = 'Preview Unavailable'
            previewVideo.replaceWith(placeholder)
        }
    }
    
    destroy() {
        if (this._projectorInterval) {
            clearInterval(this._projectorInterval)
            this._projectorInterval = null
        }
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
        
        document.documentElement.style.setProperty('--panel-right-width', '0px')
        if (this.panel && this.panel.parentNode) {
            this.panel.parentNode.removeChild(this.panel)
        }
        this.isInitialized = false
    }
}

// Global instance
export const mainMixerUI = new MainMixerUI()