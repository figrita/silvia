import {registerNode} from '../registry.js'
import {Connection} from '../connections.js'
import {SNode} from '../snode.js'
import {formatFloatGLSL} from '../utils.js'

registerNode({
    slug: 'screencapture',
    icon: '🖥️',
    label: 'Screen Capture',
    tooltip: 'Captures your screen or application windows. Modern browsers may require user permission for screen sharing.',
    elements: {
        video: null
    },
    runtimeState: {
        stream: null,
        aspect: 1.0
    },

    input: {},
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName, uniformName){
                return `vec4 ${funcName}(vec2 uv) {
    float aspect = ${formatFloatGLSL(this.runtimeState.aspect)};
    uv.x = (uv.x / aspect + 1.0) * 0.5;  // [-imageAspectRatio, imageAspectRatio] -> [0,1]
    uv.y = (uv.y + 1.0) * 0.5;                     // [-1, 1] -> [0,1]
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
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video)
                } else {
                    // Upload black 1x1 pixel as fallback when no video data yet
                    const blackPixel = new Uint8Array([0, 0, 0, 255])
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, blackPixel)
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

        // Store button reference for cleanup
        this.elements.startButton = startButton

        // Create named handler for cleanup to prevent listener leak
        const clickHandler = async() => {
            // Guard 1: Prevent multiple requests while one is in progress
            if (startButton.disabled) {
                return
            }

            // Guard 2: If a stream already exists, do nothing
            if (this.runtimeState.stream) {
                console.warn('Screen capture stream already active.')
                return
            }

            try {
                // Disable button immediately to prevent multiple clicks
                startButton.disabled = true
                startButton.textContent = 'Initializing...'

                // Stop any previous stream (defensive programming)
                if (this.runtimeState.stream) {
                    this.runtimeState.stream.getTracks().forEach(track => track.stop())
                    this.runtimeState.stream = null
                }

                // Request screen capture
                this.runtimeState.stream = await navigator.mediaDevices.getDisplayMedia({video: true, audio: false})

                // Attach stream to video element
                this.elements.video.srcObject = this.runtimeState.stream

                // Once metadata is loaded
                this.elements.video.onloadedmetadata = () => {
                    // Calculate aspect ratio from intrinsic dimensions
                    this.runtimeState.aspect = this.elements.video.videoWidth / this.elements.video.videoHeight

                    // Show video and hide button
                    this.elements.video.style.display = 'block'
                    startButton.style.display = 'none'

                    // Update node dimensions for connections
                    this.updatePortPoints()
                    Connection.redrawAllConnections()
                    SNode.refreshDownstreamOutputs(this)
                }

                // Add a listener to reset the UI if the user stops sharing via browser controls.
                // Store handler for cleanup to prevent listener leak
                const trackEndedHandler = () => {
                    if(this.elements.video){
                        this.elements.video.srcObject = null
                        this.elements.video.style.display = 'none'
                    }
                    this.runtimeState.stream = null
                    this.runtimeState._trackEndedHandler = null
                    startButton.style.display = 'block'
                    startButton.textContent = 'Start Screen Capture'
                    startButton.disabled = false

                    // Reset aspect ratio
                    this.runtimeState.aspect = 1.0

                    this.updatePortPoints()
                    Connection.redrawAllConnections()
                    SNode.refreshDownstreamOutputs(this)
                }

                this.runtimeState.stream.getVideoTracks()[0].addEventListener('ended', trackEndedHandler)
                this.runtimeState._trackEndedHandler = trackEndedHandler

            } catch(err){
                console.error('Error starting screen capture:', err)
                startButton.textContent = 'Capture Canceled'
                // Keep button disabled on error
            }
        }

        startButton.addEventListener('click', clickHandler)
        this.runtimeState._buttonClickHandler = clickHandler

        this.customArea.appendChild(startButton)
        this.customArea.appendChild(this.elements.video)
    },

    onDestroy(){
        // Clean up button click listener to prevent leak
        if(this.elements.startButton && this.runtimeState._buttonClickHandler){
            this.elements.startButton.removeEventListener('click', this.runtimeState._buttonClickHandler)
            this.runtimeState._buttonClickHandler = null
        }

        // Clean up 'ended' event listener to prevent leak
        if(this.runtimeState.stream && this.runtimeState._trackEndedHandler){
            this.runtimeState.stream.getVideoTracks().forEach(track => {
                track.removeEventListener('ended', this.runtimeState._trackEndedHandler)
            })
            this.runtimeState._trackEndedHandler = null
        }

        if(this.runtimeState.stream){
            this.runtimeState.stream.getTracks().forEach(track => track.stop())
            this.runtimeState.stream = null
            console.log('Screen capture stream stopped.')
        }
        if(this.elements.video){
            this.elements.video.srcObject = null
        }
    }
})