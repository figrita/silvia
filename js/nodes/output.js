import {registerNode} from '../registry.js'
import {compile, compileAsync} from '../compiler.js'
import {SNode} from '../snode.js'
import {WebGLRenderer} from '../webgl.js'
import {BackgroundRenderer} from './_background.js'
import {formatFloatGLSL, formatBytes} from '../utils.js'
import {masterMixer} from '../masterMixer.js'
import {masterMixerUI} from '../masterMixerUI.js'

registerNode({
    slug: 'output',
    icon: '📺',
    label: 'Output',
    tooltip: 'Main output node for rendering and display. Shows result on screen, provides recording capabilities, and frame history control. Connect your effect chain here.',
    elements: {
        canvas: null,
        frameHistoryControl: null,
        vramDisplay: null, // Add a reference for the new display
        statusLine: null // Status line indicator
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
        isCompiling: false,
        compilationProgress: ''
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
                masterMixer.assignToChannelA(this)
                masterMixerUI.updateChannelStatus('A', this)
                this._updateStatusLine()
            }
        },
        'showB': {
            label: 'Show on B',
            type: 'action',
            control: {},  
            callback(){
                masterMixer.assignToChannelB(this)
                masterMixerUI.updateChannelStatus('B', this)
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
    float aspect = ${formatFloatGLSL(this.runtimeState.aspect)};
    uv.x = (uv.x / aspect + 1.0) * 0.5;
    uv.y = (uv.y + 1.0) * 0.5;
    return texture(${uniformName}, vec2(uv.x, 1.0 - uv.y));
}`
            },
            textureUniformUpdate(uniformName, gl, program, textureUnit, textureMap){
                if(this.isDestroyed){return}
                const sourceCanvas = this.runtimeState.renderer?.gl?.canvas
                if(!sourceCanvas || sourceCanvas.width === 0 || sourceCanvas.height === 0){return}
                let texture = textureMap.get(this)
                if(!texture){
                    texture = gl.createTexture()
                    textureMap.set(this, texture)
                    gl.bindTexture(gl.TEXTURE_2D, texture)
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT)
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT)
                }
                gl.activeTexture(gl.TEXTURE0 + textureUnit)
                gl.bindTexture(gl.TEXTURE_2D, texture)
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas)
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
        if(!this.runtimeState.renderer || !this.elements.canvas){return}
        const resolutionValue = this.getOption('resolution')
        const [width, height] = resolutionValue.split('x').map(Number)
        if(this.elements.canvas.width !== width || this.elements.canvas.height !== height){
            this.elements.canvas.width = width
            this.elements.canvas.height = height
            this.elements.canvas.style.aspectRatio = `${width} / ${height}`
            this.runtimeState.aspect = width / height
            // Only refresh downstream outputs if we have connections
            if(this.input.input.connection){
                SNode.refreshDownstreamOutputs(this)
            }
            this.runtimeState.renderer.onResize()
        }
        this._updateVramDisplay() // Update VRAM when resolution changes
    },

    updateFrameBufferSize(){
        if(!this.runtimeState.renderer){return}
        const newSize = this.values.frameHistorySize
        this.runtimeState.renderer.setFrameBufferSize(newSize)
        this._updateVramDisplay() // Update VRAM when history size changes
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
            console.log(`Output node ${this.id} recompiled and is active.`)
        } else {
            this.runtimeState.isActive = false
            console.warn(`Output node ${this.id} is inactive due to compilation failure.`)
        }
        this._updateStatusLine()
    },

    async recompileAsync(){
        if(this.runtimeState.isCompiling){
            console.log('Compilation already in progress, skipping...')
            return
        }

        // Reset any previous failed compilation state
        this.runtimeState.compilationProgress = ''

        this.runtimeState.isCompiling = true
        this.runtimeState.compilationProgress = 'Starting compilation...'
        this._updateStatusLine()

        try {
            const compilationResult = await compileAsync(
                this.input.input,
                this.values.frameHistorySize,
                (progress) => {
                    this.runtimeState.compilationProgress = progress
                    this._updateStatusLine()
                }
            )

            if(compilationResult){
                this.runtimeState.shaderInfo = compilationResult
                this.runtimeState.compilationProgress = 'Compiling...'
                this._updateStatusLine()

                this.runtimeState.renderer.updateProgram(
                    this.runtimeState.shaderInfo.shaderCode,
                    (success) => {
                        this.runtimeState.isCompiling = false
                        if(success){
                            this.runtimeState.isActive = true
                            this.runtimeState.compilationProgress = ''
                            console.log(`Output node ${this.id} async recompiled and is active.`)
                        } else {
                            this.runtimeState.isActive = false
                            this.runtimeState.compilationProgress = 'GPU compilation failed'
                            console.warn(`Output node ${this.id} is inactive due to GPU compilation failure.`)
                        }
                        this._updateStatusLine()
                    }
                )
            } else {
                this.runtimeState.isCompiling = false
                this.runtimeState.isActive = false
                this.runtimeState.compilationProgress = 'Compilation failed'
                console.warn(`Output node ${this.id} is inactive due to compilation failure.`)
                this._updateStatusLine()
            }
        } catch(error){
            this.runtimeState.isCompiling = false
            this.runtimeState.isActive = false
            this.runtimeState.compilationProgress = `Error: ${error.message}`
            console.error(`Async compilation error for output node ${this.id}:`, error)
            this._updateStatusLine()
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
            
            console.log('🎬 Recording started')
            
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
        
        console.log('🎬 Recording stopped')
        
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

    _updateStatusLine(){
        if(!this.elements.statusLine){return}

        const connectionStatus = this.elements.statusLine.querySelector('[data-status="connection"]')
        const showingStatus = this.elements.statusLine.querySelector('[data-status="showing"]')
        const recordingStatus = this.elements.statusLine.querySelector('[data-status="recording"]')

        // Connection status (green if connected, gray if not, orange if compiling)
        const isConnected = this.input.input.connection !== null && this.input.input.connection !== undefined
        if(this.runtimeState.isCompiling){
            connectionStatus.style.color = '#f59e0b'
            connectionStatus.textContent = this.runtimeState.compilationProgress || '⟳ Compiling...'
        } else {
            connectionStatus.style.color = isConnected ? '#10b981' : '#999'
            connectionStatus.textContent = isConnected ? '● Input' : '○ No Input'
        }

        // Showing status - check master mixer channel assignments
        let showingText = '○ Hidden'
        let showingColor = '#999'

        if(masterMixer.channelA === this){
            showingText = '● On A'
            showingColor = '#10b981'
        } else if(masterMixer.channelB === this){
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
            margin-bottom: 8px;
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
        
        this.customArea.appendChild(statusLine)
        this.customArea.appendChild(canvas)
        
        this.runtimeState.renderer = new WebGLRenderer(canvas, this.values.frameHistorySize)

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

        this.updateResolution() // This will also call _updateVramDisplay for the first time
        this._updateStatusLine() // Initialize status line
    },

    updateOutput(time){
        if(!this.runtimeState.isActive || !this.runtimeState.renderer){return}
        this.runtimeState.renderer.render(time, this.runtimeState.shaderInfo, this.runtimeState.textureMap)
        this._updateStatusLine() // Update status line each frame to catch connection changes
    },

    onDestroy(){
        // Stop recording if active
        if(this.runtimeState.isRecording){
            this._stopRecording()
        }
        
        SNode.outputs.delete(this)
        if(BackgroundRenderer.outputNode == this){
            BackgroundRenderer.outputNode = null
            BackgroundRenderer.shaderInfo ? BackgroundRenderer.shaderInfo.removeAllUniformProviders() : null ;
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