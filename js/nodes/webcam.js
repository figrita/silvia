import {registerNode} from '../registry.js'
import {Connection} from '../connections.js'
import {SNode} from '../snode.js'
import {formatFloatGLSL} from '../utils.js'

registerNode({
    slug: 'webcam',
    icon: '📹',
    label: 'Webcam',
    tooltip: 'Captures live video from your webcam. Click to request camera permission. Use the Mirror option to control horizontal flipping.',
    elements: {
        video: null
    },
    runtimeState: {
        stream: null, // To hold the MediaStream object
        aspect: 1.0
    },

    input: {},
    
    options: {
        'mirror': {
            label: 'Mirror Output',
            type: 'select',
            default: 'yes',
            choices: [
                {value: 'yes', name: 'Yes'},
                {value: 'no', name: 'No'}
            ]
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName, uniformName){
                const mirror = this.getOption('mirror') === 'yes'
                const xCoord = mirror ? '1.0 - uv.x' : 'uv.x'
                
                return `vec4 ${funcName}(vec2 uv) {
    float aspect = ${formatFloatGLSL(this.runtimeState.aspect)};
    uv.x = (uv.x / aspect + 1.0) * 0.5;  // [-imageAspectRatio, imageAspectRatio] -> [0,1]
    uv.y = (1.0 - uv.y) * 0.5;                     // [-1, 1] -> [0,1]
    return texture(${uniformName}, vec2(${xCoord}, uv.y));
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

        // Create the video element for the preview
        this.elements.video = document.createElement('video')
        this.elements.video.style.width = '100%'
        this.elements.video.style.maxWidth = '320px'
        this.elements.video.style.display = 'none' // Initially hidden
        this.elements.video.autoplay = true
        this.elements.video.muted = true // Required for autoplay in most browsers
        this.elements.video.playsInline = true

        // Create the button to request camera access
        const startButton = document.createElement('button')
        startButton.className = 'btn'
        startButton.textContent = 'Start Webcam'
        startButton.style.margin = '0.5rem'
        startButton.style.width = 'calc(100% - 1rem)'

        startButton.addEventListener('click', async() => {
            try {
                // Request access to the webcam
                this.runtimeState.stream = await navigator.mediaDevices.getUserMedia({video: true, audio: false})

                // Attach the stream to our video element
                this.elements.video.srcObject = this.runtimeState.stream

                // Once the video metadata is loaded
                this.elements.video.onloadedmetadata = () => {
                    // Calculate aspect ratio from intrinsic dimensions
                    this.runtimeState.aspect = this.elements.video.videoWidth / this.elements.video.videoHeight

                    // Show video and hide button
                    this.elements.video.style.display = 'block'
                    startButton.style.display = 'none'

                    // Update node dimensions so connections redraw correctly
                    this.updatePortPoints()
                    Connection.redrawAllConnections()
                    SNode.refreshDownstreamOutputs(this)
                }

            } catch(err){
                console.error('Error accessing webcam:', err)
                startButton.textContent = 'Permission Denied'
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
            console.log('Webcam stream stopped.')
        }
        if(this.elements.video){
            this.elements.video.srcObject = null
        }
    }
})