import {registerNode} from '../../registry.js'

/**
 * Audio math ops — arithmetic primitives that compile to inline JS
 * expressions inside the per-sample loop. Zero per-sample call overhead;
 * use liberally for CV shaping, audio-rate feature construction, and
 * quick algebra that doesn't warrant a dedicated DSP node.
 *
 * Stereo: every op evaluates the same formula per channel using each
 * channel's matching inputs. For mono CV inputs (knobs, ADSR, LFO) L and
 * R are the same expression and the math is identical on both sides; for
 * stereo audio inputs the math diverges per channel naturally.
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
    tooltip: 'A + B per channel. Sum two audio-rate signals or CVs.',
    outLabel: 'A + B',
    input: {a: audioIn('A'), b: audioIn('B')},
    expr: (c) => {
        const a = c.in('a'), b = c.in('b')
        return {
            l: `(${a.l}) + (${b.l})`,
            r: `(${a.r}) + (${b.r})`
        }
    }
})

defineOp({
    slug: 'subtract', icon: '➖', label: 'Subtract',
    tooltip: 'A − B per channel. Useful for inversion around a bias (A = 1, B = signal → 1 − signal).',
    outLabel: 'A − B',
    input: {a: audioIn('A'), b: audioIn('B')},
    expr: (c) => {
        const a = c.in('a'), b = c.in('b')
        return {
            l: `(${a.l}) - (${b.l})`,
            r: `(${a.r}) - (${b.r})`
        }
    }
})

defineOp({
    slug: 'multiply', icon: '✖', label: 'Multiply',
    tooltip: 'A × B per channel. Ring modulation when both are signals; amplitude scaling when one is CV.',
    outLabel: 'A × B',
    input: {a: audioIn('A', 1), b: audioIn('B', 1)},
    expr: (c) => {
        const a = c.in('a'), b = c.in('b')
        return {
            l: `(${a.l}) * (${b.l})`,
            r: `(${a.r}) * (${b.r})`
        }
    }
})

defineOp({
    slug: 'divide', icon: '➗', label: 'Divide',
    tooltip: 'A ÷ B per channel. Divisor clamped to ±1e-20 so a momentary zero on B returns 0 instead of ±∞.',
    outLabel: 'A ÷ B',
    input: {a: audioIn('A', 1), b: audioIn('B', 1)},
    expr: (c) => {
        const a = c.in('a'), b = c.in('b')
        const tL = c.tmp(), tR = c.tmp()
        c.line(`const ${tL} = (${b.l});`)
        c.line(`const ${tR} = (${b.r});`)
        return {
            l: `(Math.abs(${tL}) < 1e-20 ? 0 : (${a.l}) / ${tL})`,
            r: `(Math.abs(${tR}) < 1e-20 ? 0 : (${a.r}) / ${tR})`
        }
    }
})

defineOp({
    slug: 'modulo', icon: '🪙', label: 'Modulo',
    tooltip: 'A mod B per channel. Wraps A to the range [0, |B|). Divisor-safe (returns 0 when B ≈ 0).',
    outLabel: 'A mod B',
    input: {a: audioIn('A', 1), b: audioIn('B', 1)},
    expr: (c) => {
        const a = c.in('a'), b = c.in('b')
        const tL = c.tmp(), tR = c.tmp()
        c.line(`const ${tL} = (${b.l});`)
        c.line(`const ${tR} = (${b.r});`)
        return {
            l: `(Math.abs(${tL}) < 1e-20 ? 0 : (${a.l}) - Math.floor((${a.l}) / ${tL}) * ${tL})`,
            r: `(Math.abs(${tR}) < 1e-20 ? 0 : (${a.r}) - Math.floor((${a.r}) / ${tR}) * ${tR})`
        }
    }
})

defineOp({
    slug: 'power', icon: '🏒', label: 'Power',
    tooltip: 'base^exp per channel. Negative base with non-integer exponent returns 0 to avoid NaN.',
    outLabel: 'base^exp',
    input: {
        base: audioIn('Base', 2, {min: 0, max: 10, step: 0.01}),
        exp:  audioIn('Exp',  2, {min: -10, max: 10, step: 0.01})
    },
    expr: (c) => {
        const base = c.in('base'), e = c.in('exp')
        const bL = c.tmp(), eL = c.tmp(), bR = c.tmp(), eR = c.tmp()
        c.line(`const ${bL} = (${base.l}), ${eL} = (${e.l});`)
        c.line(`const ${bR} = (${base.r}), ${eR} = (${e.r});`)
        return {
            l: `(${bL} < 0 && (${eL} % 1) !== 0 ? 0 : Math.pow(Math.abs(${bL}), ${eL}) * (${bL} < 0 ? -1 : 1))`,
            r: `(${bR} < 0 && (${eR} % 1) !== 0 ? 0 : Math.pow(Math.abs(${bR}), ${eR}) * (${bR} < 0 ? -1 : 1))`
        }
    }
})

defineOp({
    slug: 'min', icon: '⬇️', label: 'Min',
    tooltip: 'Smaller of A, B per channel. Useful for clamping a ceiling.',
    outLabel: 'min(A, B)',
    input: {a: audioIn('A'), b: audioIn('B')},
    expr: (c) => {
        const a = c.in('a'), b = c.in('b')
        return {
            l: `Math.min((${a.l}), (${b.l}))`,
            r: `Math.min((${a.r}), (${b.r}))`
        }
    }
})

defineOp({
    slug: 'max', icon: '⬆️', label: 'Max',
    tooltip: 'Larger of A, B per channel. Useful for clamping a floor.',
    outLabel: 'max(A, B)',
    input: {a: audioIn('A'), b: audioIn('B')},
    expr: (c) => {
        const a = c.in('a'), b = c.in('b')
        return {
            l: `Math.max((${a.l}), (${b.l}))`,
            r: `Math.max((${a.r}), (${b.r}))`
        }
    }
})

// ─── Unary ──────────────────────────────────────────────────────────────

defineOp({
    slug: 'negate', icon: '±', label: 'Negate',
    tooltip: '−x per channel. Polarity flip. Cheaper than Multiply-by-minus-one when the constant −1 is all you want.',
    outLabel: '−x',
    input: {x: audioIn('x')},
    expr: (c) => {
        const x = c.in('x')
        return {l: `-(${x.l})`, r: `-(${x.r})`}
    }
})

defineOp({
    slug: 'abs', icon: '🏓', label: 'Absolute',
    tooltip: '|x| per channel. Full-wave rectification — produces DC-offset signal useful for envelope extraction when followed by a slew.',
    outLabel: '|x|',
    input: {x: audioIn('x')},
    expr: (c) => {
        const x = c.in('x')
        return {l: `Math.abs(${x.l})`, r: `Math.abs(${x.r})`}
    }
})

defineOp({
    slug: 'sign', icon: '🧿', label: 'Sign',
    tooltip: '+1 when x > 0, −1 when x < 0, 0 when x = 0, per channel. Hard comparator. Aliased audio — follow with a lowpass.',
    outLabel: 'sign(x)',
    input: {x: audioIn('x')},
    expr: (c) => {
        const x = c.in('x')
        return {l: `Math.sign(${x.l})`, r: `Math.sign(${x.r})`}
    }
})

defineOp({
    slug: 'sqrt', icon: '√', label: 'Square Root',
    tooltip: '√|x|·sign(x) per channel. Signed root so bipolar signals pass through. Energy-preserving panning math.',
    outLabel: '√x',
    input: {x: audioIn('x', 1, {min: -10, max: 10, step: 0.01})},
    expr: (c) => {
        const x = c.in('x')
        const tL = c.tmp(), tR = c.tmp()
        c.line(`const ${tL} = (${x.l});`)
        c.line(`const ${tR} = (${x.r});`)
        return {
            l: `(Math.sqrt(Math.abs(${tL})) * (${tL} < 0 ? -1 : 1))`,
            r: `(Math.sqrt(Math.abs(${tR})) * (${tR} < 0 ? -1 : 1))`
        }
    }
})

defineOp({
    slug: 'log', icon: '📉', label: 'Log',
    tooltip: 'Natural log of max(x, 1e-20), per channel. Negative inputs saturate at the lower clamp; pair with Abs if you need |x|.',
    outLabel: 'ln(x)',
    input: {x: audioIn('x', 1, {min: 0, max: 10, step: 0.01})},
    expr: (c) => {
        const x = c.in('x')
        return {
            l: `Math.log(Math.max(1e-20, (${x.l})))`,
            r: `Math.log(Math.max(1e-20, (${x.r})))`
        }
    }
})

defineOp({
    slug: 'exp', icon: '📈', label: 'Exp',
    tooltip: 'e^x per channel. Great as a log-to-linear step after Log or a dB-like curve. Output grows fast — 10 → ~22026.',
    outLabel: 'exp(x)',
    input: {x: audioIn('x', 0, {min: -10, max: 10, step: 0.01})},
    expr: (c) => {
        const x = c.in('x')
        return {l: `Math.exp(${x.l})`, r: `Math.exp(${x.r})`}
    }
})

defineOp({
    slug: 'tanh', icon: '〽️', label: 'Tanh',
    tooltip: 'Hyperbolic tangent per channel. Smooth soft-clipper in [−1, 1]. Drive hard for asymmetric saturation character.',
    outLabel: 'tanh(x)',
    input: {x: audioIn('x')},
    expr: (c) => {
        const x = c.in('x')
        return {l: `Math.tanh(${x.l})`, r: `Math.tanh(${x.r})`}
    }
})

defineOp({
    slug: 'sin', icon: '∿', label: 'Sin',
    tooltip: 'sin(x) per channel. Waveshaper — feed a signal at audio rate for Chebyshev-style harmonic generation. Not an oscillator; use the Oscillator node for that.',
    outLabel: 'sin(x)',
    input: {x: audioIn('x')},
    expr: (c) => {
        const x = c.in('x')
        return {l: `Math.sin(${x.l})`, r: `Math.sin(${x.r})`}
    }
})

defineOp({
    slug: 'cos', icon: '∼', label: 'Cos',
    tooltip: 'cos(x) per channel. Waveshaper. Same use cases as Sin, 90° phase-shifted.',
    outLabel: 'cos(x)',
    input: {x: audioIn('x')},
    expr: (c) => {
        const x = c.in('x')
        return {l: `Math.cos(${x.l})`, r: `Math.cos(${x.r})`}
    }
})

defineOp({
    slug: 'atan2', icon: '🧭', label: 'ATan2',
    tooltip: 'atan2(y, x) / π per channel. Angle in the range [−1, 1]. Coordinate-to-angle conversion; useful with XY-pair CV.',
    outLabel: '∠(x, y)/π',
    input: {x: audioIn('x', 1), y: audioIn('y', 0)},
    expr: (c) => {
        const x = c.in('x'), y = c.in('y')
        return {
            l: `(Math.atan2((${y.l}), (${x.l})) * INV_PI)`,
            r: `(Math.atan2((${y.r}), (${x.r})) * INV_PI)`
        }
    }
})

// ─── Rounding ───────────────────────────────────────────────────────────

defineOp({
    slug: 'floor', icon: '⬇', label: 'Floor',
    tooltip: 'Round toward −∞, per channel. Combine with Multiply for sample-rate step quantization.',
    outLabel: 'floor(x)',
    input: {x: audioIn('x')},
    expr: (c) => {
        const x = c.in('x')
        return {l: `Math.floor(${x.l})`, r: `Math.floor(${x.r})`}
    }
})

defineOp({
    slug: 'ceil', icon: '⬆', label: 'Ceil',
    tooltip: 'Round toward +∞, per channel.',
    outLabel: 'ceil(x)',
    input: {x: audioIn('x')},
    expr: (c) => {
        const x = c.in('x')
        return {l: `Math.ceil(${x.l})`, r: `Math.ceil(${x.r})`}
    }
})

defineOp({
    slug: 'round', icon: '🎯', label: 'Round',
    tooltip: 'Round to nearest integer (half-to-positive-infinity), per channel.',
    outLabel: 'round(x)',
    input: {x: audioIn('x')},
    expr: (c) => {
        const x = c.in('x')
        return {l: `Math.round(${x.l})`, r: `Math.round(${x.r})`}
    }
})

// ─── Range shaping ──────────────────────────────────────────────────────

defineOp({
    slug: 'clamp', icon: '🗜️', label: 'Clamp',
    tooltip: 'Limit x to [lo, hi] per channel. Classic hard limiter when lo, hi are constants near ±1.',
    outLabel: 'clamp',
    input: {
        x:  audioIn('x'),
        lo: audioIn('Lo', -1, BIPOLAR),
        hi: audioIn('Hi',  1, BIPOLAR)
    },
    expr: (c) => {
        const x = c.in('x'), lo = c.in('lo'), hi = c.in('hi')
        return {
            l: `Math.max((${lo.l}), Math.min((${hi.l}), (${x.l})))`,
            r: `Math.max((${lo.r}), Math.min((${hi.r}), (${x.r})))`
        }
    }
})

defineOp({
    slug: 'lerp', icon: '🌓', label: 'Lerp',
    tooltip: 'Linear interpolate from A to B by t, per channel. t is not clamped — use Clamp if you need strict [0, 1].',
    outLabel: 'mix(A, B, t)',
    input: {
        a: audioIn('A', 0),
        b: audioIn('B', 1),
        t: audioIn('t', 0.5, {min: 0, max: 1, step: 0.001})
    },
    expr: (c) => {
        const a = c.in('a'), b = c.in('b'), t = c.in('t')
        return {
            l: `(${a.l}) + ((${b.l}) - (${a.l})) * (${t.l})`,
            r: `(${a.r}) + ((${b.r}) - (${a.r})) * (${t.r})`
        }
    }
})
