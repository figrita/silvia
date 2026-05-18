import {nodeList} from './registry.js'

/**
 * Audio-workspace category structure.
 *
 * Audio nodes compile to a Web Audio graph (not GLSL). Ports are:
 *   • `audio` — stereo AudioNode connections
 *   • `float` — either CV (connects natively to AudioParam on audio sinks)
 *               or a knob value (when the input is unconnected)
 *   • `action` — gate/trigger events
 *
 * Hybrid nodes (e.g., `button`, `adsrenvelope`) appear here AND in the video
 * menu. They render the same way on both workspaces — no layout flip — so
 * shared CPU-flow nodes drop in naturally.
 */
const categoryStructure = [
    {
        name: 'Sources',
        icon: '🔊',
        nodes: ['audio-mic', 'audio-noise']
    },
    {
        name: 'Oscillators',
        icon: '〰️',
        nodes: ['audio-osc']
    },
    {
        name: 'Samplers',
        icon: '💿',
        nodes: []
    },
    {
        name: 'Filters',
        icon: '🌊',
        nodes: ['audio-filter']
    },
    {
        name: 'Dynamics',
        icon: '📈',
        nodes: ['audio-vca']
    },
    {
        name: 'Modulation',
        icon: '🌀',
        nodes: ['audio-lfo', 'audio-attenuverter', 'audio-slew', 'audio-samplehold', 'audio-ringmod']
    },
    {
        name: 'Distortion',
        icon: '🔥',
        nodes: ['audio-clip', 'audio-saturate', 'audio-bitcrush']
    },
    {
        name: 'Delay & Reverb',
        icon: '🏛️',
        nodes: ['audio-echo', 'audio-delay']
    },
    {
        name: 'EQ',
        icon: '🎚️',
        nodes: []
    },
    {
        name: 'Mixers',
        icon: '🎛️',
        nodes: ['audio-mix', 'audio-mix4']
    },
    {
        name: 'CV / Modular',
        icon: '⚡',
        nodes: ['audio-adsr', 'button', 'bpmclock']
    },
    {
        name: 'Sequencers',
        icon: '🧮',
        nodes: ['euclideanrhythm', 'clockdivider']
    },
    {
        name: 'MIDI',
        icon: '🎹',
        nodes: ['audio-midi-keyboard', 'audio-midi-note', 'audio-midi-gate', 'audio-monosynth', 'audio-minimono']
    },
    {
        name: 'Analysis',
        icon: '🔬',
        nodes: ['audio-envfollow']
    },
    {
        name: 'Math',
        icon: '➕',
        nodes: [
            'audio-add', 'audio-subtract', 'audio-multiply', 'audio-divide',
            'audio-modulo', 'audio-power',
            'audio-min', 'audio-max', 'audio-clamp', 'audio-lerp',
            'audio-negate', 'audio-abs', 'audio-sign', 'audio-sqrt',
            'audio-log', 'audio-exp', 'audio-tanh',
            'audio-sin', 'audio-cos', 'audio-atan2',
            'audio-floor', 'audio-ceil', 'audio-round'
        ]
    },
    {
        name: 'Output',
        icon: '📢',
        nodes: ['synthout', 'fourtrack']
    }
]

function processCategories(){
    const nodeMap = new Map(Object.values(nodeList).map(def => [def.slug, def]))

    return categoryStructure.map(category => ({
        ...category,
        nodeDefs: category.nodes
            .map(slug => nodeMap.get(slug))
            .filter(Boolean)
    }))
}

export const categorizedNodeListAudio = processCategories()

/** Slugs that belong to the audio workspace menu. Used to filter the flat quick-menu search. */
export const audioNodeSlugs = new Set(categoryStructure.flatMap(c => c.nodes))
