import {registerNode} from '../registry.js'
import {compile} from '../compiler.js'
import {SNode} from '../snode.js'
import {Connection} from '../connections.js'
import {WebGLRenderer} from '../webgl.js'
import {mainMixer} from '../mainMixer.js'
import {autowire, StringToFragment, showAlertModal} from '../utils.js'

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
        },
        'supersampling': {
            label: 'Supersampling',
            type: 'select',
            default: '1',
            choices: [
                {value: '1', name: '1x (off)'},
                {value: '2', name: '2x'},
                {value: '4', name: '4x'}
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
        canvas.className = 'offline-output-canvas'
        this.elements.canvas = canvas

        const [w, h] = this.getOption('resolution').split('x').map(Number)
        canvas.width = w
        canvas.height = h
        canvas.style.aspectRatio = `${w} / ${h}`

        // Controls HTML
        const controlsHtml = `
            <div class="offline-output-controls">
                <div class="offline-output-row">
                    <label>FPS</label>
                    <s-number midi-disabled value="${this.values.fps}" default="${this.defaults.fps}" min="1" max="120" step="1" data-el="fpsControl"></s-number>
                </div>
                <div class="offline-output-row">
                    <label>Duration (s)</label>
                    <s-number midi-disabled value="${this.values.duration}" default="${this.defaults.duration}" min="0.1" max="3600" step="0.1" data-el="durationControl"></s-number>
                </div>
                <div class="offline-output-row">
                    <label>Warm-up</label>
                    <s-number midi-disabled value="${this.values.warmupFrames}" default="${this.defaults.warmupFrames}" min="0" max="600" step="1" data-el="warmupControl"></s-number>
                </div>
                <div class="offline-output-buttons">
                    <button class="btn" data-el="startBtn">Render</button>
                    <button class="btn offline-output-cancel" data-el="cancelBtn">Cancel</button>
                </div>
                <div class="offline-output-progress" data-el="progressBar">
                    <div class="offline-output-progress-fill" data-el="progressFill"></div>
                </div>
                <div class="offline-output-progress-text" data-el="progressText"></div>
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
            showAlertModal('Cannot render: no input connected or compilation failed.', 'Offline Render')
            return
        }

        const fps = this.values.fps
        const duration = this.values.duration
        const totalFrames = Math.ceil(fps * duration)
        const warmupFrames = this.values.warmupFrames
        const warmupMode = this.getOption('warmupMode')
        const ssScale = parseInt(this.getOption('supersampling'), 10)
        const renderer = this.runtimeState.renderer
        const gl = renderer.gl
        const [outW, outH] = this.getOption('resolution').split('x').map(Number)
        const renderW = outW * ssScale
        const renderH = outH * ssScale

        // Render at supersampled resolution
        if(renderer._width !== renderW || renderer._height !== renderH){
            renderer.onResize(renderW, renderH)
        }
        // Preview canvas stays at output resolution
        if(this.elements.canvas.width !== outW || this.elements.canvas.height !== outH){
            this.elements.canvas.width = outW
            this.elements.canvas.height = outH
        }

        // Discover upstream nodes that need time-driven preparation
        const timeNodes = this._collectTimeDrivenNodes()
        const suspendedNodes = []

        this.runtimeState.isRendering = true
        this.runtimeState.cancelled = false
        let renderCompleted = false

        try {
        // Suspend realtime loops; track each one so finally only resumes what actually suspended
        for(const node of timeNodes){
            node._suspendRealtimeLoops?.()
            suspendedNodes.push(node)
        }
        // UI state
        this.elements.startBtn.style.display = 'none'
        this.elements.cancelBtn.style.display = 'block'
        this.elements.progressBar.style.display = 'block'
        this.elements.progressText.style.display = 'block'

        // Pick output directory (Electron) or prepare for zip (web)
        let outputDir = null
        let fileHandle = null
        const frameBlobs = []
        let frameBlobBytes = 0

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

        // Pixel buffer for readback (at render resolution)
        const pixelBuf = new Uint8Array(renderW * renderH * 4)

        // Offscreen canvas for PNG encoding (at output resolution)
        const encodeCanvas = new OffscreenCanvas(outW, outH)
        const encodeCtx = encodeCanvas.getContext('2d')

        // Supersampled source canvas (only needed if ssScale > 1)
        const ssCanvas = ssScale > 1 ? new OffscreenCanvas(renderW, renderH) : null
        const ssCtx = ssCanvas ? ssCanvas.getContext('2d') : null

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

        // Main render pass — encode/save is pipelined with the next frame's prepare+render:
        // convertToBlob for frame N is fired immediately after readPixels (non-blocking),
        // then frame N's blob is awaited and saved during frame N+1's iteration. PNG encoding
        // (browser background thread) overlaps with video seeks and GPU readback.
        let pendingEncode = null  // {promise: Promise<Blob>, frameName: string, frameNum: number}

        for(let i = 0; i < totalFrames; i++){
            if(this.runtimeState.cancelled) break

            const virtualTime = i / fps

            // Prepare upstream nodes for this time
            for(const node of timeNodes){
                await node._prepareForTime(virtualTime, fps)
            }

            this._renderOneFrame(virtualTime, renderer, gl)

            // Blocking readback at render resolution
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, renderer.tempFBO)
            gl.readPixels(0, 0, renderW, renderH, gl.RGBA, gl.UNSIGNED_BYTE, pixelBuf)

            // Flip Y (GL is bottom-to-top) into the encode canvas
            if(ssScale > 1){
                // Flip into supersized canvas, then downsample to output resolution
                const ssImageData = new ImageData(renderW, renderH)
                const rowBytes = renderW * 4
                for(let y = 0; y < renderH; y++){
                    const srcOffset = (renderH - 1 - y) * rowBytes
                    ssImageData.data.set(pixelBuf.subarray(srcOffset, srcOffset + rowBytes), y * rowBytes)
                }
                ssCtx.putImageData(ssImageData, 0, 0)
                // Downsample via drawImage (bilinear filtering)
                encodeCtx.drawImage(ssCanvas, 0, 0, outW, outH)
            } else {
                const imageData = new ImageData(outW, outH)
                const rowBytes = outW * 4
                for(let y = 0; y < outH; y++){
                    const srcOffset = (outH - 1 - y) * rowBytes
                    imageData.data.set(pixelBuf.subarray(srcOffset, srcOffset + rowBytes), y * rowBytes)
                }
                encodeCtx.putImageData(imageData, 0, 0)
            }

            // Update preview canvas (every 4th frame to save overhead)
            if(i % 4 === 0 || i === totalFrames - 1){
                previewCtx.drawImage(encodeCanvas, 0, 0, outW, outH)
            }

            // Kick off PNG encode for this frame without awaiting — the bitmap is captured
            // immediately, so overwriting encodeCanvas in the next iteration is safe.
            const frameName = `frame_${String(i + 1).padStart(6, '0')}.png`
            const encodePromise = encodeCanvas.convertToBlob({type: 'image/png'})

            // Await and save the PREVIOUS frame's blob. By this point it has been encoding
            // in the background during _prepareForTime, renderOneFrame, and readPixels above.
            if(pendingEncode !== null){
                let blob
                try {
                    blob = await pendingEncode.promise
                } catch(e) {
                    this.elements.progressText.textContent = `Encode failed on frame ${pendingEncode.frameNum}: ${e.message}`
                    throw e
                }

                if(isElectronMode && outputDir){
                    // Electron: write to disk via IPC
                    const arrayBuf = await blob.arrayBuffer()
                    await window.electronAPI.writeFrameFile(outputDir, pendingEncode.frameName, arrayBuf)
                } else if(fileHandle){
                    // Web File System Access API
                    const fh = await fileHandle.getFileHandle(pendingEncode.frameName, {create: true})
                    const writable = await fh.createWritable()
                    await writable.write(blob)
                    await writable.close()
                } else {
                    // Web fallback: accumulate blobs for zip
                    frameBlobs.push({name: pendingEncode.frameName, blob})
                    frameBlobBytes += blob.size
                    if(frameBlobBytes > 3900 * 1024 * 1024){
                        this.elements.progressText.textContent = 'Web zip limit reached (~4GB). Use File System Access API or Electron.'
                        this.runtimeState.cancelled = true
                        break
                    }
                }
            }

            pendingEncode = {promise: encodePromise, frameName, frameNum: i + 1}

            // Progress
            const pct = ((i + 1) / totalFrames) * 100
            this.elements.progressFill.style.width = `${pct}%`
            const elapsed = (performance.now() - renderStartTime) / 1000
            const perFrame = elapsed / (i + 1)
            const remaining = perFrame * (totalFrames - i - 1)
            const mins = Math.floor(remaining / 60)
            const secs = Math.floor(remaining % 60)
            let progressMsg = `Frame ${i + 1} / ${totalFrames} (${pct.toFixed(0)}%) — ${mins}:${String(secs).padStart(2, '0')} remaining`
            if(frameBlobBytes > 500 * 1024 * 1024){
                progressMsg += ` — ${(frameBlobBytes / (1024 * 1024)).toFixed(0)}MB in memory`
            }
            this.elements.progressText.textContent = progressMsg

            // Yield to browser
            await new Promise(r => setTimeout(r, 0))
        }

        // Flush the last encoded frame (not yet saved because the loop ended)
        if(pendingEncode !== null && !this.runtimeState.cancelled){
            let blob
            try {
                blob = await pendingEncode.promise
            } catch(e) {
                this.elements.progressText.textContent = `Encode failed on frame ${pendingEncode.frameNum}: ${e.message}`
                throw e
            }
            if(isElectronMode && outputDir){
                const arrayBuf = await blob.arrayBuffer()
                await window.electronAPI.writeFrameFile(outputDir, pendingEncode.frameName, arrayBuf)
            } else if(fileHandle){
                const fh = await fileHandle.getFileHandle(pendingEncode.frameName, {create: true})
                const writable = await fh.createWritable()
                await writable.write(blob)
                await writable.close()
            } else {
                frameBlobs.push({name: pendingEncode.frameName, blob})
                frameBlobBytes += blob.size
            }
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
        renderCompleted = true

        } finally {
            // Restore renderer to output resolution if supersampled
            if(ssScale > 1 && renderer._width !== outW){
                renderer.onResize(outW, outH)
            }
            // Resume realtime loops on upstream nodes (even if cancelled or errored)
            for(const node of suspendedNodes){
                node._resumeRealtimeLoops?.()
            }

            this.runtimeState.isRendering = false
            this.elements.startBtn.style.display = 'block'
            this.elements.cancelBtn.style.display = 'none'
            // On unhandled error: reset progress UI so partial state doesn't persist.
            // Normal completion (done / cancelled) leaves the final message visible.
            if(!renderCompleted){
                this.elements.progressBar.style.display = 'none'
                this.elements.progressText.style.display = 'none'
                this.elements.progressFill.style.width = '0%'
            }
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
