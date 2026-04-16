import {registerNode} from '../registry.js'
import {compile} from '../compiler.js'
import {SNode} from '../snode.js'
import {Connection} from '../connections.js'
import {WebGLRenderer} from '../webgl.js'
import {mainMixer} from '../mainMixer.js'
import {autowire, StringToFragment} from '../utils.js'

registerNode({
    slug: 'offlineoutput',
    icon: '🎞️',
    label: 'Offline Output',
    tooltip: 'Renders frames offline at any resolution and FPS. Exports lossless PNG sequences for artifact-free video production.',

    elements: {
        canvas: null,
        startBtn: null,
        cancelBtn: null,
        progressBar: null,
        progressFill: null,
        progressText: null,
        fpsControl: null,
        durationControl: null,
        warmupControl: null
    },
    values: {
        fps: 30,
        duration: 10,
        warmupFrames: 0,
        frameHistorySize: 10
    },
    runtimeState: {
        renderer: null,
        shaderInfo: null,
        textureMap: new Map(),
        isRendering: false,
        cancelled: false,
        isCompiling: false
    },

    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null
        }
    },
    output: {},

    options: {
        'resolution': {
            label: 'Resolution',
            type: 'select',
            default: '1920x1080',
            choices: [
                {value: '1280x720', name: '16:9 (1280x720)'},
                {value: '1920x1080', name: '16:9 (1920x1080)'},
                {value: '3840x2160', name: '16:9 (3840x2160)'},
                {value: '3440x1440', name: '21:9 (3440x1440)'},
                {value: '1024x768', name: '4:3 (1024x768)'},
                {value: '1080x1080', name: '1:1 (1080x1080)'},
                {value: '720x1280', name: '9:16 (720x1280)'},
                {value: '1080x1920', name: '9:16 (1080x1920)'}
            ]
        },
        'warmupMode': {
            label: 'Warm-up Mode',
            type: 'select',
            default: 'sequence',
            choices: [
                {value: 'black', name: 'Black'},
                {value: 'hold', name: 'Hold First Frame'},
                {value: 'sequence', name: 'Run Sequence'}
            ]
        }
    },

    updateResolution(){
        if(!this.runtimeState.renderer) return
        const [w, h] = this.getOption('resolution').split('x').map(Number)
        this.runtimeState.renderer.onResize(w, h)
        if(this.elements.canvas){
            this.elements.canvas.width = w
            this.elements.canvas.height = h
            this.elements.canvas.style.aspectRatio = `${w} / ${h}`
        }
    },

    recompile(){
        const compilationResult = compile(this.input.input)
        if(compilationResult){
            this.runtimeState.shaderInfo = compilationResult
            this.runtimeState.renderer.updateProgram(this.runtimeState.shaderInfo.shaderCode)
        } else {
            this.runtimeState.shaderInfo = null
        }
    },

    onCreate(){
        SNode.outputs.add(this)
        if(!this.customArea) return

        // Preview canvas
        const canvas = document.createElement('canvas')
        canvas.style.width = '360px'
        canvas.style.height = 'auto'
        canvas.style.display = 'block'
        this.elements.canvas = canvas

        const [w, h] = this.getOption('resolution').split('x').map(Number)
        canvas.width = w
        canvas.height = h
        canvas.style.aspectRatio = `${w} / ${h}`

        // Controls HTML
        const controlsHtml = `
            <div style="padding: 0.5rem; display: flex; flex-direction: column; gap: 0.5rem;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <label style="font-size: 0.9rem; color: #ccc;">FPS</label>
                    <s-number midi-disabled value="${this.values.fps}" default="${this.defaults.fps}" min="1" max="120" step="1" data-el="fpsControl"></s-number>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <label style="font-size: 0.9rem; color: #ccc;">Duration (s)</label>
                    <s-number midi-disabled value="${this.values.duration}" default="${this.defaults.duration}" min="0.1" max="3600" step="0.1" data-el="durationControl"></s-number>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <label style="font-size: 0.9rem; color: #ccc;">Warm-up</label>
                    <s-number midi-disabled value="${this.values.warmupFrames}" default="${this.defaults.warmupFrames}" min="0" max="600" step="1" data-el="warmupControl"></s-number>
                </div>
                <div style="display: flex; gap: 0.5rem;">
                    <button class="btn" data-el="startBtn" style="flex: 1; font-family: monospace; background: #444; color: #ccc; border: 1px solid #666; padding: 5px; border-radius: 4px; cursor: pointer;">Render</button>
                    <button class="btn" data-el="cancelBtn" style="flex: 1; font-family: monospace; background: #444; color: #ccc; border: 1px solid #666; padding: 5px; border-radius: 4px; cursor: pointer; display: none;">Cancel</button>
                </div>
                <div data-el="progressBar" style="display: none; height: 8px; background: #333; border-radius: 4px; overflow: hidden;">
                    <div data-el="progressFill" style="height: 100%; background: var(--primary-color); width: 0%; transition: width 0.1s linear;"></div>
                </div>
                <div data-el="progressText" style="display: none; font-size: 0.8rem; color: #999; text-align: center; font-family: monospace;"></div>
            </div>
        `
        const controlsFragment = StringToFragment(controlsHtml)
        Object.assign(this.elements, autowire(controlsFragment))

        // Event listeners
        this.elements.fpsControl.addEventListener('input', (e) => {
            this.values.fps = parseInt(e.target.value, 10)
        })
        this.elements.durationControl.addEventListener('input', (e) => {
            this.values.duration = parseFloat(e.target.value)
        })
        this.elements.warmupControl.addEventListener('input', (e) => {
            this.values.warmupFrames = parseInt(e.target.value, 10)
        })
        this.elements.startBtn.addEventListener('click', () => this._startRender())
        this.elements.cancelBtn.addEventListener('click', () => this._cancelRender())

        // Resolution change
        const resolutionControl = this.nodeEl.querySelector('[data-option-el="resolution"]')
        if(resolutionControl){
            resolutionControl.addEventListener('change', () => this.updateResolution())
        }

        // Append DOM
        this.customArea.appendChild(canvas)
        this.customArea.appendChild(controlsFragment)

        // Create renderer (FBO mode, shared GL context)
        this.runtimeState.renderer = new WebGLRenderer(
            {gl: mainMixer.gl, vao: mainMixer.sharedVao, width: w, height: h},
            this.values.frameHistorySize
        )
        mainMixer.registerOutputRenderer(this.runtimeState.renderer)

        this.runtimeState.renderer.onContextRestored = () => {
            this.runtimeState.textureMap.clear()
            this.recompile()
        }
    },

    // Called by the main render loop — offline output does NOT render in realtime
    updateOutput(time){},

    /**
     * Collect all upstream nodes that support offline time preparation.
     * Returns them in topological order (sources first) so upstream nodes
     * prepare before downstream nodes that depend on their output.
     */
    _collectTimeDrivenNodes(){
        const visited = new Set()
        const ordered = []

        const visit = (node) => {
            if(visited.has(node)) return
            visited.add(node)
            // Visit upstream nodes first (depth-first, post-order)
            for(const key in node.input){
                const port = node.input[key]
                if(port.connection){
                    visit(port.connection.parent)
                }
            }
            // Also follow action connections (step sequencer → triggered nodes)
            for(const conn of Connection.connections){
                if(conn.destination.parent === node && conn.source.parent !== node){
                    visit(conn.source.parent)
                }
            }
            if(node._prepareForTime){
                ordered.push(node)
            }
        }

        visit(this)
        return ordered
    },

    async _startRender(){
        if(this.runtimeState.isRendering) return

        // Compile shader
        this.recompile()
        if(!this.runtimeState.shaderInfo){
            alert('Cannot render: no input connected or compilation failed.')
            return
        }

        const fps = this.values.fps
        const duration = this.values.duration
        const totalFrames = Math.ceil(fps * duration)
        const warmupFrames = this.values.warmupFrames
        const warmupMode = this.getOption('warmupMode')
        const renderer = this.runtimeState.renderer
        const gl = renderer.gl
        const [w, h] = this.getOption('resolution').split('x').map(Number)

        // Ensure resolution matches
        if(renderer._width !== w || renderer._height !== h){
            renderer.onResize(w, h)
            this.elements.canvas.width = w
            this.elements.canvas.height = h
        }

        // Discover upstream nodes that need time-driven preparation
        const timeNodes = this._collectTimeDrivenNodes()

        // Suspend their realtime loops
        for(const node of timeNodes){
            node._suspendRealtimeLoops?.()
        }

        this.runtimeState.isRendering = true
        this.runtimeState.cancelled = false

        try {
        // UI state
        this.elements.startBtn.style.display = 'none'
        this.elements.cancelBtn.style.display = 'block'
        this.elements.progressBar.style.display = 'block'
        this.elements.progressText.style.display = 'block'

        // Pick output directory (Electron) or prepare for zip (web)
        let outputDir = null
        let fileHandle = null
        const frameBlobs = []

        if(isElectronMode && window.electronAPI){
            const result = await window.electronAPI.showOpenDialog({
                title: 'Select output directory for PNG frames',
                properties: ['openDirectory', 'createDirectory']
            })
            if(!result || result.canceled || !result.filePaths || result.filePaths.length === 0){
                this._resetUI()
                return
            }
            outputDir = result.filePaths[0]
        } else {
            // Web mode: try File System Access API, fall back to in-memory zip
            if(window.showDirectoryPicker){
                try {
                    fileHandle = await window.showDirectoryPicker({mode: 'readwrite'})
                } catch(e){
                    // User cancelled
                    if(e.name === 'AbortError'){
                        this._resetUI()
                        return
                    }
                    // API not available or denied, fall back to zip
                    fileHandle = null
                }
            }
        }

        // Pixel buffer for readback
        const pixelBuf = new Uint8Array(w * h * 4)

        // Offscreen canvas for PNG encoding
        const encodeCanvas = new OffscreenCanvas(w, h)
        const encodeCtx = encodeCanvas.getContext('2d')

        // Preview canvas 2d context
        const previewCtx = this.elements.canvas.getContext('2d')

        const renderStartTime = performance.now()

        // Warm-up pass
        for(let i = 0; i < warmupFrames; i++){
            if(this.runtimeState.cancelled) break

            let virtualTime
            if(warmupMode === 'black'){
                virtualTime = 0
            } else if(warmupMode === 'hold'){
                virtualTime = 0
            } else {
                // 'sequence' — run frames that precede frame 0
                virtualTime = (i - warmupFrames) / fps
            }

            // Prepare upstream nodes for this time
            for(const node of timeNodes){
                await node._prepareForTime(virtualTime, fps)
            }

            this._renderOneFrame(virtualTime, renderer, gl)

            // Update progress
            const pct = (i / warmupFrames) * 100
            this.elements.progressFill.style.width = `${pct}%`
            this.elements.progressText.textContent = `Warm-up ${i + 1} / ${warmupFrames}`

            await new Promise(r => setTimeout(r, 0))
        }

        // Main render pass
        for(let i = 0; i < totalFrames; i++){
            if(this.runtimeState.cancelled) break

            const virtualTime = i / fps

            // Prepare upstream nodes for this time
            for(const node of timeNodes){
                await node._prepareForTime(virtualTime, fps)
            }

            this._renderOneFrame(virtualTime, renderer, gl)

            // Blocking readback
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, renderer.tempFBO)
            gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixelBuf)

            // Flip Y (GL is bottom-to-top)
            const imageData = new ImageData(w, h)
            const rowBytes = w * 4
            for(let y = 0; y < h; y++){
                const srcOffset = (h - 1 - y) * rowBytes
                imageData.data.set(pixelBuf.subarray(srcOffset, srcOffset + rowBytes), y * rowBytes)
            }

            // Update preview canvas (every 4th frame to save overhead)
            if(i % 4 === 0 || i === totalFrames - 1){
                previewCtx.putImageData(imageData, 0, 0)
            }

            // Encode to PNG
            encodeCtx.putImageData(imageData, 0, 0)
            const blob = await encodeCanvas.convertToBlob({type: 'image/png'})

            // Save frame
            const frameName = `frame_${String(i + 1).padStart(6, '0')}.png`

            if(isElectronMode && outputDir){
                // Electron: write to disk via IPC
                const arrayBuf = await blob.arrayBuffer()
                await window.electronAPI.writeFrameFile(outputDir, frameName, arrayBuf)
            } else if(fileHandle){
                // Web File System Access API
                const fh = await fileHandle.getFileHandle(frameName, {create: true})
                const writable = await fh.createWritable()
                await writable.write(blob)
                await writable.close()
            } else {
                // Web fallback: accumulate blobs for zip
                frameBlobs.push({name: frameName, blob})
            }

            // Progress
            const pct = ((i + 1) / totalFrames) * 100
            this.elements.progressFill.style.width = `${pct}%`
            const elapsed = (performance.now() - renderStartTime) / 1000
            const perFrame = elapsed / (i + 1)
            const remaining = perFrame * (totalFrames - i - 1)
            const mins = Math.floor(remaining / 60)
            const secs = Math.floor(remaining % 60)
            this.elements.progressText.textContent = `Frame ${i + 1} / ${totalFrames} (${pct.toFixed(0)}%) — ${mins}:${String(secs).padStart(2, '0')} remaining`

            // Yield to browser
            await new Promise(r => setTimeout(r, 0))
        }

        // Finalize
        if(!this.runtimeState.cancelled){
            if(!isElectronMode && !fileHandle && frameBlobs.length > 0){
                // Build and download zip
                this.elements.progressText.textContent = 'Building zip...'
                await new Promise(r => setTimeout(r, 0))
                const zipBlob = await this._buildZip(frameBlobs)
                this._downloadBlob(zipBlob, this._getTimestampFilename('silvia_render', 'zip'))
            }

            this.elements.progressText.textContent = `Done — ${totalFrames} frames rendered`
            this.elements.progressFill.style.width = '100%'
        } else {
            this.elements.progressText.textContent = 'Cancelled'
        }

        } finally {
            // Resume realtime loops on upstream nodes (even if cancelled or errored)
            for(const node of timeNodes){
                node._resumeRealtimeLoops?.()
            }

            this.runtimeState.isRendering = false
            this.elements.startBtn.style.display = 'block'
            this.elements.cancelBtn.style.display = 'none'
        }
    },

    _renderOneFrame(virtualTime, renderer, gl){
        // Clear the pending fence to avoid frame-drop logic in offline mode
        if(renderer.pendingFence){
            gl.deleteSync(renderer.pendingFence)
            renderer.pendingFence = null
        }

        renderer.render(virtualTime, this.runtimeState.shaderInfo, this.runtimeState.textureMap)
    },

    _cancelRender(){
        this.runtimeState.cancelled = true
    },

    _resetUI(){
        this.runtimeState.isRendering = false
        this.runtimeState.cancelled = false
        this.elements.startBtn.style.display = 'block'
        this.elements.cancelBtn.style.display = 'none'
        this.elements.progressBar.style.display = 'none'
        this.elements.progressText.style.display = 'none'
        this.elements.progressFill.style.width = '0%'
    },

    /**
     * Build a minimal zip file from an array of {name, blob} entries.
     * Uses stored (uncompressed) method since PNGs are already compressed.
     */
    async _buildZip(entries){
        const files = []
        let offset = 0

        for(const entry of entries){
            const data = new Uint8Array(await entry.blob.arrayBuffer())
            const nameBytes = new TextEncoder().encode(entry.name)
            const crc = crc32(data)

            // Local file header (30 + name length)
            const localHeader = new Uint8Array(30 + nameBytes.length)
            const lv = new DataView(localHeader.buffer)
            lv.setUint32(0, 0x04034b50, true)  // Signature
            lv.setUint16(4, 20, true)           // Version needed
            lv.setUint16(6, 0, true)            // Flags
            lv.setUint16(8, 0, true)            // Compression: stored
            lv.setUint16(10, 0, true)           // Mod time
            lv.setUint16(12, 0, true)           // Mod date
            lv.setUint32(14, crc, true)         // CRC-32
            lv.setUint32(18, data.length, true) // Compressed size
            lv.setUint32(22, data.length, true) // Uncompressed size
            lv.setUint16(26, nameBytes.length, true)
            lv.setUint16(28, 0, true)           // Extra field length
            localHeader.set(nameBytes, 30)

            files.push({localHeader, data, nameBytes, crc, offset})
            offset += localHeader.length + data.length
        }

        // Central directory
        const cdEntries = []
        for(const f of files){
            const cd = new Uint8Array(46 + f.nameBytes.length)
            const cv = new DataView(cd.buffer)
            cv.setUint32(0, 0x02014b50, true)   // Signature
            cv.setUint16(4, 20, true)            // Version made by
            cv.setUint16(6, 20, true)            // Version needed
            cv.setUint16(8, 0, true)             // Flags
            cv.setUint16(10, 0, true)            // Compression
            cv.setUint16(12, 0, true)            // Mod time
            cv.setUint16(14, 0, true)            // Mod date
            cv.setUint32(16, f.crc, true)
            cv.setUint32(20, f.data.length, true)
            cv.setUint32(24, f.data.length, true)
            cv.setUint16(28, f.nameBytes.length, true)
            cv.setUint16(30, 0, true)            // Extra field length
            cv.setUint16(32, 0, true)            // Comment length
            cv.setUint16(34, 0, true)            // Disk number
            cv.setUint16(36, 0, true)            // Internal attrs
            cv.setUint32(38, 0, true)            // External attrs
            cv.setUint32(42, f.offset, true)     // Local header offset
            cd.set(f.nameBytes, 46)
            cdEntries.push(cd)
        }

        const cdSize = cdEntries.reduce((sum, e) => sum + e.length, 0)
        const cdOffset = offset

        // End of central directory
        const eocd = new Uint8Array(22)
        const ev = new DataView(eocd.buffer)
        ev.setUint32(0, 0x06054b50, true)
        ev.setUint16(4, 0, true)
        ev.setUint16(6, 0, true)
        ev.setUint16(8, files.length, true)
        ev.setUint16(10, files.length, true)
        ev.setUint32(12, cdSize, true)
        ev.setUint32(16, cdOffset, true)
        ev.setUint16(20, 0, true)

        // Concatenate everything
        const parts = []
        for(const f of files){
            parts.push(f.localHeader, f.data)
        }
        for(const cd of cdEntries) parts.push(cd)
        parts.push(eocd)

        return new Blob(parts, {type: 'application/zip'})
    },

    _downloadBlob(blob, filename){
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    },

    _getTimestampFilename(prefix, extension){
        const d = new Date()
        const pad = (n) => n.toString().padStart(2, '0')
        const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
        const time = `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
        return `${prefix}_${date}_${time}.${extension}`
    },

    onDestroy(){
        if(this.runtimeState.isRendering){
            this.runtimeState.cancelled = true
        }

        if(this.runtimeState.renderer){
            mainMixer.unregisterOutputRenderer(this.runtimeState.renderer)
        }

        if(this.runtimeState.renderer && mainMixer.gl){
            const gl = mainMixer.gl
            const r = this.runtimeState.renderer

            if(r.historyTexture)  gl.deleteTexture(r.historyTexture)
            if(r.tempTexture)     gl.deleteTexture(r.tempTexture)
            if(r.tempFBO)         gl.deleteFramebuffer(r.tempFBO)
            if(r.outputTexture)   gl.deleteTexture(r.outputTexture)
            if(r.outputFBO)       gl.deleteFramebuffer(r.outputFBO)
            r.historyFBOs.forEach(fbo => gl.deleteFramebuffer(fbo))
            if(r._pbo) r._pbo.forEach(b => { if(b) gl.deleteBuffer(b) })
            if(r._pboFences[0])   gl.deleteSync(r._pboFences[0])
            if(r._pboFences[1])   gl.deleteSync(r._pboFences[1])
            if(r.pendingFence)    gl.deleteSync(r.pendingFence)
            if(r.program)         gl.deleteProgram(r.program)
            if(r.pendingProgram)  { gl.deleteProgram(r.pendingProgram); r.pendingProgram = null }
        }

        if(this.runtimeState.textureMap && mainMixer.gl){
            const gl = mainMixer.gl
            this.runtimeState.textureMap.forEach(entry => gl.deleteTexture(entry.tex))
            this.runtimeState.textureMap.clear()
        }

        this.runtimeState.renderer = null
        SNode.outputs.delete(this)
    }
})

/**
 * CRC-32 for zip file checksums (IEEE polynomial)
 */
const crc32Table = new Uint32Array(256)
for(let i = 0; i < 256; i++){
    let c = i
    for(let j = 0; j < 8; j++){
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    }
    crc32Table[i] = c
}

function crc32(data){
    let crc = 0xFFFFFFFF
    for(let i = 0; i < data.length; i++){
        crc = crc32Table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8)
    }
    return (crc ^ 0xFFFFFFFF) >>> 0
}
