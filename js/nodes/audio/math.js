import {registerNode} from '../../registry.js'

/**
 * Audio math ops — arithmetic primitives that compile to inline JS
 * expressions inside the per-sample loop. Zero per-sample call overhead;
 * use liberally for CV shaping, audio-rate feature construction, and
 * quick algebra that doesn't warrant a dedicated DSP node.
 *
 * Unconnected inputs act as knobs (smoothed per-port with the standard
 * τ = 5 ms one-pole, so dial moves are zipper-free). Divisions, modulos,
 * logs, and powers guard against the classic poisoning values (0, ≤0,
 * negative base with non-integer exponent) so one bad CV doesn't NaN
 * an entire patch.
 *
 * Every node here is stateless — no audioState, no setup, no tail. They
 * are entirely expressed through their output's genAudio.
 */

const AUDIO_RANGE = {min: -10, max: 10, step: 0.01}
const BIPOLAR     = {min: -1,  max: 1,  step: 0.001}

function audioIn(label, def = 0, range = AUDIO_RANGE){
    return {label, type: 'audio', control: {default: def, ...range}}
}

function defineOp({slug, icon, label, tooltip, input, outLabel = 'Out', expr}){
    registerNode({
        slug: 'audio-' + slug,
        icon,
        label,
        tooltip,
        workspaceType: 'audio',
        input,
        output: {
            'out': {
                label: outLabel,
                type: 'audio',
                genAudio(ctx){ return expr(ctx) }
            }
        }
    })
}

// ─── Binary arithmetic ──────────────────────────────────────────────────

defineOp({
    slug: 'add', icon: '➕', label: 'Add',
    tooltip: 'A + B. Sum two audio-rate signals or CVs.',
    outLabel: 'A + B',
    input: {a: audioIn('A'), b: audioIn('B')},
    expr: (c) => `(${c.in('a')}) + (${c.in('b')})`
})

defineOp({
    slug: 'subtract', icon: '➖', label: 'Subtract',
    tooltip: 'A − B. Useful for inversion around a bias (A = 1, B = signal → 1 − signal).',
    outLabel: 'A − B',
    input: {a: audioIn('A'), b: audioIn('B')},
    expr: (c) => `(${c.in('a')}) - (${c.in('b')})`
})

defineOp({
    slug: 'multiply', icon: '✖', label: 'Multiply',
    tooltip: 'A × B. Ring modulation when both are signals; amplitude scaling when one is CV.',
    outLabel: 'A × B',
    input: {a: audioIn('A', 1), b: audioIn('B', 1)},
    expr: (c) => `(${c.in('a')}) * (${c.in('b')})`
})

defineOp({
    slug: 'divide', icon: '➗', label: 'Divide',
    tooltip: 'A ÷ B. Divisor clamped to ±1e-20 so a momentary zero on B returns 0 instead of ±∞.',
    outLabel: 'A ÷ B',
    input: {a: audioIn('A', 1), b: audioIn('B', 1)},
    expr: (c) => {
        const tmp = c.tmp()
        c.line(`const ${tmp} = (${c.in('b')});`)
        return `(Math.abs(${tmp}) < 1e-20 ? 0 : (${c.in('a')}) / ${tmp})`
    }
})

defineOp({
    slug: 'modulo', icon: '🪙', label: 'Modulo',
    tooltip: 'A mod B. Wraps A to the range [0, |B|). Divisor-safe (returns 0 when B ≈ 0).',
    outLabel: 'A mod B',
    input: {a: audioIn('A', 1), b: audioIn('B', 1)},
    expr: (c) => {
        const tmp = c.tmp()
        c.line(`const ${tmp} = (${c.in('b')});`)
        return `(Math.abs(${tmp}) < 1e-20 ? 0 : (${c.in('a')}) - Math.floor((${c.in('a')}) / ${tmp}) * ${tmp})`
    }
})

defineOp({
    slug: 'power', icon: '🏒', label: 'Power',
    tooltip: 'base^exp. Negative base with non-integer exponent returns 0 to avoid NaN.',
    outLabel: 'base^exp',
    input: {
        base: audioIn('Base', 2, {min: 0, max: 10, step: 0.01}),
        exp:  audioIn('Exp',  2, {min: -10, max: 10, step: 0.01})
    },
    expr: (c) => {
        const b = c.tmp(), e = c.tmp()
        c.line(`const ${b} = (${c.in('base')}), ${e} = (${c.in('exp')});`)
        return `(${b} < 0 && (${e} % 1) !== 0 ? 0 : Math.pow(Math.abs(${b}), ${e}) * (${b} < 0 ? -1 : 1))`
    }
})

defineOp({
    slug: 'min', icon: '⬇️', label: 'Min',
    tooltip: 'Smaller of A, B. Useful for clamping a ceiling.',
    outLabel: 'min(A, B)',
    input: {a: audioIn('A'), b: audioIn('B')},
    expr: (c) => `Math.min((${c.in('a')}), (${c.in('b')}))`
})

defineOp({
    slug: 'max', icon: '⬆️', label: 'Max',
    tooltip: 'Larger of A, B. Useful for clamping a floor.',
    outLabel: 'max(A, B)',
    input: {a: audioIn('A'), b: audioIn('B')},
    expr: (c) => `Math.max((${c.in('a')}), (${c.in('b')}))`
})

// ─── Unary ──────────────────────────────────────────────────────────────

defineOp({
    slug: 'negate', icon: '±', label: 'Negate',
    tooltip: '−x. Polarity flip. Cheaper than Multiply-by-minus-one when the constant −1 is all you want.',
    outLabel: '−x',
    input: {x: audioIn('x')},
    expr: (c) => `-(${c.in('x')})`
})

defineOp({
    slug: 'abs', icon: '🏓', label: 'Absolute',
    tooltip: '|x|. Full-wave rectification — produces DC-offset signal useful for envelope extraction when followed by a slew.',
    outLabel: '|x|',
    input: {x: audioIn('x')},
    expr: (c) => `Math.abs(${c.in('x')})`
})

defineOp({
    slug: 'sign', icon: '🧿', label: 'Sign',
    tooltip: '+1 when x > 0, −1 when x < 0, 0 when x = 0. Hard comparator. Aliased audio — follow with a lowpass.',
    outLabel: 'sign(x)',
    input: {x: audioIn('x')},
    expr: (c) => `Math.sign(${c.in('x')})`
})

defineOp({
    slug: 'sqrt', icon: '√', label: 'Square Root',
    tooltip: '√|x|·sign(x). Signed root so bipolar signals pass through. Energy-preserving panning math.',
    outLabel: '√x',
    input: {x: audioIn('x', 1, {min: -10, max: 10, step: 0.01})},
    expr: (c) => {
        const t = c.tmp()
        c.line(`const ${t} = (${c.in('x')});`)
        return `(Math.sqrt(Math.abs(${t})) * (${t} < 0 ? -1 : 1))`
    }
})

defineOp({
    slug: 'log', icon: '📉', label: 'Log',
    tooltip: 'Natural log of max(x, 1e-20). Negative inputs saturate at the lower clamp; pair with Abs if you need |x|.',
    outLabel: 'ln(x)',
    input: {x: audioIn('x', 1, {min: 0, max: 10, step: 0.01})},
    expr: (c) => `Math.log(Math.max(1e-20, (${c.in('x')})))`
})

defineOp({
    slug: 'exp', icon: '📈', label: 'Exp',
    tooltip: 'e^x. Great as a log-to-linear step after Log or a dB-like curve. Output grows fast — 10 → ~22026.',
    outLabel: 'exp(x)',
    input: {x: audioIn('x', 0, {min: -10, max: 10, step: 0.01})},
    expr: (c) => `Math.exp(${c.in('x')})`
})

defineOp({
    slug: 'tanh', icon: '〽️', label: 'Tanh',
    tooltip: 'Hyperbolic tangent. Smooth soft-clipper in [−1, 1]. Drive hard for asymmetric saturation character.',
    outLabel: 'tanh(x)',
    input: {x: audioIn('x')},
    expr: (c) => `Math.tanh(${c.in('x')})`
})

defineOp({
    slug: 'sin', icon: '∿', label: 'Sin',
    tooltip: 'sin(x). Waveshaper — feed a signal at audio rate for Chebyshev-style harmonic generation. Not an oscillator; use the Oscillator node for that.',
    outLabel: 'sin(x)',
    input: {x: audioIn('x')},
    expr: (c) => `Math.sin(${c.in('x')})`
})

defineOp({
    slug: 'cos', icon: '∼', label: 'Cos',
    tooltip: 'cos(x). Waveshaper. Same use cases as Sin, 90° phase-shifted.',
    outLabel: 'cos(x)',
    input: {x: audioIn('x')},
    expr: (c) => `Math.cos(${c.in('x')})`
})

defineOp({
    slug: 'atan2', icon: '🧭', label: 'ATan2',
    tooltip: 'atan2(y, x) / π. Angle in the range [−1, 1]. Coordinate-to-angle conversion; useful with XY-pair CV.',
    outLabel: '∠(x, y)/π',
    input: {x: audioIn('x', 1), y: audioIn('y', 0)},
    expr: (c) => `(Math.atan2((${c.in('y')}), (${c.in('x')})) * INV_PI)`
})

// ─── Rounding ───────────────────────────────────────────────────────────

defineOp({
    slug: 'floor', icon: '⬇', label: 'Floor',
    tooltip: 'Round toward −∞. Combine with Multiply for sample-rate step quantization.',
    outLabel: 'floor(x)',
    input: {x: audioIn('x')},
    expr: (c) => `Math.floor(${c.in('x')})`
})

defineOp({
    slug: 'ceil', icon: '⬆', label: 'Ceil',
    tooltip: 'Round toward +∞.',
    outLabel: 'ceil(x)',
    input: {x: audioIn('x')},
    expr: (c) => `Math.ceil(${c.in('x')})`
})

defineOp({
    slug: 'round', icon: '🎯', label: 'Round',
    tooltip: 'Round to nearest integer (half-to-positive-infinity).',
    outLabel: 'round(x)',
    input: {x: audioIn('x')},
    expr: (c) => `Math.round(${c.in('x')})`
})

// ─── Range shaping ──────────────────────────────────────────────────────

defineOp({
    slug: 'clamp', icon: '🗜️', label: 'Clamp',
    tooltip: 'Limit x to [lo, hi]. Classic hard limiter when lo, hi are constants near ±1.',
    outLabel: 'clamp',
    input: {
        x:  audioIn('x'),
        lo: audioIn('Lo', -1, BIPOLAR),
        hi: audioIn('Hi',  1, BIPOLAR)
    },
    expr: (c) => `Math.max((${c.in('lo')}), Math.min((${c.in('hi')}), (${c.in('x')})))`
})

defineOp({
    slug: 'lerp', icon: '🌓', label: 'Lerp',
    tooltip: 'Linear interpolate from A to B by t. t is not clamped — use Clamp if you need strict [0, 1].',
    outLabel: 'mix(A, B, t)',
    input: {
        a: audioIn('A', 0),
        b: audioIn('B', 1),
        t: audioIn('t', 0.5, {min: 0, max: 1, step: 0.001})
    },
    expr: (c) => `(${c.in('a')}) + ((${c.in('b')}) - (${c.in('a')})) * (${c.in('t')})`
})
