import {WebGLRenderer} from './webgl.js'
import {BackgroundRenderer} from './nodes/_background.js'

export class MasterMixer {
    constructor() {
        this.channelA = null  // Output node reference
        this.channelB = null  // Output node reference  
        this.mixValue = 0.0   // 0=A, 1=B
        this.canvas = null    // Hidden mixing canvas
        this.renderer = null  // WebGL renderer instance
        this.textureMap = new Map()
        this.isInitialized = false
        this.projectorStream = null
        this.backgroundVisible = true
        this.bgVideoElement = null  // Cache DOM reference
        this.useViewportResolution = true  // Track if using viewport matching
        this.resizeListener = null  // For cleanup
        this.crossfadeMethod = 0  // 0 = simple mix
    }
    
    init() {
        // Create hidden canvas for mixing
        this.canvas = document.createElement('canvas')
        this.canvas.style.display = 'none'
        document.body.appendChild(this.canvas)
        
        // Set default resolution (will be updated to match output nodes)
        this.canvas.width = 1280
        this.canvas.height = 720
        
        // Cache background video element reference
        this.bgVideoElement = document.getElementById('background-video')
        
        // Create WebGL renderer (minimal frame buffer)
        this.renderer = new WebGLRenderer(this.canvas, 2)

        // Compile static mixing shader
        this.renderer.updateProgram(MIXING_FRAGMENT_SHADER)

        this.isInitialized = true
        console.log('Master Mixer initialized')
    }
    
    assignToChannelA(outputNode) {
        const oldNode = this.channelA
        this.channelA = outputNode
        // Notify old node to update its status line (it's no longer on A)
        if (oldNode && oldNode !== outputNode && oldNode._updateStatusLine) {
            oldNode._updateStatusLine()
        }
        console.log('Channel A assigned:', outputNode)
    }

    assignToChannelB(outputNode) {
        const oldNode = this.channelB
        this.channelB = outputNode
        // Notify old node to update its status line (it's no longer on B)
        if (oldNode && oldNode !== outputNode && oldNode._updateStatusLine) {
            oldNode._updateStatusLine()
        }
        console.log('Channel B assigned:', outputNode)
    }

    clearChannel(outputNode) {
        if (this.channelA === outputNode) {
            this.channelA = null
            console.log('Channel A cleared')
        }
        if (this.channelB === outputNode) {
            this.channelB = null
            console.log('Channel B cleared')
        }
    }

    _clearToBlack() {
        if (!this.renderer || !this.canvas) return
        const gl = this.renderer.gl
        if (!gl) return

        gl.bindFramebuffer(gl.FRAMEBUFFER, null)
        gl.viewport(0, 0, this.canvas.width, this.canvas.height)
        gl.clearColor(0, 0, 0, 1)
        gl.clear(gl.COLOR_BUFFER_BIT)
        gl.flush()
        console.log('Master mixer cleared to black')
    }
    
    setResolution(resolutionString) {
        if (!this.canvas) return
        
        this.useViewportResolution = false
        this._removeResizeListener()
        
        const [width, height] = resolutionString.split('x').map(Number)
        this._updateCanvasSize(width, height)
    }
    
    setViewportResolution() {
        if (!this.canvas) return
        
        this.useViewportResolution = true
        this._updateViewportSize()
        this._setupResizeListener()
    }
    
    _updateViewportSize() {
        // Calculate editor-matching resolution for proper background coverage
        const editor = document.getElementById('editor')
        const editorRect = editor.getBoundingClientRect()
        const viewportWidth = editorRect.width
        const viewportHeight = window.innerHeight
        
        // Use a reasonable resolution that matches the viewport aspect ratio
        // Scale to a good resolution (aim for ~1080p equivalent)
        const targetHeight = Math.min(1080, viewportHeight)
        const aspectRatio = viewportWidth / viewportHeight
        const width = Math.round(targetHeight * aspectRatio)
        const height = targetHeight
        
        this._updateCanvasSize(width, height)
    }
    
    _updateCanvasSize(width, height) {
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width
            this.canvas.height = height

            // Update renderer with new dimensions
            if (this.renderer) {
                this.renderer.onResize()
            }

            // Update projector window size to match
            BackgroundRenderer.updateProjectorSize()
        }
    }
    
    _setupResizeListener() {
        this._removeResizeListener()
        this.resizeListener = () => {
            if (this.useViewportResolution) {
                this._updateViewportSize()
            }
        }
        window.addEventListener('resize', this.resizeListener)
    }
    
    _removeResizeListener() {
        if (this.resizeListener) {
            window.removeEventListener('resize', this.resizeListener)
            this.resizeListener = null
        }
    }
    
    setMixValue(value) {
        this.mixValue = Math.max(0, Math.min(1, value))
    }
    
    setBackgroundVisible(visible) {
        this.backgroundVisible = visible
        if (this.bgVideoElement) {
            this.bgVideoElement.style.display = visible ? 'block' : 'none'
        }
    }
    
    setCrossfadeMethod(method) {
        this.crossfadeMethod = Math.max(0, Math.min(7, method))
    }
    
    connectProjector(projectorVideoElement) {
        if (this.projectorStream && projectorVideoElement) {
            projectorVideoElement.srcObject = this.projectorStream
            projectorVideoElement.play()
            return true
        }
        return false
    }
    
    updateMasterOutput() {
        if (!this.isInitialized) return

        // If both channels are empty, just clear to black and return
        if (!this.channelA && !this.channelB) {
            this._clearToBlack()
            return
        }

        // Calculate aspect ratios for the assigned channels
        const getAspectRatio = (channel) => {
            if (channel && channel.elements && channel.elements.canvas) {
                const canvas = channel.elements.canvas
                if (canvas.width > 0 && canvas.height > 0) {
                    return canvas.width / canvas.height
                }
            }
            return 1.0 // Default square aspect ratio
        }
        
        const aspectA = getAspectRatio(this.channelA)
        const aspectB = getAspectRatio(this.channelB)
        
        const shaderInfo = {
            uniformProviders: [
                {
                    uniformName: 'u_mix',
                    type: 'float',
                    sourceControl: { value: this.mixValue }
                },
                {
                    uniformName: 'u_resolution',
                    type: 'vec2',
                    sourceControl: { value: [this.canvas.width, this.canvas.height] }
                },
                {
                    uniformName: 'u_aspectA',
                    type: 'float',
                    sourceControl: { value: aspectA }
                },
                {
                    uniformName: 'u_aspectB',
                    type: 'float',
                    sourceControl: { value: aspectB }
                },
                {
                    uniformName: 'u_crossfadeMethod',
                    type: 'float',
                    sourceControl: { value: this.crossfadeMethod }
                }
            ]
        }
        
        const textureProviders = {
            'u_channelA': () => (this.channelA?.runtimeState?.isActive && this.channelA?.elements?.canvas) || null,
            'u_channelB': () => (this.channelB?.runtimeState?.isActive && this.channelB?.elements?.canvas) || null
        }
        
        this.renderer.render(performance.now() * 0.001, shaderInfo, this.textureMap, {
            skipStandardUniforms: true,
            textureProviders: textureProviders
        })
        
        if (this.backgroundVisible) {
            this._updateBackgroundStream()
        }
    }
    
    _updateBackgroundStream() {
        if (!this.bgVideoElement) return

        if (!this.projectorStream) {
            this.projectorStream = this.canvas.captureStream(60)
            this.reconnectProjector()
        }

        if (this.bgVideoElement.srcObject !== this.projectorStream) {
            this.bgVideoElement.srcObject = this.projectorStream
            this.bgVideoElement.play().catch(() => {})
        }
    }
    
    _updateProjectorStream() {
        // Find projector video element if window is open
        try {
            const projectorWindow = Array.from(window.parent.frames).find(f => f.name === 'projector')
            if (projectorWindow && projectorWindow.document) {
                const projectorVideo = projectorWindow.document.getElementById('projector-video')
                if (projectorVideo && this.projectorStream) {
                    projectorVideo.srcObject = this.projectorStream
                    projectorVideo.play()
                }
            }
        } catch (e) {
            // Projector window may not be accessible or open, that's fine
        }
    }

    // Force reconnect projector stream (called when we have a new stream)
    reconnectProjector() {
        if (!this.projectorStream) return

        // Use BackgroundRenderer's method since it has the window reference
        if (BackgroundRenderer.reconnectProjectorStream) {
            BackgroundRenderer.reconnectProjectorStream(this.projectorStream)
        } else {
            console.warn('BackgroundRenderer.reconnectProjectorStream not available')
        }
    }
    
    destroy() {
        this._removeResizeListener()
        
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas)
        }
        if (this.projectorStream) {
            this.projectorStream.getTracks().forEach(track => track.stop())
        }
        this.isInitialized = false
    }
}

const MIXING_FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform sampler2D u_channelA;
uniform sampler2D u_channelB;
uniform float u_mix;
uniform vec2 u_resolution;
uniform float u_aspectA;  // Texture A aspect ratio (width/height)
uniform float u_aspectB;  // Texture B aspect ratio (width/height)
uniform float u_crossfadeMethod; // 0=simple, 1=horizontal wipe, 2=vertical wipe, etc.
out vec4 fragColor;

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    
    // Calculate viewport aspect ratio
    float viewportAspect = u_resolution.x / u_resolution.y;
    
    // Full-height normalized scaling with aspect ratio correction for texture A
    vec2 uvA = uv;
    float scaleA = viewportAspect / u_aspectA;  // Scale factor to maintain aspect ratio
    uvA.x = (uvA.x - 0.5) * scaleA + 0.5;      // Scale horizontally, centered
    
    // Full-height normalized scaling with aspect ratio correction for texture B  
    vec2 uvB = uv;
    float scaleB = viewportAspect / u_aspectB;  // Scale factor to maintain aspect ratio
    uvB.x = (uvB.x - 0.5) * scaleB + 0.5;      // Scale horizontally, centered
    
    // Sample with mirror wrapping (handled by texture parameters) and Y flip
    vec4 colorA = texture(u_channelA, vec2(uvA.x, 1.0 - uvA.y));
    vec4 colorB = texture(u_channelB, vec2(uvB.x, 1.0 - uvB.y));
    
    float mixAmount = u_mix;
    int method = int(u_crossfadeMethod);
    
    if (method == 0) {
        // Simple blend/mix
        fragColor = mix(colorA, colorB, mixAmount);
    } else if (method == 1) {
        // Horizontal Wipe (left to right)
        float wipePosition = mixAmount;
        fragColor = (uv.x < wipePosition) ? colorB : colorA;
    } else if (method == 2) {
        // Vertical Wipe (bottom to top)
        float wipePosition = mixAmount;
        fragColor = (uv.y < wipePosition) ? colorB : colorA;
    } else if (method == 3) {
        // Radial Wipe (Looney Tunes style - center outward, perfect circle)
        vec2 center = vec2(0.5, 0.5);
        vec2 offset = uv - center;
        // Use Pythagorean theorem to find diagonal distance for full screen coverage
        float maxDist = sqrt(0.25 + 0.25 * viewportAspect * viewportAspect); // sqrt(0.5^2 + (0.5*aspect)^2)
        float dist = length(vec2(offset.x * viewportAspect, offset.y));
        float normalizedDist = dist / maxDist;
        fragColor = (normalizedDist < mixAmount) ? colorB : colorA;
    } else if (method == 4) {
        // Dark fade first - luminance mask offset with forced boundaries
        if (mixAmount <= 0.0) {
            fragColor = colorA;
        } else if (mixAmount >= 1.0) {
            fragColor = colorB;
        } else {
            float lumA = dot(colorA.rgb, vec3(0.299, 0.587, 0.114));
            float threshold = mixAmount;

            // Use luminance to determine which color to show
            if (lumA < threshold) {
                fragColor = colorB;
            } else {
                fragColor = colorA;
            }
        }
    } else if (method == 5) {
        // Light fade first - luminance mask offset (inverted) with forced boundaries
        if (mixAmount <= 0.0) {
            fragColor = colorA;
        } else if (mixAmount >= 1.0) {
            fragColor = colorB;
        } else {
            float lumA = dot(colorA.rgb, vec3(0.299, 0.587, 0.114));
            float threshold = 1.0 - mixAmount;

            // Use luminance to determine which color to show (inverted logic)
            if (lumA > threshold) {
                fragColor = colorB;
            } else {
                fragColor = colorA;
            }
        }
    } else if (method == 6) {
        // Checkerboard - odds wipe bottom-to-top, evens wipe top-to-bottom
        vec2 checker = floor(uv * 8.0); // 8x8 checkerboard
        bool isOdd = mod(checker.x + checker.y, 2.0) > 0.5;
        
        float wipePosition = mixAmount;
        bool showB;
        
        if (isOdd) {
            // Odd squares: wipe bottom-to-top
            showB = (uv.y < wipePosition);
        } else {
            // Even squares: wipe top-to-bottom
            showB = ((1.0 - uv.y) < wipePosition);
        }
        
        fragColor = showB ? colorB : colorA;
    } else if (method == 7) {
        // Horizontal Lines
        vec2 checker = floor(uv * vec2(16.0, 8.0)); // 16x8 pattern
        bool isOdd = mod(checker.y, 2.0) > 0.5;
        
        float wipePosition = mixAmount;
        bool showB;
        
        if (isOdd) {
            // Odd rows: wipe left-to-right
            showB = (uv.x < wipePosition);
        } else {
            // Even rows: wipe right-to-left
            showB = ((1.0 - uv.x) < wipePosition);
        }
        
        fragColor = showB ? colorB : colorA;
    } else {
        // Fallback to simple mix
        fragColor = mix(colorA, colorB, mixAmount);
    }
}`

// Global instance
export const masterMixer = new MasterMixer()