import {registerNode} from '../registry.js'
import {compile, compileAsync} from '../compiler.js'
import {SNode} from '../snode.js'
import {WebGLRenderer} from '../webgl.js'
import {BackgroundRenderer} from './_background.js'
import {formatBytes} from '../utils.js'
import {mainMixer} from '../mainMixer.js'
import {mainMixerUI} from '../mainMixerUI.js'

registerNode({
    slug: 'output',
    icon: '📺',
    label: 'Output',
    tooltip: 'Main output node for rendering and display. Shows result on screen, provides recording capabilities, and frame history control. Connect your effect chain here.',
    elements: {
        canvas: null,
        canvas2d: null,
        imageData: null,
        frameHistoryControl: null,
        vramDisplay: null,
        statusLine: null
    },
    values: {
        frameHistorySize: 10
    },
    runtimeState: {
        renderer: null,
        shaderInfo: null,
        textureMap: new Map(),
        isActive: false,
        mediaRecorder: null,
        isRecording: false,
        recordedChunks: [],
        isCompiling: false
    },

    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null
        },
        'showA': {
            label: 'Show on A',
            type: 'action',
            control: {},
            callback(){
                mainMixer.assignToChannelA(this)
                mainMixerUI.updateChannelStatus('A', this)
                this._updateStatusLine()
            }
        },
        'showB': {
            label: 'Show on B',
            type: 'action',
            control: {},
            callback(){
                mainMixer.assignToChannelB(this)
                mainMixerUI.updateChannelStatus('B', this)
                this._updateStatusLine()
            }
        },
        'snap': {
            label: 'Snap',
            type: 'action',
            control: {},
            callback(){
                this._downloadCanvasSnapshot()
            }
        },
        'rec': {
            label: 'Rec',
            type: 'action',
            control: {},
            callback(){
                this._toggleRecording()
            }
        }
    },
    output: {
        'frame': {
            label: 'Frame Out',
            type: 'color',
            genCode(cc, funcName, uniformName){
                return `vec4 ${funcName}(vec2 uv) {
    ivec2 texSize = textureSize(${uniformName}, 0);
    float aspect = float(texSize.x) / float(texSize.y);
    uv.x = (uv.x / aspect + 1.0) * 0.5;
    uv.y = (uv.y + 1.0) * 0.5;
    return texture(${uniformName}, uv);
}`
            },
            textureUniformUpdate(uniformName, gl, program, textureUnit, textureMap){
                if(this.isDestroyed) return
                const renderer = this.runtimeState.renderer
                if(!renderer) return
                const tex = renderer.getLatestTexture()
                if(!tex) return

                gl.activeTexture(gl.TEXTURE0 + textureUnit)
                gl.bindTexture(gl.TEXTURE_2D, tex)
                gl.uniform1i(gl.getUniformLocation(program, uniformName), textureUnit)
            }
        }
    },

    options: {
        'resolution': {
            label: 'Resolution',
            type: 'select',
            default: '1280x720',
            choices: [
                {value: '1280x720', name: '16:9 (1280x720)'},
                {value: '1920x1080', name: '16:9 (1920x1080)'},
                {value: '3440x1440', name: '21:9 (3440x1440)'},
                {value: '1024x768', name: '4:3 (1024x768)'},
                {value: '1080x1080', name: '1:1 (1080x1080)'},
                {value: '720x1280', name: '9:16 (720x1280)'},
                {value: '1080x1920', name: '9:16 (1080x1920)'}
            ]
        },
        'recordDuration': {
            label: 'Record Duration',
            type: 'select',
            default: 'manual',
            choices: [
                {value: '3', name: '3 seconds'},
                {value: '5', name: '5 seconds'},
                {value: '10', name: '10 seconds'},
                {value: '15', name: '15 seconds'},
                {value: '30', name: '30 seconds'},
                {value: '60', name: '1 minute'},
                {value: 'manual', name: 'Manual (click to stop)'}
            ]
        }
    },

    updateResolution(){
        if(!this.runtimeState.renderer || !this.elements.canvas) return
        const [w, h] = this.getOption('resolution').split('x').map(Number)

        this.elements.canvas.width = w
        this.elements.canvas.height = h
        this.elements.canvas.style.aspectRatio = `${w} / ${h}`

        this.runtimeState.renderer.onResize(w, h)
        this.elements.imageData = null

        mainMixerUI.refreshPreviewForNode(this)
        this._updateVramDisplay()
    },

    updateFrameBufferSize(){
        if(!this.runtimeState.renderer){return}
        const newSize = this.values.frameHistorySize
        this.runtimeState.renderer.setFrameBufferSize(newSize)
        this._updateVramDisplay()
    },

    recompile(){
        if(this.runtimeState.renderer?.parallelShaderCompileExt){
            this.recompileAsync()
        } else {
            this.recompileSync()
        }
    },

    recompileSync(){
        const compilationResult = compile(this.input.input)
        if(compilationResult){
            this.runtimeState.shaderInfo = compilationResult
            this.runtimeState.renderer.updateProgram(this.runtimeState.shaderInfo.shaderCode)
            this.runtimeState.isActive = true
        } else {
            this.runtimeState.isActive = false
            this._clearCanvasToBlack()
            console.warn(`Output node ${this.id} is inactive due to compilation failure.`)
        }
        this._updateStatusLine()
        this._refreshMixerPreview()
    },

    async recompileAsync(){
        if(this.runtimeState.isCompiling){
            return
        }

        this.runtimeState.isCompiling = true

        try {
            const compilationResult = await compileAsync(
                this.input.input,
                this.values.frameHistorySize
            )

            if(compilationResult){
                this.runtimeState.shaderInfo = compilationResult

                this.runtimeState.renderer.updateProgram(
                    this.runtimeState.shaderInfo.shaderCode,
                    (success) => {
                        this.runtimeState.isCompiling = false
                        if(success){
                            this.runtimeState.isActive = true
                        } else {
                            this.runtimeState.isActive = false
                            this._clearCanvasToBlack()
                            console.warn(`Output node ${this.id} is inactive due to GPU compilation failure.`)
                        }
                        this._updateStatusLine()
                        this._refreshMixerPreview()
                    }
                )
            } else {
                this.runtimeState.isCompiling = false
                this.runtimeState.isActive = false
                this._clearCanvasToBlack()
                console.warn(`Output node ${this.id} is inactive due to compilation failure.`)
                this._updateStatusLine()
                this._refreshMixerPreview()
            }
        } catch(error){
            this.runtimeState.isCompiling = false
            this.runtimeState.isActive = false
            this._clearCanvasToBlack()
            console.error(`Async compilation error for output node ${this.id}:`, error)
            this._updateStatusLine()
            this._refreshMixerPreview()
        }
    },

    _downloadCanvasSnapshot(){
        if(!this.runtimeState.isActive || !this.elements.canvas){
            alert('Cannot save snapshot: Output node is not active or has not rendered yet.')
            return
        }
        const filename = getTimestampFilename('silvia_snap', 'png')
        const link = document.createElement('a')
        link.download = filename
        link.href = this.elements.canvas.toDataURL('image/png')
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    },

    _toggleRecording(){
        if(!this.runtimeState.isRecording){
            this._startRecording()
        } else {
            this._stopRecording()
        }
    },

    _startRecording(){
        if(!this.runtimeState.isActive || !this.elements.canvas){
            alert('Cannot start recording: Output node is not active or has not rendered yet.')
            return
        }

        this.runtimeState.recordedChunks = []

        try {
            const stream = this.elements.canvas.captureStream(60)

            // Try different codecs in order of preference
            const mimeTypes = [
                'video/webm;codecs=vp9',
                'video/webm;codecs=vp8',
                'video/webm',
                'video/mp4'
            ]

            let selectedMimeType = 'video/webm'
            for(const mimeType of mimeTypes){
                if(MediaRecorder.isTypeSupported(mimeType)){
                    selectedMimeType = mimeType
                    break
                }
            }

            this.runtimeState.mediaRecorder = new MediaRecorder(stream, {
                mimeType: selectedMimeType
            })

            this.runtimeState.mediaRecorder.ondataavailable = (event) => {
                if(event.data.size > 0){
                    this.runtimeState.recordedChunks.push(event.data)
                }
            }

            this.runtimeState.mediaRecorder.onstop = () => {
                const blob = new Blob(this.runtimeState.recordedChunks, {type: 'video/webm'})
                const url = URL.createObjectURL(blob)
                const anchor = document.createElement('a')
                anchor.href = url
                anchor.download = getTimestampFilename('silvia_rec', 'webm')
                anchor.click()
                URL.revokeObjectURL(url)

                this.runtimeState.recordedChunks = []
            }

            this.runtimeState.mediaRecorder.start()
            this.runtimeState.isRecording = true
            this._updateStatusLine()


            // Auto-stop recording after duration
            const duration = this.getOption('recordDuration')
            if(duration !== 'manual'){
                const seconds = parseInt(duration, 10) * 1000
                setTimeout(() => {
                    if(this.runtimeState.isRecording){
                        this._stopRecording()
                    }
                }, seconds)
            }
        } catch(error) {
            console.error('Failed to start recording:', error)
            alert('Failed to start recording. Your browser may not support canvas recording.')
        }
    },

    _stopRecording(){
        if(!this.runtimeState.mediaRecorder || !this.runtimeState.isRecording){
            return
        }

        this.runtimeState.isRecording = false
        this.runtimeState.mediaRecorder.stop()
        this._updateStatusLine()


        this.runtimeState.mediaRecorder = null
    },

    _updateVramDisplay(){
        if(!this.elements.canvas || !this.elements.vramDisplay){return}
        const {width, height} = this.elements.canvas
        const historySize = this.values.frameHistorySize
        const bytesPerPixel = 4 // RGBA

        // Calculate VRAM for the history buffer + the temporary ping-pong buffer
        const totalBytes = (width * height * bytesPerPixel) * (historySize + 1)
        this.elements.vramDisplay.textContent = `VRAM: ${formatBytes(totalBytes)}`
    },

    _clearCanvasToBlack(){
        const renderer = this.runtimeState.renderer
        if(!renderer) return
        const {gl} = renderer

        gl.bindFramebuffer(gl.FRAMEBUFFER, renderer.tempFBO)
        gl.viewport(0, 0, renderer._width, renderer._height)
        gl.clearColor(0, 0, 0, 1)
        gl.clear(gl.COLOR_BUFFER_BIT)
        gl.bindFramebuffer(gl.FRAMEBUFFER, null)

        if(this.elements.canvas2d){
            this.elements.canvas2d.fillStyle = '#000'
            this.elements.canvas2d.fillRect(0, 0, renderer._width, renderer._height)
        }
    },

    _refreshMixerPreview(){
        // If this output is assigned to a mixer channel, refresh its preview
        if(mainMixer.channelA === this){
            mainMixerUI.updateChannelStatus('A', this)
        }
        if(mainMixer.channelB === this){
            mainMixerUI.updateChannelStatus('B', this)
        }
    },

    _updateStatusLine(){
        if(!this.elements.statusLine){return}

        const connectionStatus = this.elements.statusLine.querySelector('[data-status="connection"]')
        const showingStatus = this.elements.statusLine.querySelector('[data-status="showing"]')
        const recordingStatus = this.elements.statusLine.querySelector('[data-status="recording"]')

        // Connection status (green if connected, gray if not)
        const isConnected = this.input.input.connection !== null && this.input.input.connection !== undefined
        connectionStatus.style.color = isConnected ? '#10b981' : '#999'
        connectionStatus.textContent = isConnected ? '● Input' : '○ No Input'

        // Showing status - check main mixer channel assignments
        let showingText = '○ Hidden'
        let showingColor = '#999'
        const onA = mainMixer.channelA === this
        const onB = mainMixer.channelB === this

        if(onA && onB){
            showingText = '● A & B'
            showingColor = '#10b981'
        } else if(onA){
            showingText = '● On A'
            showingColor = '#10b981'
        } else if(onB){
            showingText = '● On B'
            showingColor = '#10b981'
        }

        showingStatus.style.color = showingColor
        showingStatus.textContent = showingText

        // Recording status (red if recording, gray if ready)
        const isRecording = this.runtimeState.isRecording
        recordingStatus.style.color = isRecording ? '#ff3b30' : '#f59e0b'
        recordingStatus.textContent = isRecording ? '● Recording' : '○ Rec Ready'
    },

    onCreate(){
        SNode.outputs.add(this)
        if(!this.customArea){return}

        // Create status line (always visible, subtle)
        const statusLine = document.createElement('div')
        statusLine.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 4px 8px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 4px;
            font-size: 11px;
            font-family: monospace;
            color: #999;
            height: 20px;
        `
        statusLine.innerHTML = `
            <span data-status="connection" style="width: 90px; text-align: left;">● Connected</span>
            <span data-status="showing" style="width: 90px; text-align: left;">○ Showing</span>
            <span data-status="recording" style="width: 90px; text-align: left;">○ Ready</span>
        `
        this.elements.statusLine = statusLine

        const canvas = document.createElement('canvas')
        canvas.style.width = '360px'
        canvas.style.height = 'auto'
        canvas.style.display = 'block'
        this.elements.canvas = canvas
        this.elements.canvas2d = canvas.getContext('2d')

        this.customArea.appendChild(statusLine)
        this.customArea.appendChild(canvas)

        const [w, h] = this.getOption('resolution').split('x').map(Number)
        canvas.width = w
        canvas.height = h
        canvas.style.aspectRatio = `${w} / ${h}`

        this.runtimeState.renderer = new WebGLRenderer(
            { gl: mainMixer.gl, vao: mainMixer.sharedVao, width: w, height: h },
            this.values.frameHistorySize
        )
        mainMixer.registerOutputRenderer(this.runtimeState.renderer)

        this.runtimeState.renderer.onContextRestored = () => {
            // Texture handles in textureMap are invalidated by context loss.
            this.runtimeState.textureMap.clear()
            this.recompile()
        }

        const optionsContainer = this.nodeEl.querySelector('.node-options')
        if(optionsContainer){
            const historyControlHtml = `
            <div class="node-option">
                <div class="option-label">Frame History</div>
                <div class="option-control">
                    <s-number
                        midi-disabled
                        value="${this.values.frameHistorySize}"
                        min="1"
                        max="120"
                        step="1"
                        data-el="frameHistoryControl">
                    </s-number>
                </div>
            </div>
            <div class="node-option" style="justify-content: center; color: #999; font-family: monospace; font-size: 0.9em; padding: 0.2rem;" data-el="vramDisplay">
                VRAM: ...
            </div>`
            optionsContainer.insertAdjacentHTML('beforeend', historyControlHtml)

            // Autowire the new elements
            this.elements.frameHistoryControl = this.nodeEl.querySelector('[data-el="frameHistoryControl"]')
            this.elements.vramDisplay = this.nodeEl.querySelector('[data-el="vramDisplay"]')

            // Use 'input' event for live updates (including MIDI)
            this.elements.frameHistoryControl.addEventListener('input', (e) => {
                this.values.frameHistorySize = parseInt(e.target.value, 10)
                this.updateFrameBufferSize()
            })
        }

        const resolutionControl = this.nodeEl.querySelector('[data-option-el="resolution"]')
        if(resolutionControl){
            resolutionControl.addEventListener('change', () => this.updateResolution())
        }

        this._updateVramDisplay()
        this._updateStatusLine()
    },

    updateOutput(time){
        if(!this.runtimeState.isActive || !this.runtimeState.renderer) return
        const renderer = this.runtimeState.renderer

        // Collect previous frame's async PBO data and push to 2D display canvas
        const pixels = renderer.collectReadback()
        if(pixels){
            const w = renderer._width, h = renderer._height
            if(!this.elements.imageData ||
                this.elements.imageData.width !== w ||
                this.elements.imageData.height !== h){
                this.elements.imageData = new ImageData(w, h)
            }
            // Flip rows: GL readback is bottom-to-top, canvas is top-to-bottom
            const rowBytes = w * 4
            const data = this.elements.imageData.data
            for(let y = 0; y < h; y++){
                const srcOffset = (h - 1 - y) * rowBytes
                data.set(pixels.subarray(srcOffset, srcOffset + rowBytes), y * rowBytes)
            }
            this.elements.canvas2d.putImageData(this.elements.imageData, 0, 0)
        }

        if(renderer.render(time, this.runtimeState.shaderInfo, this.runtimeState.textureMap)){
            renderer.issueReadback()
        }
    },

    onDestroy(){
        if(this.runtimeState.isRecording){
            this._stopRecording()
        }

        mainMixer.clearChannel(this)
        mainMixerUI.updateChannelStatus('A', mainMixer.channelA)
        mainMixerUI.updateChannelStatus('B', mainMixer.channelB)

        if(this.runtimeState.renderer){
            mainMixer.unregisterOutputRenderer(this.runtimeState.renderer)
        }

        if(this.runtimeState.renderer && mainMixer.gl){
            const gl = mainMixer.gl
            const r = this.runtimeState.renderer

            if(r.historyTexture)  gl.deleteTexture(r.historyTexture)
            if(r.tempTexture)     gl.deleteTexture(r.tempTexture)
            if(r.tempFBO)         gl.deleteFramebuffer(r.tempFBO)
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

        if(BackgroundRenderer.outputNode === this){
            BackgroundRenderer.outputNode = null
            BackgroundRenderer.shaderInfo?.removeAllUniformProviders()
        }
    }
})

function getTimestampFilename(prefix = 'snap', extension = 'png'){
    const d = new Date()
    const pad = (n) => n.toString().padStart(2, '0')
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const time = `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
    return `${prefix}_${date}_${time}.${extension}`
}