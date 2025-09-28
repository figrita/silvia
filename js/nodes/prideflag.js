import {registerNode} from '../registry.js'

const FLAGS = {
    lesbian: [
        'vec4(0.839, 0.161, 0.0, 1.0)',     // #D62900
        'vec4(0.937, 0.463, 0.153, 1.0)',   // #EF7627
        'vec4(1.0, 0.608, 0.333, 1.0)',     // #FF9B55
        'vec4(1.0, 1.0, 1.0, 1.0)',         // white
        'vec4(0.831, 0.380, 0.651, 1.0)',   // #D461A6
        'vec4(0.710, 0.337, 0.565, 1.0)',   // #B55690
        'vec4(0.647, 0.0, 0.384, 1.0)'      // #A50062
    ],
    gay_mlm: [
        'vec4(0.031, 0.553, 0.439, 1.0)',   // #078D70
        'vec4(0.149, 0.808, 0.667, 1.0)',   // #26CEAA
        'vec4(0.596, 0.910, 0.757, 1.0)',   // #98E8C1
        'vec4(1.0, 1.0, 1.0, 1.0)',         // white
        'vec4(0.482, 0.678, 0.886, 1.0)',   // #7BADE2
        'vec4(0.314, 0.286, 0.800, 1.0)',   // #5049CC
        'vec4(0.239, 0.102, 0.471, 1.0)'    // #3D1A78
    ],
    bi: [
        'vec4(0.839, 0.008, 0.439, 1.0)',   // #D60270
        'vec4(0.608, 0.310, 0.588, 1.0)',   // #9B4F96
        'vec4(0.0, 0.220, 0.659, 1.0)'      // #0038A8
    ],
    transgender: [
        'vec4(0.333, 0.804, 0.988, 1.0)',   // #55CDFC
        'vec4(0.969, 0.659, 0.722, 1.0)',   // #F7A8B8
        'vec4(1.0, 1.0, 1.0, 1.0)',         // white
        'vec4(0.969, 0.659, 0.722, 1.0)',   // #F7A8B8
        'vec4(0.333, 0.804, 0.988, 1.0)'    // #55CDFC
    ],
    rainbow: [
        'vec4(1.0, 0.0, 0.0, 1.0)',         // #FF0000
        'vec4(1.0, 0.600, 0.0, 1.0)',       // #FF9900
        'vec4(1.0, 0.996, 0.075, 1.0)',     // #FFFE13
        'vec4(0.024, 0.624, 0.176, 1.0)',   // #059F2D
        'vec4(0.004, 0.310, 0.910, 1.0)',   // #014FE8
        'vec4(0.569, 0.004, 0.631, 1.0)'    // #9101A1
    ],
    pan: [
        'vec4(1.0, 0.106, 0.553, 1.0)',     // #FF1B8D
        'vec4(1.0, 0.855, 0.0, 1.0)',       // #FFDA00
        'vec4(0.106, 0.702, 1.0, 1.0)'      // #1BB3FF
    ],
    asexual: [
        'vec4(0.0, 0.0, 0.0, 1.0)',         // black
        'vec4(0.643, 0.643, 0.643, 1.0)',   // #A4A4A4
        'vec4(1.0, 1.0, 1.0, 1.0)',         // white
        'vec4(0.506, 0.0, 0.506, 1.0)'      // #810081
    ],
    nonbinary: [
        'vec4(1.0, 0.957, 0.188, 1.0)',     // #FFF430
        'vec4(1.0, 1.0, 1.0, 1.0)',         // white
        'vec4(0.612, 0.349, 0.820, 1.0)',   // #9C59D1
        'vec4(0.0, 0.0, 0.0, 1.0)'          // black
    ],
    gilbert_baker: [
        'vec4(0.992, 0.412, 0.702, 1.0)',   // #FD69B3
        'vec4(1.0, 0.0, 0.0, 1.0)',         // #FF0000
        'vec4(1.0, 0.553, 0.027, 1.0)',     // #FF8D07
        'vec4(1.0, 0.988, 0.024, 1.0)',     // #FFFC06
        'vec4(0.012, 0.553, 0.0, 1.0)',     // #038D00
        'vec4(0.0, 0.761, 0.761, 1.0)',     // #00C2C2
        'vec4(0.251, 0.012, 0.475, 1.0)',   // #400379
        'vec4(0.557, 0.004, 0.051, 1.0)'    // #8E010D
    ],
    progress: [
        // Rainbow stripes
        'vec4(0.890, 0.016, 0.016, 1.0)',   // #E30404 red
        'vec4(1.0, 0.549, 0.0, 1.0)',       // #FF8C00 orange
        'vec4(1.0, 0.929, 0.0, 1.0)',       // #FFED00 yellow
        'vec4(0.0, 0.502, 0.149, 1.0)',     // #008026 green
        'vec4(0.0, 0.302, 1.0, 1.0)',       // #004DFF blue
        'vec4(0.459, 0.0, 0.529, 1.0)',     // #750087 purple
        // Chevron colors (ordered for correct display)
        'vec4(1.0, 1.0, 1.0, 1.0)',         // white
        'vec4(0.961, 0.659, 0.722, 1.0)',   // #F5A9B8 light pink (trans)
        'vec4(0.361, 0.816, 0.980, 1.0)',   // #5CCFFA light blue (trans)
        'vec4(0.353, 0.192, 0.055, 1.0)',   // #5A310E brown
        'vec4(0.0, 0.0, 0.0, 1.0)'          // black
    ]
}

registerNode({
    slug: 'prideflag',
    icon: '🏳️‍🌈',
    label: 'Pride Flag',
    tooltip: 'Generates various pride flags with horizontal stripes or a chevron design. Select from multiple flags using the dropdown menu.',
    
    input: {},
    
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const flagType = this.getOption('flagType')
                const stripes = FLAGS[flagType]
                
                // Special handling for Progress Pride flag with chevron
                // Based on https://godotshaders.com/author/jtad/ CC0
                if (flagType === 'progress') {
                    return `vec4 ${funcName}(vec2 uv) {
    // Normalize coordinates to 0-1 range
    float x = (uv.x + 1.0) * 0.5;
    float y = (uv.y + 1.0) * 0.5;
    
    // Draw rainbow stripes first (inverted to fix upside-down issue)
    vec4 color;
    if (y < 1.0/6.0) color = ${stripes[5]}; // purple
    else if (y < 2.0/6.0) color = ${stripes[4]}; // blue
    else if (y < 3.0/6.0) color = ${stripes[3]}; // green
    else if (y < 4.0/6.0) color = ${stripes[2]}; // yellow
    else if (y < 5.0/6.0) color = ${stripes[1]}; // orange
    else color = ${stripes[0]}; // red
    
    // Calculate chevron/triangle position (inverted y for correct orientation)
    float widthHeightProportion = 1.20;
    float triangle = 1.0 - (abs(0.5 - (1.0 - y)) + (x * widthHeightProportion) + 0.5);
    
    // Apply chevron colors from outermost to innermost (5 stripes, slightly wider)
    if (triangle > 4.5/6.0) color = ${stripes[6]}; // white (innermost)
    else if (triangle > 3.6/6.0) color = ${stripes[7]}; // pink
    else if (triangle > 2.7/6.0) color = ${stripes[8]}; // light blue  
    else if (triangle > 1.8/6.0) color = ${stripes[9]}; // brown
    else if (triangle > 0.9/6.0) color = ${stripes[10]}; // black (outermost)
    
    return color;
}`
                }
                
                // Standard horizontal stripes for other flags
                const n = stripes.length
                let shaderCode = `vec4 ${funcName}(vec2 uv) {
    float y = 1.0 - (mod((uv.y + 1.0) * 0.5, 1.0));\n`
                
                for (let i = 0; i < n; i++) {
                    const threshold = (i + 1) / n
                    if (i === n - 1) {
                        shaderCode += `    return ${stripes[i]};\n`
                    } else {
                        shaderCode += `    if (y < ${threshold.toFixed(3)}) return ${stripes[i]};\n`
                    }
                }
                
                shaderCode += '}'
                return shaderCode
            }
        }
    },
    
    options: {
        'flagType': {
            label: 'Flag Type',
            type: 'select',
            default: 'rainbow',
            choices: [
                {value: 'lesbian', name: 'Lesbian'},
                {value: 'gay_mlm', name: 'Gay/MLM'},
                {value: 'bi', name: 'Bisexual'},
                {value: 'transgender', name: 'Transgender'},
                {value: 'rainbow', name: 'Rainbow'},
                {value: 'pan', name: 'Pansexual'},
                {value: 'asexual', name: 'Asexual'},
                {value: 'nonbinary', name: 'Nonbinary'},
                {value: 'gilbert_baker', name: '8-stripe Gilbert Baker'},
                {value: 'progress', name: 'Progress Pride'}
            ]
        }
    }
})