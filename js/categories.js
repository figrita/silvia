import {nodeList} from './registry.js'

/**
 * Defines the structure and order of categories in the node menu.
 * Each object represents a category, and the `nodes` array lists the slugs
 * of the nodes that belong to it. This structure provides a more granular
 * and intuitive organization for the user.
 */
const categoryStructure = [
    {
        name: 'Input',
        icon: '📤',
        nodes: ['color', 'number', 'worldcoordinates', 'imagegif', 'video', 'webcam', 'screencapture', 'text', 'drawingcanvas', 'audioanalyzer', 'micline', 'gamepad', 'mouseinput']
    },
    {
        name: 'Generate',
        icon: '🎨',
        nodes: ['checkerboard', 'stripes', 'grid', 'houndstooth', 'prideflag', 'circle', 'polygon', 'star', 'spiral', 'phyllotaxis', 'radialgradient', 'lineargradient', 'mandelbrot', 'juliaset', 'sierpinski']
    },
    {
        name: 'Noise',
        icon: '🌫️',
        nodes: ['perlinnoise', 'simplex', 'static', 'worleynoise', 'fractalnoise', 'randomhurl']
    },
    {
        name: 'Random',
        icon: '🎲',
        nodes: ['random', 'randomfire', 'triggeredrandom', 'triggeredcolor']
    },
    {
        name: 'Transform',
        icon: '🔄',
        nodes: ['translate', 'zoom', 'rotate', 'perspective', 'mirror', 'stretchskew', 'regionabsolute', 'regionsized', 'polarcoords', 'rotozoom']
    },
    {
        name: 'Distort',
        icon: '🌀',
        nodes: ['wave', 'fisheye', 'whirlandpinch', 'tunnel', 'shakycam', 'kaleidoscope', 'wallpaper', 'tile', 'repeater']
    },
    {
        name: 'Feedback',
        icon: '🎸',
        nodes: ['feedback', 'stargate', 'variabletimefeedback', 'geissflow', 'feedbackmix']
    },
    {
        name: 'Effects',
        icon: '🔍',
        nodes: ['colorshift', 'contrast', 'invert', 'colorize', 'chromaticaberration', 'chromakey', 'posterize', 'colormapping', 'autoexposure', 'blur', 'bloom', 'dilate', 'erode', 'edgedetection', 'supersampling', 'sincfilter', 'sharpen', 'emboss', 'heighttonormal', 'simplelight', 'halftone', 'mosaic']
    },
    {
        name: 'Mix',
        icon: '🎭',
        nodes: ['layerblend', 'mixer', 'minimixer', 'muxevent', 'muxnumber']
    },
    {
        name: 'Math',
        icon: '🧮',
        nodes: ['add', 'subtract', 'multiply', 'divide', 'power', 'modulo', 'abs', 'max', 'min', 'threshold', 'pythagorean', 'lerp', 'sine', 'cosine', 'atan2', 'ceil', 'floor']
    },
    {
        name: 'Convert',
        icon: '🔀',
        nodes: ['rgba', 'channelsplitter', 'reframerange', 'hsla', 'sliderule', 'lightness', 'luminosity', 'hue', 'saturation']
    },
    {
        name: 'Time',
        icon: '⏰',
        nodes: ['animation', 'automation', 'adsrenvelope', 'oscillator', 'counter', 'clock', 'bpmclock', 'stepsequencer', 'euclideanrhythm', 'clockdivider', 'button']
    },
    {
        name: 'Games',
        icon: '🕹️',
        nodes: ['brickgame', 'cellularautomata']
    },
    {
        name: 'Debug',
        icon: '🛠️',
        nodes: ['debug', 'note']
    },
    {
        name: 'Output',
        icon: '📺',
        nodes: ['output']
    }
]


/**
 * Processes the raw node list and the category structure into a final,
 * easy-to-render data structure for the menu.
 * @returns {Array<object>} The categorized list with full node definitions.
 */
function processCategories(){
    const nodeMap = new Map(Object.values(nodeList).map(def => [def.slug, def]))

    return categoryStructure.map(category => ({
        ...category,
        // Replace node slugs with the full node definition object.
        // Filter out any slugs that might not have a corresponding node definition.
        nodeDefs: category.nodes
            .map(slug => nodeMap.get(slug))
            .filter(Boolean)
    }))
}

export const categorizedNodeList = processCategories()