import {registerNode} from '../registry.js'

/**
 * Envelope Follower — turns audio amplitude into a CV. Rectifies the
 * input, then applies an asymmetric one-pole smoother with separate
 * attack and release time constants. Output tracks the loudness of
 * the input over time.
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
    tooltip: 'Tracks audio amplitude as a CV. Asymmetric attack/release smoothing on the rectified input.',
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
            genAudio(ctx){ return ctx.state('env') }
        }
    },

    audioState: { env: 0 },

    genAudioSetup(ctx){
        const audio = ctx.in('audio')
        const atk = ctx.in('attack')
        const rel = ctx.in('release')
        const env = ctx.state('env')
        ctx.line(`
            const _abs = Math.abs(${audio});
            const _t = (_abs > ${env}) ? Math.max(0.0001, ${atk}) : Math.max(0.0001, ${rel});
            const _k = 1 - Math.exp(-1 / (sampleRate * _t));
            ${env} = ${env} + (_abs - ${env}) * _k;
        `)
    }
})
