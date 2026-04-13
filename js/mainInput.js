/**
 * Main Input Manager
 *
 * Singleton that manages global video and audio input sources for the Main Input node.
 * Supports independent video and audio sources that can be mixed and matched:
 * - Video: video file, webcam, screen capture, or none
 * - Audio: audio file, mic/line, video's audio track, or none
 */

import {AudioAnalyzer} from './audioAnalyzer.js'
import {AssetManager} from './assetManager.js'
import {applyBandConfig, DEFAULT_BAND_CONFIG} from './audioHistogram.js'

class MainInputManager {
    constructor() {
        this.isInitialized = false

        // Video source state
        this.videoSourceType = 'none' // 'none' | 'video' | 'webcam' | 'screencapture'
        this.videoElement = null
        this.videoStream = null
        this.canvas = null
        this.canvasCtx = null
        this.canvasHasData = false
        this.aspect = 1.0
        this.videoRenderLoop = null
        this.videoAssetPath = null

        // Audio source state
        this.audioSourceType = 'none' // 'none' | 'audio' | 'mic' | 'video'
        this.audioAnalyzer = null
        this.audioElement = null
        this.audioStream = null
        this.audioAssetPath = null

        // Shared settings
        this.gain = 1.0
        this.bandConfig = {...DEFAULT_BAND_CONFIG}

        // UI update callback
        this.onStateChange = null

        // Generation counters to detect stale async results from rapid source switching
        this._videoGeneration = 0
        this._audioGeneration = 0

        // Shared GPU texture cache: one upload per GL context per frame
        this._sharedTextureCache = new WeakMap() // WeakMap<WebGLRenderingContext, {texture, lastUploadedFrame}>
        this._frameCount = 0
        this._blackPixel = new Uint8Array([0, 0, 0, 255])
    }

    init() {
        if (this.isInitialized) return

        // Create hidden video element for video sources
        this.videoElement = document.createElement('video')
        this.videoElement.autoplay = true
        this.videoElement.muted = true // Muted for autoplay, audio handled separately
        this.videoElement.playsInline = true
        this.videoElement.loop = true
        this.videoElement.style.display = 'none'
        document.body.appendChild(this.videoElement)

        // Create canvas for texture uploads
        this.canvas = document.createElement('canvas')
        this.canvas.width = 1
        this.canvas.height = 1
        this.canvas.style.display = 'none'
        this.canvasCtx = this.canvas.getContext('2d')
        document.body.appendChild(this.canvas)

        // Create hidden audio element for audio files
        // Muted — exists only as a sync source for AudioAnalyzer's shadow player.
        // The UI panel's <audio> element handles audible playback.
        this.audioElement = document.createElement('audio')
        this.audioElement.controls = false
        this.audioElement.loop = true
        this.audioElement.muted = true
        this.audioElement.style.display = 'none'
        document.body.appendChild(this.audioElement)

        this.isInitialized = true

        // Load bundled demo video as default source
        this.setVideoSource('demo')
            .then(() => this.setAudioSource('video'))
            .catch(e => console.warn('Demo video not available:', e))
    }

    // ============ VIDEO SOURCE METHODS ============

    async setVideoSource(type, options = {}) {
        const gen = ++this._videoGeneration

        // Cleanup previous video source
        this._cleanupVideoSource()

        this.videoSourceType = type

        switch (type) {
            case 'none':
                break

            case 'demo':
                await this._loadVideoFile(null, 'assets/demo/gumbasia.webm')
                break

            case 'video':
                await this._loadVideoFile(options.assetPath || options.file, options.url)
                break

            case 'webcam':
                await this._startWebcam(options.deviceId)
                break

            case 'screencapture':
                await this._startScreenCapture()
                break
        }

        // Bail out if another setVideoSource call came in while we were awaiting
        if (gen !== this._videoGeneration) return

        // If audio is set to 'video', reinitialize audio from video
        if (this.audioSourceType === 'video') {
            this._initAudioFromVideo()
        }

        this._notifyStateChange()
    }

    async _loadVideoFile(fileOrPath, directUrl) {
        // directUrl: hack for loading bundled demo video by relative path
        let videoPath
        if (directUrl) {
            videoPath = directUrl
            this.videoAssetPath = null
        } else if (!fileOrPath) {
            return
        } else if (typeof fileOrPath === 'string') {
            // Asset path
            this.videoAssetPath = fileOrPath
            videoPath = await AssetManager.loadAsset(fileOrPath)
        } else {
            // File object
            videoPath = URL.createObjectURL(fileOrPath)
            this.videoAssetPath = null
        }

        if (!videoPath) return

        return new Promise((resolve, reject) => {
            this.videoElement.onloadedmetadata = () => {
                this.aspect = this.videoElement.videoWidth / this.videoElement.videoHeight
                this.canvas.width = this.videoElement.videoWidth
                this.canvas.height = this.videoElement.videoHeight
                this._startVideoRenderLoop()
                this.videoElement.play()
                resolve()
            }
            this.videoElement.onerror = reject
            this.videoElement.src = videoPath
        })
    }

    async _startWebcam(deviceId) {
        try {
            // Build constraints - only use exact deviceId if we have a valid one
            const videoConstraints = (deviceId && deviceId !== 'default')
                ? {deviceId: {ideal: deviceId}} // Use ideal instead of exact for better fallback
                : true
            const constraints = {
                video: videoConstraints,
                audio: false
            }
            this.videoStream = await navigator.mediaDevices.getUserMedia(constraints)
            this.videoElement.srcObject = this.videoStream

            await new Promise((resolve) => {
                this.videoElement.onloadedmetadata = () => {
                    this.aspect = this.videoElement.videoWidth / this.videoElement.videoHeight
                    this.canvas.width = this.videoElement.videoWidth
                    this.canvas.height = this.videoElement.videoHeight
                    this._startVideoRenderLoop()
                    resolve()
                }
            })

            // Handle user stopping via browser controls
            this.videoStream.getVideoTracks()[0].addEventListener('ended', () => {
                this.setVideoSource('none')
            })
        } catch (err) {
            console.error('Failed to start webcam:', err)
            this.videoSourceType = 'none'
            throw err
        }
    }

    async _startScreenCapture() {
        try {
            this.videoStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true
            })
            this.videoElement.srcObject = this.videoStream

            await new Promise((resolve) => {
                this.videoElement.onloadedmetadata = () => {
                    this.aspect = this.videoElement.videoWidth / this.videoElement.videoHeight
                    this.canvas.width = this.videoElement.videoWidth
                    this.canvas.height = this.videoElement.videoHeight
                    this._startVideoRenderLoop()
                    resolve()
                }
            })

            // Handle user stopping via browser controls
            this.videoStream.getVideoTracks()[0].addEventListener('ended', () => {
                this.setVideoSource('none')
            })
        } catch (err) {
            console.error('Failed to start screen capture:', err)
            this.videoSourceType = 'none'
            throw err
        }
    }

    _startVideoRenderLoop() {
        if (this.videoRenderLoop) {
            cancelAnimationFrame(this.videoRenderLoop)
        }

        const renderFrame = () => {
            if (this.videoSourceType === 'none') return

            if (this.videoElement && this.videoElement.readyState >= this.videoElement.HAVE_CURRENT_DATA) {
                this.canvasCtx.drawImage(this.videoElement, 0, 0, this.canvas.width, this.canvas.height)
                this.canvasHasData = true
            }

            this._frameCount++
            this.videoRenderLoop = requestAnimationFrame(renderFrame)
        }

        this.videoRenderLoop = requestAnimationFrame(renderFrame)
    }

    _cleanupVideoSource() {
        if (this.videoRenderLoop) {
            cancelAnimationFrame(this.videoRenderLoop)
            this.videoRenderLoop = null
        }

        if (this.videoStream) {
            this.videoStream.getTracks().forEach(track => track.stop())
            this.videoStream = null
        }

        if (this.videoElement.src && !this.videoAssetPath) {
            URL.revokeObjectURL(this.videoElement.src)
        }

        this.videoElement.srcObject = null
        this.videoElement.src = ''
        this.videoAssetPath = null
        this.canvasHasData = false
        this.aspect = 1.0

        // Reset canvas to 1x1
        this.canvas.width = 1
        this.canvas.height = 1
    }

    // ============ AUDIO SOURCE METHODS ============

    async setAudioSource(type, options = {}) {
        const gen = ++this._audioGeneration

        // Cleanup previous audio source
        this._cleanupAudioSource()

        this.audioSourceType = type

        try {
            switch (type) {
                case 'none':
                    break

                case 'audio':
                    await this._loadAudioFile(options.assetPath || options.file)
                    break

                case 'mic':
                    await this._startMic(options.deviceId)
                    break

                case 'video':
                    this._initAudioFromVideo()
                    break
            }
        } catch (err) {
            console.error('Failed to set audio source:', err)
            this.audioSourceType = 'none'
        }

        // Bail out if another setAudioSource call came in while we were awaiting
        if (gen !== this._audioGeneration) return

        this._notifyStateChange()
    }

    async _loadAudioFile(fileOrPath) {
        if (!fileOrPath) return

        let audioPath
        if (typeof fileOrPath === 'string') {
            // Asset path
            this.audioAssetPath = fileOrPath
            audioPath = await AssetManager.loadAsset(fileOrPath)
        } else {
            // File object
            audioPath = URL.createObjectURL(fileOrPath)
            this.audioAssetPath = null
        }

        if (!audioPath) return

        return new Promise((resolve, reject) => {
            this.audioElement.onloadedmetadata = () => {
                this.audioAnalyzer = new AudioAnalyzer()
                applyBandConfig(this.audioAnalyzer, this.bandConfig)
                this.audioAnalyzer.initFromFile(this.audioElement)
                this.audioElement.play()
                resolve()
            }
            this.audioElement.onerror = reject
            this.audioElement.src = audioPath
        })
    }

    async _startMic(deviceId) {
        try {
            // Build constraints - only use ideal deviceId if we have a valid one
            const audioConstraints = (deviceId && deviceId !== 'default')
                ? {deviceId: {ideal: deviceId}} // Use ideal instead of exact for better fallback
                : true
            const constraints = {
                audio: audioConstraints,
                video: false
            }
            this.audioStream = await navigator.mediaDevices.getUserMedia(constraints)

            this.audioAnalyzer = new AudioAnalyzer()
            applyBandConfig(this.audioAnalyzer, this.bandConfig)
            this.audioAnalyzer.initFromStream(this.audioStream)

            // Handle user stopping via browser controls
            this.audioStream.getAudioTracks()[0].addEventListener('ended', () => {
                this.setAudioSource('none')
            })
        } catch (err) {
            console.error('Failed to start mic:', err)
            this.audioSourceType = 'none'
            throw err
        }
    }

    _initAudioFromVideo() {
        // Always close previous analyzer when re-initializing
        if (this.audioAnalyzer) {
            this.audioAnalyzer.close()
            this.audioAnalyzer = null
        }

        if ((this.videoSourceType === 'video' || this.videoSourceType === 'demo') && this.videoElement.src) {
            // File-based: use shadow player approach
            this.audioAnalyzer = new AudioAnalyzer()
            applyBandConfig(this.audioAnalyzer, this.bandConfig)
            this.audioAnalyzer.initFromFile(this.videoElement)
        } else if (this.videoSourceType === 'screencapture' && this.videoStream) {
            // Stream-based: analyze audio tracks directly if present
            const audioTracks = this.videoStream.getAudioTracks()
            if (audioTracks.length > 0) {
                const audioStream = new MediaStream(audioTracks)
                this.audioAnalyzer = new AudioAnalyzer()
                applyBandConfig(this.audioAnalyzer, this.bandConfig)
                this.audioAnalyzer.initFromStream(audioStream)
            }
        }
    }

    _cleanupAudioSource() {
        if (this.audioAnalyzer) {
            this.audioAnalyzer.close()
            this.audioAnalyzer = null
        }

        if (this.audioStream) {
            this.audioStream.getTracks().forEach(track => track.stop())
            this.audioStream = null
        }

        if (this.audioElement.src && !this.audioAssetPath) {
            URL.revokeObjectURL(this.audioElement.src)
        }

        this.audioElement.src = ''
        this.audioAssetPath = null
    }

    // ============ GETTER METHODS (for Main Input node) ============

    uploadSharedTexture(gl, textureUnit) {
        let entry = this._sharedTextureCache.get(gl)
        if (!entry) {
            const texture = gl.createTexture()
            gl.bindTexture(gl.TEXTURE_2D, texture)
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT)
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT)
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
            entry = {texture, lastUploadedFrame: -1}
            this._sharedTextureCache.set(gl, entry)
        }

        gl.activeTexture(gl.TEXTURE0 + textureUnit)
        gl.bindTexture(gl.TEXTURE_2D, entry.texture)

        if (entry.lastUploadedFrame !== this._frameCount) {
            if (this.canvasHasData && this.canvas.width > 0 && this.canvas.height > 0) {
                if(entry.w === this.canvas.width && entry.h === this.canvas.height){
                    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas)
                } else {
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas)
                    entry.w = this.canvas.width; entry.h = this.canvas.height
                }
            } else {
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, this._blackPixel)
                entry.w = 0; entry.h = 0
            }
            entry.lastUploadedFrame = this._frameCount
        }
    }

    getVideoTexture() {
        if (this.canvasHasData) {
            return this.canvas
        }
        return null
    }

    getAudioValues() {
        if (this.audioAnalyzer) {
            const values = this.audioAnalyzer.audioValues
            return {
                bass: Math.min(1.0, values.bass * this.gain),
                mid: Math.min(1.0, values.mid * this.gain),
                high: Math.min(1.0, values.high * this.gain)
            }
        }
        return {bass: 0, mid: 0, high: 0}
    }

    getWaveformData() {
        if (this.audioAnalyzer) {
            return this.audioAnalyzer.waveformData
        }
        return new Uint8Array(512).fill(128) // Flat line at center
    }

    getAspect() {
        return this.aspect
    }

    hasVideo() {
        return this.videoSourceType !== 'none'
    }

    hasAudio() {
        return this.audioSourceType !== 'none' && this.audioAnalyzer !== null
    }

    // ============ SETTINGS METHODS ============

    setGain(value) {
        this.gain = value
    }

    setBandConfig(config) {
        this.bandConfig = config
        if (this.audioAnalyzer) {
            applyBandConfig(this.audioAnalyzer, config)
        }
    }

    // ============ SERIALIZATION ============

    serialize() {
        return {
            video: {
                sourceType: this.videoSourceType,
                assetPath: this.videoAssetPath
            },
            audio: {
                sourceType: this.audioSourceType,
                assetPath: this.audioAssetPath
            },
            gain: this.gain,
            bandConfig: this.bandConfig
        }
    }

    async deserialize(data) {
        if (!data) return

        this.gain = data.gain ?? 1.0
        this.bandConfig = data.bandConfig ?? {...DEFAULT_BAND_CONFIG}

        // Only restore file-based sources. Live sources (webcam, screencapture, mic)
        // require user interaction and would trigger unexpected permission prompts.
        if (data.video && data.video.sourceType === 'video' && data.video.assetPath) {
            try {
                await this.setVideoSource('video', {
                    assetPath: data.video.assetPath
                })
            } catch (err) {
                console.warn('Failed to restore video source:', err)
            }
        }

        if (data.audio && data.audio.sourceType === 'audio' && data.audio.assetPath) {
            try {
                await this.setAudioSource('audio', {
                    assetPath: data.audio.assetPath
                })
            } catch (err) {
                console.warn('Failed to restore audio source:', err)
            }
        }
    }

    // ============ UTILITY METHODS ============

    _notifyStateChange() {
        if (this.onStateChange) {
            this.onStateChange()
        }
    }

    async enumerateVideoDevices() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices()
            return devices.filter(d => d.kind === 'videoinput')
        } catch (err) {
            console.error('Failed to enumerate video devices:', err)
            return []
        }
    }

    async enumerateAudioDevices() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices()
            return devices.filter(d => d.kind === 'audioinput')
        } catch (err) {
            console.error('Failed to enumerate audio devices:', err)
            return []
        }
    }

    // Get audio element for UI display (audio controls)
    getAudioElement() {
        if (this.audioSourceType === 'audio') {
            return this.audioElement
        }
        return null
    }

    destroy() {
        this._cleanupVideoSource()
        this._cleanupAudioSource()

        if (this.videoElement && this.videoElement.parentNode) {
            this.videoElement.parentNode.removeChild(this.videoElement)
        }
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas)
        }
        if (this.audioElement && this.audioElement.parentNode) {
            this.audioElement.parentNode.removeChild(this.audioElement)
        }

        this.isInitialized = false
    }
}

// Singleton export
export const mainInput = new MainInputManager()
