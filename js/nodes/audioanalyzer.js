import {registerNode} from '../registry.js'
import {AudioAnalyzer} from '../audioAnalyzer.js'
import {createAudioMetersUI, updateMeterAndCheckThreshold, DEFAULT_THRESHOLDS, DEFAULT_THRESHOLD_STATE, THRESHOLD_ACTION_OUTPUTS} from '../audioThresholds.js'
import {AssetManager} from '../assetManager.js'
import {ensureBandConfig, createBandEQUI, drawScope, applyBandConfig, makeOscilloscopeOutput, DEFAULT_BAND_CONFIG} from '../audioHistogram.js'
import {setIconLabel} from '../icons.js'

registerNode({
    slug: 'audioanalyzer',
    icon: '🔊',
    label: 'Audio Analyzer',
    tooltip: 'Analyzes audio files and outputs frequency band levels (bass, mid, high). Load audio file and use outputs to drive visual effects.',

    elements: {
        audio: null,
        meters: {},
        thresholdSliders: {},
        meterContainer: null,
        histogramCanvas: null
    },
    fileSelectors: {
        input: null
    },
    values: {
        thresholds: DEFAULT_THRESHOLDS,
        debounceMs: 100,
        assetPath: null,
        bandConfig: DEFAULT_BAND_CONFIG
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
        'oscilloscope': makeOscilloscopeOutput(function(){ return this.runtimeState.analyzer?.waveformData }),
        ...THRESHOLD_ACTION_OUTPUTS
    },

    onCreate(){
        if(!this.customArea){return}

        ensureBandConfig(this)

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
        setIconLabel(uploadBtn, 'upload', 'Upload', 11)
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
        setIconLabel(assetBrowserBtn, 'folder-open', 'Assets', 11)
        assetBrowserBtn.onclick = async (e) => {
            e.stopPropagation()
            AssetManager.showGlobalAssetManager({
                nodeType: 'audio',
                onSelect: (assetPath, assetInfo) => {
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
        setIconLabel(replaceBtn, 'refresh-cw', 'Replace', 11)
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
            min-width: 270px;
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

        // Create band EQ controls
        createBandEQUI(this, this.customArea)

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
            const {bass, mid, high} = audioValues
            const now = performance.now()

            // Update meters and check thresholds using the EXACT same values
            updateMeterAndCheckThreshold(this, 'bass', bass, now)
            updateMeterAndCheckThreshold(this, 'mid', mid, now)
            updateMeterAndCheckThreshold(this, 'high', high, now)

            // Draw scope
            drawScope(this, this.runtimeState.analyzer)

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

            await this._loadFromAssetPath(assetPath)
        } catch (error) {
            console.error('Failed to handle audio file:', error)
            // Fallback to old blob URL method
            this._loadAudioFromBlob(file)
        }
    },

    async _loadFromAssetPath(assetPath) {
        try {
            const resolvedPath = await AssetManager.loadAsset(assetPath)
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
        return new Promise((resolve, reject) => {
            this.elements.audio.onloadedmetadata = () => {
                this.runtimeState.analyzer = new AudioAnalyzer()
                applyBandConfig(this.runtimeState.analyzer, this.values.bandConfig)
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
        applyBandConfig(this.runtimeState.analyzer, this.values.bandConfig)
        this.runtimeState.analyzer.initFromFile(this.elements.audio)
        this.elements.uploadBtn.style.display = 'none'
        this.elements.replaceBtn.style.display = 'block'

        this.elements.audio.play()
        this._startUiUpdateLoop()
    },

})