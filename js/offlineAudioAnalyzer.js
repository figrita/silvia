/**
 * OfflineAudioAnalyzer — computes audio band values for arbitrary timestamps
 * from a decoded AudioBuffer, matching the realtime AudioAnalyzer's output.
 *
 * Pipeline: extract samples → FFT → frequency bins → band extraction → exciter
 */
export class OfflineAudioAnalyzer {
    audioValues = {bass: 0, mid: 0, high: 0}
    bandState = {
        bass:  {raw: 0, excited: 0, output: 0},
        mid:   {raw: 0, excited: 0, output: 0},
        high:  {raw: 0, excited: 0, output: 0}
    }
    waveformData = new Uint8Array(512)
    frequencyData = new Uint8Array(256)

    #audioBuffer = null
    #sampleRate = 48000
    #fftSize = 512
    #binCount = 256
    #smoothingTimeConstant = 0.3

    // Matches AnalyserNode temporal smoothing between consecutive FFT frames
    #prevFreqData = null

    // Band configuration (mirrors AudioAnalyzer defaults, overwritten by applyBandConfig)
    bandConfig = {
        bass: {freq: 100, q: 1.0, gain: 1, smooth: 0.3, react: 2},
        mid: {freq: 1000, q: 1.0, gain: 1, smooth: 0.3, react: 2},
        high: {freq: 8000, q: 1.0, gain: 1, smooth: 0.3, react: 2}
    }

    // Per-band exciter state (mirrors AudioAnalyzer)
    #exciterState = {
        bass:  {history: new Array(30).fill(0), sorted: new Array(30).fill(0), index: 0, smoothed: 0, median: 0, excited: 0},
        mid:   {history: new Array(30).fill(0), sorted: new Array(30).fill(0), index: 0, smoothed: 0, median: 0, excited: 0},
        high:  {history: new Array(30).fill(0), sorted: new Array(30).fill(0), index: 0, smoothed: 0, median: 0, excited: 0}
    }

    // Pre-computed Hann window for FFT
    #window = null

    /**
     * Initialize from an audio/video element's source URL.
     * Decodes the entire audio file into an AudioBuffer.
     * @param {string} src - URL of the audio/video file
     */
    async initFromURL(src) {
        const response = await fetch(src)
        const arrayBuffer = await response.arrayBuffer()
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
        this.#audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
        this.#sampleRate = this.#audioBuffer.sampleRate
        await audioCtx.close()

        // Pre-compute Hann window
        this.#window = new Float32Array(this.#fftSize)
        for (let i = 0; i < this.#fftSize; i++) {
            this.#window[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (this.#fftSize - 1)))
        }

        this.#prevFreqData = new Float32Array(this.#binCount)
    }

    /**
     * Reset all stateful analysis (exciter, smoothing) to initial values.
     * Call before starting a new offline render pass.
     */
    reset() {
        this.audioValues = {bass: 0, mid: 0, high: 0}
        this.#prevFreqData?.fill(0)
        for (const band of ['bass', 'mid', 'high']) {
            const st = this.#exciterState[band]
            st.history.fill(0)
            st.sorted.fill(0)
            st.index = 0
            st.smoothed = 0
            st.median = 0
            st.excited = 0
            this.bandState[band] = {raw: 0, excited: 0, output: 0}
        }
    }

    /**
     * Analyze audio at a specific timestamp.
     * Must be called sequentially (frame 0, frame 1, ...) for exciter state to be correct.
     * @param {number} time - Time in seconds
     */
    analyzeAtTime(time) {
        if (!this.#audioBuffer) return

        // Handle looping / out-of-bounds
        const duration = this.#audioBuffer.duration
        if (duration <= 0) return
        const t = ((time % duration) + duration) % duration

        // Extract samples centered at time t
        const centerSample = Math.floor(t * this.#sampleRate)
        const startSample = centerSample - Math.floor(this.#fftSize / 2)

        // Mix all channels to mono
        const samples = new Float32Array(this.#fftSize)
        const numChannels = this.#audioBuffer.numberOfChannels
        for (let ch = 0; ch < numChannels; ch++) {
            const channelData = this.#audioBuffer.getChannelData(ch)
            for (let i = 0; i < this.#fftSize; i++) {
                const idx = startSample + i
                if (idx >= 0 && idx < channelData.length) {
                    samples[i] += channelData[idx]
                }
            }
        }
        // Average channels
        if (numChannels > 1) {
            for (let i = 0; i < this.#fftSize; i++) {
                samples[i] /= numChannels
            }
        }

        // Update waveform data (time domain, 0-255 range like getByteTimeDomainData)
        for (let i = 0; i < this.#fftSize; i++) {
            this.waveformData[i] = Math.max(0, Math.min(255, Math.round((samples[i] + 1) * 128)))
        }

        // Apply Hann window
        for (let i = 0; i < this.#fftSize; i++) {
            samples[i] *= this.#window[i]
        }

        // FFT (real-valued input → magnitude spectrum)
        const {real, imag} = this.#fft(samples)

        // Convert to byte frequency data (matching getByteFrequencyData behavior)
        // AnalyserNode uses: dB = 20 * log10(magnitude), then maps [-100dB, -30dB] → [0, 255]
        const currentFreqData = new Float32Array(this.#binCount)
        for (let i = 0; i < this.#binCount; i++) {
            const magnitude = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]) / this.#fftSize
            const dB = magnitude > 0 ? 20 * Math.log10(magnitude) : -200
            // Map [-100, -30] to [0, 255] (AnalyserNode default: minDecibels=-100, maxDecibels=-30)
            const normalized = (dB + 100) / 70
            currentFreqData[i] = Math.max(0, Math.min(255, normalized * 255))
        }

        // Apply temporal smoothing (matches AnalyserNode.smoothingTimeConstant)
        const s = this.#smoothingTimeConstant
        for (let i = 0; i < this.#binCount; i++) {
            this.#prevFreqData[i] = s * this.#prevFreqData[i] + (1 - s) * currentFreqData[i]
            this.frequencyData[i] = Math.round(this.#prevFreqData[i])
        }

        // Band extraction and exciter (identical to AudioAnalyzer.#analyze)
        const getWeightedAverage = (start, end, powerCurve = 0.6) => {
            let sum = 0
            let weightSum = 0
            for (let i = start; i <= end; i++) {
                const weight = Math.log(i + 1)
                sum += this.frequencyData[i] * weight
                weightSum += weight
            }
            if (weightSum === 0) return 0
            const rawAvg = (sum / weightSum) / 255
            return Math.pow(rawAvg, powerCurve)
        }

        const bands = [
            ['bass', 0.5],
            ['mid',  0.6],
            ['high', 0.7]
        ]

        for (const [band, powerCurve] of bands) {
            const cfg = this.bandConfig[band]
            const bins = this.#getBinRange(cfg.freq, cfg.q)
            const raw = getWeightedAverage(...bins, powerCurve) * (cfg.gain ?? 1)
            this.audioValues[band] = this.#excite(raw, this.#exciterState[band], cfg.smooth ?? 0.3, cfg.react ?? 2)
            const st = this.#exciterState[band]
            this.bandState[band].raw = raw
            this.bandState[band].excited = st.excited
            this.bandState[band].output = this.audioValues[band]
        }
    }

    // --- Private methods (matching AudioAnalyzer) ---

    #freqToBin(freq) {
        const binWidth = this.#sampleRate / this.#fftSize
        return Math.round(freq / binWidth)
    }

    #getBinRange(centerFreq, q) {
        const bandwidth = centerFreq / q
        const startFreq = Math.max(0, centerFreq - bandwidth / 2)
        const endFreq = centerFreq + bandwidth / 2
        const startBin = this.#freqToBin(startFreq)
        const endBin = this.#freqToBin(endFreq)
        return [Math.max(1, startBin), Math.min(endBin, this.#binCount - 1)]
    }

    /**
     * Exciter: identical to AudioAnalyzer.#excite
     */
    #excite(raw, state, smoothFactor, react) {
        if (!isFinite(raw)) raw = 0

        const old = state.history[state.index]
        state.sorted.splice(state.sorted.indexOf(old), 1)

        let i = 0
        while (i < state.sorted.length && state.sorted[i] < raw) i++
        state.sorted.splice(i, 0, raw)

        state.history[state.index] = raw
        state.index = (state.index + 1) % state.history.length

        state.median = state.sorted[15]

        const deviation = raw - state.median
        const expanded = deviation * react
        const softened = Math.tanh(expanded) * 0.5
        const excited = Math.max(0, state.median + softened)
        state.excited = excited

        state.smoothed += (excited - state.smoothed) * (1 - smoothFactor)
        if (!isFinite(state.smoothed)) state.smoothed = 0
        return state.smoothed
    }

    /**
     * Radix-2 Cooley-Tukey FFT (in-place, decimation-in-time)
     * Input must be power-of-2 length.
     */
    #fft(input) {
        const N = input.length
        const real = new Float32Array(N)
        const imag = new Float32Array(N)

        // Bit-reversal permutation
        for (let i = 0; i < N; i++) {
            real[this.#bitReverse(i, N)] = input[i]
        }

        // Butterfly passes
        for (let size = 2; size <= N; size *= 2) {
            const halfSize = size / 2
            const step = -2 * Math.PI / size
            for (let i = 0; i < N; i += size) {
                for (let j = 0; j < halfSize; j++) {
                    const angle = step * j
                    const wr = Math.cos(angle)
                    const wi = Math.sin(angle)
                    const idx1 = i + j
                    const idx2 = i + j + halfSize
                    const tr = real[idx2] * wr - imag[idx2] * wi
                    const ti = real[idx2] * wi + imag[idx2] * wr
                    real[idx2] = real[idx1] - tr
                    imag[idx2] = imag[idx1] - ti
                    real[idx1] += tr
                    imag[idx1] += ti
                }
            }
        }

        return {real, imag}
    }

    #bitReverse(x, N) {
        const bits = Math.log2(N)
        let result = 0
        for (let i = 0; i < bits; i++) {
            result = (result << 1) | (x & 1)
            x >>= 1
        }
        return result
    }
}
