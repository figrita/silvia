import {registerNode} from '../registry.js'
import {Connection} from '../connections.js'
import {SNode} from '../snode.js'
import {autowire, formatFloatGLSL, StringToFragment} from '../utils.js'
import {AudioAnalyzer} from '../audioAnalyzer.js'
import {createAudioMetersUI, updateMeterAndCheckThreshold, DEFAULT_THRESHOLDS, DEFAULT_THRESHOLD_STATE, THRESHOLD_ACTION_OUTPUTS} from '../audioThresholds.js'
import {AssetManager} from '../assetManager.js'

registerNode({
    slug: 'video',
    icon: '📼',
    label: 'Video',
    tooltip: 'Loads video files with playback controls. Includes audio analysis outputs (bass, mid, high) and speed control. Supports common video formats.',
    elements: {
        video: null,
        canvas: null,
        playbackControls: null,
        speedControl: null,
        meters: {},
        thresholdSliders: {},
        meterContainer: null
    },
    fileSelectors: {
        input: null
    },
    runtimeState: {
        aspect: 1.0,
        analyzer: null,
        renderLoop: null,
        uiUpdateFrameId: null,
        thresholdState: DEFAULT_THRESHOLD_STATE,
        currentAssetPath: null, // Track current asset for cleanup
        canvasHasData: false // Track if canvas has been drawn to at least once
    },
    values: {
        playbackRate: 1.0,
        thresholds: DEFAULT_THRESHOLDS,
        debounceMs: 100,
        assetPath: null // Persistent asset reference for serialization (Electron only)
    },

    input: {
        'play': {
            label: 'Play',
            type: 'action',
            control: {},
            downCallback(){ this.elements.video?.play().catch(e => console.warn('Video play interrupted:', e)) }
        },
        'pause': {
            label: 'Pause',
            type: 'action',
            control: {},
            downCallback(){ this.elements.video?.pause() }
        },
        'stop': {
            label: 'Stop',
            type: 'action',
            control: {},
            downCallback(){
                if(this.elements.video){
                    this.elements.video.pause()
                    this.elements.video.currentTime = 0
                }
            }
        },
        'randomizeTime': {
            label: 'Random Time',
            type: 'action',
            control: {},
            callback(){
                if(this.elements.video && this.elements.video.duration > 0){
                    this.elements.video.currentTime = Math.random() * this.elements.video.duration
                }
            }
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName, uniformName){
                return `vec4 ${funcName}(vec2 uv) {
    float aspect = ${formatFloatGLSL(this.runtimeState.aspect)};
    uv.x = (uv.x / aspect + 1.0) * 0.5;  // [-imageAspectRatio, imageAspectRatio] -> [0,1]
    uv.y = (uv.y + 1.0) * 0.5;                     // [-1, 1] -> [0,1]
    return texture(${uniformName}, vec2(uv.x, 1.0 - uv.y));
}`
            },
            textureUniformUpdate(uniformName, gl, program, textureUnit, textureMap){
                if(this.isDestroyed){return}

                let texture = textureMap.get(this)
                if(!texture){
                    texture = gl.createTexture()
                    textureMap.set(this, texture)
                    gl.bindTexture(gl.TEXTURE_2D, texture)
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT)
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT)
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
                }

                gl.activeTexture(gl.TEXTURE0 + textureUnit)
                gl.bindTexture(gl.TEXTURE_2D, texture)

                const {canvas} = this.elements
                // Security: Only upload canvas if it has been drawn to at least once
                // This prevents reading uninitialized canvas memory which causes security errors
                if(canvas && canvas.width > 0 && canvas.height > 0 && this.runtimeState.canvasHasData){
                    // Use the actual canvas with verified video data
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas)
                } else {
                    // Create a 1x1 black texture as fallback
                    const blackPixel = new Uint8Array([0, 0, 0, 255]) // Black with full alpha
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, blackPixel)
                }

                const location = gl.getUniformLocation(program, uniformName)
                gl.uniform1i(location, textureUnit)
            }
        },
        'bass': {
            label: 'Bass',
            type: 'float',
            range: '[0, 1]',
            genCode(cc, funcName, uniformName){ return `float ${funcName}(vec2 uv) { return ${uniformName}; }` },
            floatUniformUpdate(uniformName, gl, program){
                if(this.isDestroyed || !this.runtimeState.analyzer){return}
                const location = gl.getUniformLocation(program, uniformName)
                gl.uniform1f(location, this.runtimeState.analyzer.audioValues.bass)
            }
        },
        'bassExciter': {
            label: 'Bass+',
            type: 'float',
            range: '[0, 1]',
            genCode(cc, funcName, uniformName){ return `float ${funcName}(vec2 uv) { return ${uniformName}; }` },
            floatUniformUpdate(uniformName, gl, program){
                if(this.isDestroyed || !this.runtimeState.analyzer){return}
                const location = gl.getUniformLocation(program, uniformName)
                gl.uniform1f(location, this.runtimeState.analyzer.audioValues.bassExciter)
            }
        },
        'mid': {
            label: 'Mid',
            type: 'float',
            range: '[0, 1]',
            genCode(cc, funcName, uniformName){ return `float ${funcName}(vec2 uv) { return ${uniformName}; }` },
            floatUniformUpdate(uniformName, gl, program){
                if(this.isDestroyed || !this.runtimeState.analyzer){return}
                const location = gl.getUniformLocation(program, uniformName)
                gl.uniform1f(location, this.runtimeState.analyzer.audioValues.mid)
            }
        },
        'high': {
            label: 'High',
            type: 'float',
            range: '[0, 1]',
            genCode(cc, funcName, uniformName){ return `float ${funcName}(vec2 uv) { return ${uniformName}; }` },
            floatUniformUpdate(uniformName, gl, program){
                if(this.isDestroyed || !this.runtimeState.analyzer){return}
                const location = gl.getUniformLocation(program, uniformName)
                gl.uniform1f(location, this.runtimeState.analyzer.audioValues.high)
            }
        },
        'oscilloscope': {
            label: 'Oscilloscope',
            type: 'color',
            genCode(cc, funcName, uniformName){
                return `vec4 ${funcName}(vec2 uv) {
    // Square aspect ratio, centered
    vec2 coord = uv;

    // Transparent background
    vec4 color = vec4(0.0, 0.0, 0.0, 0.0);

    // Sample the waveform at current x position using full resolution
    float x = (coord.x + 1.0) * 0.5; // [-1,1] to [0,1]

    float sampleIndex = x * 1024.0; // Use full 1024 samples across width
    int idx = int(sampleIndex);

    // Get waveform value and normalize from [0,255] to [-1,1]
    float waveValue = (texture(${uniformName}, vec2(float(idx) / 1024.0, 0.5)).r - 0.5) * 2.0;

    // Draw waveform line - taller, using 95% of height
    float lineY = waveValue * 0.95; // Scale to 95% of height for taller waveform
    float distance = abs(coord.y - lineY);
    float lineThickness = 0.02;

    if (distance < lineThickness) {
        color = vec4(1.0, 1.0, 1.0, 1.0); // White line
    }

    return color;
}`
            },
            textureUniformUpdate(uniformName, gl, program, textureUnit, textureMap){
                if(this.isDestroyed || !this.runtimeState.analyzer){return}

                let texture = textureMap.get(this.output.oscilloscope)
                if(!texture){
                    texture = gl.createTexture()
                    textureMap.set(this.output.oscilloscope, texture)
                    gl.bindTexture(gl.TEXTURE_2D, texture)
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT)
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT)
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
                }

                gl.activeTexture(gl.TEXTURE0 + textureUnit)
                gl.bindTexture(gl.TEXTURE_2D, texture)

                // Upload waveform data as a 1D texture (1024x1)
                const waveformData = this.runtimeState.analyzer.waveformData
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1024, 1, 0, gl.RED, gl.UNSIGNED_BYTE, waveformData)

                const location = gl.getUniformLocation(program, uniformName)
                gl.uniform1i(location, textureUnit)
            }
        },
        ...THRESHOLD_ACTION_OUTPUTS
    },

    onCreate(){
        if(!this.customArea){return}

        // Create drop zone container
        const dropZone = document.createElement('div')
        dropZone.className = 'drop-zone'
        dropZone.style.cssText = `
            border: 2px dashed var(--color-border);
            border-radius: 8px;
            min-height: 120px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            cursor: pointer;
            transition: opacity 0.3s ease;
            margin: 8px;
            position: relative;
            overflow: hidden;
        `
        
        // Create placeholder text
        const placeholder = document.createElement('div')
        placeholder.className = 'drop-zone-placeholder'
        placeholder.style.cssText = `
            color: var(--color-text-secondary);
            font-size: 14px;
            text-align: center;
            padding: 20px;
            pointer-events: none;
        `
        placeholder.innerHTML = `
            <div style="font-size: 24px; margin-bottom: 8px;">📼</div>
            <div>Drop video here</div>
            <div style="font-size: 12px; opacity: 0.7; margin-top: 4px;">or click to browse</div>
        `

        // Hidden file input (web mode only, Electron uses native dialog)
        this.fileSelectors.input = document.createElement('input')
        this.fileSelectors.input.type = 'file'
        this.fileSelectors.input.accept = 'video/*'
        this.fileSelectors.input.style.display = 'none'

        // Video element
        this.elements.video = document.createElement('video')
        this.elements.video.style.cssText = `
            width: 100%;
            max-width: 320px;
            max-height:200px;
            display: none;
            border-radius: 4px;
        `
        this.elements.video.controls = true
        this.elements.video.loop = true
        this.elements.video.autoplay = true
        this.elements.video.muted = true // Autoplay often requires mute
        this.elements.video.playsInline = true

        // Canvas element for handling video rotation metadata
        this.elements.canvas = document.createElement('canvas')
        this.elements.canvas.style.display = 'none'
        
        // Store references
        this.elements.dropZone = dropZone
        this.elements.placeholder = placeholder

        // --- Create Custom Playback Controls ---
        const controlsHtml = `
            <div data-el="playbackControls" style="display: none; padding: 0.5rem; flex-direction: column; gap: 0.5rem; border-top: 1px solid #444; margin-top: 0.5rem;">
                <div style="display:flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
                    <label style="font-size:0.9rem; color:#ccc;">Speed</label>
                    <s-number value="${this.values.playbackRate}" default="${this.defaults.playbackRate}" min="0.1" max="4.0" step="0.05" data-el="speedControl"></s-number>
                </div>
            </div>
        `
        const controlsFragment = StringToFragment(controlsHtml)
        Object.assign(this.elements, autowire(controlsFragment))

        // Create control buttons container
        const buttonContainer = document.createElement('div')
        buttonContainer.style.cssText = `
            position: absolute;
            top: 8px;
            right: 8px;
            display: ${isElectronMode ? 'flex' : 'none'};
            flex-direction: column;
            gap: 4px;
            z-index: 10;
            opacity: 0;
            transition: opacity 0.2s ease;
        `

        // Create replace button (shown when video is loaded)
        const replaceBtn = document.createElement('button')
        replaceBtn.className = 'replace-media-btn'
        replaceBtn.style.cssText = `
            padding: 4px 8px;
            background: var(--bg-interactive);
            border: 1px solid var(--border-normal);
            border-radius: 4px;
            color: var(--text-secondary);
            font-size: 11px;
            cursor: pointer;
            font-family: monospace;
        `
        replaceBtn.textContent = isElectronMode ? '📁 Upload' : '↻ Replace'
        replaceBtn.onclick = (e) => {
            e.stopPropagation()
            this.fileSelectors.input.click()
        }
        replaceBtn.addEventListener('mouseenter', () => {
            replaceBtn.style.background = 'var(--bg-hover)'
            replaceBtn.style.borderColor = 'var(--primary-muted)'
        })
        replaceBtn.addEventListener('mouseleave', () => {
            replaceBtn.style.background = 'var(--bg-interactive)'
            replaceBtn.style.borderColor = 'var(--border-normal)'
        })

        // Create asset browser button (Electron only)
        const assetBrowserBtn = document.createElement('button')
        assetBrowserBtn.className = 'asset-browser-btn'
        assetBrowserBtn.style.cssText = `
            padding: 4px 8px;
            background: var(--bg-interactive);
            border: 1px solid var(--border-normal);
            border-radius: 4px;
            color: var(--text-secondary);
            font-size: 11px;
            cursor: pointer;
            font-family: monospace;
            display: ${isElectronMode ? 'block' : 'none'};
        `
        assetBrowserBtn.textContent = '📂 Assets'
        assetBrowserBtn.onclick = async (e) => {
            e.stopPropagation()
            AssetManager.showGlobalAssetManager({
                nodeType: 'video',
                onSelect: (assetPath, assetInfo) => {
                    console.log('Selected video asset:', assetPath, assetInfo)
                    this.values.assetPath = assetPath // Asset browser is Electron-only
                    this._loadFromAssetPath(assetPath)
                }
            })
        }
        assetBrowserBtn.addEventListener('mouseenter', () => {
            assetBrowserBtn.style.background = 'var(--bg-hover)'
            assetBrowserBtn.style.borderColor = 'var(--primary-muted)'
        })
        assetBrowserBtn.addEventListener('mouseleave', () => {
            assetBrowserBtn.style.background = 'var(--bg-interactive)'
            assetBrowserBtn.style.borderColor = 'var(--border-normal)'
        })

        buttonContainer.appendChild(replaceBtn)
        buttonContainer.appendChild(assetBrowserBtn)
        
        this.elements.buttonContainer = buttonContainer
        this.elements.replaceBtn = replaceBtn
        this.elements.assetBrowserBtn = assetBrowserBtn
        
        // --- Add Event Listeners ---
        
        // Click to open file dialog (only when no video is loaded)
        dropZone.addEventListener('click', () => {
            if(this.elements.video.style.display === 'none'){
                this.fileSelectors.input.click()
            }
        })

        // Hover functionality for buttons
        dropZone.addEventListener('mouseenter', () => {
            buttonContainer.style.opacity = '1'
        })
        dropZone.addEventListener('mouseleave', () => {
            buttonContainer.style.opacity = '0'
        })
        
        // Drag and drop events
        dropZone.addEventListener('dragenter', (e) => {
            e.preventDefault()
            e.stopPropagation()
            dropZone.style.background = 'rgba(255, 255, 255, 0.05)'
            dropZone.style.borderColor = 'var(--color-accent)'
        })
        
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault()
            e.stopPropagation()
        })
        
        dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault()
            e.stopPropagation()
            dropZone.style.background = ''
            dropZone.style.borderColor = 'var(--color-border)'
        })
        
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault()
            e.stopPropagation()
            dropZone.style.background = ''
            dropZone.style.borderColor = 'var(--color-border)'
            
            const files = e.dataTransfer.files
            if(files.length > 0 && files[0].type.startsWith('video/')){
                this._handleVideoFile(files[0])
            }
        })
        
        // File input change
        this.fileSelectors.input.addEventListener('change', (e) => {
            if(e.target.files.length > 0){
                this._handleVideoFile(e.target.files[0])
            }
        })

        // Use 'input' event for live updates (including MIDI)
        this.elements.speedControl.addEventListener('input', (e) => {
            const newRate = parseFloat(e.target.value)
            this.values.playbackRate = newRate
            this.elements.video.playbackRate = newRate
            this.runtimeState.analyzer?.setPlaybackRate(newRate)
        })

        // --- Append elements to DOM ---
        dropZone.appendChild(placeholder)
        dropZone.appendChild(this.elements.video)
        dropZone.appendChild(buttonContainer)
        this.customArea.appendChild(dropZone)
        this.customArea.appendChild(controlsFragment)
        this.customArea.appendChild(this.fileSelectors.input)
        
        // Create meters immediately to avoid node resizing later - Video shows numbers only by default
        createAudioMetersUI(this, false, {numbers: true, events: false})

        // Load asset if one is already set in values (Electron only)
        if (this.values.assetPath && isElectronMode) {
            this._loadFromAssetPath(this.values.assetPath)
        }
    },
    
    async _handleVideoFilePath(filePath){
        // Cleanup previous state and mark canvas as invalid immediately
        this.runtimeState.canvasHasData = false
        this.runtimeState.analyzer?.close()
        if(this.elements.video.src && this.runtimeState.currentAssetPath && !this.runtimeState.currentAssetPath.startsWith('asset://')){
            URL.revokeObjectURL(this.elements.video.src)
        }

        try {
            console.log(`Copying video from path (no size limit): ${filePath}`)

            // Generate thumbnail using AssetManager
            let thumbnailData = null
            try {
                thumbnailData = await AssetManager.generateVideoThumbnail(filePath)
            } catch (error) {
                console.warn('Failed to generate thumbnail:', error)
                // Continue without thumbnail
            }

            const assetPath = await window.electronAPI.copyAssetFromPath(filePath, 'video', thumbnailData)
            this.values.assetPath = assetPath
            this.runtimeState.currentAssetPath = assetPath

            console.log(`Video file handled, calling _loadFromAssetPath with: ${assetPath}`)
            await this._loadFromAssetPath(assetPath)
            console.log(`Video asset stored: ${assetPath}`)
        } catch (error) {
            console.error('Failed to handle video file path:', error)
            alert(`Failed to load video: ${error.message}`)
        }
    },

    async _handleVideoFile(file){
        if(!file || !file.type.startsWith('video/')) return

        // Cleanup previous state and mark canvas as invalid immediately
        this.runtimeState.canvasHasData = false
        this.runtimeState.analyzer?.close()
        if(this.elements.video.src && this.runtimeState.currentAssetPath && !this.runtimeState.currentAssetPath.startsWith('asset://')){
            URL.revokeObjectURL(this.elements.video.src)
        }

        // Web mode: Use blob URL directly (faster, no size limit, no persistence anyway)
        if (!isElectronMode) {
            this._loadVideoFromBlob(file)
            return
        }

        // Electron mode: Use file path to copy to assets
        const filePath = window.electronAPI.getFilePathFromFile(file)
        if (filePath) {
            // Use the existing path handler which copies to assets
            await this._handleVideoFilePath(filePath)
        } else {
            console.error('No file path available in Electron mode')
            this._loadVideoFromBlob(file)
        }
    },

    async _loadFromAssetPath(assetPath) {
        try {
            console.log(`Video node loading from asset path: ${assetPath}`)
            const resolvedPath = await AssetManager.loadAsset(assetPath)
            console.log(`Video node resolved path: ${resolvedPath}`)
            if (!resolvedPath) {
                console.error('Failed to resolve asset path:', assetPath)
                return
            }

            this.runtimeState.currentAssetPath = assetPath
            this.runtimeState.canvasHasData = false // Reset flag when loading new video
            await this._loadVideoFromPath(resolvedPath)
        } catch (error) {
            console.error('Failed to load video asset:', error)
        }
    },

    async _loadVideoFromPath(videoPath) {
        console.log(`Video node setting video.src to: ${videoPath}`)
        return new Promise((resolve, reject) => {
            this.elements.video.onloadedmetadata = () => {
                this.runtimeState.aspect = this.elements.video.videoWidth / this.elements.video.videoHeight
                this.elements.video.playbackRate = this.values.playbackRate // Apply saved speed
                
                // Set up canvas with video dimensions
                this.elements.canvas.width = this.elements.video.videoWidth
                this.elements.canvas.height = this.elements.video.videoHeight
                
                // Start canvas rendering loop
                this._startCanvasRenderLoop()
                
                this.runtimeState.analyzer = new AudioAnalyzer()
                this.runtimeState.analyzer.initFromFile(this.elements.video)
                this.elements.video.style.display = 'block'
                this.elements.placeholder.style.display = 'none'
                this.elements.buttonContainer.style.display = 'flex'
                this.elements.playbackControls.style.display = 'flex'
                
                // Start UI update loop (meters already created)
                this._startUiUpdateLoop()
                
                this.updatePortPoints()
                Connection.redrawAllConnections()
                SNode.refreshDownstreamOutputs(this)
                
                resolve()
            }

            this.elements.video.onerror = (error) => {
                console.error('Failed to load video from path:', videoPath, error)
                console.error('Video error details:', this.elements.video.error)
                reject(new Error('Video load failed'))
            }

            this.elements.video.src = videoPath
            this.elements.video.play()
        })
    },

    _loadVideoFromBlob(file) {
        // Fallback method using blob URL
        this.runtimeState.canvasHasData = false // Reset flag for new video
        const url = URL.createObjectURL(file)
        this.elements.video.src = url
        this.runtimeState.currentAssetPath = url

        this.elements.video.onloadedmetadata = () => {
            this.runtimeState.aspect = this.elements.video.videoWidth / this.elements.video.videoHeight
            this.elements.video.playbackRate = this.values.playbackRate

            this.elements.canvas.width = this.elements.video.videoWidth
            this.elements.canvas.height = this.elements.video.videoHeight

            this._startCanvasRenderLoop()

            this.runtimeState.analyzer = new AudioAnalyzer()
            this.runtimeState.analyzer.initFromFile(this.elements.video)
            this.elements.video.style.display = 'block'
            this.elements.placeholder.style.display = 'none'
            this.elements.buttonContainer.style.display = 'flex'
            this.elements.playbackControls.style.display = 'flex'

            this._startUiUpdateLoop()

            this.updatePortPoints()
            Connection.redrawAllConnections()
            SNode.refreshDownstreamOutputs(this)
        }
        this.elements.video.play()
    },


    _startCanvasRenderLoop(){
        if(this.runtimeState.renderLoop){
            cancelAnimationFrame(this.runtimeState.renderLoop)
        }
        
        const renderFrame = () => {
            if(this.isDestroyed) return

            const {video, canvas} = this.elements
            if(video && canvas){
                const ctx = canvas.getContext('2d')
                if(video.readyState >= video.HAVE_CURRENT_DATA){
                    // Draw video frame
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
                    this.runtimeState.canvasHasData = true
                } else if(!this.runtimeState.canvasHasData){
                    // Draw black fallback when no video data yet
                    ctx.fillStyle = '#000000'
                    ctx.fillRect(0, 0, canvas.width, canvas.height)
                    this.runtimeState.canvasHasData = true
                }
            }

            this.runtimeState.renderLoop = requestAnimationFrame(renderFrame)
        }
        
        this.runtimeState.renderLoop = requestAnimationFrame(renderFrame)
    },

    _startUiUpdateLoop(){
        if(this.runtimeState.uiUpdateFrameId){
            cancelAnimationFrame(this.runtimeState.uiUpdateFrameId)
        }

        const updateMeters = () => {
            if(this.isDestroyed || !this.runtimeState.analyzer){return}

            // Get the latest values from the analyzer instance
            const audioValues = this.runtimeState.analyzer.audioValues
            const {bass, mid, high, bassExciter} = audioValues
            const now = performance.now()

            // Update meters and check thresholds using the EXACT same values
            updateMeterAndCheckThreshold(this, 'bass', bass, now)
            updateMeterAndCheckThreshold(this, 'bassExciter', bassExciter, now, 'bass+')
            updateMeterAndCheckThreshold(this, 'mid', mid, now)
            updateMeterAndCheckThreshold(this, 'high', high, now)

            this.runtimeState.uiUpdateFrameId = requestAnimationFrame(updateMeters)
        }
        updateMeters()
    },

    onDestroy(){
        if(this.runtimeState.renderLoop){
            cancelAnimationFrame(this.runtimeState.renderLoop)
            this.runtimeState.renderLoop = null
        }
        
        if(this.runtimeState.uiUpdateFrameId){
            cancelAnimationFrame(this.runtimeState.uiUpdateFrameId)
            this.runtimeState.uiUpdateFrameId = null
        }
        
        this.runtimeState.analyzer?.close()

        // Clean up asset references
        if (this.runtimeState.currentAssetPath && !this.runtimeState.currentAssetPath.startsWith('asset://')) {
            // Only revoke blob URLs, not asset:// paths
            URL.revokeObjectURL(this.runtimeState.currentAssetPath)
        }

        if(this.elements.video){
            this.elements.video.pause()
            if(this.elements.video.src && !this.elements.video.src.startsWith('asset://')){
                URL.revokeObjectURL(this.elements.video.src)
            }
            this.elements.video.src = ''
            this.elements.video.removeAttribute('src')
        }
    }
})