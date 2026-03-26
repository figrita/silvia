import {registerNode} from '../registry.js'
import {autowire, StringToFragment} from '../utils.js'
import {SNode} from '../snode.js'

/**
 * Parse a sequence string with optional exponent notation into an int array.
 * Supports: "AB", "AABB", "A4B2" (= AAAABB), "A^4B^2", mixed "AAB3A" (= AABBBA)
 * Returns array of 0s (A) and 1s (B), or null if invalid.
 */
function parseSequence(str) {
    const cleaned = str.toUpperCase().replace(/[^AB0-9^]/g, '')
    if (!cleaned) return null
    const seq = []
    let i = 0
    while (i < cleaned.length) {
        const ch = cleaned[i]
        if (ch !== 'A' && ch !== 'B') return null
        const val = ch === 'A' ? 0 : 1
        i++
        if (i < cleaned.length && cleaned[i] === '^') i++
        let numStr = ''
        while (i < cleaned.length && cleaned[i] >= '0' && cleaned[i] <= '9') {
            numStr += cleaned[i]
            i++
        }
        const count = numStr ? Math.min(parseInt(numStr, 10), 64) : 1
        if (count < 1) return null
        for (let j = 0; j < count; j++) seq.push(val)
    }
    if (seq.length === 0 || seq.length > 128) return null
    return seq
}

function randomSequence() {
    const len = 2 + Math.floor(Math.random() * 10)
    let str = ''
    for (let i = 0; i < len; i++) str += Math.random() < 0.5 ? 'A' : 'B'
    if (!str.includes('A')) str = str.substring(1) + 'A'
    else if (!str.includes('B')) str = str.substring(1) + 'B'
    return str
}

const DEFAULT_SEQ_STR = 'A6B6'
const DEFAULT_SEQ = [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1]

function seqToGLSL(seq, prefix) {
    const len = seq.length
    const vals = seq.join(', ')
    return `const int ${prefix}_SL = ${len};\nconst int ${prefix}_SQ[${len}] = int[${len}](${vals});`
}

function genHelperFunc(prefix) {
    return `float ${prefix}_expo(float a, float b, float amp, int maxIter) {
    float x = 0.0;
    float lyap = 0.0;
    for (int n = 0; n < maxIter; n++) {
        float r = ${prefix}_SQ[n % ${prefix}_SL] == 0 ? a : b;
        float s = sin(x + r);
        x = amp * s * s;
        float deriv = abs(amp * sin(2.0 * (x + r)));
        lyap += log(max(deriv, 1e-12));
    }
    return lyap / float(maxIter);
}`
}

function genLyapunovBody(seq, inputs, mode, funcName) {
    const isColor = mode === 'color'
    const retType = isColor ? 'vec4' : 'float'

    let colorInputs = ''
    if (isColor) {
        colorInputs = `
    vec4 stableCol = ${inputs.foreground};
    vec4 chaosCol = ${inputs.background};`
    }

    const shadingBlock = isColor ? `
    if (depth > 0.001) {
        float eps = 0.005 / scale;
        float hx = ${funcName}_expo(a + eps, b, amp, maxIter);
        float hy = ${funcName}_expo(a, b + eps, amp, maxIter);
        vec3 N = normalize(vec3((h - hx) * depth, (h - hy) * depth, eps));
        vec3 L = normalize(vec3(0.4, 0.4, 1.0));
        float diff = max(dot(N, L), 0.0);
        vec3 R = reflect(-L, N);
        float spec = pow(max(R.z, 0.0), 20.0);
        vec3 lit = flatColor.rgb * (0.12 + 0.88 * diff) + spec * 0.25;
        return vec4(lit, flatColor.a);
    }` : ''

    return `${seqToGLSL(seq, funcName)}

${genHelperFunc(funcName)}

${retType} ${funcName}(vec2 uv) {${colorInputs}
    float scale = ${inputs.scale};
    float cA = ${inputs.centerA};
    float cB = ${inputs.centerB};
    float contrast = ${inputs.contrast};
    float depth = ${inputs.depth};
    float amp = ${inputs.amplitude};
    int maxIter = int(${inputs.iterations});

    float radius = length(uv);
    float angle = atan(uv.y, uv.x);

    float a = cA + radius * scale;
    float b = cB + sin(angle) * scale;

    float h = ${funcName}_expo(a, b, amp, maxIter);

    float t = clamp(0.5 + 0.5 * tanh(h * contrast), 0.0, 1.0);
    ${isColor ? `vec4 flatColor = mix(stableCol, chaosCol, t);${shadingBlock}
    return flatColor;` : 'return 1.0 - t;'}
}`
}

registerNode({
    slug: 'lyapunov',
    icon: '🦋',
    label: 'Lyapunov',
    tooltip: 'Lyapunov fractal (sin² map) with 3D shading. Radial mapping: radius → A, angle → B. Type a sequence like AB, AABAB, A6B6.',

    input: {
        'foreground': {
            label: 'Stable Color',
            type: 'color',
            control: {default: '#ffffffff'}
        },
        'background': {
            label: 'Chaos Color',
            type: 'color',
            control: {default: '#000000ff'}
        },
        'centerA': {
            label: 'Center A',
            type: 'float',
            control: {default: 2.0, min: -2.0, max: 8.0, step: 0.01}
        },
        'centerB': {
            label: 'Center B',
            type: 'float',
            control: {default: 2.0, min: -2.0, max: 8.0, step: 0.01}
        },
        'scale': {
            label: 'Scale',
            type: 'float',
            control: {default: 1.5, min: 0.05, max: 10.0, step: 0.01}
        },
        'contrast': {
            label: 'Contrast',
            type: 'float',
            control: {default: 3.0, min: 0.1, max: 20.0, step: 0.1}
        },
        'amplitude': {
            label: 'Amplitude',
            type: 'float',
            control: {default: 1.95, min: 0.1, max: 4.0, step: 0.01}
        },
        'depth': {
            label: 'Depth',
            type: 'float',
            control: {default: 1.0, min: 0.0, max: 10.0, step: 0.1}
        },
        'iterations': {
            label: 'Iterations',
            type: 'float',
            control: {default: 80, min: 10, max: 300, step: 1}
        },
        'randomize': {
            label: 'Random Seq',
            type: 'action',
            control: {},
            downCallback() {
                const str = randomSequence()
                this.values.sequence = str
                if (this.elements.seqInput) this.elements.seqInput.value = str
                SNode.refreshDownstreamOutputs(this)
            }
        }
    },

    output: {
        'color': {
            label: 'Color',
            type: 'color',
            genCode(cc, funcName){
                const seq = this._getSequence()
                return genLyapunovBody(seq, {
                    foreground: this.getInput('foreground', cc),
                    background: this.getInput('background', cc),
                    centerA: this.getInput('centerA', cc),
                    centerB: this.getInput('centerB', cc),
                    scale: this.getInput('scale', cc),
                    contrast: this.getInput('contrast', cc),
                    amplitude: this.getInput('amplitude', cc),
                    depth: this.getInput('depth', cc),
                    iterations: this.getInput('iterations', cc)
                }, 'color', funcName)
            }
        },
        'mask': {
            label: 'Mask',
            type: 'float',
            range: '[0, 1]',
            genCode(cc, funcName){
                const seq = this._getSequence()
                return genLyapunovBody(seq, {
                    centerA: this.getInput('centerA', cc),
                    centerB: this.getInput('centerB', cc),
                    scale: this.getInput('scale', cc),
                    contrast: this.getInput('contrast', cc),
                    amplitude: this.getInput('amplitude', cc),
                    depth: this.getInput('depth', cc),
                    iterations: this.getInput('iterations', cc)
                }, 'mask', funcName)
            }
        }
    },

    elements: {
        seqInput: null
    },
    values: {
        sequence: DEFAULT_SEQ_STR
    },

    _getSequence(){
        return parseSequence(this.values.sequence) || DEFAULT_SEQ
    },

    onCreate(){
        if(!this.customArea) return

        const html = `
            <div style="display:flex; align-items:center; gap:8px; padding:4px 0;">
                <label style="font-size:11px; opacity:0.7; flex-shrink:0;">Sequence</label>
                <input type="text" data-el="seqInput"
                    value="${this.values.sequence}"
                    placeholder="e.g. AB, A4B2, AABAB"
                    spellcheck="false"
                    style="flex:1; min-width:0; padding:2px 4px; border-radius:4px;
                           border:1px solid hsl(var(--theme-hue), var(--theme-sat-norm), 25%);
                           background:hsl(var(--theme-hue), var(--theme-sat-norm), 8%);
                           color:inherit; font-family:inherit; font-size:12px;">
            </div>`

        const fragment = StringToFragment(html)
        this.elements = autowire(fragment)
        this.customArea.appendChild(fragment)

        const seqInput = this.elements.seqInput
        seqInput.addEventListener('input', () => {
            const parsed = parseSequence(seqInput.value)
            if(parsed){
                seqInput.style.borderColor = 'hsl(var(--theme-hue), var(--theme-sat-norm), 25%)'
                this.values.sequence = seqInput.value
                SNode.refreshDownstreamOutputs(this)
            } else {
                seqInput.style.borderColor = 'hsl(0, 60%, 40%)'
            }
        })
        seqInput.addEventListener('keydown', e => e.stopPropagation())
    }
})
