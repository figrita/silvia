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
        nodes: ['audio-mic']
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
        nodes: ['audio-lfo', 'audio-attenuverter']
    },
    {
        name: 'Distortion',
        icon: '🔥',
        nodes: []
    },
    {
        name: 'Delay & Reverb',
        icon: '🏛️',
        nodes: []
    },
    {
        name: 'EQ',
        icon: '🎚️',
        nodes: []
    },
    {
        name: 'Mixers',
        icon: '🎛️',
        nodes: []
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
        name: 'Analysis',
        icon: '🔬',
        nodes: []
    },
    {
        name: 'Output',
        icon: '📢',
        nodes: []
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
