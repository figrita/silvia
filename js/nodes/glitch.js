import {registerNode} from '../registry.js'

registerNode({
    slug: 'glitch',
    icon: '📳',
    label: 'Glitch',
    tooltip: 'Scanline displacement with randomized RGB channel splitting. Syncs to BPM or manual trigger.',
    runtimeState: {
        stepOffset: 0
    },
    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null
        },
        'intensity': {
            label: 'Intensity',
            type: 'float',
            control: {default: 0.15, min: 0.0, max: 1.0, step: 0.01}
        },
        'shift': {
            label: 'Shift',
            type: 'float',
            control: {default: 0.15, min: 0.0, max: 1.0, step: 0.01}
        },
        'blockSize': {
            label: 'Block Size',
            type: 'float',
            control: {default: 0.05, min: 0.005, max: 0.3, step: 0.005}
        },
        'rgbSplit': {
            label: 'RGB Split',
            type: 'float',
            control: {default: 0.02, min: 0.0, max: 0.1, step: 0.001}
        },
        'bpm': {
            label: 'BPM',
            type: 'float',
            control: {default: 120.0, min: 0.0, max: 600.0, step: 1.0}
        },
        'trigger': {
            label: 'Step',
            type: 'action',
            control: {},
            downCallback(){
                this.runtimeState.stepOffset++
            }
        }
    },
    options: {
        'direction': {
            label: 'Direction',
            type: 'select',
            default: 'horizontal',
            choices: [
                {value: 'horizontal', name: 'Horizontal'},
                {value: 'vertical', name: 'Vertical'},
                {value: 'both', name: 'Both'}
            ]
        },
        'subdivisions': {
            label: 'Subdivisions',
            type: 'select',
            default: '1',
            choices: [
                {value: '0.25', name: '1/4'},
                {value: '0.5', name: '1/2'},
                {value: '1', name: '1'},
                {value: '2', name: '2'},
                {value: '4', name: '4'}
            ]
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName, uniformName){
                const intensity = this.getInput('intensity', cc)
                const shift = this.getInput('shift', cc)
                const blockSize = this.getInput('blockSize', cc)
                const rgbSplit = this.getInput('rgbSplit', cc)
                const bpm = this.getInput('bpm', cc)
                const direction = this.getOption('direction')
                const subdivisions = parseFloat(this.getOption('subdivisions')).toFixed(2)

                const stepUniform = `${uniformName}_step`
                cc.uniforms.set(stepUniform, {
                    type: 'float',
                    sourcePort: this.output.output
                })

                // Hierarchical block subdivision: coarse blocks randomly split
                // into medium or fine, so blockSize is the base unit
                const varBlock = (coordExpr, prefix) => `
    float ${prefix}Coarse = floor(${coordExpr} / (${blockSize} * 4.0));
    float ${prefix}Scale = fract(sin(${prefix}Coarse * 127.1 + time * 0.37) * 43758.5453);
    float ${prefix}Coord;
    if (${prefix}Scale < 0.3) {
        ${prefix}Coord = ${prefix}Coarse;
    } else if (${prefix}Scale < 0.65) {
        ${prefix}Coord = floor(${coordExpr} / (${blockSize} * 2.0)) + 10000.0;
    } else {
        ${prefix}Coord = floor(${coordExpr} / ${blockSize}) + 20000.0;
    }`

                const glitchLogic = (() => {
                    switch(direction){
                        case 'vertical':
                            return `${varBlock('uv.x', 'block')}
    float blockRand = fract(sin(dot(vec2(blockCoord, time), vec2(12.9898, 78.233))) * 43758.5453);

    if (blockRand > ${intensity}) {
        return ${this.getInput('input', cc, 'uv')};
    }

    float shiftAmt = (fract(sin(dot(vec2(blockCoord * 3.17, time * 1.71), vec2(45.233, 94.117))) * 23421.631) - 0.5) * ${shift};
    vec2 shiftedUV = uv + vec2(0.0, shiftAmt);

    float splitRand = fract(sin(dot(vec2(blockCoord * 7.31, time * 2.13), vec2(67.891, 12.345))) * 54321.987);
    float splitAmt = splitRand * ${rgbSplit};
    vec4 center = ${this.getInput('input', cc, 'shiftedUV')};
    float r = ${this.getInput('input', cc, '(shiftedUV + vec2(0.0, splitAmt))')}.r;
    float b = ${this.getInput('input', cc, '(shiftedUV - vec2(0.0, splitAmt))')}.b;

    return vec4(r, center.g, b, center.a);`

                        case 'both':
                            return `${varBlock('uv.y', 'blockH')}
${varBlock('uv.x', 'blockV')}

    float cellRand = fract(sin(dot(vec2(blockHCoord, blockVCoord), vec2(12.9898, 78.233)) + time * 43.17) * 43758.5453);

    if (cellRand > ${intensity}) {
        return ${this.getInput('input', cc, 'uv')};
    }

    float shiftAngle = fract(sin(dot(vec2(blockHCoord * 3.17, blockVCoord * 7.23), vec2(45.233, 94.117)) + time * 1.71) * 23421.631) * 6.28318;
    float shiftMag = fract(sin(dot(vec2(blockHCoord * 5.71, blockVCoord * 2.93), vec2(31.727, 58.913)) + time * 2.31) * 61283.419) * ${shift};
    vec2 shiftedUV = uv + vec2(cos(shiftAngle), sin(shiftAngle)) * shiftMag;

    float splitRand = fract(sin(dot(vec2(blockHCoord * 7.31 + blockVCoord * 2.17, time * 2.13), vec2(67.891, 12.345))) * 54321.987);
    float splitAmt = splitRand * ${rgbSplit};
    vec2 splitDir = vec2(cos(shiftAngle), sin(shiftAngle));
    vec4 center = ${this.getInput('input', cc, 'shiftedUV')};
    float r = ${this.getInput('input', cc, '(shiftedUV + splitDir * splitAmt)')}.r;
    float b = ${this.getInput('input', cc, '(shiftedUV - splitDir * splitAmt)')}.b;

    return vec4(r, center.g, b, center.a);`

                        case 'horizontal':
                        default:
                            return `${varBlock('uv.y', 'block')}
    float blockRand = fract(sin(dot(vec2(blockCoord, time), vec2(12.9898, 78.233))) * 43758.5453);

    if (blockRand > ${intensity}) {
        return ${this.getInput('input', cc, 'uv')};
    }

    float shiftAmt = (fract(sin(dot(vec2(blockCoord * 3.17, time * 1.71), vec2(45.233, 94.117))) * 23421.631) - 0.5) * ${shift};
    vec2 shiftedUV = uv + vec2(shiftAmt, 0.0);

    float splitRand = fract(sin(dot(vec2(blockCoord * 7.31, time * 2.13), vec2(67.891, 12.345))) * 54321.987);
    float splitAmt = splitRand * ${rgbSplit};
    vec4 center = ${this.getInput('input', cc, 'shiftedUV')};
    float r = ${this.getInput('input', cc, '(shiftedUV + vec2(splitAmt, 0.0))')}.r;
    float b = ${this.getInput('input', cc, '(shiftedUV - vec2(splitAmt, 0.0))')}.b;

    return vec4(r, center.g, b, center.a);`
                    }
                })()

                return `vec4 ${funcName}(vec2 uv) {
    float time = floor(u_time * ${bpm} / 60.0 * ${subdivisions}) + ${stepUniform};
${glitchLogic}
}`
            },
            floatUniformUpdate(uniformName, gl, program){
                if(this.isDestroyed){return}
                if(uniformName.endsWith('_step')){
                    const location = gl.getUniformLocation(program, uniformName)
                    if(location){
                        gl.uniform1f(location, this.runtimeState.stepOffset)
                    }
                }
            }
        }
    }
})
