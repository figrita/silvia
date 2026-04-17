import {registerNode} from '../registry.js'
import {Connection} from '../connections.js'

registerNode({
    slug: 'webcam',
    icon: '📹',
    label: 'Webcam',
    tooltip: 'Captures live video from your webcam. Click to request camera permission. Use the Mirror option to control horizontal flipping.',
    elements: {
        video: null
    },
    runtimeState: {
        stream: null // To hold the MediaStream object
    },

    offlineBlocked: true,
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
    ivec2 texSize = textureSize(${uniformName}, 0);
    float aspect = float(texSize.x) / float(texSize.y);
    uv.x = (uv.x / aspect + 1.0) * 0.5;
    uv.y = (1.0 - uv.y) * 0.5;
    return texture(${uniformName}, vec2(${xCoord}, uv.y));
}`
            },
            textureUniformUpdate(uniformName, gl, program, textureUnit, textureMap){
                if(this.isDestroyed){return}

                const {video} = this.elements

                let entry = textureMap.get(this)
                if(!entry){
                    const tex = gl.createTexture()
                    entry = {tex, w: 0, h: 0}
                    textureMap.set(this, entry)
                    gl.bindTexture(gl.TEXTURE_2D, tex)
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT)
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT)
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
                }

                gl.activeTexture(gl.TEXTURE0 + textureUnit)
                gl.bindTexture(gl.TEXTURE_2D, entry.tex)

                if(video && video.readyState >= video.HAVE_CURRENT_DATA){
                    if(entry.w === video.videoWidth && entry.h === video.videoHeight){
                        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, video)
                    } else {
                        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video)
                        entry.w = video.videoWidth; entry.h = video.videoHeight
                    }
                } else {
                    const blackPixel = new Uint8Array([0, 0, 0, 255])
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, blackPixel)
                    entry.w = 0; entry.h = 0
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
                    // Show video and hide button
                    this.elements.video.style.display = 'block'
                    startButton.style.display = 'none'

                    // Update node dimensions so connections redraw correctly
                    this.updatePortPoints()
                    Connection.redrawAllConnections()
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
        }
        if(this.elements.video){
            this.elements.video.srcObject = null
        }
    }
})