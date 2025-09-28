import {registerNode} from '../registry.js'

registerNode({
    slug: 'threshold',
    icon: '⚖',
    label: 'Threshold',
    tooltip: 'Converts input to binary output based on threshold value. Above threshold outputs high value, below outputs low value.',
    input: {
        'input': {
            label: 'Input',
            type: 'float',
            control: {default: 0.5, min: 0, max: 1, step: 0.01}
        },
        'threshold': {
            label: 'Threshold',
            type: 'float',
            control: {default: 0.5, min: 0, max: 1, step: 0.01}
        },
        'smooth': {
            label: 'Smoothing',
            type: 'float',
            control: {default: 0.01, min: 0, max: 1.0, step: 0.001}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'float',
            range: '[0, 1]',
            genCode(cc, funcName){
                const input = this.getInput('input', cc)
                const threshold = this.getInput('threshold', cc)
                const smooth = this.getInput('smooth', cc)
                
                return `float ${funcName}(vec2 uv) {
    float val = ${input};
    float thresh = ${threshold};
    float smoothing = ${smooth};
    
    // Use smoothstep for antialiased thresholding
    return smoothstep(thresh - smoothing, thresh + smoothing, val);
}`
            }
        }
    }
})