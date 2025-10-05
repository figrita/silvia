import {registerNode} from '../registry.js'
import {autowire, StringToFragment} from '../utils.js'
import {AudioAnalyzer} from '../audioAnalyzer.js'
import {createAudioMetersUI, updateMeterAndCheckThreshold, DEFAULT_THRESHOLDS_WITH_VOLUME, DEFAULT_THRESHOLD_STATE_WITH_VOLUME, THRESHOLD_ACTION_OUTPUTS_WITH_VOLUME} from '../audioThresholds.js'
import {ensureBandConfig, createBandEQControlsHTML, attachBandEQListeners, setupHistogramCanvas, drawHistogram, applyBandConfig, DEFAULT_BAND_CONFIG} from '../audioHistogram.js'

registerNode({
    slug: 'micline',
    icon: '🎤',
    label: 'Mic/Line In',
    tooltip: 'Analyzes live microphone input for frequency content. Click to request microphone permission. Great for audio-reactive visuals.',

    elements: {
        startButton: null,
        statusText: null,
        meters: {},
        thresholdSliders: {},
        meterContainer: null,
        volumeSlider: null,
        smoothingSlider: null,
        gainSlider: null,
        deviceSelect: null,
        histogramCanvas: null
    },
    values: {
        volume: 1.0,
        smoothing: 0.7,
        gain: 1.0,
        thresholds: DEFAULT_THRESHOLDS_WITH_VOLUME,
        debounceMs: 100,
        selectedDeviceId: 'default',
        bandConfig: DEFAULT_BAND_CONFIG
    },
    runtimeState: {
        stream: null,
        analyzer: null,
        uiUpdateFrameId: null,
        thresholdState: DEFAULT_THRESHOLD_STATE_WITH_VOLUME,
        availableDevices: []
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
                const value = this.runtimeState.analyzer.audioValues.bass * this.values.gain
                gl.uniform1f(location, Math.min(1.0, value))
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
                const value = this.runtimeState.analyzer.audioValues.bassExciter * this.values.gain
                gl.uniform1f(location, Math.min(1.0, value))
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
                const value = this.runtimeState.analyzer.audioValues.mid * this.values.gain
                gl.uniform1f(location, Math.min(1.0, value))
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
                const value = this.runtimeState.analyzer.audioValues.high * this.values.gain
                gl.uniform1f(location, Math.min(1.0, value))
            }
        },
        'volume': {
            label: 'Volume',
            type: 'float',
            range: '[0, 1]',
            genCode(cc, funcName, uniformName){
                return `float ${funcName}(vec2 uv) { return ${uniformName}; }`
            },
            floatUniformUpdate(uniformName, gl, program){
                if(this.isDestroyed || !this.runtimeState.analyzer){return}
                const location = gl.getUniformLocation(program, uniformName)
                const {bass, mid, high} = this.runtimeState.analyzer.audioValues
                const avg = (bass + mid + high) / 3.0 * this.values.gain
                gl.uniform1f(location, Math.min(1.0, avg))
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
        ...THRESHOLD_ACTION_OUTPUTS_WITH_VOLUME
    },

    async onCreate(){
        if(!this.customArea){return}

        ensureBandConfig(this)

        // Enumerate devices first (Electron only)
        if (typeof window !== 'undefined' && window.electronAPI) {
            await this._enumerateDevices()
        }

        this._createUI()

        // Create meters immediately to avoid node resizing later - Mic shows numbers only by default
        createAudioMetersUI(this, true, {numbers: true, events: false})

        this.elements.startButton.addEventListener('click', async() => {
            try {
                if(this.runtimeState.stream){return} // Already running

                // Request microphone access with selected device
                const isElectron = typeof window !== 'undefined' && window.electronAPI
                const audioConstraints = (!isElectron || this.values.selectedDeviceId === 'default')
                    ? {audio: true, video: false}
                    : {audio: {deviceId: {exact: this.values.selectedDeviceId}}, video: false}
                const stream = await navigator.mediaDevices.getUserMedia(audioConstraints)
                this.runtimeState.stream = stream

                // Initialize analyzer
                this.runtimeState.analyzer = new AudioAnalyzer()
                applyBandConfig(this.runtimeState.analyzer, this.values.bandConfig)
                this.runtimeState.analyzer.initFromStream(stream)

                // Update UI
                this.elements.startButton.style.display = 'none'
                this.elements.statusText.textContent = 'Status: Mic Active'
                this.elements.histogramCanvas.style.display = 'block'
                setupHistogramCanvas(this.elements.histogramCanvas)
                this._startUiUpdateLoop()

                // Listen for when the user stops sharing via browser UI
                stream.getTracks()[0].addEventListener('ended', () => {
                    this.onDestroy() // Trigger a full cleanup
                    this._createUI() // Re-create the initial UI
                })
            } catch(err){
                console.error('Error accessing microphone:', err)
                this.elements.statusText.textContent = 'Status: Permission Denied'
                this.elements.startButton.disabled = true
            }
        })
    },

    onDestroy(){
        this.runtimeState.analyzer?.close()
        this.runtimeState.stream?.getTracks().forEach(track => track.stop())
        if(this.runtimeState.uiUpdateFrameId){
            cancelAnimationFrame(this.runtimeState.uiUpdateFrameId)
        }
        this.runtimeState.analyzer = null
        this.runtimeState.stream = null
    },


    _startUiUpdateLoop(){
        if(this.runtimeState.uiUpdateFrameId){
            cancelAnimationFrame(this.runtimeState.uiUpdateFrameId)
        }

        const updateMeters = () => {
            if(this.isDestroyed || !this.runtimeState.analyzer){return}

            const {bass, mid, high, bassExciter} = this.runtimeState.analyzer.audioValues
            const now = performance.now()

            // Calculate volume (average of all bands with gain)
            const volume = Math.min(1.0, (bass + mid + high) / 3.0 * this.values.gain)

            // Update meters and check thresholds using the EXACT same values
            updateMeterAndCheckThreshold(this, 'bass', bass, now)
            updateMeterAndCheckThreshold(this, 'bassExciter', bassExciter, now, 'bass+')
            updateMeterAndCheckThreshold(this, 'mid', mid, now)
            updateMeterAndCheckThreshold(this, 'high', high, now)
            updateMeterAndCheckThreshold(this, 'volume', volume, now)

            // Draw histogram
            drawHistogram(this.elements.histogramCanvas, this.runtimeState.analyzer)

            this.runtimeState.uiUpdateFrameId = requestAnimationFrame(updateMeters)
        }
        updateMeters()
    },

    async _enumerateDevices(){
        try {
            const devices = await navigator.mediaDevices.enumerateDevices()
            const audioInputDevices = devices.filter(device => device.kind === 'audioinput')
            this.runtimeState.availableDevices = audioInputDevices
        } catch(error) {
            console.error('Failed to enumerate audio devices:', error)
            this.runtimeState.availableDevices = []
        }
    },

    _createUI(){
        this.customArea.innerHTML = '' // Clear existing UI
        // Create device options (Electron only)
        const isElectron = typeof window !== 'undefined' && window.electronAPI
        const deviceOptions = isElectron && this.runtimeState.availableDevices.length > 0
            ? this.runtimeState.availableDevices.map(device =>
                `<option value="${device.deviceId}" ${this.values.selectedDeviceId === device.deviceId ? 'selected' : ''}>
                    ${device.label || `Device ${device.deviceId.substring(0, 8)}...`}
                </option>`
            ).join('')
            : ''

        const deviceSelectHtml = isElectron
            ? `<div style="display: flex; align-items: center; gap: 0.5rem;">
                    <label style="color: #ccc; font-size: 11px; min-width: 60px;">Device:</label>
                    <select class="slct" data-el="deviceSelect" style="flex: 1; background: var(--bg-interactive); color: var(--text-primary); border: 1px solid var(--border-normal); border-radius: 4px; padding: 4px 6px; font-family: monospace; width: 15rem;">
                        <option value="default" ${this.values.selectedDeviceId === 'default' ? 'selected' : ''}>Default</option>
                        ${deviceOptions}
                    </select>
                </div>`
            : ''

        const html = `
            <div style="padding: 0.5rem; display: flex; flex-direction: column; gap: 0.5rem; min-width: 270px;">
                <p data-el="statusText" style="margin: 0; color: #ccc;">Status: Inactive</p>
                ${deviceSelectHtml}
                <button class="btn" data-el="startButton" style="width: 100%;">Start Mic</button>

                <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 0.5rem;">
                    <label style="color: #ccc; font-size: 11px; min-width: 60px;">Volume:</label>
                    <s-number data-el="volumeControl" value="${this.values.volume}" default="${this.defaults.volume}" min="0" max="2" step="0.01" style="flex: 1;"></s-number>
                </div>
                
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <label style="color: #ccc; font-size: 11px; min-width: 60px;">Smoothing:</label>
                    <s-number data-el="smoothingControl" value="${this.values.smoothing}" default="${this.defaults.smoothing}" min="0" max="0.99" step="0.01" style="flex: 1;"></s-number>
                </div>
                
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <label style="color: #ccc; font-size: 11px; min-width: 60px;">Gain:</label>
                    <s-number data-el="gainControl" value="${this.values.gain}" default="${this.defaults.gain}" min="0.1" max="5" step="0.1" style="flex: 1;"></s-number>
                </div>

                ${createBandEQControlsHTML(this.values.bandConfig)}

                <div class="meter-container" data-el="meterContainer" style="margin-top:0.5rem;"></div>
            </div>
        `
        const fragment = StringToFragment(html)
        const partialElements = autowire(fragment)
        Object.assign(this.elements, partialElements)

        // Meters will be created when microphone is activated

        this.customArea.appendChild(fragment)
        
        // Add s-number event listeners
        if(this.elements.volumeControl){
            this.elements.volumeControl.addEventListener('input', (e) => {
                this.values.volume = parseFloat(e.target.value)
            })
        }
        
        if(this.elements.smoothingControl){
            this.elements.smoothingControl.addEventListener('input', (e) => {
                this.values.smoothing = parseFloat(e.target.value)
                // Note: Smoothing changes will apply on next mic restart due to private AudioAnalyzer fields
            })
        }
        
        if(this.elements.gainControl){
            this.elements.gainControl.addEventListener('input', (e) => {
                this.values.gain = parseFloat(e.target.value)
            })
        }

        // Add device select event listener (Electron only)
        if(this.elements.deviceSelect){
            this.elements.deviceSelect.addEventListener('change', (e) => {
                this.values.selectedDeviceId = e.target.value
                // If mic is currently active, restart it with the new device
                if(this.runtimeState.stream){
                    this._restartWithNewDevice()
                }
            })
        }

        // Add band EQ control event listeners
        attachBandEQListeners(this)
    },

    async _restartWithNewDevice(){
        try {
            // Stop current stream
            this.runtimeState.analyzer?.close()
            this.runtimeState.stream?.getTracks().forEach(track => track.stop())
            if(this.runtimeState.uiUpdateFrameId){
                cancelAnimationFrame(this.runtimeState.uiUpdateFrameId)
            }

            // Start with new device
            const isElectron = typeof window !== 'undefined' && window.electronAPI
            const audioConstraints = (!isElectron || this.values.selectedDeviceId === 'default')
                ? {audio: true, video: false}
                : {audio: {deviceId: {exact: this.values.selectedDeviceId}}, video: false}
            const stream = await navigator.mediaDevices.getUserMedia(audioConstraints)
            this.runtimeState.stream = stream

            // Initialize analyzer
            this.runtimeState.analyzer = new AudioAnalyzer()
            applyBandConfig(this.runtimeState.analyzer, this.values.bandConfig)
            this.runtimeState.analyzer.initFromStream(stream)

            // Update UI
            this.elements.statusText.textContent = 'Status: Mic Active'
            this.elements.histogramCanvas.style.display = 'block'
            setupHistogramCanvas(this.elements.histogramCanvas)
            this._startUiUpdateLoop()

            // Listen for when the user stops sharing via browser UI
            stream.getTracks()[0].addEventListener('ended', () => {
                this.onDestroy() // Trigger a full cleanup
                this._createUI() // Re-create the initial UI
            })
        } catch(err) {
            console.error('Error switching audio device:', err)
            this.elements.statusText.textContent = 'Status: Device Switch Failed'
            this.elements.startButton.style.display = 'block'
            this.runtimeState.analyzer = null
            this.runtimeState.stream = null
        }
    }
})