import {registerNode} from '../../registry.js'
import {audioRuntime} from '../../audioRuntime.js'

/**
 * Sample & Hold — captures the input value on each rising edge of the
 * trigger gate and holds it until the next trigger. Classic source of
 * stepped, semi-random control voltages: feed Noise into Input and a
 * BPM clock into Trigger to get pitched random sequences ("turing
 * machine" style).
 *
 * Stereo: the L and R held values are sampled independently from each
 * channel of the input on the same trigger edge — so a stereo noise
 * source becomes a stereo S&H, while a mono source still produces L=R.
 *
 * The input is sampled at the moment of the trigger, so audio-rate
 * triggering produces a stepped sample-rate-reduced signal.
 */
registerNode({
    slug: 'audio-samplehold',
    icon: '🔒',
    label: 'Sample & Hold',
    tooltip: 'Captures and holds the input value on each trigger rising edge. Stereo-aware; both channels latch on the same edge.',
    workspaceType: 'audio',

    input: {
        'input': {
            label: 'In',
            type: 'audio',
            control: {default: 0.0, min: -10, max: 10, step: 0.01}
        },
        'trigger': {
            label: 'Trigger',
            type: 'action',
            control: {},
            downCallback(){ audioRuntime.postGate(this.id, 'trigger', 1) },
            upCallback(){   audioRuntime.postGate(this.id, 'trigger', 0) }
        }
    },

    output: {
        'out': {
            label: 'Out',
            type: 'audio',
            genAudio(ctx){ return {l: ctx.state('heldL'), r: ctx.state('heldR')} }
        }
    },

    audioState: {
        heldL: 0,
        heldR: 0,
        trigger: 0,
        lastTrigger: 0
    },

    genAudioSetup(ctx){
        const x = ctx.in('input')
        const heldL = ctx.state('heldL')
        const heldR = ctx.state('heldR')
        const trig = ctx.state('trigger')
        const lt = ctx.state('lastTrigger')
        ctx.line(`
            if(${trig} > 0.5 && ${lt} < 0.5){
                ${heldL} = ${x.l};
                ${heldR} = ${x.r};
            }
            ${lt} = ${trig};
        `)
    }
})
