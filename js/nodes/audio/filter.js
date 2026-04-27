import {registerNode} from '../../registry.js'

/**
 * Multimode biquad filter, direct-form-II transposed. Coefficients are
 * recomputed per sample so cutoff/Q modulation (LFO, ADSR) is fully
 * sample-accurate. Four modes, baked into the worklet at compile time so
 * the per-sample path has no branch per-mode.
 *
 * Stereo: independent biquad state per channel (z1/z2/y doubled into L/R)
 * so a stereo input maintains its image; a mono input gets identical
 * filtering on both sides. Cutoff and resonance are mono CV — the same
 * coefficients drive both channels, which is the natural choice for an
 * EQ-style filter (a stereo cutoff would split the image as the freq
 * sweeps).
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
    tooltip: 'Biquad filter (LP/HP/BP/Notch), stereo. Cutoff and resonance take CV; high Q self-oscillates.',
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
            genAudio(ctx){ return {l: ctx.state('yL'), r: ctx.state('yR')} }
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

    audioState: { z1L: 0, z2L: 0, yL: 0, z1R: 0, z2R: 0, yR: 0 },

    genAudioSetup(ctx){
        const a = ctx.in('audio')
        const cutoff = ctx.inL('cutoff')
        const q = ctx.inL('resonance')
        const modeCode = MODE_COEFFS[ctx.option('mode')] || MODE_COEFFS.lowpass

        const z1L = ctx.state('z1L'), z2L = ctx.state('z2L'), yL = ctx.state('yL')
        const z1R = ctx.state('z1R'), z2R = ctx.state('z2R'), yR = ctx.state('yR')

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
            const _xL = ${a.l};
            const _xR = ${a.r};
            ${yL}  = _b0 * _xL + ${z1L};
            ${z1L} = _b1 * _xL - _a1 * ${yL} + ${z2L};
            ${z2L} = _b2 * _xL - _a2 * ${yL};
            ${yR}  = _b0 * _xR + ${z1R};
            ${z1R} = _b1 * _xR - _a1 * ${yR} + ${z2R};
            ${z2R} = _b2 * _xR - _a2 * ${yR};
        `)
    }
})
