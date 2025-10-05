// audioAnalyzer.js

// With fftSize = 1024, sample rate is typically 48000Hz
// Each bin is sampleRate / fftSize = 48000 / 1024 = ~46.875Hz wide
// Default bands (can be overridden):
// Bass: ~43Hz - ~258Hz
// Mids: ~301Hz - ~4.3kHz
// Highs: ~4.3kHz - ~12.9kHz
const DEFAULT_BASS_BINS = [1, 6]
const DEFAULT_MID_BINS = [7, 100]
const DEFAULT_HIGH_BINS = [101, 300]

/**
 * A reusable class for performing frequency analysis on audio from
 * HTMLMediaElements or MediaStreams.
 */
export class AudioAnalyzer{
    // Public state that nodes can read from.
    audioValues = {bass: 0, mid: 0, high: 0, bassExciter: 0}
    waveformData = new Uint8Array(1024) // Time domain data for oscilloscope
    frequencyData = new Uint8Array(512) // Frequency bin data for histogram

    // Band configuration (center frequency in Hz and Q factor)
    bandConfig = {
        bass: {freq: 100, q: 1.0},
        mid: {freq: 1000, q: 1.0},
        high: {freq: 8000, q: 1.0}
    }

    // Running median tracking for exciter
    #bassHistory = new Array(30).fill(0)
    #historyIndex = 0

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
        const binWidth = sampleRate / (this.#analyser?.fftSize || 1024)
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

        return [Math.max(1, startBin), Math.min(endBin, 511)]
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

        // @ts-ignore
        this.#audioCtx = new (window.AudioContext || window.webkitAudioContext)()
        this.#analyser = this.#audioCtx.createAnalyser()
        this.#configureAnalyser()

        // Create and configure the silent shadow player.
        this.#shadowPlayer = document.createElement(visibleMediaElement.tagName.toLowerCase())
        this.#shadowPlayer.src = visibleMediaElement.src
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
        this.start()

        // Perform initial synchronization
        if(!visibleMediaElement.paused){
            this.#shadowPlayer.play().catch(e => console.error('Shadow player failed to play:', e))
        }
        this.#shadowPlayer.currentTime = visibleMediaElement.currentTime
        this.#shadowPlayer.playbackRate = visibleMediaElement.playbackRate

        console.log('AudioAnalyzer initialized from file.')
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
        console.log('AudioAnalyzer initialized from stream.')
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
        if(this.#visibleElement){
            this.#removeSyncListeners()
            this.#shadowPlayer?.pause()
            this.#shadowPlayer = null
            this.#visibleElement = null
        }
        this.#sourceNode?.disconnect()
        this.#audioCtx?.close().catch(e => console.error('Error closing AudioContext', e))

        this.#sourceNode = null
        this.#analyser = null
        this.#audioCtx = null
        console.log('AudioAnalyzer closed.')
    }

    // --- Private Methods ---

    #configureAnalyser(){
        this.#analyser.fftSize = 1024
        this.#analyser.smoothingTimeConstant = 0.7
        const bufferLength = this.#analyser.frequencyBinCount
        this.#dataArray = new Uint8Array(bufferLength)
        this.#timeDomainArray = new Uint8Array(this.#analyser.fftSize)
    }

    // --- Synchronization methods for file-based sources (as arrow functions) ---
    #syncPlay = () => { this.#shadowPlayer?.play().catch(e => console.warn('Shadow player sync play failed', e)) }
    #syncPause = () => { this.#shadowPlayer?.pause() }
    #syncSeek = () => { if(this.#shadowPlayer){this.#shadowPlayer.currentTime = this.#visibleElement.currentTime} }
    #syncRateChange = () => { if(this.#shadowPlayer){this.#shadowPlayer.playbackRate = this.#visibleElement.playbackRate} }
    #syncLoop = () => { if(this.#shadowPlayer){this.#shadowPlayer.loop = this.#visibleElement.loop} }


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
            const rawAvg = (sum / weightSum) / 255 // Normalize to 0-1
            return Math.pow(rawAvg, powerCurve)
        }

        // Calculate bin ranges based on current band configuration
        const bassBins = this.#getBinRange(this.bandConfig.bass.freq, this.bandConfig.bass.q)
        const midBins = this.#getBinRange(this.bandConfig.mid.freq, this.bandConfig.mid.q)
        const highBins = this.#getBinRange(this.bandConfig.high.freq, this.bandConfig.high.q)

        this.audioValues.bass = getWeightedAverage(...bassBins, 0.5)
        this.audioValues.mid = getWeightedAverage(...midBins, 0.6)
        this.audioValues.high = getWeightedAverage(...highBins, 0.7)
        
        // Bass exciter - harsh S-curve around running median
        this.#bassHistory[this.#historyIndex] = this.audioValues.bass
        this.#historyIndex = (this.#historyIndex + 1) % this.#bassHistory.length
        
        const sortedHistory = [...this.#bassHistory].sort((a, b) => a - b)
        const median = sortedHistory[Math.floor(sortedHistory.length / 2)]
        
        const deviation = this.audioValues.bass - median
        const normalized = Math.tanh(deviation * 8)
        this.audioValues.bassExciter = ((normalized + 1) / 2) * this.audioValues.bass
    }
}