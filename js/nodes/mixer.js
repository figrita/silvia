import {registerNode} from '../registry.js'

registerNode({
    slug: 'mixer',
    icon: '🎚️',
    label: 'Mixer',
    tooltip: 'Fade between multiple color inputs.',
    input: {
        'deckA': {label: 'Deck A', type: 'color', control: null},
        'deckB': {label: 'Deck B', type: 'color', control: null},
        'fade': {
            label: 'Fade',
            type: 'float',
            range: '[-1, 1]',
            control: {default: 0.0, min: -1.0, max: 1.0, step: 0.01}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const deckA = this.getInput('deckA', cc)
                const deckB = this.getInput('deckB', cc)
                const fade = this.getInput('fade', cc)

                const method = this.getOption('method')
                let body
                switch(method){
                    case 'h_wipe':
                        body = `return (uv.x < f) ? b : a;`
                        break
                    case 'v_wipe':
                        body = `return (uv.y < f) ? b : a;`
                        break
                    case 'radial':
                        body = `float dist = length(uv);
    return (dist < f) ? b : a;`
                        break
                    case 'dark_fade':
                        body = `float lumA = dot(a.rgb, vec3(0.299, 0.587, 0.114));
    return (lumA < f) ? b : a;`
                        break
                    case 'light_fade':
                        body = `float lumA = dot(a.rgb, vec3(0.299, 0.587, 0.114));
    return (lumA > 1.0 - f) ? b : a;`
                        break
                    case 'checker':
                        body = `vec2 cell = floor(uv * 8.0);
    bool odd = mod(cell.x + cell.y, 2.0) > 0.5;
    bool showB = odd ? (uv.y < f) : (-uv.y < f);
    return showB ? b : a;`
                        break
                    case 'h_lines':
                        body = `vec2 cell = floor(uv * vec2(16.0, 8.0));
    bool odd = mod(cell.y, 2.0) > 0.5;
    bool showB = odd ? (uv.x < f) : (-uv.x < f);
    return showB ? b : a;`
                        break
                    default: // 'blend'
                        body = `return mix(a, b, clamp(f, 0.0, 1.0));`
                        break
                }

                return `vec4 ${funcName}(vec2 uv) {
    vec4 a = ${deckA};
    vec4 b = ${deckB};
    float f = 0.5 + 0.5 * tan((${fade}) * 1.5707963);
    ${body}
}`
            }
        }
    },

    options: {
        'method': {
            label: 'Method',
            type: 'select',
            default: 'blend',
            choices: [
                {value: 'blend',      name: 'Simple Blend'},
                {value: 'h_wipe',     name: 'Horizontal Wipe'},
                {value: 'v_wipe',     name: 'Vertical Wipe'},
                {value: 'radial',     name: 'Radial Wipe'},
                {value: 'dark_fade',  name: 'Dark Fade'},
                {value: 'light_fade', name: 'Light Fade'},
                {value: 'checker',    name: 'Checkerboard'},
                {value: 'h_lines',    name: 'Horizontal Lines'}
            ]
        }
    }
})