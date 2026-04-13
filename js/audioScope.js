// audioScope.js - Combined spectrum + exciter scope canvas widget
//
// Top: frequency spectrum with draggable band dots (X=freq, Y=Q)
// Bottom: per-band scope lanes showing the exciter pipeline:
//   1. Raw FFT energy — thin bottom-filled area
//   2. Excited (post-exciter, pre-smooth) — thin line
//   3. Output (post-smooth) — glowing thick line
//   4. Circle at right edge — current output value

import {getBinRange} from './audioHistogram.js'

const BAND_COLORS = {
    bass: {r: 255, g: 102, b: 102},
    mid:  {r: 102, g: 255, b: 102},
    high: {r: 102, g: 102, b: 255}
}
const BANDS = ['bass', 'mid', 'high']
const SCOPE_HISTORY = 120

export class AudioScope {
    constructor(canvas, bandConfig, onChange) {
        this.canvas = canvas
        this.bandConfig = bandConfig
        this.onChange = onChange

        this.history = {
            bass:  {raw: new Float32Array(SCOPE_HISTORY), excited: new Float32Array(SCOPE_HISTORY), output: new Float32Array(SCOPE_HISTORY)},
            mid:   {raw: new Float32Array(SCOPE_HISTORY), excited: new Float32Array(SCOPE_HISTORY), output: new Float32Array(SCOPE_HISTORY)},
            high:  {raw: new Float32Array(SCOPE_HISTORY), excited: new Float32Array(SCOPE_HISTORY), output: new Float32Array(SCOPE_HISTORY)}
        }
        this.historyIndex = 0
        this._binCount = 256

        // Drag state (dots only)
        this._dragging = null
        this._addEventListeners()
    }

    _layout() {
        const w = this.canvas.width
        const h = this.canvas.height
        const spectrumH = Math.round(h * 0.4)
        const scopeH = h - spectrumH
        const laneH = Math.floor(scopeH / 3)
        return {w, h, spectrumH, scopeH, laneH}
    }

    // Freq/Q ↔ pixel conversions using the same log axis as FFT bars
    _freqToX(freq, w) {
        const bin = freq / (48000 / (this._binCount * 2))
        return (Math.log(bin + 1) / Math.log(this._binCount)) * w
    }
    _xToFreq(x, w) {
        const bin = Math.pow(this._binCount, x / w) - 1
        return bin * (48000 / (this._binCount * 2))
    }
    _qToY(q, spectrumH) {
        const t = (Math.log(q) - Math.log(0.3)) / (Math.log(12) - Math.log(0.3))
        return spectrumH - t * (spectrumH - 8) - 4
    }
    _yToQ(y, spectrumH) {
        const t = (spectrumH - y - 4) / (spectrumH - 8)
        return Math.exp(Math.log(0.3) + Math.max(0, Math.min(1, t)) * (Math.log(12) - Math.log(0.3)))
    }

    _pushHistory(analyzer) {
        const idx = this.historyIndex % SCOPE_HISTORY
        for(const band of BANDS) {
            const bs = analyzer.bandState[band]
            const gain = this.bandConfig[band]?.gain ?? 1
            const invGain = gain > 0 ? 1 / gain : 0
            this.history[band].raw[idx] = Math.min(1, bs.raw * invGain)
            this.history[band].excited[idx] = Math.min(1, bs.excited * invGain)
            this.history[band].output[idx] = Math.min(1, bs.output * invGain)
        }
        this.historyIndex++
    }

    draw(analyzer) {
        if(!analyzer) return
        this._binCount = analyzer.frequencyData.length
        this._pushHistory(analyzer)

        const ctx = this.canvas.getContext('2d')
        const {w, h, spectrumH, laneH} = this._layout()
        ctx.clearRect(0, 0, w, h)

        this._drawSpectrum(ctx, analyzer, w, spectrumH)
        this._drawScopes(ctx, analyzer, w, spectrumH, laneH)
    }

    _drawSpectrum(ctx, analyzer, w, spectrumH) {
        const frequencyData = analyzer.frequencyData
        const binCount = frequencyData.length
        const fftSize = binCount * 2

        const bandBins = {}
        for(const band of BANDS) {
            const cfg = this.bandConfig[band]
            bandBins[band] = getBinRange(cfg.freq, cfg.q, 48000, fftSize)
        }

        let prevX = 0
        for(let i = 0; i < binCount; i++) {
            const value = frequencyData[i] / 255
            const barHeight = value * spectrumH
            const logPosition = Math.log(i + 1) / Math.log(binCount)
            const x = logPosition * w
            const barWidth = x - prevX

            let r = 40, g = 40, b = 40
            for(const band of BANDS) {
                if(i >= bandBins[band][0] && i <= bandBins[band][1]) {
                    const c = BAND_COLORS[band]
                    r = Math.max(r, c.r >> 1); g = Math.max(g, c.g >> 1); b = Math.max(b, c.b >> 1)
                }
            }

            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.4)`
            ctx.fillRect(prevX, spectrumH - barHeight, barWidth, barHeight)
            prevX = x
        }

        ctx.fillStyle = 'rgba(255,255,255,0.1)'
        ctx.fillRect(0, spectrumH - 1, w, 1)

        // Draggable dots
        for(const band of BANDS) {
            const cfg = this.bandConfig[band]
            const c = BAND_COLORS[band]
            const x = this._freqToX(cfg.freq, w)
            const y = this._qToY(cfg.q, spectrumH)
            const isActive = this._dragging?.band === band
            const radius = isActive ? 8 : 6

            ctx.beginPath()
            ctx.arc(x, y, radius, 0, Math.PI * 2)
            ctx.fillStyle = `rgb(${c.r}, ${c.g}, ${c.b})`
            ctx.fill()
            ctx.strokeStyle = isActive ? 'white' : 'black'
            ctx.lineWidth = isActive ? 2 : 2
            ctx.stroke()
        }
    }

    _drawScopes(ctx, analyzer, w, spectrumTop, laneH) {
        const len = SCOPE_HISTORY
        const start = this.historyIndex
        const xStep = w / len

        for(let i = 0; i < BANDS.length; i++) {
            const band = BANDS[i]
            const c = BAND_COLORS[band]
            const laneTop = spectrumTop + i * laneH
            const hist = this.history[band]

            // Lane separator
            ctx.fillStyle = 'rgba(255,255,255,0.06)'
            ctx.fillRect(0, laneTop, w, 1)

            // --- 1. Raw: bottom-filled area (dim) ---
            ctx.beginPath()
            ctx.moveTo(0, laneTop + laneH)
            for(let j = 0; j < len; j++) {
                const v = hist.raw[(start + j) % len]
                ctx.lineTo(j * xStep, laneTop + laneH - v * laneH)
            }
            ctx.lineTo(w, laneTop + laneH)
            ctx.closePath()
            ctx.fillStyle = `rgba(${c.r >> 1}, ${c.g >> 1}, ${c.b >> 1}, 0.25)`
            ctx.fill()

            // --- 2. Excited: thin line (post-exciter, pre-smooth) ---
            ctx.beginPath()
            for(let j = 0; j < len; j++) {
                const v = hist.excited[(start + j) % len]
                const x = j * xStep
                const y = laneTop + laneH - v * laneH
                if(j === 0) ctx.moveTo(x, y)
                else ctx.lineTo(x, y)
            }
            ctx.strokeStyle = `rgba(${c.r}, ${c.g}, ${c.b}, 0.35)`
            ctx.lineWidth = 1
            ctx.stroke()

            // --- 3. Output: glowing thick line (post-smooth) ---
            // Glow pass
            ctx.beginPath()
            for(let j = 0; j < len; j++) {
                const v = hist.output[(start + j) % len]
                const x = j * xStep
                const y = laneTop + laneH - v * laneH
                if(j === 0) ctx.moveTo(x, y)
                else ctx.lineTo(x, y)
            }
            ctx.strokeStyle = `rgba(${c.r}, ${c.g}, ${c.b}, 0.2)`
            ctx.lineWidth = 4
            ctx.stroke()
            // Sharp pass
            ctx.strokeStyle = `rgb(${c.r}, ${c.g}, ${c.b})`
            ctx.lineWidth = 1.5
            ctx.stroke()

            // --- 4. Circle at right edge: current output value ---
            const gain = this.bandConfig[band]?.gain ?? 1
            const currentOutput = gain > 0 ? Math.min(1, analyzer.bandState[band].output / gain) : 0
            const circleX = w - 6
            const circleY = laneTop + laneH - currentOutput * laneH
            ctx.beginPath()
            ctx.arc(circleX, circleY, 4, 0, Math.PI * 2)
            ctx.strokeStyle = `rgb(${c.r}, ${c.g}, ${c.b})`
            ctx.lineWidth = 1.5
            ctx.stroke()

            // Band label
            ctx.fillStyle = `rgba(${c.r}, ${c.g}, ${c.b}, 0.35)`
            ctx.font = '9px monospace'
            ctx.textAlign = 'left'
            ctx.fillText(band[0].toUpperCase(), 3, laneTop + 10)
        }
    }

    // Hit-test: only dots in the spectrum area
    _hitTest(canvasX, canvasY) {
        const {w, spectrumH} = this._layout()
        if(canvasY > spectrumH) return null

        for(const band of BANDS) {
            const cfg = this.bandConfig[band]
            const dotX = this._freqToX(cfg.freq, w)
            const dotY = this._qToY(cfg.q, spectrumH)
            if(Math.hypot(canvasX - dotX, canvasY - dotY) < 12) return {band}
        }
        return null
    }

    _canvasCoords(e) {
        const rect = this.canvas.getBoundingClientRect()
        return {
            x: (e.clientX - rect.left) * (this.canvas.width / rect.width),
            y: (e.clientY - rect.top) * (this.canvas.height / rect.height)
        }
    }

    _addEventListeners() {
        const canvas = this.canvas

        canvas.addEventListener('pointerdown', (e) => {
            const {x, y} = this._canvasCoords(e)
            const hit = this._hitTest(x, y)
            if(!hit) return

            e.preventDefault()
            canvas.setPointerCapture(e.pointerId)
            canvas.style.cursor = 'grabbing'
            this._dragging = hit
        })

        canvas.addEventListener('pointermove', (e) => {
            if(!this._dragging) {
                const {x, y} = this._canvasCoords(e)
                canvas.style.cursor = this._hitTest(x, y) ? 'grab' : 'default'
                return
            }

            e.preventDefault()
            const {w, spectrumH} = this._layout()
            const {x, y} = this._canvasCoords(e)

            const freq = Math.max(20, Math.min(22000, this._xToFreq(x, w)))
            const q = Math.max(0.3, Math.min(12, this._yToQ(y, spectrumH)))

            this.bandConfig[this._dragging.band].freq = Math.round(freq)
            this.bandConfig[this._dragging.band].q = parseFloat(q.toFixed(1))
            this.onChange(this._dragging.band, 'freq', this.bandConfig[this._dragging.band].freq)
            this.onChange(this._dragging.band, 'q', this.bandConfig[this._dragging.band].q)
        })

        const endDrag = (e) => {
            this._dragging = null
            const {x, y} = this._canvasCoords(e)
            canvas.style.cursor = this._hitTest(x, y) ? 'grab' : 'default'
        }
        canvas.addEventListener('pointerup', endDrag)
        canvas.addEventListener('pointercancel', endDrag)
    }

    destroy() {}
}

export function setupScopeCanvas(canvas) {
    if(!canvas) return
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio > 1 ? 2 : 1
    canvas.width = rect.width * dpr
    canvas.height = 160 * dpr
}
