import {registerNode} from '../registry.js'
import {Connection} from '../connections.js'

registerNode({
    slug: 'screencapture',
    icon: '🖥️',
    label: 'Screen Capture',
    tooltip: 'Captures your screen or application windows. Modern browsers may require user permission for screen sharing.',
    elements: {
        video: null
    },
    runtimeState: {
        stream: null
    },

    input: {},
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName, uniformName){
                return `vec4 ${funcName}(vec2 uv) {
    ivec2 texSize = textureSize(${uniformName}, 0);
    float aspect = float(texSize.x) / float(texSize.y);
    uv.x = (uv.x / aspect + 1.0) * 0.5;
    uv.y = (uv.y + 1.0) * 0.5;
    return texture(${uniformName}, vec2(uv.x, 1.0 - uv.y));
}`
            },
            textureUniformUpdate(uniformName, gl, program, textureUnit, textureMap){
                if(this.isDestroyed){return}

                const {video} = this.elements

                let texture = textureMap.get(this)
                if(!texture){
                    texture = gl.createTexture()
                    textureMap.set(this, texture)
                    gl.bindTexture(gl.TEXTURE_2D, texture)
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT)
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT)
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
                }

                gl.activeTexture(gl.TEXTURE0 + textureUnit)
                gl.bindTexture(gl.TEXTURE_2D, texture)

                if(video && video.readyState >= video.HAVE_CURRENT_DATA){
                    if(texture._w === video.videoWidth && texture._h === video.videoHeight){
                        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, video)
                    } else {
                        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video)
                        texture._w = video.videoWidth; texture._h = video.videoHeight
                    }
                } else {
                    const blackPixel = new Uint8Array([0, 0, 0, 255])
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, blackPixel)
                    texture._w = 0; texture._h = 0
                }

                const location = gl.getUniformLocation(program, uniformName)
                gl.uniform1i(location, textureUnit)
            }
        }
    },

    onCreate(){
        if(!this.customArea){return}

        // Create video element for preview
        this.elements.video = document.createElement('video')
        this.elements.video.style.width = '100%'
        this.elements.video.style.maxWidth = '320px'
        this.elements.video.style.display = 'none'
        this.elements.video.autoplay = true
        this.elements.video.muted = true
        this.elements.video.playsInline = true

        // Create start button
        const startButton = document.createElement('button')
        startButton.className = 'btn'
        startButton.textContent = 'Start Screen Capture'
        startButton.style.margin = '0.5rem'
        startButton.style.width = 'calc(100% - 1rem)'

        startButton.addEventListener('click', async() => {
            try {
                // Request screen capture
                this.runtimeState.stream = await navigator.mediaDevices.getDisplayMedia({video: true, audio: false})

                // Attach stream to video element
                this.elements.video.srcObject = this.runtimeState.stream

                // Once metadata is loaded
                this.elements.video.onloadedmetadata = () => {
                    // Show video and hide button
                    this.elements.video.style.display = 'block'
                    startButton.style.display = 'none'

                    // Update node dimensions for connections
                    this.updatePortPoints()
                    Connection.redrawAllConnections()
                }

                // Add a listener to reset the UI if the user stops sharing via browser controls.
                this.runtimeState.stream.getVideoTracks()[0].addEventListener('ended', () => {
                    if(this.elements.video){
                        this.elements.video.srcObject = null
                        this.elements.video.style.display = 'none'
                    }
                    startButton.style.display = 'block'
                    startButton.textContent = 'Start Screen Capture'
                    startButton.disabled = false

                    this.updatePortPoints()
                    Connection.redrawAllConnections()
                })

            } catch(err){
                console.error('Error starting screen capture:', err)
                startButton.textContent = 'Capture Canceled'
                startButton.disabled = true
            }
        })

        this.customArea.appendChild(startButton)
        this.customArea.appendChild(this.elements.video)
    },

    onDestroy(){
        if(this.runtimeState.stream){
            this.runtimeState.stream.getTracks().forEach(track => track.stop())
            this.runtimeState.stream = null
        }
        if(this.elements.video){
            this.elements.video.srcObject = null
        }
    }
})