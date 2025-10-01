import {registerNode} from '../registry.js'
import {AudioAnalyzer} from '../audioAnalyzer.js'
import {createAudioMetersUI, updateMeterAndCheckThreshold, DEFAULT_THRESHOLDS, DEFAULT_THRESHOLD_STATE, THRESHOLD_ACTION_OUTPUTS} from '../audioThresholds.js'
import {AssetManager} from '../assetManager.js'

registerNode({
    slug: 'audioanalyzer',
    icon: '🔊',
    label: 'Audio Analyzer',
    tooltip: 'Analyzes audio files and outputs frequency band levels (bass, mid, high). Load audio file and use outputs to drive visual effects.',

    elements: {
        audio: null,
        meters: {},
        thresholdSliders: {},
        meterContainer: null
    },
    fileSelectors: {
        input: null
    },
    values: {
        thresholds: DEFAULT_THRESHOLDS,
        debounceMs: 100,
        assetPath: null
    },
    runtimeState: {
        analyzer: null,
        uiUpdateFrameId: null,
        thresholdState: DEFAULT_THRESHOLD_STATE,
        currentAssetPath: null
    },

    input: {},
    output: {
        'bass': {
            label: 'Bass',
            type: 'float',
            range: '[0, 1]',
            genCode(cc, funcName, uniformName){
                return `float ${funcName}(vec2 uv) { return ${uniformName}; }`
            },
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
            genCode(cc, funcName, uniformName){
                return `float ${funcName}(vec2 uv) { return ${uniformName}; }`
            },
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
            genCode(cc, funcName, uniformName){
                return `float ${funcName}(vec2 uv) { return ${uniformName}; }`
            },
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
            genCode(cc, funcName, uniformName){
                return `float ${funcName}(vec2 uv) { return ${uniformName}; }`
            },
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

        // Hidden file input
        this.fileSelectors.input = document.createElement('input')
        this.fileSelectors.input.type = 'file'
        this.fileSelectors.input.accept = 'audio/*'
        this.fileSelectors.input.style.display = 'none'
        this.fileSelectors.input.addEventListener('change', (event) => {
            const [file] = event.target.files
            if(file){
                this._handleAudioFile(file)
            }
        })

        // Create button container above audio element
        const buttonContainer = document.createElement('div')
        buttonContainer.style.cssText = `
            display: flex;
            gap: 8px;
            margin-bottom: 8px;
            opacity: 0;
            transition: opacity 0.2s ease;
        `

        // Upload button
        const uploadBtn = document.createElement('button')
        uploadBtn.style.cssText = `
            padding: 4px 8px;
            background: var(--bg-interactive);
            border: 1px solid var(--border-normal);
            border-radius: 4px;
            color: var(--text-secondary);
            font-size: 11px;
            cursor: pointer;
            font-family: monospace;
        `
        uploadBtn.textContent = '📁 Upload'
        uploadBtn.onclick = () => this.fileSelectors.input.click()
        uploadBtn.addEventListener('mouseenter', () => {
            uploadBtn.style.background = 'var(--bg-hover)'
            uploadBtn.style.borderColor = 'var(--primary-muted)'
        })
        uploadBtn.addEventListener('mouseleave', () => {
            uploadBtn.style.background = 'var(--bg-interactive)'
            uploadBtn.style.borderColor = 'var(--border-normal)'
        })

        // Assets browser button (Electron only)
        const assetBrowserBtn = document.createElement('button')
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
                nodeType: 'audio',
                onSelect: (assetPath, assetInfo) => {
                    console.log('Selected audio asset:', assetPath, assetInfo)
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

        // Replace button (only shows when audio is loaded)
        const replaceBtn = document.createElement('button')
        replaceBtn.style.cssText = `
            padding: 4px 8px;
            background: var(--bg-interactive);
            border: 1px solid var(--border-normal);
            border-radius: 4px;
            color: var(--text-secondary);
            font-size: 11px;
            cursor: pointer;
            font-family: monospace;
            display: none;
        `
        replaceBtn.textContent = '↻ Replace'
        replaceBtn.onclick = () => this.fileSelectors.input.click()
        replaceBtn.addEventListener('mouseenter', () => {
            replaceBtn.style.background = 'var(--bg-hover)'
            replaceBtn.style.borderColor = 'var(--primary-muted)'
        })
        replaceBtn.addEventListener('mouseleave', () => {
            replaceBtn.style.background = 'var(--bg-interactive)'
            replaceBtn.style.borderColor = 'var(--border-normal)'
        })

        buttonContainer.appendChild(uploadBtn)
        buttonContainer.appendChild(assetBrowserBtn)
        buttonContainer.appendChild(replaceBtn)
        
        this.elements.buttonContainer = buttonContainer
        this.elements.uploadBtn = uploadBtn
        this.elements.assetBrowserBtn = assetBrowserBtn
        this.elements.replaceBtn = replaceBtn

        // Create audio element
        this.elements.audio = document.createElement('audio')
        this.elements.audio.style.cssText = `
            min-width: 100%;
            margin-bottom: 8px;
        `
        this.elements.audio.controls = true
        this.elements.audio.loop = true

        // Add hover functionality to show buttons
        this.customArea.addEventListener('mouseenter', () => {
            buttonContainer.style.opacity = '1'
        })
        this.customArea.addEventListener('mouseleave', () => {
            buttonContainer.style.opacity = '0'
        })

        // Append elements
        this.customArea.appendChild(buttonContainer)
        this.customArea.appendChild(this.elements.audio)
        this.customArea.appendChild(this.fileSelectors.input)

        // Create audio meters with threshold sliders - Audio Analyzer shows both by default
        createAudioMetersUI(this, false, {numbers: true, events: true})

        // Load existing asset if available (Electron only)
        if(this.values.assetPath && isElectronMode){
            this._loadFromAssetPath(this.values.assetPath)
        }
    },

    onDestroy(){
        if(this.runtimeState.uiUpdateFrameId){cancelAnimationFrame(this.runtimeState.uiUpdateFrameId)}
        this.runtimeState.analyzer?.close()
        
        // Clean up asset references
        if (this.runtimeState.currentAssetPath && !this.runtimeState.currentAssetPath.startsWith('asset://')) {
            // Only revoke blob URLs, not asset:// paths
            URL.revokeObjectURL(this.runtimeState.currentAssetPath)
        }
        
        if(this.elements.audio && this.elements.audio.src){
            this.elements.audio.pause()
            if(!this.runtimeState.currentAssetPath || !this.runtimeState.currentAssetPath.startsWith('asset://')){
                URL.revokeObjectURL(this.elements.audio.src)
            }
        }
    },

    _startUiUpdateLoop(){
        if(this.runtimeState.uiUpdateFrameId){
            cancelAnimationFrame(this.runtimeState.uiUpdateFrameId)
        }

        const updateMeters = () => {
            if(this.isDestroyed || !this.runtimeState.analyzer){return}

            // Get the latest values from the analyzer instance - use SAME values for both display and threshold checking
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

    async _handleAudioFile(file){
        if(!file || !file.type.startsWith('audio/')) return

        // Cleanup previous state
        this.runtimeState.analyzer?.close()
        if(this.elements.audio.src && this.runtimeState.currentAssetPath && !this.runtimeState.currentAssetPath.startsWith('asset://')){
            URL.revokeObjectURL(this.elements.audio.src)
        }

        // Web mode: Use blob URL directly
        if (!isElectronMode) {
            this._loadAudioFromBlob(file)
            return
        }

        // Electron mode: Use file path from drag-and-drop
        try {
            // Get the real file path using webUtils
            const filePath = window.electronAPI.getFilePathFromFile(file)
            if (!filePath) {
                console.error('No file path available')
                this._loadAudioFromBlob(file)
                return
            }

            // Copy file to assets using path
            const assetPath = await window.electronAPI.copyAssetFromPath(filePath, 'audio')
            this.values.assetPath = assetPath
            this.runtimeState.currentAssetPath = assetPath

            console.log(`Audio file handled, calling _loadFromAssetPath with: ${assetPath}`)
            // Load the asset
            await this._loadFromAssetPath(assetPath)

            console.log(`Audio asset stored: ${assetPath}`)
        } catch (error) {
            console.error('Failed to handle audio file:', error)
            // Fallback to old blob URL method
            this._loadAudioFromBlob(file)
        }
    },

    async _loadFromAssetPath(assetPath) {
        try {
            console.log(`Audio node loading from asset path: ${assetPath}`)
            const resolvedPath = await AssetManager.loadAsset(assetPath)
            console.log(`Audio node resolved path: ${resolvedPath}`)
            if (!resolvedPath) {
                console.error('Failed to resolve asset path:', assetPath)
                return
            }

            this.runtimeState.currentAssetPath = assetPath
            await this._loadAudioFromPath(resolvedPath)
        } catch (error) {
            console.error('Failed to load audio asset:', error)
        }
    },

    async _loadAudioFromPath(audioPath) {
        console.log(`Audio node setting audio.src to: ${audioPath}`)
        return new Promise((resolve, reject) => {
            this.elements.audio.onloadedmetadata = () => {
                this.runtimeState.analyzer = new AudioAnalyzer()
                this.runtimeState.analyzer.initFromFile(this.elements.audio)
                this.elements.uploadBtn.style.display = 'none'
                this.elements.replaceBtn.style.display = 'block'
                
                this.elements.audio.play()
                this._startUiUpdateLoop()
                
                resolve()
            }

            this.elements.audio.onerror = (error) => {
                console.error('Failed to load audio from path:', audioPath, error)
                reject(new Error('Audio load failed'))
            }

            this.elements.audio.src = audioPath
        })
    },

    _loadAudioFromBlob(file) {
        // Fallback method using blob URL
        const url = URL.createObjectURL(file)
        this.elements.audio.src = url
        this.runtimeState.currentAssetPath = url

        this.runtimeState.analyzer = new AudioAnalyzer()
        this.runtimeState.analyzer.initFromFile(this.elements.audio)
        this.elements.uploadBtn.style.display = 'none'
        this.elements.replaceBtn.style.display = 'block'
        
        this.elements.audio.play()
        this._startUiUpdateLoop()
    },

})