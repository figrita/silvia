import {registerNode} from '../../registry.js'
import {audioRuntime} from '../../audioRuntime.js'

/**
 * MIDI to Gate — bridges a midi event cable into audio-rate state
 * the rest of the audio graph can read. Note-on flips `gate` to 1
 * and latches `note` (as a frequency in Hz, A4 = 440) and `vel`
 * (0–1). Note-off flips `gate` to 0. The state writes flow through
 * audioRuntime.setNodeState → engine 'updateState' message, which
 * mutates both programs during a fade so the event isn't split
 * across a recompile boundary.
 *
 * Outputs are plain audio-rate signals (gate, vel, note frequency)
 * so a downstream VCA / envelope / oscillator picks them up like
 * any other CV — no worklet plumbing changes required.
 */
registerNode({
    slug: 'audio-midi-gate',
    icon: '⏱',
    label: 'MIDI to Gate',
    tooltip: 'Note-on/off → gate + velocity + frequency CV.',
    workspaceType: 'audio',

    input: {
        'midi': {
            label: 'MIDI',
            type: 'midi',
            control: null,
            noteOnCallback(event){
                const freq = 440 * Math.pow(2, (event.note - 69) / 12)
                audioRuntime.setNodeState(this.id, {
                    gate: 1,
                    vel:  event.velocity / 127,
                    note: freq
                })
            },
            noteOffCallback(){
                audioRuntime.setNodeState(this.id, {gate: 0})
            }
        }
    },

    output: {
        'gate': {label: 'Gate',  type: 'audio', genAudio(ctx){ return ctx.state('gate') }},
        'vel':  {label: 'Vel',   type: 'audio', genAudio(ctx){ return ctx.state('vel')  }},
        'note': {label: 'Freq',  type: 'audio', genAudio(ctx){ return ctx.state('note') }}
    },

    audioState: {
        gate: 0,
        vel:  0,
        note: 440
    }
})
