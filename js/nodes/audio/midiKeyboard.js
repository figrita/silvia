import {registerNode} from '../../registry.js'
import {midiManager} from '../../midiManager.js'

/**
 * MIDI Keyboard — bridges hardware MIDI input into the patch graph.
 * Subscribes to midiManager raw events on create; on each note-on
 * or note-off, fires a midi event from the `midi` output via
 * SNode.fireMidi. Many-to-many: any number of consumer nodes can
 * cable in, and the keyboard fans out to all of them on every
 * event.
 *
 * Channel filter: 0 means "all channels"; 1–16 selects one (1-based
 * so the UI matches what hardware controllers display).
 */
registerNode({
    slug: 'audio-midi-keyboard',
    icon: '🎹',
    label: 'MIDI Keyboard',
    tooltip: 'Hardware USB / virtual MIDI input as a graph source.',
    workspaceType: 'audio',

    input: {
        'channel': {label: 'Ch', type: 'float', control: {default: 0, min: 0, max: 16, step: 1}}
    },

    output: {
        'midi': {label: 'MIDI', type: 'midi'}
    },

    runtimeState: { unsubscribe: null },

    onCreate(){
        const node = this
        this.runtimeState.unsubscribe = midiManager.subscribeRaw(record => {
            const chanFilter = (node.getInputValue('channel') | 0)
            if(chanFilter > 0 && record.channel !== (chanFilter - 1)) return
            if(record.mtype === 9){
                node.fireMidi('midi', 'on', {
                    note: record.note, velocity: record.velocity, channel: record.channel
                })
            } else if(record.mtype === 8){
                node.fireMidi('midi', 'off', {
                    note: record.note, velocity: record.velocity, channel: record.channel
                })
            }
        })
    },

    onDestroy(){
        if(this.runtimeState.unsubscribe){
            this.runtimeState.unsubscribe()
            this.runtimeState.unsubscribe = null
        }
    }
})
