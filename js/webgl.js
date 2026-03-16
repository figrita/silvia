import {hexToRgba} from './utils.js'

export class WebGLRenderer{
    constructor(canvas, initialFrameBufferSize = 10){
        this.gl = canvas.getContext('webgl2', {
            antialias: false,
            preserveDrawingBuffer: true,
            premultipliedAlpha: false
        })
        // Cache black pixel for fallback textures
        this.blackPixel = new Uint8Array([0, 0, 0, 255])
        if(!this.gl){
            console.error('WebGL2 not supported!')
            return
        }

        this.program = null
        this.vao = null
        this.historyTexture = null
        this.historyFBOs = []
        this.tempTexture = null
        this.tempFBO = null
        this.currentIndex = 0
        this.frameBufferSize = initialFrameBufferSize // Store the dynamic size
        this.contextLost = false

        // GPU backpressure: fence from previous frame
        this.pendingFence = null
        this.droppedFrames = 0

        // Uniform location cache — invalidated on program change
        this._uniformCache = new Map()

        // Texture dimension cache — tracks last uploaded size per texture key
        // to allow texSubImage2D instead of texImage2D when dimensions match
        this._texDimensions = new Map()

        // Async shader compilation support
        this.parallelShaderCompileExt = this.gl.getExtension('KHR_parallel_shader_compile')
        this.pendingProgram = null
        this.compilationStartTime = null

        // Context loss handling
        this._onContextLost = (e) => {
            e.preventDefault() // Allow restore
            this.contextLost = true
            console.warn('WebGL context lost on', canvas.id || 'canvas')
        }
        this._onContextRestored = () => {
            console.info('WebGL context restored on', canvas.id || 'canvas')
            this.contextLost = false
            this.pendingFence = null
            this._initGL()
            this._initFramebuffers()
            // Re-compile active program if source was cached
            if(this._lastFragmentSource){
                this.updateProgram(this._lastFragmentSource)
            }
        }
        canvas.addEventListener('webglcontextlost', this._onContextLost)
        canvas.addEventListener('webglcontextrestored', this._onContextRestored)

        this._initGL()
        this.onResize()
    }

    setFrameBufferSize(newSize){
        if(this.frameBufferSize === newSize){return}
        this.frameBufferSize = Math.max(1, Math.min(120, newSize))
        this._initFramebuffers() // Rebuild textures and FBOs with the new size
    }

    _initGL(){
        const {gl} = this
        const positionBuffer = gl.createBuffer()
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
        this.vao = gl.createVertexArray()
        gl.bindVertexArray(this.vao)
        gl.enableVertexAttribArray(0)
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
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
        gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA, gl.canvas.width, gl.canvas.height, this.frameBufferSize, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
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
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.canvas.width, gl.canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
        this.tempFBO = gl.createFramebuffer()
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.tempFBO)
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tempTexture, 0)

        gl.bindFramebuffer(gl.FRAMEBUFFER, null)
        this.currentIndex = 0 // Reset index when buffers are rebuilt
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
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height)
        gl.useProgram(this.program)

        // Skip standard uniforms for main mixer
        if(!customOptions.skipStandardUniforms){
            gl.uniform1f(this._getUniform('u_time'), time)
            gl.uniform2f(this._getUniform('u_resolution'), gl.canvas.width, gl.canvas.height)
            gl.uniform1i(this._getUniform('u_current_frame_index'), this.currentIndex)
            gl.uniform1i(this._getUniform('u_frame_buffer_size'), this.frameBufferSize)

            gl.activeTexture(gl.TEXTURE0)
            gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.historyTexture)
            gl.uniform1i(this._getUniform('u_frame_history'), 0)
        }

        let textureUnit = 1

        // Handle direct canvas texture input
        if(customOptions.textureProviders){
            for(const uniformName in customOptions.textureProviders){
                const location = this._getUniform(uniformName)
                if(!location) continue
                const provider = customOptions.textureProviders[uniformName]

                let texture = textureMap.get(uniformName)
                gl.activeTexture(gl.TEXTURE0 + textureUnit)
                if(!texture){
                    texture = gl.createTexture()
                    textureMap.set(uniformName, texture)
                    gl.bindTexture(gl.TEXTURE_2D, texture)
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT)
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT)
                } else {
                    gl.bindTexture(gl.TEXTURE_2D, texture)
                }

                const canvas = provider()
                if(canvas instanceof HTMLCanvasElement && canvas.width > 0 && canvas.height > 0){
                    const dimKey = uniformName
                    const prev = this._texDimensions.get(dimKey)
                    if(prev && prev[0] === canvas.width && prev[1] === canvas.height){
                        // Dimensions unchanged — sub-upload avoids GPU reallocation
                        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, canvas)
                    } else {
                        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas)
                        this._texDimensions.set(dimKey, [canvas.width, canvas.height])
                    }
                } else {
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.blackPixel)
                    this._texDimensions.delete(uniformName)
                }

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
            0, 0, gl.canvas.width, gl.canvas.height,
            0, 0, gl.canvas.width, gl.canvas.height,
            gl.COLOR_BUFFER_BIT, gl.NEAREST
        )

        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.tempFBO)
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null)
        gl.blitFramebuffer(
            0, 0, gl.canvas.width, gl.canvas.height,
            0, 0, gl.canvas.width, gl.canvas.height,
            gl.COLOR_BUFFER_BIT, gl.NEAREST
        )
        this.currentIndex = (this.currentIndex + 1) % this.frameBufferSize

        // Place fence so next frame can detect if GPU is still working on this one
        this.pendingFence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)

        // Force GPU to process all commands immediately.
        // Prevents Chromium from deferring WebGL work on off-screen canvases
        // (critical on AMD Mesa where scrolled-out canvases stall the pipeline).
        gl.flush()
    }

    onResize(){
        if(this.contextLost){return}
        const {gl} = this
        // Clean up pending fence — framebuffers are about to be rebuilt
        if(this.pendingFence){
            gl.deleteSync(this.pendingFence)
            this.pendingFence = null
        }
        this._texDimensions.clear()
        this._initFramebuffers()
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height)
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