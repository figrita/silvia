import {registerNode} from '../registry.js'
import {autowire, StringToFragment} from '../utils.js'
import {SNode} from '../snode.js'

// a + b * cos(2π(c·t + d))
// Writes r,g,b into pre-allocated out array — zero allocation in hot loops
const TAU = Math.PI * 2
const _paletteOut = new Float64Array(3)

function evalPalette(t, v, out) {
    out[0] = Math.max(0, Math.min(1, v.aR + v.bR * Math.cos(TAU * (v.cR * t + v.dR))))
    out[1] = Math.max(0, Math.min(1, v.aG + v.bG * Math.cos(TAU * (v.cG * t + v.dG))))
    out[2] = Math.max(0, Math.min(1, v.aB + v.bB * Math.cos(TAU * (v.cB * t + v.dB))))
    return out
}

// Channel descriptors hoisted to module scope — no allocation per redraw
const WAVE_CHANNELS = [
    {color: 'rgba(255,80,80,0.8)',  idx: 0},
    {color: 'rgba(80,220,80,0.8)',   idx: 1},
    {color: 'rgba(80,120,255,0.8)',  idx: 2}
]

function f(n) { return n.toFixed(4) }

registerNode({
    slug: 'cosinegradient',
    icon: '🌈',
    label: 'Cosine Gradient',
    tooltip: 'Maps a float to color via Bias + Amp*cos(2π(Freq·t + Phase)). Per-channel control.',

    input: {
        't': {
            label: 'Input',
            type: 'float',
            control: {default: 0, min: 0, max: 1, step: 0.01}
        }
    },

    output: {
        'color': {
            label: 'Color',
            type: 'color',
            genCode(cc, funcName){
                const t = this.getInput('t', cc)
                const v = this.values
                return `vec4 ${funcName}(vec2 uv) {
    float t = ${t};
    vec3 a = vec3(${f(v.aR)}, ${f(v.aG)}, ${f(v.aB)});
    vec3 b = vec3(${f(v.bR)}, ${f(v.bG)}, ${f(v.bB)});
    vec3 c = vec3(${f(v.cR)}, ${f(v.cG)}, ${f(v.cB)});
    vec3 d = vec3(${f(v.dR)}, ${f(v.dG)}, ${f(v.dB)}) + u_time * ${f(v.cycle)};
    vec3 col = a + b * cos(6.283185 * (c * t + d));
    return vec4(clamp(col, 0.0, 1.0), 1.0);
}`
            }
        }
    },

    elements: {
        gradientCanvas: null,
        waveCanvas: null
    },

    values: {
        aR: 0.5, aG: 0.5, aB: 0.5,
        bR: 0.5, bG: 0.5, bB: 0.5,
        cR: 1.0, cG: 1.0, cB: 1.0,
        dR: 0.00, dG: 0.33, dB: 0.67,
        cycle: 0.0
    },

    onCreate(){
        if(!this.customArea) return

        const v = this.values
        const row = (label, rKey, gKey, bKey, min, max, step) => `
            <div style="display:grid; grid-template-columns: 28px 1fr 1fr 1fr; gap: 4px; align-items: center;">
                <span style="font-size:11px; opacity:0.5;">${label}</span>
                <s-number value="${v[rKey]}" default="${this.defaults[rKey]}" min="${min}" max="${max}" step="${step}" data-el="${rKey}"></s-number>
                <s-number value="${v[gKey]}" default="${this.defaults[gKey]}" min="${min}" max="${max}" step="${step}" data-el="${gKey}"></s-number>
                <s-number value="${v[bKey]}" default="${this.defaults[bKey]}" min="${min}" max="${max}" step="${step}" data-el="${bKey}"></s-number>
            </div>`

        const html = `
            <div style="width: 420px; padding: 4px; display: flex; flex-direction: column; gap: 4px;">
                <canvas data-el="gradientCanvas" width="280" height="1"
                    style="width:100%; height:16px; border-radius:2px;"></canvas>
                <canvas data-el="waveCanvas" width="280" height="72"
                    style="width:100%; height:72px; border-radius:2px; background:hsl(var(--theme-hue), var(--theme-sat-norm), 6%);"></canvas>
                <div style="display:grid; grid-template-columns: 28px 1fr 1fr 1fr; gap: 4px; padding: 2px 0;">
                    <span></span>
                    <span style="font-size:10px; text-align:center; color:#f66;">R</span>
                    <span style="font-size:10px; text-align:center; color:#6d6;">G</span>
                    <span style="font-size:10px; text-align:center; color:#68f;">B</span>
                </div>
                ${row('Bias', 'aR', 'aG', 'aB', 0, 1, 0.01)}
                ${row('Amp', 'bR', 'bG', 'bB', 0, 1, 0.01)}
                ${row('Freq', 'cR', 'cG', 'cB', 0, 4, 0.01)}
                ${row('Phase', 'dR', 'dG', 'dB', 0, 1, 0.01)}
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
                    <label style="font-size:11px; opacity:0.5;">Cycle</label>
                    <s-number value="${v.cycle}" default="0" min="-5" max="5" step="0.01" data-el="cycle"></s-number>
                </div>
            </div>
        `

        const fragment = StringToFragment(html)
        this.elements = autowire(fragment)
        this.customArea.appendChild(fragment)

        const paramKeys = [
            'aR','aG','aB', 'bR','bG','bB',
            'cR','cG','cB', 'dR','dG','dB',
            'cycle'
        ]

        for(const key of paramKeys){
            if(!this.elements[key]) continue
            this.elements[key].addEventListener('input', (e) => {
                this.values[key] = parseFloat(e.target.value)
                this._drawPreviews()
                SNode.refreshDownstreamOutputs(this)
            })
        }

        this._drawPreviews()
    },

    _drawPreviews(){
        this._drawGradient()
        this._drawWaves()
    },

    _drawGradient(){
        const canvas = this.elements.gradientCanvas
        if(!canvas) return
        const ctx = canvas.getContext('2d')
        const w = canvas.width
        const v = this.values

        // Reuse ImageData across redraws
        if(!this._gradientImgData || this._gradientImgData.width !== w){
            this._gradientImgData = ctx.createImageData(w, 1)
        }
        const data = this._gradientImgData.data
        const out = _paletteOut
        for(let x = 0; x < w; x++){
            const t = x / (w - 1)
            evalPalette(t, v, out)
            const idx = x * 4
            data[idx]     = out[0] * 255
            data[idx + 1] = out[1] * 255
            data[idx + 2] = out[2] * 255
            data[idx + 3] = 255
        }
        ctx.putImageData(this._gradientImgData, 0, 0)
    },

    _drawWaves(){
        const canvas = this.elements.waveCanvas
        if(!canvas) return
        const ctx = canvas.getContext('2d')
        const w = canvas.width
        const h = canvas.height
        const v = this.values
        const pad = 4
        const plotH = h - pad * 2

        ctx.clearRect(0, 0, w, h)

        // Grid
        ctx.strokeStyle = 'rgba(255,255,255,0.06)'
        ctx.lineWidth = 1
        for(let i = 1; i < 4; i++){
            const y = (i / 4) * h
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
        }

        // 0/1 reference
        ctx.strokeStyle = 'rgba(255,255,255,0.12)'
        ctx.setLineDash([2, 4])
        ctx.beginPath()
        ctx.moveTo(0, pad); ctx.lineTo(w, pad)
        ctx.moveTo(0, h - pad); ctx.lineTo(w, h - pad)
        ctx.stroke()
        ctx.setLineDash([])

        // Channel curves — uses module-level WAVE_CHANNELS, shared _paletteOut
        const out = _paletteOut
        for(const ch of WAVE_CHANNELS){
            ctx.strokeStyle = ch.color
            ctx.lineWidth = 1.5
            ctx.beginPath()
            for(let x = 0; x < w; x++){
                const t = x / (w - 1)
                evalPalette(t, v, out)
                const y = pad + (1 - out[ch.idx]) * plotH
                if(x === 0) ctx.moveTo(x, y)
                else ctx.lineTo(x, y)
            }
            ctx.stroke()
        }
    }
})