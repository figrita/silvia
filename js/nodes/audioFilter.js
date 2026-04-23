import {registerNode} from '../registry.js'
import {audioRuntime} from '../audioRuntime.js'

/**
 * Multimode biquad filter, direct-form-II transposed. Coefficients are
 * recomputed per sample so cutoff/Q modulation (LFO, ADSR) is fully
 * sample-accurate. Four modes, baked into the worklet at compile time so
 * the per-sample path has no branch per-mode.
 *
 * Resonance goes up to 30 — high values self-oscillate, intentionally,
 * for filter sweeps.
 */

const MODE_COEFFS = {
    lowpass: `
        _b0 = (1 - _cw) * 0.5;
        _b1 = 1 - _cw;
        _b2 = (1 - _cw) * 0.5;
        _a1 = -2 * _cw;
        _a2 = 1 - _alpha;
    `,
    highpass: `
        _b0 = (1 + _cw) * 0.5;
        _b1 = -(1 + _cw);
        _b2 = (1 + _cw) * 0.5;
        _a1 = -2 * _cw;
        _a2 = 1 - _alpha;
    `,
    bandpass: `
        _b0 = _alpha;
        _b1 = 0;
        _b2 = -_alpha;
        _a1 = -2 * _cw;
        _a2 = 1 - _alpha;
    `,
    notch: `
        _b0 = 1;
        _b1 = -2 * _cw;
        _b2 = 1;
        _a1 = -2 * _cw;
        _a2 = 1 - _alpha;
    `
}

registerNode({
    slug: 'audio-filter',
    icon: '🌊',
    label: 'Filter',
    tooltip: 'Biquad filter (LP/HP/BP/Notch). Cutoff and resonance take CV; high Q self-oscillates.',
    workspaceType: 'audio',

    input: {
        'audio':     {label: 'Audio',     type: 'audio', control: null},
        'cutoff':    {label: 'Cutoff',    type: 'audio', control: {default: 1000, min: 20, max: 20000, step: 0.01, unit: 'Hz', logScale: true}},
        'resonance': {label: 'Resonance', type: 'audio', control: {default: 0.707, min: 0.1, max: 30, step: 0.01}}
    },

    output: {
        'out': {
            label: 'Out',
            type: 'audio',
            genAudio(ctx){ return ctx.state('y') }
        }
    },

    options: {
        mode: {
            label: 'Mode',
            type: 'select',
            default: 'lowpass',
            choices: [
                {value: 'lowpass',  name: 'Low-pass'},
                {value: 'highpass', name: 'High-pass'},
                {value: 'bandpass', name: 'Band-pass'},
                {value: 'notch',    name: 'Notch'}
            ]
        }
    },

    audioState: { z1: 0, z2: 0, y: 0 },

    genAudioSetup(ctx){
        const audio = ctx.in('audio')
        const cutoff = ctx.in('cutoff')
        const q = ctx.in('resonance')
        const modeCode = MODE_COEFFS[ctx.option('mode')] || MODE_COEFFS.lowpass

        const z1 = ctx.state('z1')
        const z2 = ctx.state('z2')
        const y  = ctx.state('y')

        ctx.line(`
            const _f = Math.max(20, Math.min(sampleRate * 0.5 - 20, ${cutoff}));
            const _w = 2 * Math.PI * _f / sampleRate;
            const _q = Math.max(0.1, ${q});
            const _cw = Math.cos(_w);
            const _alpha = Math.sin(_w) / (2 * _q);
            const _a0 = 1 + _alpha;
            let _b0, _b1, _b2, _a1, _a2;
            ${modeCode}
            _b0 /= _a0; _b1 /= _a0; _b2 /= _a0;
            _a1 /= _a0; _a2 /= _a0;
            const _x = ${audio};
            ${y}  = _b0 * _x + ${z1};
            ${z1} = _b1 * _x - _a1 * ${y} + ${z2};
            ${z2} = _b2 * _x - _a2 * ${y};
        `)
    },

    onOptionChange(){ audioRuntime.invalidate() }
})
