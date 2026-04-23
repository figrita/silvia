import {registerNode} from '../registry.js'
import {audioRuntime} from '../audioRuntime.js'

/**
 * Sample & Hold — captures the input value on each rising edge of the
 * trigger gate and holds it until the next trigger. Classic source of
 * stepped, semi-random control voltages: feed Noise into Input and a
 * BPM clock into Trigger to get pitched random sequences ("turing
 * machine" style).
 *
 * The input is sampled at the moment of the trigger, so audio-rate
 * triggering produces a stepped sample-rate-reduced signal.
 */
registerNode({
    slug: 'audio-samplehold',
    icon: '🔒',
    label: 'Sample & Hold',
    tooltip: 'Captures and holds the input value on each trigger rising edge. Stepped CV from any source.',
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
            genAudio(ctx){ return ctx.state('held') }
        }
    },

    audioState: {
        held: 0,
        trigger: 0,
        lastTrigger: 0
    },

    genAudioSetup(ctx){
        const input = ctx.in('input')
        const held = ctx.state('held')
        const trig = ctx.state('trigger')
        const lt = ctx.state('lastTrigger')
        ctx.line(`
            if(${trig} > 0.5 && ${lt} < 0.5){
                ${held} = ${input};
            }
            ${lt} = ${trig};
        `)
    }
})
