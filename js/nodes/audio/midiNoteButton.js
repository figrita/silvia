import {registerNode} from '../../registry.js'

/**
 * MIDI Note Button — a clickable / action-triggerable source of
 * note events. Press the button (or wire an action input) to emit
 * note-on; release to emit note-off. The note number and velocity
 * come from inline knobs. Useful for testing a midi consumer
 * without hardware, and as a building block for one-off triggers
 * inside a patch.
 */
registerNode({
    slug: 'audio-midi-note',
    icon: '🎵',
    label: 'MIDI Note',
    tooltip: 'Action-triggered note source — press to fire note-on, release to fire note-off.',
    workspaceType: 'audio',

    input: {
        'trigger': {
            label: 'Trig', type: 'action', control: {},
            downCallback(){
                this.fireMidi('midi', 'on', {
                    note:     this.getInputValue('note') | 0,
                    velocity: this.getInputValue('velocity') | 0,
                    channel:  0
                })
            },
            upCallback(){
                this.fireMidi('midi', 'off', {
                    note:     this.getInputValue('note') | 0,
                    velocity: 0,
                    channel:  0
                })
            }
        },
        'note':     {label: 'Note', type: 'float', control: {default: 60,  min: 0, max: 127, step: 1}},
        'velocity': {label: 'Vel',  type: 'float', control: {default: 100, min: 1, max: 127, step: 1}}
    },

    output: {
        'midi': {label: 'MIDI', type: 'midi'}
    }
})
