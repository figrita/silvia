/**
 * Main Input Node
 *
 * References the global Main Input panel sources.
 * Outputs video texture and audio analysis data.
 * Multiple instances can exist in a patch - all reference the same global sources.
 */

import {registerNode} from '../registry.js'
import {mainInput} from '../mainInput.js'
import {createAudioMetersUI, updateMeterAndCheckThreshold, DEFAULT_THRESHOLDS, DEFAULT_THRESHOLD_STATE} from '../audioThresholds.js'
import {makeOscilloscopeOutput} from '../audioHistogram.js'

registerNode({
    slug: 'maininput',
    icon: '🎛️',
    label: 'Main Input',
    tooltip: 'References the global Main Input panel. Configure video and audio sources in the left panel. Multiple nodes can reference the same input.',

    elements: {
        statusText: null,
        meters: {},
        thresholdSliders: {},
        meterContainer: null,
        histogramCanvas: null
    },
    values: {
        thresholds: DEFAULT_THRESHOLDS,
        debounceMs: 100
    },
    runtimeState: {
        uiUpdateFrameId: null,
        thresholdState: DEFAULT_THRESHOLD_STATE
    },

    input: {},

    output: {
        'output': {
            label: 'Video',
            type: 'color',
            offlineBlocked: true,
            genCode(cc, funcName, uniformName) {
                return `vec4 ${funcName}(vec2 uv) {
    ivec2 texSize = textureSize(${uniformName}, 0);
    float aspect = float(texSize.x) / float(texSize.y);
    uv.x = (uv.x / aspect + 1.0) * 0.5;
    uv.y = (uv.y + 1.0) * 0.5;
    return texture(${uniformName}, vec2(uv.x, 1.0 - uv.y));
}`
            },
            textureUniformUpdate(uniformName, gl, program, textureUnit, textureMap) {
                if (this.isDestroyed) return
                mainInput.uploadSharedTexture(gl, textureUnit)
                gl.uniform1i(gl.getUniformLocation(program, uniformName), textureUnit)
            }
        },

        'bass': {
            label: 'Red Band',
            type: 'float',
            range: '[0, 1]',
            offlineBlocked: true,
            genCode(cc, funcName, uniformName) {
                return `float ${funcName}(vec2 uv) { return ${uniformName}; }`
            },
            floatUniformUpdate(uniformName, gl, program) {
                if (this.isDestroyed) return
                const location = gl.getUniformLocation(program, uniformName)
                gl.uniform1f(location, mainInput.getAudioValues().bass)
            }
        },

        'mid': {
            label: 'Green Band',
            type: 'float',
            range: '[0, 1]',
            offlineBlocked: true,
            genCode(cc, funcName, uniformName) {
                return `float ${funcName}(vec2 uv) { return ${uniformName}; }`
            },
            floatUniformUpdate(uniformName, gl, program) {
                if (this.isDestroyed) return
                const location = gl.getUniformLocation(program, uniformName)
                gl.uniform1f(location, mainInput.getAudioValues().mid)
            }
        },

        'high': {
            label: 'Blue Band',
            type: 'float',
            range: '[0, 1]',
            offlineBlocked: true,
            genCode(cc, funcName, uniformName) {
                return `float ${funcName}(vec2 uv) { return ${uniformName}; }`
            },
            floatUniformUpdate(uniformName, gl, program) {
                if (this.isDestroyed) return
                const location = gl.getUniformLocation(program, uniformName)
                gl.uniform1f(location, mainInput.getAudioValues().high)
            }
        },

        'oscilloscope': {...makeOscilloscopeOutput(function(){ return mainInput.getWaveformData() }), offlineBlocked: true},

        'bassThreshold': {label: 'Red Band Event', type: 'action', offlineBlocked: true},
        'midThreshold': {label: 'Green Band Event', type: 'action', offlineBlocked: true},
        'highThreshold': {label: 'Blue Band Event', type: 'action', offlineBlocked: true}
    },

    onCreate() {
        if (!this.customArea) return

        // Create simple status display
        const container = document.createElement('div')
        container.style.cssText = `
            padding: 8px;
            min-width: 150px;
            text-align: center;
        `

        this.elements.statusText = document.createElement('div')
        this.elements.statusText.style.cssText = `
            font-size: 11px;
            color: var(--text-secondary);
        `

        container.appendChild(this.elements.statusText)
        this.customArea.appendChild(container)

        // Create audio meters with threshold sliders
        createAudioMetersUI(this, false, {numbers: true, events: true})

        // Start status + threshold update loop
        this._startStatusUpdateLoop()
    },

    _startStatusUpdateLoop() {
        const updateStatus = () => {
            if (this.isDestroyed) return

            let videoStatus = 'No video'
            let audioStatus = 'No audio'

            if (mainInput.hasVideo()) {
                switch (mainInput.videoSourceType) {
                    case 'demo': videoStatus = '📼 Demo'; break
                    case 'video': videoStatus = '📼 Video'; break
                    case 'webcam': videoStatus = '📹 Webcam'; break
                    case 'screencapture': videoStatus = '🖥️ Screen'; break
                }
            }

            if (mainInput.hasAudio()) {
                switch (mainInput.audioSourceType) {
                    case 'audio': audioStatus = '🔊 Audio'; break
                    case 'mic': audioStatus = '🎤 Mic'; break
                    case 'video': audioStatus = '📼 Video Audio'; break
                }
            }

            this.elements.statusText.innerHTML = `${videoStatus}<br>${audioStatus}`

            // Update meters and check thresholds
            if (mainInput.hasAudio()) {
                const values = mainInput.getAudioValues()
                const now = performance.now()
                updateMeterAndCheckThreshold(this, 'bass', values.bass, now)
                updateMeterAndCheckThreshold(this, 'mid', values.mid, now)
                updateMeterAndCheckThreshold(this, 'high', values.high, now)

            }

            this.runtimeState.uiUpdateFrameId = requestAnimationFrame(updateStatus)
        }

        this.runtimeState.uiUpdateFrameId = requestAnimationFrame(updateStatus)
    },

    onDestroy() {
        if (this.runtimeState.uiUpdateFrameId) {
            cancelAnimationFrame(this.runtimeState.uiUpdateFrameId)
            this.runtimeState.uiUpdateFrameId = null
        }
    }
})
