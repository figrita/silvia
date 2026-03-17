import {registerNode} from '../registry.js'
import {autowire, StringToFragment} from '../utils.js'

registerNode({
    slug: 'camcordercrt',
    icon: '📼',
    label: 'Camcorder CRT',
    tooltip: 'All-in-one VHS camcorder / CRT feedback loop. Barrel distortion, chromatic aberration, scanlines, phosphor glow, brightness, vignette, plus spatial feedback with zoom, rotation and drift -- like pointing a camcorder at its own monitor.',
    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null,
            samplingCost: '8'
        },
        'curvature': {
            label: 'Curvature',
            type: 'float',
            control: {default: 0.0, min: 0.0, max: 2.0, step: 0.01}
        },
        'aberration': {
            label: 'Aberration',
            type: 'float',
            control: {default: 0.0, min: 0.0, max: 3.0, step: 0.01}
        },
        'scanlines': {
            label: 'Scanlines',
            type: 'float',
            control: {default: 0.0, min: 0.0, max: 1.0, step: 0.01}
        },
        'glow': {
            label: 'Glow',
            type: 'float',
            control: {default: 0.0, min: 0.0, max: 2.0, step: 0.01}
        },
        'brightness': {
            label: 'Brightness',
            type: 'float',
            control: {default: 1.0, min: 0.0, max: 2.0, step: 0.01}
        },
        'vignette': {
            label: 'Vignette',
            type: 'float',
            control: {default: 0.0, min: 0.0, max: 2.0, step: 0.01}
        },
        'fbAmount': {
            label: 'Feedback',
            type: 'float',
            control: {default: 0.0, min: 0.0, max: 1.0, step: 0.01}
        },
        'fbContrast': {
            label: 'FB Contrast',
            type: 'float',
            control: {default: 1.0, min: 0.5, max: 2.0, step: 0.01}
        },
        'fbDelay': {
            label: 'FB Delay',
            type: 'float',
            control: {default: 0.0, min: 0.0, max: 1.0, step: 0.01}
        }
    },

    elements: {
        canvas: null,
        zoomControl: null,
        rotateControl: null,
        tiltXControl: null,
        tiltYControl: null,
        driftXControl: null,
        driftYControl: null
    },

    values: {
        fbZoom: 1.0,
        fbRotation: 0.0,
        fbDriftX: 0,
        fbDriftY: 0,
        fbTiltX: 0,
        fbTiltY: 0
    },

    runtimeState: {
        animationFrameId: null,
        isDragging: false,
        isTilting: false,
        dragStartX: 0,
        dragStartY: 0,
        dragStartValX: 0,
        dragStartValY: 0
    },

    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName, uniformName){
                // Register CPU-driven uniforms for feedback camera
                const base = uniformName || funcName
                const fbU = {}
                for (const key of ['fbZoom', 'fbRot', 'fbDX', 'fbDY', 'fbTX', 'fbTY']) {
                    fbU[key] = `${base}_${key}`
                    cc.uniforms.set(fbU[key], {type: 'float', sourcePort: this.output.output})
                }

                const curvature = this.getInput('curvature', cc)
                const aberration = this.getInput('aberration', cc)
                const scanlines = this.getInput('scanlines', cc)
                const glow = this.getInput('glow', cc)
                const brightness = this.getInput('brightness', cc)
                const vignette = this.getInput('vignette', cc)
                const fbAmount = this.getInput('fbAmount', cc)
                const fbContrast = this.getInput('fbContrast', cc)
                const fbDelay = this.getInput('fbDelay', cc)

                return `vec4 ${funcName}(vec2 uv) {
    float curv = ${curvature};
    float aber = ${aberration};
    float scan = ${scanlines};
    float glw = ${glow};
    float brt = ${brightness};
    float vig = ${vignette};
    float aspect = u_resolution.x / u_resolution.y;

    // --- CRT barrel distortion ---
    vec2 norm = vec2(uv.x / aspect, uv.y);
    float r2 = dot(norm, norm);
    vec2 crtUV = uv * (1.0 + r2 * curv * 0.3);

    // Soft CRT bezel edge
    vec2 edgePos = vec2(abs(crtUV.x) / aspect, abs(crtUV.y));
    float edgeFade = (1.0 - smoothstep(0.92, 1.0, edgePos.x))
                   * (1.0 - smoothstep(0.92, 1.0, edgePos.y));

    // --- Chromatic aberration (radial, barrel-style) ---
    vec2 abNorm = vec2(crtUV.x / aspect, crtUV.y);
    float abDist = length(abNorm);
    vec2 abDir = abDist > 0.001 ? normalize(crtUV) : vec2(1.0, 0.0);
    float abOffset = aber * abDist * 0.04;

    float rCh = ${this.getInput('input', cc, 'crtUV - abDir * abOffset')}.r;
    float gCh = ${this.getInput('input', cc, 'crtUV')}.g;
    float bCh = ${this.getInput('input', cc, 'crtUV + abDir * abOffset')}.b;
    vec4 color = vec4(rCh, gCh, bCh, 1.0);

    // --- Phosphor glow (4-tap cross blur) ---
    float glowRadius = 6.0 / u_resolution.y;
    vec4 bloomSample = vec4(0.0);
    bloomSample += ${this.getInput('input', cc, 'crtUV + vec2(glowRadius, 0.0)')};
    bloomSample += ${this.getInput('input', cc, 'crtUV - vec2(glowRadius, 0.0)')};
    bloomSample += ${this.getInput('input', cc, 'crtUV + vec2(0.0, glowRadius)')};
    bloomSample += ${this.getInput('input', cc, 'crtUV - vec2(0.0, glowRadius)')};
    bloomSample *= 0.25;
    color.rgb += max(bloomSample.rgb - color.rgb, vec3(0.0)) * glw;

    // --- Scanlines ---
    float pixelY = (crtUV.y + 1.0) * 0.5 * u_resolution.y;
    float scanLine = sin(pixelY * PI);
    scanLine = scanLine * 0.5 + 0.5;
    scanLine = pow(scanLine, 1.5);
    color.rgb *= mix(vec3(1.0), vec3(scanLine), scan);

    // --- RGB phosphor sub-pixel tint ---
    float pixelX = (crtUV.x / aspect + 1.0) * 0.5 * u_resolution.x;
    float subpixel = mod(floor(pixelX), 3.0);
    vec3 phosphorTint = vec3(
        subpixel == 0.0 ? 1.0 : 0.85,
        subpixel == 1.0 ? 1.0 : 0.85,
        subpixel == 2.0 ? 1.0 : 0.85
    );
    color.rgb *= mix(vec3(1.0), phosphorTint, scan * 0.5);

    // --- Brightness ---
    color.rgb *= brt;

    // --- Vignette ---
    float vigR2 = dot(norm, norm);
    float vigAmount = 1.0 - vigR2 * vig * vig;
    color.rgb *= clamp(vigAmount, 0.0, 1.0);

    // --- Warm VHS color cast ---
    color.r *= 1.05;
    color.b *= 0.92;

    // --- CRT bezel edge ---
    color.rgb *= edgeFade;

    // --- CRT feedback loop (camera-pointed-at-monitor) ---
    float fbAmt = ${fbAmount};
    float fbZ = ${fbU.fbZoom};
    float fbR = ${fbU.fbRot};
    float fbDX = ${fbU.fbDX};
    float fbDY = ${fbU.fbDY};
    float fbTX = ${fbU.fbTX};
    float fbTY = ${fbU.fbTY};
    float fbCon = ${fbContrast};
    float fbDel = ${fbDelay};

    vec2 screenUV = vec2((uv.x / aspect + 1.0) * 0.5, (uv.y + 1.0) * 0.5);

    // Simulate camera transform: zoom, rotate, drift, perspective tilt
    vec2 fbUV = screenUV - 0.5;
    fbUV /= fbZ;
    float cr = cos(fbR), sr = sin(fbR);
    fbUV = vec2(fbUV.x * cr - fbUV.y * sr, fbUV.x * sr + fbUV.y * cr);
    // Perspective tilt (camera angled relative to screen)
    float pw = 1.0 + fbUV.x * fbTX + fbUV.y * fbTY;
    pw = max(pw, 0.001);
    fbUV /= pw;
    fbUV += vec2(fbDX, fbDY);
    fbUV += 0.5;

    // Sample from frame history
    float maxDelay = float(u_frame_buffer_size - 1);
    float absolute_delay = mix(1.0, maxDelay, fbDel);
    float target_frame_index = mod(
        float(u_current_frame_index) - absolute_delay + float(u_frame_buffer_size),
        float(u_frame_buffer_size)
    );
    vec4 prevFrame = texture(u_frame_history, vec3(clamp(fbUV, 0.0, 1.0), target_frame_index));

    // Contrast boost on feedback
    prevFrame.rgb = (prevFrame.rgb - 0.5) * fbCon + 0.5;

    // Additive blend: phosphors accumulate light
    color.rgb += prevFrame.rgb * fbAmt;

    color.a = 1.0;
    return color;
}`
            },
            floatUniformUpdate(uniformName, gl, program){
                if (this.isDestroyed) return
                const loc = gl.getUniformLocation(program, uniformName)
                if (!loc) return

                if (uniformName.endsWith('_fbZoom')) gl.uniform1f(loc, this.values.fbZoom)
                else if (uniformName.endsWith('_fbRot')) gl.uniform1f(loc, this.values.fbRotation)
                else if (uniformName.endsWith('_fbDX')) gl.uniform1f(loc, this.values.fbDriftX)
                else if (uniformName.endsWith('_fbDY')) gl.uniform1f(loc, this.values.fbDriftY)
                else if (uniformName.endsWith('_fbTX')) gl.uniform1f(loc, this.values.fbTiltX)
                else if (uniformName.endsWith('_fbTY')) gl.uniform1f(loc, this.values.fbTiltY)
            }
        }
    },

    onCreate(){
        if (!this.customArea) return

        const html = `
            <div style="padding: 0.5rem; display: flex; flex-direction: column; gap: 0.5rem;">
                <canvas data-el="canvas" width="200" height="200"
                    style="width: 100%; max-width: 200px; aspect-ratio: 1; border-radius: 4px; cursor: crosshair; align-self: center;"></canvas>
                <div style="font-size: 0.75rem; color: #888; text-align: center; line-height: 1.5; max-width: 200px; align-self: center;">
                    drag: drift · shift+drag: tilt · scroll: zoom · shift+scroll: rotate · dbl-click: reset
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <label style="font-size: 0.9rem; color: #ccc;">Zoom</label>
                    <s-number value="${this.values.fbZoom}" default="${this.defaults.fbZoom}" min="0.9" max="1.2" step="0.001" data-el="zoomControl"></s-number>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <label style="font-size: 0.9rem; color: #ccc;">Rotate</label>
                    <s-number value="${this.values.fbRotation}" default="${this.defaults.fbRotation}" min="-0.5" max="0.5" step="0.001" data-el="rotateControl"></s-number>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <label style="font-size: 0.9rem; color: #ccc;">Tilt X</label>
                    <s-number value="${this.values.fbTiltX}" default="${this.defaults.fbTiltX}" min="-2.0" max="2.0" step="0.01" data-el="tiltXControl"></s-number>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <label style="font-size: 0.9rem; color: #ccc;">Tilt Y</label>
                    <s-number value="${this.values.fbTiltY}" default="${this.defaults.fbTiltY}" min="-2.0" max="2.0" step="0.01" data-el="tiltYControl"></s-number>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <label style="font-size: 0.9rem; color: #ccc;">Drift X</label>
                    <s-number value="${this.values.fbDriftX}" default="${this.defaults.fbDriftX}" min="-0.1" max="0.1" step="0.001" data-el="driftXControl"></s-number>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <label style="font-size: 0.9rem; color: #ccc;">Drift Y</label>
                    <s-number value="${this.values.fbDriftY}" default="${this.defaults.fbDriftY}" min="-0.1" max="0.1" step="0.001" data-el="driftYControl"></s-number>
                </div>
            </div>
        `

        const fragment = StringToFragment(html)
        this.elements = autowire(fragment)
        this.customArea.appendChild(fragment)

        const canvas = this.elements.canvas
        const ctx = canvas.getContext('2d')

        // Focus support for wheel events
        canvas.tabIndex = 0
        canvas.style.outline = 'none'

        canvas.addEventListener('focus', () => {
            canvas.style.boxShadow = '0 0 0 2px hsla(var(--theme-hue), var(--theme-sat-full), 50%, 0.5)'
        })
        canvas.addEventListener('blur', () => {
            canvas.style.boxShadow = 'none'
        })
        canvas.addEventListener('click', () => canvas.focus())

        // Drag = drift, shift+drag = perspective tilt
        canvas.addEventListener('pointerdown', (e) => {
            e.preventDefault()
            canvas.setPointerCapture(e.pointerId)
            canvas.focus()
            this.runtimeState.dragStartX = e.clientX
            this.runtimeState.dragStartY = e.clientY
            if (e.shiftKey) {
                this.runtimeState.isTilting = true
                this.runtimeState.dragStartValX = this.values.fbTiltX
                this.runtimeState.dragStartValY = this.values.fbTiltY
            } else {
                this.runtimeState.isDragging = true
                this.runtimeState.dragStartValX = this.values.fbDriftX
                this.runtimeState.dragStartValY = this.values.fbDriftY
            }
        })

        canvas.addEventListener('pointermove', (e) => {
            if (this.runtimeState.isDragging) {
                const dx = e.clientX - this.runtimeState.dragStartX
                const dy = e.clientY - this.runtimeState.dragStartY
                this.values.fbDriftX = Math.max(-0.1, Math.min(0.1,
                    this.runtimeState.dragStartValX + dx * 0.0005))
                this.values.fbDriftY = Math.max(-0.1, Math.min(0.1,
                    this.runtimeState.dragStartValY - dy * 0.0005))
                this.elements.driftXControl.value = this.values.fbDriftX.toFixed(3)
                this.elements.driftYControl.value = this.values.fbDriftY.toFixed(3)
            }
            if (this.runtimeState.isTilting) {
                const dx = e.clientX - this.runtimeState.dragStartX
                const dy = e.clientY - this.runtimeState.dragStartY
                this.values.fbTiltX = Math.max(-2.0, Math.min(2.0,
                    this.runtimeState.dragStartValX + dx * 0.005))
                this.values.fbTiltY = Math.max(-2.0, Math.min(2.0,
                    this.runtimeState.dragStartValY - dy * 0.005))
                this.elements.tiltXControl.value = this.values.fbTiltX.toFixed(2)
                this.elements.tiltYControl.value = this.values.fbTiltY.toFixed(2)
            }
        })

        const endDrag = () => {
            this.runtimeState.isDragging = false
            this.runtimeState.isTilting = false
        }
        canvas.addEventListener('pointerup', endDrag)
        canvas.addEventListener('pointerleave', endDrag)

        // Scroll = zoom, shift+scroll = rotate (only when focused)
        canvas.addEventListener('wheel', (e) => {
            if (document.activeElement !== canvas) return
            e.preventDefault()
            e.stopPropagation()
            const delta = e.deltaY > 0 ? -0.003 : 0.003
            if (e.shiftKey) {
                this.values.fbRotation = Math.max(-0.5, Math.min(0.5, this.values.fbRotation + delta))
                this.elements.rotateControl.value = this.values.fbRotation.toFixed(3)
            } else {
                this.values.fbZoom = Math.max(0.9, Math.min(1.2, this.values.fbZoom + delta))
                this.elements.zoomControl.value = this.values.fbZoom.toFixed(3)
            }
        }, {passive: false})

        // Double-click = reset camera
        canvas.addEventListener('dblclick', () => {
            this.values.fbZoom = this.defaults.fbZoom
            this.values.fbRotation = this.defaults.fbRotation
            this.values.fbDriftX = this.defaults.fbDriftX
            this.values.fbDriftY = this.defaults.fbDriftY
            this.values.fbTiltX = this.defaults.fbTiltX
            this.values.fbTiltY = this.defaults.fbTiltY
            this.elements.zoomControl.value = this.values.fbZoom.toFixed(3)
            this.elements.rotateControl.value = this.values.fbRotation.toFixed(3)
            this.elements.tiltXControl.value = this.values.fbTiltX.toFixed(2)
            this.elements.tiltYControl.value = this.values.fbTiltY.toFixed(2)
            this.elements.driftXControl.value = this.values.fbDriftX.toFixed(3)
            this.elements.driftYControl.value = this.values.fbDriftY.toFixed(3)
        })

        // s-number listeners
        this.elements.zoomControl.addEventListener('input', (e) => {
            this.values.fbZoom = parseFloat(e.target.value)
        })
        this.elements.rotateControl.addEventListener('input', (e) => {
            this.values.fbRotation = parseFloat(e.target.value)
        })
        this.elements.tiltXControl.addEventListener('input', (e) => {
            this.values.fbTiltX = parseFloat(e.target.value)
        })
        this.elements.tiltYControl.addEventListener('input', (e) => {
            this.values.fbTiltY = parseFloat(e.target.value)
        })
        this.elements.driftXControl.addEventListener('input', (e) => {
            this.values.fbDriftX = parseFloat(e.target.value)
        })
        this.elements.driftYControl.addEventListener('input', (e) => {
            this.values.fbDriftY = parseFloat(e.target.value)
        })
        // Animation loop for viewfinder preview
        const animate = () => {
            this._drawViewfinder(canvas, ctx)
            this.runtimeState.animationFrameId = requestAnimationFrame(animate)
        }
        animate()
    },

    onDestroy(){
        if (this.runtimeState.animationFrameId) {
            cancelAnimationFrame(this.runtimeState.animationFrameId)
        }
    },

    _drawViewfinder(canvas, ctx){
        const w = canvas.width
        const h = canvas.height
        // Background
        ctx.fillStyle = '#0a0a0a'
        ctx.fillRect(0, 0, w, h)

        const cx = w / 2
        const cy = h / 2
        const margin = 20
        const rectW = w - margin * 2
        const rectH = h - margin * 2
        const driftPx = w * 5

        // Feedback spiral preview — nested rectangles showing the tunnel
        // Manual corner projection to match the shader's perspective divide
        const cr = Math.cos(this.values.fbRotation)
        const sr = Math.sin(this.values.fbRotation)
        let corners = [
            [-rectW / 2, -rectH / 2],
            [ rectW / 2, -rectH / 2],
            [ rectW / 2,  rectH / 2],
            [-rectW / 2,  rectH / 2]
        ]

        for (let i = 0; i < 50; i++) {
            const alpha = Math.pow(0.88, i)
            if (alpha < 0.015) break

            ctx.globalAlpha = alpha

            if (i === 0) {
                ctx.strokeStyle = '#ddd'
                ctx.lineWidth = 2
            } else {
                const hue = 120 + i * 3
                const light = Math.min(45 + i, 70)
                ctx.strokeStyle = `hsl(${hue}, 85%, ${light}%)`
                ctx.lineWidth = 1
            }

            ctx.beginPath()
            ctx.moveTo(cx + corners[0][0], cy + corners[0][1])
            for (let j = 1; j < 4; j++) {
                ctx.lineTo(cx + corners[j][0], cy + corners[j][1])
            }
            ctx.closePath()
            ctx.stroke()

            // Transform corners for next iteration (matching shader)
            corners = corners.map(([x, y]) => {
                // Zoom
                x *= this.values.fbZoom
                y *= this.values.fbZoom
                // Rotate
                const rx = x * cr - y * sr
                const ry = x * sr + y * cr
                x = rx; y = ry
                // Perspective tilt (shader: fbUV /= 1.0 + fbUV.x*tiltX + fbUV.y*tiltY)
                const nx = -x / rectW
                const ny = y / rectH
                const pw = Math.max(1.0 + nx * this.values.fbTiltX + ny * this.values.fbTiltY, 0.001)
                x /= pw
                y /= pw
                // Drift
                x -= this.values.fbDriftX * driftPx
                y += this.values.fbDriftY * driftPx
                return [x, y]
            })
        }

        ctx.globalAlpha = 1.0

        // Camera crosshair at drift offset
        const camX = cx + this.values.fbDriftX * driftPx
        const camY = cy - this.values.fbDriftY * driftPx

        ctx.strokeStyle = 'rgba(255, 60, 60, 0.9)'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(camX - 9, camY)
        ctx.lineTo(camX + 9, camY)
        ctx.moveTo(camX, camY - 9)
        ctx.lineTo(camX, camY + 9)
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(camX, camY, 5, 0, Math.PI * 2)
        ctx.stroke()

        // Tilt meter (top-right) — shows perspective tilt as dot on crosshair
        const tMeterX = w - 24
        const tMeterY = 24
        const tMeterR = 12
        const tiltMax = 2.0
        const tNormX = this.values.fbTiltX / tiltMax
        const tNormY = this.values.fbTiltY / tiltMax
        const tDotX = tMeterX + tNormX * tMeterR
        const tDotY = tMeterY - tNormY * tMeterR

        ctx.strokeStyle = 'rgba(255, 180, 60, 0.4)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(tMeterX, tMeterY, tMeterR, 0, Math.PI * 2)
        ctx.stroke()
        // Crosshair lines
        ctx.beginPath()
        ctx.moveTo(tMeterX - tMeterR, tMeterY)
        ctx.lineTo(tMeterX + tMeterR, tMeterY)
        ctx.moveTo(tMeterX, tMeterY - tMeterR)
        ctx.lineTo(tMeterX, tMeterY + tMeterR)
        ctx.stroke()
        // Tilt dot
        ctx.fillStyle = 'rgba(255, 180, 60, 0.9)'
        ctx.beginPath()
        ctx.arc(tDotX, tDotY, 3, 0, Math.PI * 2)
        ctx.fill()

        // Viewfinder corner brackets
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'
        ctx.lineWidth = 1.5
        const bLen = 14
        const bOff = 6
        ctx.beginPath()
        ctx.moveTo(bOff, bOff + bLen); ctx.lineTo(bOff, bOff); ctx.lineTo(bOff + bLen, bOff)
        ctx.moveTo(w - bOff - bLen, bOff); ctx.lineTo(w - bOff, bOff); ctx.lineTo(w - bOff, bOff + bLen)
        ctx.moveTo(bOff, h - bOff - bLen); ctx.lineTo(bOff, h - bOff); ctx.lineTo(bOff + bLen, h - bOff)
        ctx.moveTo(w - bOff - bLen, h - bOff); ctx.lineTo(w - bOff, h - bOff); ctx.lineTo(w - bOff, h - bOff - bLen)
        ctx.stroke()

        // Datestamp (bottom-left)
        const d = new Date()
        const month = d.toLocaleString('en', {month: 'short'}).toUpperCase()
        const day = String(d.getDate()).padStart(2, '0')
        const year = d.getFullYear()
        const hrs = String(d.getHours()).padStart(2, '0')
        const mins = String(d.getMinutes()).padStart(2, '0')
        ctx.fillStyle = '#aaa'
        ctx.font = '10px monospace'
        ctx.textAlign = 'left'
        ctx.fillText(`${month} ${day} ${year} ${hrs}:${mins}`, 10, h - 10)
    }
})
