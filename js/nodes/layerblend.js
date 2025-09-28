import {registerNode} from '../registry.js'

registerNode({
    slug: 'layerblend',
    icon: '⿻',
    label: 'Layer Blend',
    tooltip: 'Blends two input layers with various blend modes (multiply, screen, overlay, etc.).',
    input: {
        'background': {
            label: 'Background',
            type: 'color',
            control: {default: '#000000ff'}
        },
        'foreground': {
            label: 'Foreground',
            type: 'color',
            control: {default: '#ffffffff'}
        },
        'opacity': {
            label: 'Opacity',
            type: 'float',
            range: '[0, 1]',
            control: {default: 1.0, min: 0.0, max: 1.0, step: 0.01}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                return `vec4 ${funcName}(vec2 uv) {
    vec4 bg = ${this.getInput('background', cc)};
    vec4 fg = ${this.getInput('foreground', cc)};
    float op = ${this.getInput('opacity', cc)};
    vec3 result;
    
    ${(() => {
        let res
        switch(this.getOption('blend_mode')){
            case 'normal':
                res = `result = mix(bg.rgb, fg.rgb, fg.a * op);`
                break
            case 'add':
                res = `result = bg.rgb + fg.rgb * fg.a * op;`
                break
            case 'multiply':
                res = `result = bg.rgb * mix(vec3(1.0), fg.rgb, fg.a * op);`
                break
            case 'screen':
                res = `result = 1.0 - (1.0 - bg.rgb) * (1.0 - fg.rgb * fg.a * op);`
                break
            case 'overlay':
                res = `vec3 overlay = vec3(0.0);
        if (bg.r < 0.5) { overlay.r = 2.0 * bg.r * fg.r; } else { overlay.r = 1.0 - 2.0 * (1.0 - bg.r) * (1.0 - fg.r); }
        if (bg.g < 0.5) { overlay.g = 2.0 * bg.g * fg.g; } else { overlay.g = 1.0 - 2.0 * (1.0 - bg.g) * (1.0 - fg.g); }
        if (bg.b < 0.5) { overlay.b = 2.0 * bg.b * fg.b; } else { overlay.b = 1.0 - 2.0 * (1.0 - bg.b) * (1.0 - fg.b); }
        result = mix(bg.rgb, overlay, fg.a * op);`
                break
            case 'soft':
                res = `vec3 softlight = (1.0 - 2.0 * fg.rgb) * bg.rgb * bg.rgb + 2.0 * bg.rgb * fg.rgb;
        result = mix(bg.rgb, softlight, fg.a * op);`
                break
            case 'hard':
                res = `vec3 hardlight = vec3(0.0);
        if (fg.r < 0.5) { hardlight.r = 2.0 * fg.r * bg.r; } else { hardlight.r = 1.0 - 2.0 * (1.0 - fg.r) * (1.0 - bg.r); }
        if (fg.g < 0.5) { hardlight.g = 2.0 * fg.g * bg.g; } else { hardlight.g = 1.0 - 2.0 * (1.0 - fg.g) * (1.0 - bg.g); }
        if (fg.b < 0.5) { hardlight.b = 2.0 * fg.b * bg.b; } else { hardlight.b = 1.0 - 2.0 * (1.0 - fg.b) * (1.0 - bg.b); }
        result = mix(bg.rgb, hardlight, fg.a * op);`
                break
            case 'difference':
                res = `result = abs(bg.rgb - fg.rgb * fg.a * op);`
                break
            case 'exclusion':
                res = `result = bg.rgb + fg.rgb * fg.a * op - 2.0 * bg.rgb * fg.rgb * fg.a * op;`
                break
        }
        return res
    })()}
    
    float finalAlpha = fg.a * op + bg.a * (1.0 - fg.a * op);
    return vec4(result, finalAlpha);
}`
            }
        }
    },

    options: {
        'blend_mode': {
            label: 'Blend Mode',
            type: 'select',
            default: 'normal',
            choices: [
                {value:  'normal', name: 'Normal'},
                {value:  'add', name: 'Add (Linear Dodge)'},
                {value:  'multiply', name: 'Multiply'},
                {value:  'screen', name: 'Screen'},
                {value:  'overlay', name: 'Overlay'},
                {value:  'soft', name: 'Soft Light'},
                {value:  'hard', name: 'Hard Light'},
                {value:  'difference', name: 'Difference'},
                {value:  'exclusion', name: 'Exclusion'}
            ]
        }
    }
})