// audioHistogram.js - Shared histogram visualization for audio nodes

import {autowire, StringToFragment} from './utils.js'
import {AudioScope, setupScopeCanvas} from './audioScope.js'

/**
 * Calculates bin range from center frequency and Q factor
 * @param {number} centerFreq - Center frequency in Hz
 * @param {number} q - Q factor (higher = narrower bandwidth)
 * @param {number} sampleRate - Sample rate (default 48000)
 * @returns {Array} - [startBin, endBin]
 */
export function getBinRange(centerFreq, q, sampleRate = 48000, fftSize = 512) {
    const binWidth = sampleRate / fftSize

    const bandwidth = centerFreq / q
    const startFreq = Math.max(0, centerFreq - bandwidth / 2)
    const endFreq = centerFreq + bandwidth / 2

    const startBin = Math.round(startFreq / binWidth)
    const endBin = Math.round(endFreq / binWidth)

    return [Math.max(1, startBin), Math.min(endBin, fftSize / 2 - 1)]
}

/**
 * Generates HTML for the scope canvas (replaces old EQ controls)
 */
export function createScopeHTML(bandConfig) {
    return `
        <div class="audio-scope">
            <canvas data-el="scopeCanvas" class="scope-canvas"></canvas>
            <div class="band-controls">
                <div class="band-col">
                    <span class="band-col-label">Gain</span>
                    <s-number data-el="bassGainControl" value="${bandConfig.bass.gain ?? 1}" default="1" min="0" max="3" step="0.1"></s-number>
                    <s-number data-el="midGainControl" value="${bandConfig.mid.gain ?? 1}" default="1" min="0" max="3" step="0.1"></s-number>
                    <s-number data-el="highGainControl" value="${bandConfig.high.gain ?? 1}" default="1" min="0" max="3" step="0.1"></s-number>
                </div>
                <div class="band-col">
                    <span class="band-col-label">Expand</span>
                    <s-number data-el="bassReactControl" value="${bandConfig.bass.react ?? 2}" default="2" min="1" max="10" step="0.1"></s-number>
                    <s-number data-el="midReactControl" value="${bandConfig.mid.react ?? 2}" default="2" min="1" max="10" step="0.1"></s-number>
                    <s-number data-el="highReactControl" value="${bandConfig.high.react ?? 2}" default="2" min="1" max="10" step="0.1"></s-number>
                </div>
                <div class="band-col">
                    <span class="band-col-label">Smooth</span>
                    <s-number data-el="bassSmoothControl" class="band-dot-bass" value="${bandConfig.bass.smooth ?? 0.3}" default="0.3" min="0" max="0.95" step="0.05"></s-number>
                    <s-number data-el="midSmoothControl" class="band-dot-mid" value="${bandConfig.mid.smooth ?? 0.3}" default="0.3" min="0" max="0.95" step="0.05"></s-number>
                    <s-number data-el="highSmoothControl" class="band-dot-high" value="${bandConfig.high.smooth ?? 0.3}" default="0.3" min="0" max="0.95" step="0.05"></s-number>
                </div>
            </div>
        </div>
    `
}

/**
 * Creates scope UI for a node, wires up AudioScope with change propagation.
 * Stores the AudioScope instance on node.runtimeState.scope.
 * @param {Object} node - The node instance
 * @param {HTMLElement} container - Container element to append to
 */
export function createBandEQUI(node, container) {
    const html = createScopeHTML(node.values.bandConfig)
    const fragment = StringToFragment(html)
    Object.assign(node.elements, autowire(fragment))
    container.appendChild(fragment)
    attachBandEQListeners(node)

    node.runtimeState.scope = null
}

/**
 * Ensures AudioScope is initialized and draws a frame.
 * @param {Object} node - The node instance
 * @param {Object} analyzer - AudioAnalyzer instance
 */
export function drawScope(node, analyzer) {
    const canvas = node.elements.scopeCanvas
    if(!canvas || !analyzer) return

    // Lazy-init the scope once the canvas has layout dimensions
    if(!node.runtimeState.scope) {
        setupScopeCanvas(canvas)
        node.runtimeState.scope = new AudioScope(canvas, node.values.bandConfig, (band, param, value) => {
            node.values.bandConfig[band][param] = value
            if(node.runtimeState.analyzer) {
                node.runtimeState.analyzer.bandConfig[band][param] = value
            }
        })
    }

    node.runtimeState.scope.draw(analyzer)
}

// Aliases used by nodes that build their own HTML layout
export function createBandEQControlsHTML(bandConfig) { return createScopeHTML(bandConfig) }
export function attachBandEQListeners(node) {
    const controls = [
        ['bassGainControl', 'bass', 'gain'],
        ['bassSmoothControl', 'bass', 'smooth'],
        ['bassReactControl', 'bass', 'react'],
        ['midGainControl', 'mid', 'gain'],
        ['midSmoothControl', 'mid', 'smooth'],
        ['midReactControl', 'mid', 'react'],
        ['highGainControl', 'high', 'gain'],
        ['highSmoothControl', 'high', 'smooth'],
        ['highReactControl', 'high', 'react']
    ]
    controls.forEach(([elName, band, param]) => {
        if(node.elements[elName]) {
            node.elements[elName].addEventListener('input', (e) => {
                const value = parseFloat(e.target.value)
                node.values.bandConfig[band][param] = value
                if(node.runtimeState.analyzer) {
                    node.runtimeState.analyzer.bandConfig[band][param] = value
                }
            })
        }
    })
}

/**
 * Default band configuration
 */
export const DEFAULT_BAND_CONFIG = {
    bass: {freq: 100, q: 1.0, gain: 1, smooth: 0.3, react: 2},
    mid: {freq: 1000, q: 1.0, gain: 1, smooth: 0.3, react: 2},
    high: {freq: 8000, q: 1.0, gain: 1, smooth: 0.3, react: 2}
}

/**
 * Ensures band config exists with defaults
 * @param {Object} node - The node instance
 */
export function ensureBandConfig(node) {
    if(!node.values.bandConfig) {
        node.values.bandConfig = {
            bass: {...DEFAULT_BAND_CONFIG.bass},
            mid: {...DEFAULT_BAND_CONFIG.mid},
            high: {...DEFAULT_BAND_CONFIG.high}
        }
    }
    // Migrate: ensure each band has smooth and react
    for(const band of ['bass', 'mid', 'high']) {
        if(node.values.bandConfig[band]) {
            if(node.values.bandConfig[band].gain === undefined) node.values.bandConfig[band].gain = 1
            if(node.values.bandConfig[band].smooth === undefined) node.values.bandConfig[band].smooth = 0.3
            if(node.values.bandConfig[band].react === undefined) node.values.bandConfig[band].react = 2
        }
    }
}

/**
 * Creates an oscilloscope output port definition.
 * @param {Function} getWaveformData - Called with `this` bound to the node, returns Uint8Array
 */
export function makeOscilloscopeOutput(getWaveformData) {
    return {
        label: 'Oscilloscope',
        type: 'color',
        genCode(cc, funcName, uniformName){
            return `vec4 ${funcName}(vec2 uv) {
    vec2 coord = uv;
    vec4 color = vec4(0.0, 0.0, 0.0, 0.0);

    float x = (coord.x + 1.0) * 0.5;
    float sampleIndex = x * 512.0;
    int idx = int(sampleIndex);

    float waveValue = (texture(${uniformName}, vec2(float(idx) / 512.0, 0.5)).r - 0.5) * 2.0;

    float lineY = waveValue * 0.95;
    float distance = abs(coord.y - lineY);
    float lineThickness = 0.02;

    if (distance < lineThickness) {
        color = vec4(1.0, 1.0, 1.0, 1.0);
    }

    return color;
}`
        },
        textureUniformUpdate(uniformName, gl, program, textureUnit, textureMap){
            const waveformData = getWaveformData.call(this)
            if(!waveformData) return

            let entry = textureMap.get(this.output.oscilloscope)
            if(!entry){
                const tex = gl.createTexture()
                entry = {tex, init: false}
                textureMap.set(this.output.oscilloscope, entry)
                gl.bindTexture(gl.TEXTURE_2D, tex)
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT)
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT)
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
            }

            gl.activeTexture(gl.TEXTURE0 + textureUnit)
            gl.bindTexture(gl.TEXTURE_2D, entry.tex)

            if(entry.init){
                gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 512, 1, gl.RED, gl.UNSIGNED_BYTE, waveformData)
            } else {
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 512, 1, 0, gl.RED, gl.UNSIGNED_BYTE, waveformData)
                entry.init = true
            }

            const location = gl.getUniformLocation(program, uniformName)
            gl.uniform1i(location, textureUnit)
        }
    }
}

/**
 * Applies band config to analyzer instance
 * @param {Object} analyzer - AudioAnalyzer instance
 * @param {Object} bandConfig - Band configuration object
 */
export function applyBandConfig(analyzer, bandConfig) {
    analyzer.bandConfig = {
        bass: {...bandConfig.bass},
        mid: {...bandConfig.mid},
        high: {...bandConfig.high}
    }
}
