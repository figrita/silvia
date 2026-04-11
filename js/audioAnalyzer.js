// audioAnalyzer.js

/**
 * A reusable class for performing frequency analysis on audio from
 * HTMLMediaElements or MediaStreams.
 */
export class AudioAnalyzer{
    // Public state that nodes can read from.
    audioValues = {bass: 0, mid: 0, high: 0}
    // Per-band diagnostic state for scope visualization
    bandState = {
        bass:  {raw: 0, excited: 0, output: 0},
        mid:   {raw: 0, excited: 0, output: 0},
        high:  {raw: 0, excited: 0, output: 0}
    }
    waveformData = new Uint8Array(512) // Time domain data for oscilloscope
    frequencyData = new Uint8Array(256) // Frequency bin data for histogram

    // Band configuration (center frequency in Hz, Q factor, and per-band exciter smoothing)
    bandConfig = {
        bass: {freq: 100, q: 1.0, gain: 1, smooth: 0.3, react: 2},
        mid: {freq: 1000, q: 1.0, gain: 1, smooth: 0.3, react: 2},
        high: {freq: 8000, q: 1.0, gain: 1, smooth: 0.3, react: 2}
    }

    // Per-band exciter state: rolling median via maintained sorted array
    #exciterState = {
        bass:  {history: new Array(30).fill(0), sorted: new Array(30).fill(0), index: 0, smoothed: 0, median: 0, excited: 0},
        mid:   {history: new Array(30).fill(0), sorted: new Array(30).fill(0), index: 0, smoothed: 0, median: 0, excited: 0},
        high:  {history: new Array(30).fill(0), sorted: new Array(30).fill(0), index: 0, smoothed: 0, median: 0, excited: 0}
    }

    // --- Private state members ---
    #audioCtx = null
    #analyser = null
    #sourceNode = null
    #dataArray = null
    #timeDomainArray = null
    #animationFrameId = null

    // For file-based source synchronization
    #visibleElement = null
    #shadowPlayer = null

    constructor(){
        // No binding needed in the constructor when using arrow function class fields.
    }

    /**
     * Helper to convert frequency (Hz) to bin index
     * @param {number} freq - Frequency in Hz
     * @returns {number} - Bin index
     */
    #freqToBin(freq){
        const sampleRate = this.#audioCtx?.sampleRate || 48000
        const binWidth = sampleRate / (this.#analyser?.fftSize || 512)
        return Math.round(freq / binWidth)
    }

    /**
     * Helper to calculate bin range from center frequency and Q
     * @param {number} centerFreq - Center frequency in Hz
     * @param {number} q - Q factor (higher = narrower bandwidth)
     * @returns {Array} - [startBin, endBin]
     */
    #getBinRange(centerFreq, q){
        const bandwidth = centerFreq / q
        const startFreq = Math.max(0, centerFreq - bandwidth / 2)
        const endFreq = centerFreq + bandwidth / 2

        const startBin = this.#freqToBin(startFreq)
        const endBin = this.#freqToBin(endFreq)

        const maxBin = (this.#analyser?.frequencyBinCount || 256) - 1
        return [Math.max(1, startBin), Math.min(endBin, maxBin)]
    }

    /**
     * Sets the playback rate for the internal shadow audio player.
     * @param {number} rate The desired playback rate (e.g., 1.0 for normal, 0.5 for half-speed).
     */
    setPlaybackRate(rate){
        if(this.#shadowPlayer){
            this.#shadowPlayer.playbackRate = rate
        }
    }

    /**
     * Initializes the analyzer from an <audio> or <video> element.
     * Uses a shadow player to keep analysis independent of the visible player's volume/mute.
     * @param {HTMLMediaElement} visibleMediaElement The user-visible element.
     */
    initFromFile(visibleMediaElement){
        if(this.#audioCtx){return} // Already initialized

        this.#visibleElement = visibleMediaElement

        // Defer full initialization until a user gesture if needed,
        // to avoid noisy browser autoplay/AudioContext warnings.
        const hasGesture = navigator.userActivation?.hasBeenActive
        if (hasGesture) {
            this.#initFileImmediate()
            this.start()
        } else {
            this.start() // Start the analysis loop (outputs zeros until context exists)
            this.#resumeOnInteraction()
        }
    }

    /** Sets up AudioContext + shadow player. Only call after a user gesture. */
    #initFileImmediate(){
        const visibleMediaElement = this.#visibleElement
        if(!visibleMediaElement || this.#audioCtx){return}

        // @ts-ignore
        this.#audioCtx = new (window.AudioContext || window.webkitAudioContext)()
        this.#analyser = this.#audioCtx.createAnalyser()
        this.#configureAnalyser()

        // Create and configure the silent shadow player.
        this.#shadowPlayer = document.createElement(visibleMediaElement.tagName.toLowerCase())
        if (visibleMediaElement.src) {
            this.#shadowPlayer.src = visibleMediaElement.src
        }
        this.#shadowPlayer.crossOrigin = visibleMediaElement.crossOrigin || 'anonymous'
        this.#shadowPlayer.volume = 1.0
        this.#shadowPlayer.muted = false
        this.#shadowPlayer.loop = visibleMediaElement.loop
        // Hide it from Safari's audio routing
        this.#shadowPlayer.style.display = 'none'
        this.#shadowPlayer.style.visibility = 'hidden'

        this.#sourceNode = this.#audioCtx.createMediaElementSource(this.#shadowPlayer)
        this.#sourceNode.connect(this.#analyser)
        // Explicitly don't connect to destination - only to analyser

        this.#addSyncListeners()

        // Perform initial synchronization
        if(!visibleMediaElement.paused && visibleMediaElement.src){
            this.#shadowPlayer.play().catch(() => {})
        }
        this.#shadowPlayer.currentTime = visibleMediaElement.currentTime
        this.#shadowPlayer.playbackRate = visibleMediaElement.playbackRate
    }

    /**
     * Initializes the analyzer from a MediaStream (e.g., from a microphone).
     * @param {MediaStream} stream The stream to analyze.
     */
    initFromStream(stream){
        if(this.#audioCtx){return} // Already initialized

        // @ts-ignore
        this.#audioCtx = new (window.AudioContext || window.webkitAudioContext)()
        this.#analyser = this.#audioCtx.createAnalyser()
        this.#configureAnalyser()

        this.#sourceNode = this.#audioCtx.createMediaStreamSource(stream)
        this.#sourceNode.connect(this.#analyser)

        this.start()
    }

    /** Starts the analysis loop. */
    start(){
        if(this.#animationFrameId){cancelAnimationFrame(this.#animationFrameId)}
        this.#animationFrameId = requestAnimationFrame(this.#analyze)
    }

    /** Stops the analysis loop. */
    stop(){
        if(this.#animationFrameId){
            cancelAnimationFrame(this.#animationFrameId)
            this.#animationFrameId = null
        }
    }

    /** Cleans up all resources used by the analyzer. */
    close(){
        this.stop()
        this.#sourceNode?.disconnect()
        if(this.#visibleElement){
            this.#removeSyncListeners()
            this.#visibleElement = null
        }
        if(this.#shadowPlayer){
            this.#shadowPlayer.pause()
            this.#shadowPlayer.src = ''
            this.#shadowPlayer.removeAttribute('src')
            this.#shadowPlayer.load() // Force browser to release decoded video/audio from VRAM
            this.#shadowPlayer = null
        }
        this.#audioCtx?.close().catch(e => console.error('Error closing AudioContext', e))

        this.#sourceNode = null
        this.#analyser = null
        this.#audioCtx = null
    }

    // --- Private Methods ---

    #configureAnalyser(){
        this.#analyser.fftSize = 512
        this.#analyser.smoothingTimeConstant = 0.3
        const bufferLength = this.#analyser.frequencyBinCount // 256
        this.#dataArray = new Uint8Array(bufferLength)
        this.#timeDomainArray = new Uint8Array(this.#analyser.fftSize)
    }

    // --- Synchronization methods for file-based sources (as arrow functions) ---
    #syncPlay = () => { this.#shadowPlayer?.play().catch(() => {}) }
    #syncPause = () => { this.#shadowPlayer?.pause() }
    #syncSeek = () => { if(this.#shadowPlayer){this.#shadowPlayer.currentTime = this.#visibleElement.currentTime} }
    #syncRateChange = () => { if(this.#shadowPlayer){this.#shadowPlayer.playbackRate = this.#visibleElement.playbackRate} }
    #syncLoop = () => { if(this.#shadowPlayer){this.#shadowPlayer.loop = this.#visibleElement.loop} }


    #resumeOnInteraction(){
        const resume = () => {
            cleanup()
            // Deferred init: create AudioContext + shadow player on first gesture
            if (!this.#audioCtx) {
                this.#initFileImmediate()
            }
            if (this.#audioCtx?.state === 'suspended') {
                this.#audioCtx.resume().then(() => {
                    // Re-sync shadow player after context resumes
                    if (this.#shadowPlayer && this.#visibleElement && !this.#visibleElement.paused) {
                        this.#shadowPlayer.currentTime = this.#visibleElement.currentTime
                        this.#shadowPlayer.play().catch(() => {})
                    }
                }).catch(() => {})
            }
        }
        const cleanup = () => {
            document.removeEventListener('click', resume)
            document.removeEventListener('keydown', resume)
            document.removeEventListener('pointerdown', resume)
        }
        document.addEventListener('click', resume)
        document.addEventListener('keydown', resume)
        document.addEventListener('pointerdown', resume)
    }

    #addSyncListeners(){
        if(!this.#visibleElement){return}
        this.#visibleElement.addEventListener('play', this.#syncPlay)
        this.#visibleElement.addEventListener('pause', this.#syncPause)
        this.#visibleElement.addEventListener('seeking', this.#syncSeek)
        this.#visibleElement.addEventListener('seeked', this.#syncSeek)
        this.#visibleElement.addEventListener('ratechange', this.#syncRateChange)
        this.#visibleElement.addEventListener('ended', this.#syncSeek)
    }

    #removeSyncListeners(){
        if(!this.#visibleElement){return}
        this.#visibleElement.removeEventListener('play', this.#syncPlay)
        this.#visibleElement.removeEventListener('pause', this.#syncPause)
        this.#visibleElement.removeEventListener('seeking', this.#syncSeek)
        this.#visibleElement.removeEventListener('seeked', this.#syncSeek)
        this.#visibleElement.removeEventListener('ratechange', this.#syncRateChange)
        this.#visibleElement.removeEventListener('ended', this.#syncSeek)
    }

    #analyze = () => {
        // Ensure the loop continues even if the analyzer isn't ready yet.
        if(!this.isDestroyed){
            this.#animationFrameId = requestAnimationFrame(this.#analyze)
        }
        if(!this.#analyser || !this.#dataArray){return}

        this.#analyser.getByteFrequencyData(this.#dataArray)
        this.#analyser.getByteTimeDomainData(this.#timeDomainArray)

        // Update public waveform data and frequency data
        this.waveformData.set(this.#timeDomainArray)
        this.frequencyData.set(this.#dataArray)

        const getWeightedAverage = (start, end, powerCurve = 0.6) => {
            let sum = 0
            let weightSum = 0
            for(let i = start; i <= end; i++){
                const weight = Math.log(i + 1) // Logarithmic weighting
                sum += this.#dataArray[i] * weight
                weightSum += weight
            }
            if(weightSum === 0) return 0
            const rawAvg = (sum / weightSum) / 255 // Normalize to 0-1
            return Math.pow(rawAvg, powerCurve)
        }

        // Calculate bin ranges and excite each band
        const bands = [
            ['bass', 0.5],
            ['mid',  0.6],
            ['high', 0.7]
        ]

        for(const [band, powerCurve] of bands){
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

    /**
     * Expander: pushes values away from running median, then EMA smoothing.
     * react 1 = passthrough, >1 = expand, <1 = compress.
     * tanh soft-clips the expansion to avoid blowout.
     */
    #excite(raw, state, smoothFactor, react){
        if(!isFinite(raw)) raw = 0

        // Remove outgoing value from sorted array
        const old = state.history[state.index]
        state.sorted.splice(state.sorted.indexOf(old), 1)

        // Insert incoming value in sorted order
        let i = 0
        while(i < state.sorted.length && state.sorted[i] < raw) i++
        state.sorted.splice(i, 0, raw)

        state.history[state.index] = raw
        state.index = (state.index + 1) % state.history.length

        state.median = state.sorted[15]

        const deviation = raw - state.median
        const expanded = deviation * react
        const softened = Math.tanh(expanded) * 0.5
        const excited = Math.max(0, state.median + softened)
        state.excited = excited

        // Post-expander EMA: smoothFactor 0 = no smoothing, 1 = frozen
        state.smoothed += (excited - state.smoothed) * (1 - smoothFactor)
        if(!isFinite(state.smoothed)) state.smoothed = 0
        return state.smoothed
    }
}