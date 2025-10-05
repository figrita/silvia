// audioHistogram.js - Shared histogram visualization for audio nodes

import {autowire, StringToFragment} from './utils.js'

/**
 * Sets up histogram canvas resolution
 * @param {HTMLCanvasElement} canvas - The canvas element
 */
export function setupHistogramCanvas(canvas) {
    if(!canvas) return

    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width
    canvas.height = 80
}

/**
 * Calculates bin range from center frequency and Q factor
 * @param {number} centerFreq - Center frequency in Hz
 * @param {number} q - Q factor (higher = narrower bandwidth)
 * @param {number} sampleRate - Sample rate (default 48000)
 * @returns {Array} - [startBin, endBin]
 */
export function getBinRange(centerFreq, q, sampleRate = 48000) {
    const fftSize = 1024
    const binWidth = sampleRate / fftSize

    const bandwidth = centerFreq / q
    const startFreq = Math.max(0, centerFreq - bandwidth / 2)
    const endFreq = centerFreq + bandwidth / 2

    const startBin = Math.round(startFreq / binWidth)
    const endBin = Math.round(endFreq / binWidth)

    return [Math.max(1, startBin), Math.min(endBin, 511)]
}

/**
 * Draws frequency histogram with color-coded bands
 * @param {HTMLCanvasElement} canvas - The canvas element
 * @param {Object} analyzer - AudioAnalyzer instance
 */
export function drawHistogram(canvas, analyzer) {
    if(!canvas || !analyzer) return

    const ctx = canvas.getContext('2d')
    const width = canvas.width
    const height = canvas.height
    const frequencyData = analyzer.frequencyData
    const binCount = frequencyData.length // 512 bins

    ctx.clearRect(0, 0, width, height)

    // Get bin ranges for each band
    const bassBins = analyzer.bandConfig.bass ?
        getBinRange(analyzer.bandConfig.bass.freq, analyzer.bandConfig.bass.q) : [0, 0]
    const midBins = analyzer.bandConfig.mid ?
        getBinRange(analyzer.bandConfig.mid.freq, analyzer.bandConfig.mid.q) : [0, 0]
    const highBins = analyzer.bandConfig.high ?
        getBinRange(analyzer.bandConfig.high.freq, analyzer.bandConfig.high.q) : [0, 0]

    // Draw bars with logarithmic x-axis mapping
    let prevX = 0
    for(let i = 0; i < binCount; i++) {
        const value = frequencyData[i] / 255 // Normalize to 0-1
        const barHeight = value * height

        // Logarithmic x position mapping
        const logPosition = Math.log(i + 1) / Math.log(binCount)
        const x = logPosition * width
        const barWidth = x - prevX

        // Determine RGB channels based on band membership
        let r = 0, g = 0, b = 0
        const intensity = 255

        if(i >= bassBins[0] && i <= bassBins[1]) r = intensity // Bass - red
        if(i >= midBins[0] && i <= midBins[1]) g = intensity // Mid - green
        if(i >= highBins[0] && i <= highBins[1]) b = intensity // High - blue

        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`
        ctx.fillRect(prevX, height - barHeight, barWidth, barHeight)

        // White peak line at top of each bar
        if(barHeight > 0) {
            ctx.fillStyle = 'white'
            ctx.fillRect(prevX, height - barHeight, barWidth, 1)
        }

        prevX = x
    }
}

/**
 * Generates HTML for band EQ controls
 * @param {Object} bandConfig - Band configuration object {bass: {freq, q}, mid: {freq, q}, high: {freq, q}}
 * @returns {string} - HTML string
 */
export function createBandEQControlsHTML(bandConfig) {
    return `
        <details style="margin: 0.5rem; border-top: 1px solid #444; padding-top: 0.5rem;">
            <summary style="cursor: pointer; color: #ccc; font-size: 11px; user-select: none;">Spectrum & EQ</summary>
            <div style="display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.5rem; padding: 0.5rem; background: rgba(0,0,0,0.2); border-radius: 4px;">
                <canvas data-el="histogramCanvas" style="width: 100%; height: 80px; background: rgba(0,0,0,0.3); border-radius: 4px; display: none; margin-bottom: 0.5rem;"></canvas>

                <div style="color: #ff6666; font-size: 11px; font-weight: bold; margin-bottom: 0.25rem;">Bass</div>
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <label style="color: #ccc; font-size: 11px; min-width: 60px;">Freq:</label>
                    <s-number data-el="bassFreqControl" value="${bandConfig.bass.freq}" default="100" min="20" max="22000" step="1" unit="Hz" log-scale style="flex: 1;"></s-number>
                </div>
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <label style="color: #ccc; font-size: 11px; min-width: 60px;">Q:</label>
                    <s-number data-el="bassQControl" value="${bandConfig.bass.q}" default="1.0" min="0.1" max="10" step="0.1" log-scale style="flex: 1;"></s-number>
                </div>

                <div style="color: #66ff66; font-size: 11px; font-weight: bold; margin-bottom: 0.25rem; margin-top: 0.5rem;">Mid</div>
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <label style="color: #ccc; font-size: 11px; min-width: 60px;">Freq:</label>
                    <s-number data-el="midFreqControl" value="${bandConfig.mid.freq}" default="1000" min="20" max="22000" step="1" unit="Hz" log-scale style="flex: 1;"></s-number>
                </div>
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <label style="color: #ccc; font-size: 11px; min-width: 60px;">Q:</label>
                    <s-number data-el="midQControl" value="${bandConfig.mid.q}" default="1.0" min="0.1" max="10" step="0.1" log-scale style="flex: 1;"></s-number>
                </div>

                <div style="color: #6666ff; font-size: 11px; font-weight: bold; margin-bottom: 0.25rem; margin-top: 0.5rem;">High</div>
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <label style="color: #ccc; font-size: 11px; min-width: 60px;">Freq:</label>
                    <s-number data-el="highFreqControl" value="${bandConfig.high.freq}" default="8000" min="20" max="22000" step="1" unit="Hz" log-scale style="flex: 1;"></s-number>
                </div>
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <label style="color: #ccc; font-size: 11px; min-width: 60px;">Q:</label>
                    <s-number data-el="highQControl" value="${bandConfig.high.q}" default="1.0" min="0.1" max="10" step="0.1" log-scale style="flex: 1;"></s-number>
                </div>
            </div>
        </details>
    `
}

/**
 * Attaches event listeners to band EQ controls
 * @param {Object} node - The node instance
 */
export function attachBandEQListeners(node) {
    const bandControls = [
        ['bassFreqControl', 'bass', 'freq'],
        ['bassQControl', 'bass', 'q'],
        ['midFreqControl', 'mid', 'freq'],
        ['midQControl', 'mid', 'q'],
        ['highFreqControl', 'high', 'freq'],
        ['highQControl', 'high', 'q']
    ]

    bandControls.forEach(([elementName, band, param]) => {
        if(node.elements[elementName]) {
            node.elements[elementName].addEventListener('input', (e) => {
                const value = parseFloat(e.target.value)
                // Save to values for persistence
                node.values.bandConfig[band][param] = value
                // Update analyzer if it exists
                if(node.runtimeState.analyzer) {
                    node.runtimeState.analyzer.bandConfig[band][param] = value
                }
            })
        }
    })
}

/**
 * Creates complete band EQ UI and attaches listeners
 * @param {Object} node - The node instance
 * @param {HTMLElement} container - Container element to append to
 */
export function createBandEQUI(node, container) {
    const html = createBandEQControlsHTML(node.values.bandConfig)
    const fragment = StringToFragment(html)
    Object.assign(node.elements, autowire(fragment))
    container.appendChild(fragment)
    attachBandEQListeners(node)
}

/**
 * Default band configuration
 */
export const DEFAULT_BAND_CONFIG = {
    bass: {freq: 100, q: 1.0},
    mid: {freq: 1000, q: 1.0},
    high: {freq: 8000, q: 1.0}
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
