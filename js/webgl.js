import {hexToRgba} from './utils.js'

export class WebGLRenderer{
    constructor(canvasOrOpts, initialFrameBufferSize = 10){
        if(canvasOrOpts instanceof HTMLCanvasElement){
            // Standalone mode — mixer uses this
            this._fboMode = false
            this.gl = canvasOrOpts.getContext('webgl2', {
                antialias: false,
                preserveDrawingBuffer: true,
                premultipliedAlpha: false
            })
            this._width = canvasOrOpts.width
            this._height = canvasOrOpts.height

            // Context loss handling
            this._onContextLost = (e) => {
                e.preventDefault()
                this.contextLost = true
                console.warn('WebGL context lost')
                // Context is gone — all GL calls are no-ops. Just null; don't call deleteSync.
                this.pendingFence = null
                this.pendingProgram = null
            }
            this._onContextRestored = () => {
                console.info('WebGL context restored')
                this.contextLost = false
                this.pendingFence = null
                // Null stale handles before _initGL() so its delete guards don't fire on
                // potentially-reused GL names in the restored context.
                this.vao = null
                this._positionBuffer = null
                this._initGL()
                this._blackTexture = this._createBlackTexture()
                this._initFramebuffers()
                if(this._lastFragmentSource) this.updateProgram(this._lastFragmentSource)
            }
            canvasOrOpts.addEventListener('webglcontextlost', this._onContextLost)
            canvasOrOpts.addEventListener('webglcontextrestored', this._onContextRestored)
        } else {
            // FBO mode — Output nodes use this
            this._fboMode = true
            this.gl = canvasOrOpts.gl
            this.vao = canvasOrOpts.vao
            this._width = canvasOrOpts.width
            this._height = canvasOrOpts.height
        }

        this.blackPixel = new Uint8Array([0, 0, 0, 255])
        if(!this.gl){ console.error('WebGL2 not supported!'); return }

        this.program = null
        if(!this._fboMode){
            this.vao = null
            this._positionBuffer = null
        }
        this.historyTexture = null
        this.historyFBOs = []
        this.tempTexture = null
        this.tempFBO = null
        this.currentIndex = 0
        this.frameBufferSize = initialFrameBufferSize
        this.contextLost = false
        this.pendingFence = null
        this.droppedFrames = 0
        this._uniformCache = new Map()
        this.parallelShaderCompileExt = this.gl.getExtension('KHR_parallel_shader_compile')
        this.pendingProgram = null
        this.compilationStartTime = null

        // PBO state (FBO mode only)
        this._pbo = null
        this._pboFences = [null, null]
        this._stagingBuffer = null
        this._pboFrame = 0

        if(!this._fboMode){
            this._initGL()
            this._blackTexture = this._createBlackTexture()
        }
        this._initFramebuffers()
    }

    setFrameBufferSize(newSize){
        if(this.frameBufferSize === newSize){return}
        this.frameBufferSize = Math.max(1, Math.min(120, newSize))
        this._initFramebuffers()
    }

    _initGL(){
        const {gl} = this
        // Clean up previous objects if re-entered (not first call)
        if(this.vao)             { gl.deleteVertexArray(this.vao); this.vao = null }
        if(this._positionBuffer) { gl.deleteBuffer(this._positionBuffer); this._positionBuffer = null }

        this._positionBuffer = gl.createBuffer()
        gl.bindBuffer(gl.ARRAY_BUFFER, this._positionBuffer)
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
        this.vao = gl.createVertexArray()
        gl.bindVertexArray(this.vao)
        gl.enableVertexAttribArray(0)
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    }

    _createBlackTexture(){
        const {gl} = this
        const tex = gl.createTexture()
        gl.bindTexture(gl.TEXTURE_2D, tex)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
            new Uint8Array([0, 0, 0, 255]))
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
        return tex
    }

    _initFramebuffers(){
        const {gl} = this
        if(this.historyTexture){gl.deleteTexture(this.historyTexture)}
        if(this.tempTexture){gl.deleteTexture(this.tempTexture)}
        if(this.tempFBO){gl.deleteFramebuffer(this.tempFBO)}
        this.historyFBOs.forEach(f => gl.deleteFramebuffer(f))
        this.historyFBOs = []

        this.historyTexture = gl.createTexture()
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.historyTexture)
        gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA, this._width, this._height, this.frameBufferSize, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT)
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT)

        for(let i = 0; i < this.frameBufferSize; i++){
            const fbo = gl.createFramebuffer()
            this.historyFBOs.push(fbo)
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
            gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, this.historyTexture, 0, i)
        }

        this.tempTexture = gl.createTexture()
        gl.bindTexture(gl.TEXTURE_2D, this.tempTexture)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this._width, this._height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT)
        this.tempFBO = gl.createFramebuffer()
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.tempFBO)
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tempTexture, 0)

        gl.bindFramebuffer(gl.FRAMEBUFFER, null)
        this.currentIndex = 0

        if(this._fboMode){
            this._initPBOs()
        }
    }

    updateProgram(fragmentShaderSource, onComplete = null){
        if(this.contextLost){return}
        this._lastFragmentSource = fragmentShaderSource
        const {gl} = this
        const vs = `#version 300 es\nin vec4 a_position; void main() { gl_Position = a_position; }`

        if(this.parallelShaderCompileExt){
            this._updateProgramAsync(vs, fragmentShaderSource, onComplete)
        } else {
            this._updateProgramSync(vs, fragmentShaderSource)
            if(onComplete) onComplete(true)
        }
    }

    _updateProgramSync(vertexShaderSource, fragmentShaderSource){
        const {gl} = this
        const vertexShader = this._createShader(gl.VERTEX_SHADER, vertexShaderSource)
        const fragmentShader = this._createShader(gl.FRAGMENT_SHADER, fragmentShaderSource)
        if(this.program){gl.deleteProgram(this.program)}
        this.program = this._createProgram(vertexShader, fragmentShader)
        this._uniformCache.clear()
    }

    _updateProgramAsync(vertexShaderSource, fragmentShaderSource, onComplete){
        const {gl} = this

        // Clean up any pending compilation
        if(this.pendingProgram){
            gl.deleteProgram(this.pendingProgram)
            this.pendingProgram = null
        }

        const vertexShader = this._createShader(gl.VERTEX_SHADER, vertexShaderSource)
        const fragmentShader = this._createShader(gl.FRAGMENT_SHADER, fragmentShaderSource)

        if(!vertexShader || !fragmentShader){
            console.error('Shader creation failed during async compilation')
            if(onComplete) onComplete(false)
            return
        }

        this.pendingProgram = this._createProgramAsync(vertexShader, fragmentShader)
        this.compilationStartTime = performance.now()

        // Poll for completion
        this._pollCompilation(onComplete)
    }

    _pollCompilation(onComplete){
        const {gl} = this

        if(!this.pendingProgram){
            if(onComplete) onComplete(false)
            return
        }

        const compilationStatus = gl.getProgramParameter(
            this.pendingProgram,
            this.parallelShaderCompileExt.COMPLETION_STATUS_KHR
        )

        if(compilationStatus){
            // Compilation complete
            const linkStatus = gl.getProgramParameter(this.pendingProgram, gl.LINK_STATUS)

            if(linkStatus){
                // Success - swap programs
                if(this.program){
                    gl.deleteProgram(this.program)
                }
                this.program = this.pendingProgram
                this.pendingProgram = null
                this._uniformCache.clear()

                const elapsed = performance.now() - this.compilationStartTime

                if(onComplete) onComplete(true)
            } else {
                // Link failed
                console.error('Async program linking error:', gl.getProgramInfoLog(this.pendingProgram))
                gl.deleteProgram(this.pendingProgram)
                this.pendingProgram = null
                if(onComplete) onComplete(false)
            }
        } else {
            // Still compiling - check again next frame
            requestAnimationFrame(() => this._pollCompilation(onComplete))
        }
    }

    render(time, shaderInfo, textureMap, customOptions = {}){
        if(this.contextLost || !this.program || !shaderInfo || this.historyFBOs.length === 0){return}
        const {gl} = this

        // GPU backpressure: if previous frame's fence hasn't signaled, skip this frame
        if(this.pendingFence){
            const status = gl.clientWaitSync(this.pendingFence, 0, 0)
            if(status === gl.TIMEOUT_EXPIRED){
                // GPU still working on previous frame — drop this one gracefully
                this.droppedFrames++
                return
            }
            // Fence signaled or error — clean up
            gl.deleteSync(this.pendingFence)
            this.pendingFence = null
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.tempFBO)
        gl.viewport(0, 0, this._width, this._height)
        gl.useProgram(this.program)

        // Skip standard uniforms for main mixer
        if(!customOptions.skipStandardUniforms){
            gl.uniform1f(this._getUniform('u_time'), time)
            gl.uniform2f(this._getUniform('u_resolution'), this._width, this._height)
            gl.uniform1i(this._getUniform('u_current_frame_index'), this.currentIndex)
            gl.uniform1i(this._getUniform('u_frame_buffer_size'), this.frameBufferSize)

            gl.activeTexture(gl.TEXTURE0)
            gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.historyTexture)
            gl.uniform1i(this._getUniform('u_frame_history'), 0)
        }

        let textureUnit = 1

        // Handle direct canvas texture input (legacy path)
        if(customOptions.textureProviders){
            for(const uniformName in customOptions.textureProviders){
                const location = this._getUniform(uniformName)
                if(!location) continue
                const provider = customOptions.textureProviders[uniformName]

                let entry = textureMap.get(uniformName)
                gl.activeTexture(gl.TEXTURE0 + textureUnit)
                if(!entry){
                    const tex = gl.createTexture()
                    entry = {tex, w: 0, h: 0}
                    textureMap.set(uniformName, entry)
                    gl.bindTexture(gl.TEXTURE_2D, tex)
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT)
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT)
                } else {
                    gl.bindTexture(gl.TEXTURE_2D, entry.tex)
                }

                const canvas = provider()
                if(canvas instanceof HTMLCanvasElement && canvas.width > 0 && canvas.height > 0){
                    if(entry.w === canvas.width && entry.h === canvas.height){
                        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, canvas)
                    } else {
                        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas)
                        entry.w = canvas.width; entry.h = canvas.height
                    }
                } else {
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.blackPixel)
                    entry.w = 0; entry.h = 0
                }

                gl.uniform1i(location, textureUnit)
                textureUnit++
            }
        }

        // Handle direct texture bindings (shared context path)
        if(customOptions.textureBindings){
            for(const [uniformName, texture] of Object.entries(customOptions.textureBindings)){
                const location = this._getUniform(uniformName)
                if(!location) continue
                gl.activeTexture(gl.TEXTURE0 + textureUnit)
                gl.bindTexture(gl.TEXTURE_2D, texture)
                gl.uniform1i(location, textureUnit)
                textureUnit++
            }
        }

        shaderInfo.uniformProviders.forEach(provider => {
            const location = this._getUniform(provider.uniformName)
            if(!location){return}
            if(provider.sourcePort){
                if(provider.sourcePort.textureUniformUpdate){
                    provider.sourcePort.textureUniformUpdate(provider.uniformName, gl, this.program, textureUnit++, textureMap)
                }
                if(provider.sourcePort.floatUniformUpdate){
                    provider.sourcePort.floatUniformUpdate(provider.uniformName, gl, this.program)
                }
                if(provider.sourcePort.colorUniformUpdate){
                    provider.sourcePort.colorUniformUpdate(provider.uniformName, gl, this.program)
                }
            } else if(provider.sourceControl){
                if(provider.type === 'float'){
                    gl.uniform1f(location, parseFloat(provider.sourceControl.value))
                } else if(provider.type === 'vec2'){
                    const value = provider.sourceControl.value
                    if(Array.isArray(value) && value.length >= 2){
                        gl.uniform2f(location, value[0], value[1])
                    }
                } else if(provider.type === 'vec4'){
                    const rgba = hexToRgba(provider.sourceControl.value)
                    if(rgba){gl.uniform4f(location, rgba.r / 255.0, rgba.g / 255.0, rgba.b / 255.0, rgba.a)}
                } else if(provider.type === 'int'){
                    gl.uniform1i(location, parseInt(provider.sourceControl.value, 10))
                } else if(provider.type === 'bool'){
                    gl.uniform1i(location, provider.sourceControl.checked ? 1 : 0)
                }
            }
        })

        gl.bindVertexArray(this.vao)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.tempFBO)
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.historyFBOs[this.currentIndex])
        gl.blitFramebuffer(
            0, 0, this._width, this._height,
            0, 0, this._width, this._height,
            gl.COLOR_BUFFER_BIT, gl.NEAREST
        )

        if(!this._fboMode){
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.tempFBO)
            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null)
            gl.blitFramebuffer(
                0, 0, this._width, this._height,
                0, 0, this._width, this._height,
                gl.COLOR_BUFFER_BIT, gl.NEAREST
            )
        }
        this.currentIndex = (this.currentIndex + 1) % this.frameBufferSize

        // Place fence so next frame can detect if GPU is still working on this one
        this.pendingFence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)

        if(!this._fboMode){
            // Force GPU to process all commands immediately.
            // Prevents Chromium from deferring WebGL work on off-screen canvases
            // (critical on AMD Mesa where scrolled-out canvases stall the pipeline).
            gl.flush()
        }

        return true
    }

    onResize(width, height){
        if(this.contextLost) return
        const {gl} = this
        if(this._fboMode){
            this._width = width
            this._height = height
        } else {
            this._width = gl.canvas.width
            this._height = gl.canvas.height
        }
        if(this.pendingFence){
            gl.deleteSync(this.pendingFence)
            this.pendingFence = null
        }
        this._initFramebuffers()
        gl.viewport(0, 0, this._width, this._height)
    }

    getLatestTexture(){
        return this.tempTexture
    }

    // PBO async readback — FBO mode only

    _initPBOs(){
        const {gl} = this
        const size = this._width * this._height * 4

        // Clean up existing PBOs (rebuild on resize or context restore)
        if(this._pbo){
            this._pbo.forEach(b => { if(b) gl.deleteBuffer(b) })
        }
        if(this._pboFences[0]){ gl.deleteSync(this._pboFences[0]); this._pboFences[0] = null }
        if(this._pboFences[1]){ gl.deleteSync(this._pboFences[1]); this._pboFences[1] = null }

        this._pbo = [gl.createBuffer(), gl.createBuffer()]
        for(const buf of this._pbo){
            gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buf)
            gl.bufferData(gl.PIXEL_PACK_BUFFER, size, gl.STREAM_READ)
        }
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)

        this._stagingBuffer = new Uint8Array(size)
        this._pboFrame = 0
    }

    // Call AFTER render() each frame. Queues async GPU→PBO readback.
    issueReadback(){
        if(this.contextLost || !this._pbo) return
        const slot = this._pboFrame % 2
        const {gl} = this

        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.tempFBO)
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this._pbo[slot])
        gl.readPixels(0, 0, this._width, this._height, gl.RGBA, gl.UNSIGNED_BYTE, 0)

        // Replace any existing fence for this slot
        if(this._pboFences[slot]) gl.deleteSync(this._pboFences[slot])
        this._pboFences[slot] = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)

        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null)

        this._pboFrame++
    }

    // Call BEFORE render() each frame. Returns Uint8Array if GPU data is ready,
    // null if not ready yet (caller keeps the 2D canvas as-is — no stall).
    collectReadback(){
        if(this.contextLost || !this._pbo || this._pboFrame < 2) return null

        const slot = (this._pboFrame - 1) % 2
        const fence = this._pboFences[slot]
        if(!fence) return null

        const {gl} = this
        const status = gl.clientWaitSync(fence, 0, 0)

        if(status === gl.TIMEOUT_EXPIRED || status === gl.WAIT_FAILED) return null

        // CONDITION_SATISFIED or ALREADY_SIGNALED — GPU is done, safe to read
        gl.deleteSync(fence)
        this._pboFences[slot] = null

        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this._pbo[slot])
        gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, this._stagingBuffer)
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)

        return this._stagingBuffer
    }

    // Context loss — FBO mode external handlers

    handleContextLost(){
        this.contextLost = true
        this.pendingFence = null
        this.pendingProgram = null
        this._pboFences = [null, null]
        this._pboFrame = 0
        this._pbo = null
    }

    handleContextRestored(sharedVao){
        this.contextLost = false
        this.pendingFence = null
        this.vao = sharedVao
        this._initFramebuffers()
        if(this._lastFragmentSource) this.updateProgram(this._lastFragmentSource)
        if(this.onContextRestored) this.onContextRestored()
    }

    _getUniform(name){
        let loc = this._uniformCache.get(name)
        if(loc === undefined){
            loc = this.gl.getUniformLocation(this.program, name)
            this._uniformCache.set(name, loc)
        }
        return loc
    }

    _createShader(type, source){
        const {gl} = this
        const shader = gl.createShader(type)
        gl.shaderSource(shader, source)
        gl.compileShader(shader)
        if(!gl.getShaderParameter(shader, gl.COMPILE_STATUS)){
            console.error('Shader compilation error:', gl.getShaderInfoLog(shader))
            gl.deleteShader(shader)
            return null
        }
        return shader
    }

    _createProgram(vertexShader, fragmentShader){
        const {gl} = this
        const program = gl.createProgram()
        gl.attachShader(program, vertexShader)
        gl.attachShader(program, fragmentShader)
        gl.linkProgram(program)
        if(!gl.getProgramParameter(program, gl.LINK_STATUS)){
            console.error('Program linking error:', gl.getProgramInfoLog(program))
            gl.deleteProgram(program)
            return null
        }
        return program
    }

    _createProgramAsync(vertexShader, fragmentShader){
        const {gl} = this
        const program = gl.createProgram()
        gl.attachShader(program, vertexShader)
        gl.attachShader(program, fragmentShader)
        gl.linkProgram(program)
        return program
    }
}