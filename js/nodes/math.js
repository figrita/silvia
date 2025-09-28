import {registerNode} from '../registry.js'

// Sine node
registerNode({
    slug: 'sine',
    icon: '∿',
    label: 'Sine',
    tooltip: 'Generates sine wave patterns with adjustable frequency, phase, and amplitude.',
    input: {
        'input': {
            label: 'Input',
            type: 'float',
            control: {default: 0, min: -10, max: 10, step: 0.01}
        },
        'frequency': {
            label: 'Frequency',
            type: 'float',
            control: {default: 1, min: 0.01, max: 10, step: 0.01, unit: 'x'}
        },
        'phase': {
            label: 'Phase',
            type: 'float',
            control: {default: 0, min: -4, max: 4, step: 0.001, unit: 'π'}
        },
        'amplitude': {
            label: 'Amplitude',
            type: 'float',
            control: {default: 1, min: 0, max: 10, step: 0.01}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'float',
            genCode(cc, funcName){
                const input = this.getInput('input', cc)
                const freq = this.getInput('frequency', cc)
                const phase = this.getInput('phase', cc)
                const amp = this.getInput('amplitude', cc)
                
                return `float ${funcName}(vec2 uv) {
    float phaseRad = ${phase} * PI;
    return sin((${input} * ${freq} * 2.0 * PI) + phaseRad) * ${amp};
}`
            }
        }
    }
})

// Cosine node
registerNode({
    slug: 'cosine',
    icon: '∼',
    label: 'Cosine',
    tooltip: 'Generates cosine wave patterns with adjustable frequency, phase, and amplitude. Similar to sine but 90° phase shifted.',
    input: {
        'input': {
            label: 'Input',
            type: 'float',
            control: {default: 0, min: -10, max: 10, step: 0.01}
        },
        'frequency': {
            label: 'Frequency',
            type: 'float',
            control: {default: 1, min: 0.01, max: 10, step: 0.01, unit: 'x'}
        },
        'phase': {
            label: 'Phase',
            type: 'float',
            control: {default: 0, min: -4, max: 4, step: 0.001, unit: 'π'}
        },
        'amplitude': {
            label: 'Amplitude',
            type: 'float',
            control: {default: 1, min: 0, max: 10, step: 0.01}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'float',
            genCode(cc, funcName){
                const input = this.getInput('input', cc)
                const freq = this.getInput('frequency', cc)
                const phase = this.getInput('phase', cc)
                const amp = this.getInput('amplitude', cc)
                
                return `float ${funcName}(vec2 uv) {
    float phaseRad = ${phase} * PI;
    return cos((${input} * ${freq} * 2.0 * PI) + phaseRad) * ${amp};
}`
            }
        }
    }
})

// Add node
registerNode({
    slug: 'add',
    icon: '➕',
    label: 'Add',
    tooltip: 'Adds two numbers together. Outputs A + B.',
    input: {
        'a': {
            label: 'A',
            type: 'float',
            control: {default: 0, min: -100, max: 100, step: 0.01}
        },
        'b': {
            label: 'B',
            type: 'float',
            control: {default: 0, min: -100, max: 100, step: 0.01}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'float',
            genCode(cc, funcName){
                return `float ${funcName}(vec2 uv) {
    return ${this.getInput('a', cc)} + ${this.getInput('b', cc)};
}`
            }
        }
    }
})

// Subtract node
registerNode({
    slug: 'subtract',
    icon: '➖',
    label: 'Subtract',
    tooltip: 'Subtracts B from A. Outputs A - B.',
    input: {
        'a': {
            label: 'A',
            type: 'float',
            control: {default: 0, min: -100, max: 100, step: 0.01}
        },
        'b': {
            label: 'B',
            type: 'float',
            control: {default: 0, min: -100, max: 100, step: 0.01}
        }
    },
    output: {
        'output': {
            label: 'A - B',
            type: 'float',
            genCode(cc, funcName){
                return `float ${funcName}(vec2 uv) {
    return ${this.getInput('a', cc)} - ${this.getInput('b', cc)};
}`
            }
        }
    }
})

// Multiply node
registerNode({
    slug: 'multiply',
    icon: '✖',
    label: 'Multiply',
    tooltip: 'Multiplies two numbers together. Useful for scaling values or applying gain. Outputs A × B.',
    input: {
        'input': {
            label: 'A',
            type: 'float',
            control: {default: 1.0, min: -100, max: 100, step: 0.01}
        },
        'gain': {
            label: 'B',
            type: 'float',
            control: {default: 1.0, min: -100, max: 100, step: 0.01}
        }
    },
    output: {
        'output': {
            label: 'A × B',
            type: 'float',
            genCode(cc, funcName){
                return `float ${funcName}(vec2 uv) {
    return ${this.getInput('input', cc)} * ${this.getInput('gain', cc)};
}`
            }
        }
    }
})

// Divide node
registerNode({
    slug: 'divide',
    icon: '➗',
    label: 'Divide',
    tooltip: 'Divides A by B with built-in division by zero protection. Outputs A ÷ B.',
    input: {
        'a': {
            label: 'A',
            type: 'float',
            control: {default: 1, min: -100, max: 100, step: 0.01}
        },
        'b': {
            label: 'B',
            type: 'float',
            control: {default: 1, min: -100, max: 100, step: 0.01}
        }
    },
    output: {
        'output': {
            label: 'A ÷ B',
            type: 'float',
            genCode(cc, funcName){
                return `float ${funcName}(vec2 uv) {
    float divisor = ${this.getInput('b', cc)};
    // Prevent division by zero
    if(abs(divisor) < 0.00001) {
        return 0.0;
    }
    return ${this.getInput('a', cc)} / divisor;
}`
            }
        }
    }
})

// Power node
registerNode({
    slug: 'power',
    icon: '🏒',
    label: 'Power',
    tooltip: 'Raises base to the power of exponent. Handles negative bases safely. Outputs Base ^ Exponent.',
    input: {
        'base': {
            label: 'Base',
            type: 'float',
            control: {default: 2, min: 0, max: 10, step: 0.01}
        },
        'exponent': {
            label: 'Exponent',
            type: 'float',
            control: {default: 2, min: -10, max: 10, step: 0.01}
        }
    },
    output: {
        'output': {
            label: 'Base ^ Exp',
            type: 'float',
            genCode(cc, funcName){
                return `float ${funcName}(vec2 uv) {
    float base = ${this.getInput('base', cc)};
    float exp = ${this.getInput('exponent', cc)};
    
    // Handle negative bases with care
    if(base < 0.0 && mod(exp, 1.0) != 0.0) {
        return 0.0; // Undefined for negative base with non-integer exponent
    }
    
    return pow(abs(base), exp) * sign(base);
}`
            }
        }
    }
})

// Modulo node
registerNode({
    slug: 'modulo',
    icon: '🪙',
    label: 'Modulo',
    tooltip: 'Returns the remainder of A divided by B. Useful for creating repeating patterns and cycles. Outputs A mod B.',
    input: {
        'a': {
            label: 'A',
            type: 'float',
            control: {default: 1, min: -100, max: 100, step: 0.01}
        },
        'b': {
            label: 'B',
            type: 'float',
            control: {default: 1, min: -100, max: 100, step: 0.01}
        }
    },
    output: {
        'output': {
            label: 'A ⁒ B',
            type: 'float',
            genCode(cc, funcName){
                return `float ${funcName}(vec2 uv) {
    float b = ${this.getInput('b', cc)};
    if(abs(b) < 0.00001) {
        return 0.0;
    }
    return mod(${this.getInput('a', cc)}, b);
}`
            }
        }
    }
})

// Absolute value node
registerNode({
    slug: 'abs',
    icon: '🏓',
    label: 'Absolute',
    tooltip: 'Returns the absolute value, removing the sign. Converts negative numbers to positive. Outputs |Input|.',
    input: {
        'input': {
            label: 'Input',
            type: 'float',
            control: {default: 0, min: -100, max: 100, step: 0.01}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'float',
            genCode(cc, funcName){
                return `float ${funcName}(vec2 uv) {
    return abs(${this.getInput('input', cc)});
}`
            }
        }
    }
})

// Ceil node
registerNode({
    slug: 'ceil',
    icon: '⬆',
    label: 'Ceil',
    tooltip: 'Rounds up to the nearest integer. Always rounds toward positive infinity.',
    input: {
        'input': {
            label: 'Input',
            type: 'float',
            control: {default: 0, min: -100, max: 100, step: 0.01}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'float',
            genCode(cc, funcName){
                return `float ${funcName}(vec2 uv) {
    return ceil(${this.getInput('input', cc)});
}`
            }
        }
    }
})

// Floor node
registerNode({
    slug: 'floor',
    icon: '⬇',
    label: 'Floor',
    tooltip: 'Rounds down to the nearest integer. Always rounds toward negative infinity.',
    input: {
        'input': {
            label: 'Input',
            type: 'float',
            control: {default: 0, min: -100, max: 100, step: 0.01}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'float',
            genCode(cc, funcName){
                return `float ${funcName}(vec2 uv) {
    return floor(${this.getInput('input', cc)});
}`
            }
        }
    }
})

// Max node
registerNode({
    slug: 'max',
    icon: '⬆️',
    label: 'Max',
    tooltip: 'Returns the larger of two values. Useful for clamping minimum values.',
    input: {
        'a': {
            label: 'A',
            type: 'float',
            control: {default: 0, min: -100, max: 100, step: 0.01}
        },
        'b': {
            label: 'B',
            type: 'float',
            control: {default: 0, min: -100, max: 100, step: 0.01}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'float',
            genCode(cc, funcName){
                return `float ${funcName}(vec2 uv) {
    return max(${this.getInput('a', cc)}, ${this.getInput('b', cc)});
}`
            }
        }
    }
})

// Min node
registerNode({
    slug: 'min',
    icon: '⬇️',
    label: 'Min',
    tooltip: 'Returns the smaller of two values. Useful for clamping maximum values.',
    input: {
        'a': {
            label: 'A',
            type: 'float',
            control: {default: 0, min: -100, max: 100, step: 0.01}
        },
        'b': {
            label: 'B',
            type: 'float',
            control: {default: 0, min: -100, max: 100, step: 0.01}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'float',
            genCode(cc, funcName){
                return `float ${funcName}(vec2 uv) {
    return min(${this.getInput('a', cc)}, ${this.getInput('b', cc)});
}`
            }
        }
    }
})

// ATan2 node
registerNode({
    slug: 'atan2',
    icon: '🧭',
    label: 'ATan2',
    tooltip: 'Returns the angle from the positive X-axis to the point (X,Y) in π-radians. Useful for converting coordinates to angles.',
    input: {
        'x': {
            label: 'X',
            type: 'float',
            control: {default: 1, min: -100, max: 100, step: 0.01}
        },
        'y': {
            label: 'Y',
            type: 'float',
            control: {default: 0, min: -100, max: 100, step: 0.01}
        }
    },
    output: {
        'output': {
            label: 'Angle',
            type: 'float',
            genCode(cc, funcName){
                return `float ${funcName}(vec2 uv) {
    return atan(${this.getInput('y', cc)}, ${this.getInput('x', cc)}) / PI;
}`
            }
        }
    }
})