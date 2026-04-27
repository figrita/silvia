import {registerNode} from '../../registry.js'

/**
 * Envelope Follower — turns audio amplitude into a CV. Rectifies the
 * input, then applies an asymmetric one-pole smoother with separate
 * attack and release time constants. Tracks each channel independently;
 * the output is stereo so a stereo source can drive separate per-side
 * modulation (e.g., follow drums on the left, vocals on the right).
 *
 * Patch examples:
 *   • Mic into Envelope Follower → Filter cutoff = vocal-driven filter
 *   • Drum loop → Envelope Follower → Oscillator gain = ducking effect
 *   • Audio → Envelope Follower → ADSR-shaped via slew = smoothed amplitude
 *
 * Attack and release are τ values (63% to target after t seconds).
 */
registerNode({
    slug: 'audio-envfollow',
    icon: '📡',
    label: 'Env Follow',
    tooltip: 'Tracks audio amplitude as a CV, per channel. Asymmetric attack/release smoothing on the rectified input.',
    workspaceType: 'audio',

    input: {
        'audio':   {label: 'Audio',   type: 'audio', control: null},
        'attack':  {label: 'Attack',  type: 'audio', control: {default: 0.005, min: 0.0001, max: 1.0, step: 0.001, unit: 's', logScale: true}},
        'release': {label: 'Release', type: 'audio', control: {default: 0.1,   min: 0.0001, max: 5.0, step: 0.001, unit: 's', logScale: true}}
    },

    output: {
        'out': {
            label: 'Out',
            type: 'audio',
            genAudio(ctx){ return {l: ctx.state('envL'), r: ctx.state('envR')} }
        }
    },

    audioState: { envL: 0, envR: 0 },

    genAudioSetup(ctx){
        const a = ctx.in('audio')
        const atk = ctx.inL('attack')
        const rel = ctx.inL('release')
        const envL = ctx.state('envL')
        const envR = ctx.state('envR')
        ctx.line(`
            const _absL = Math.abs(${a.l});
            const _absR = Math.abs(${a.r});
            const _tL = (_absL > ${envL}) ? Math.max(0.0001, ${atk}) : Math.max(0.0001, ${rel});
            const _tR = (_absR > ${envR}) ? Math.max(0.0001, ${atk}) : Math.max(0.0001, ${rel});
            const _kL = 1 - Math.exp(-1 / (sampleRate * _tL));
            const _kR = 1 - Math.exp(-1 / (sampleRate * _tR));
            ${envL} += (_absL - ${envL}) * _kL;
            ${envR} += (_absR - ${envR}) * _kR;
        `)
    }
})
