/**
 * Main Input Node
 *
 * References the global Main Input panel sources.
 * Outputs video texture and audio analysis data.
 * Multiple instances can exist in a patch - all reference the same global sources.
 */

import {registerNode} from '../registry.js'
import {mainInput} from '../mainInput.js'

registerNode({
    slug: 'maininput',
    icon: '🎛️',
    label: 'Main Input',
    tooltip: 'References the global Main Input panel. Configure video and audio sources in the left panel. Multiple nodes can reference the same input.',

    elements: {
        statusText: null
    },
    runtimeState: {
        uiUpdateFrameId: null
    },

    input: {},

    output: {
        'output': {
            label: 'Video',
            type: 'color',
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
            label: 'Bass',
            type: 'float',
            range: '[0, 1]',
            genCode(cc, funcName, uniformName) {
                return `float ${funcName}(vec2 uv) { return ${uniformName}; }`
            },
            floatUniformUpdate(uniformName, gl, program) {
                if (this.isDestroyed) return
                const location = gl.getUniformLocation(program, uniformName)
                gl.uniform1f(location, mainInput.getAudioValues().bass)
            }
        },

        'bassExciter': {
            label: 'Bass+',
            type: 'float',
            range: '[0, 1]',
            genCode(cc, funcName, uniformName) {
                return `float ${funcName}(vec2 uv) { return ${uniformName}; }`
            },
            floatUniformUpdate(uniformName, gl, program) {
                if (this.isDestroyed) return
                const location = gl.getUniformLocation(program, uniformName)
                gl.uniform1f(location, mainInput.getAudioValues().bassExciter)
            }
        },

        'mid': {
            label: 'Mid',
            type: 'float',
            range: '[0, 1]',
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
            label: 'High',
            type: 'float',
            range: '[0, 1]',
            genCode(cc, funcName, uniformName) {
                return `float ${funcName}(vec2 uv) { return ${uniformName}; }`
            },
            floatUniformUpdate(uniformName, gl, program) {
                if (this.isDestroyed) return
                const location = gl.getUniformLocation(program, uniformName)
                gl.uniform1f(location, mainInput.getAudioValues().high)
            }
        },

        'oscilloscope': {
            label: 'Oscilloscope',
            type: 'color',
            genCode(cc, funcName, uniformName) {
                return `vec4 ${funcName}(vec2 uv) {
    vec2 coord = uv;
    vec4 color = vec4(0.0, 0.0, 0.0, 0.0);

    float x = (coord.x + 1.0) * 0.5;
    float sampleIndex = x * 1024.0;
    int idx = int(sampleIndex);

    float waveValue = (texture(${uniformName}, vec2(float(idx) / 1024.0, 0.5)).r - 0.5) * 2.0;

    float lineY = waveValue * 0.95;
    float distance = abs(coord.y - lineY);
    float lineThickness = 0.02;

    if (distance < lineThickness) {
        color = vec4(1.0, 1.0, 1.0, 1.0);
    }

    return color;
}`
            },
            textureUniformUpdate(uniformName, gl, program, textureUnit, textureMap) {
                if (this.isDestroyed) return

                let texture = textureMap.get(this.output.oscilloscope)
                if (!texture) {
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

                const waveformData = mainInput.getWaveformData()
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1024, 1, 0, gl.RED, gl.UNSIGNED_BYTE, waveformData)

                const location = gl.getUniformLocation(program, uniformName)
                gl.uniform1i(location, textureUnit)
            }
        }
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

        // Start status update loop
        this._startStatusUpdateLoop()
    },

    _startStatusUpdateLoop() {
        const updateStatus = () => {
            if (this.isDestroyed) return

            let videoStatus = 'No video'
            let audioStatus = 'No audio'

            if (mainInput.hasVideo()) {
                switch (mainInput.videoSourceType) {
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
