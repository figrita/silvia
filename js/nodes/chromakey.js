import {registerNode} from '../registry.js'

registerNode({
    slug: 'chromakey',
    icon: '🟢',
    label: 'Chroma Key',
    tooltip: 'Green screen / blue screen effect. Key out specific colors and replace with background. Includes spill suppression and edge softness.',
    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null
        },
        'background': {
            label: 'Background',
            type: 'color',
            control: {default: '#ff00ff'}
        },
        'keyColor': {
            label: 'Key Color',
            type: 'color',
            control: {default: '#00ff00'}
        },
        'threshold': {
            label: 'Threshold',
            type: 'float',
            control: {default: 0.4, min: 0, max: 1, step: 0.01}
        },
        'softness': {
            label: 'Softness',
            type: 'float',
            control: {default: 0.2, min: 0, max: 1, step: 0.01}
        },
        'spill': {
            label: 'Spill Suppression',
            type: 'float',
            control: {default: 0.5, min: 0, max: 1, step: 0.01}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const inputColor = this.getInput('input', cc)
                const background = this.getInput('background', cc)
                const keyColor = this.getInput('keyColor', cc)
                const threshold = this.getInput('threshold', cc)
                const softness = this.getInput('softness', cc)
                const spill = this.getInput('spill', cc)

                return `vec4 ${funcName}(vec2 uv) {
    vec4 foreground = ${inputColor};
    vec4 bg = ${background};
    vec4 key = ${keyColor};
    float thresh = ${threshold};
    float soft = ${softness};
    float spillAmount = ${spill};
    
    // Convert key color to YCbCr inline
    float keyY = 0.299 * key.r + 0.587 * key.g + 0.114 * key.b;
    float keyCb = 0.564 * (key.b - keyY);
    float keyCr = 0.713 * (key.r - keyY);
    
    // Convert foreground to YCbCr inline
    float fgY = 0.299 * foreground.r + 0.587 * foreground.g + 0.114 * foreground.b;
    float fgCb = 0.564 * (foreground.b - fgY);
    float fgCr = 0.713 * (foreground.r - fgY);
    
    // Calculate chroma distance (Cb and Cr channels)
    vec2 chromaDiff = vec2(fgCb - keyCb, fgCr - keyCr);
    float chromaDist = length(chromaDiff);
    
    // Also consider luminance difference for better edge detection
    float lumDiff = abs(fgY - keyY);
    
    // Combined distance with chroma weighted more heavily
    float distance = chromaDist + lumDiff * 0.2;
    
    // Calculate alpha mask with soft edge
    float alpha = smoothstep(thresh - soft, thresh + soft, distance);
    
    // Spill suppression - reduce the key color channel
    vec3 despilled = foreground.rgb;
    if (spillAmount > 0.0 && alpha > 0.01) {
        // Identify which channel is dominant in the key color
        float maxChannel = max(key.r, max(key.g, key.b));
        if (key.g == maxChannel) {
            // Green screen - suppress green channel
            despilled.g = min(despilled.g, (despilled.r + despilled.b) * 0.5);
        } else if (key.b == maxChannel) {
            // Blue screen - suppress blue channel
            despilled.b = min(despilled.b, (despilled.r + despilled.g) * 0.5);
        }
        despilled = mix(foreground.rgb, despilled, spillAmount * (1.0 - alpha));
    }
    
    // Composite foreground over background
    vec3 result = mix(bg.rgb, despilled, alpha);
    
    return vec4(result, mix(bg.a, foreground.a, alpha));
}`
            }
        }
    }
})