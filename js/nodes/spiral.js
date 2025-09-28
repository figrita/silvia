import {registerNode} from '../registry.js'

registerNode({
    slug: 'spiral',
    icon: '😵',
    label: 'Spiral',
    tooltip: 'Creates spiral patterns with adjustable turns, thickness, and size.',
    
    input: {
        'foreground': {
            label: 'Foreground',
            type: 'color',
            control: {default: '#ffffffff'}
        },
        'background': {
            label: 'Background',
            type: 'color',
            control: {default: '#000000ff'}
        },
        'turns': {
            label: 'Turns',
            type: 'float',
            control: {default: 5, min: 0.5, max: 20, step: 0.1}
        },
        'thickness': {
            label: 'Thickness',
            type: 'float',
            control: {default: 0.05, min: 0.01, max: 0.5, step: 0.01}
        },
        'innerRadius': {
            label: 'Inner Radius',
            type: 'float',
            control: {default: 0, min: 0, max: 1, step: 0.01}
        },
        'outerRadius': {
            label: 'Outer Radius',
            type: 'float',
            control: {default: 1, min: 0, max: 2, step: 0.01}
        },
        'rotation': {
            label: 'Rotation',
            type: 'float',
            control: {default: 0, min: -4, max: 4, step: 0.001, unit: 'π'}
        }
    },
    
    options: {
        'type': {
            label: 'Type',
            type: 'select',
            default: 'archimedean',
            choices: [
                {value: 'archimedean', name: 'Archimedean'},
                {value: 'logarithmic', name: 'Logarithmic'},
                {value: 'fermat', name: 'Fermat'}
            ]
        }
    },
    
    output: {
        'color': {
            label: 'Color',
            type: 'color',
            genCode(cc, funcName){
                const type = this.getOption('type')
                return `vec4 ${funcName}(vec2 uv) {
    vec4 foreground = ${this.getInput('foreground', cc)};
    vec4 background = ${this.getInput('background', cc)};
    float turns = ${this.getInput('turns', cc)};
    float thickness = ${this.getInput('thickness', cc)};
    float innerRadius = ${this.getInput('innerRadius', cc)};
    float outerRadius = ${this.getInput('outerRadius', cc)};
    float rotation = ${this.getInput('rotation', cc)} * PI;
    
    // Rotate UV
    float cs = cos(rotation);
    float sn = sin(rotation);
    vec2 p = vec2(
        uv.x * cs - uv.y * sn,
        uv.x * sn + uv.y * cs
    );
    
    // Convert to polar coordinates
    float angle = atan(p.y, p.x);
    float dist = length(p);
    
    // Normalize angle to 0-1 range
    float normalizedAngle = (angle + PI) / (2.0 * PI);
    
    // Calculate spiral radius at every possible angle
    float mask = 0.0;
    
    ${type === 'logarithmic' ? `
    // Logarithmic spiral: r = a * e^(b*theta)
    float a = innerRadius + 0.001;
    float b = log((outerRadius + 0.001) / a) / (turns * 2.0 * PI);
    
    // Check multiple windings
    for(float wind = 0.0; wind < turns; wind += 1.0) {
        float theta = (normalizedAngle + wind) * 2.0 * PI;
        float spiralRadius = a * exp(b * theta);
        
        if(spiralRadius >= innerRadius && spiralRadius <= outerRadius) {
            float spiralDist = abs(dist - spiralRadius);
            mask = max(mask, 1.0 - smoothstep(0.0, thickness, spiralDist));
        }
    }
    ` : type === 'fermat' ? `
    // Fermat spiral: r = a * sqrt(theta)
    float a = outerRadius / sqrt(turns * 2.0 * PI);
    
    // Check both arms of the spiral
    for(float sign = -1.0; sign <= 1.0; sign += 2.0) {
        for(float wind = 0.0; wind < turns; wind += 1.0) {
            float theta = (normalizedAngle + wind) * 2.0 * PI;
            float spiralRadius = a * sqrt(theta) * sign;
            spiralRadius = abs(spiralRadius);
            
            if(spiralRadius >= innerRadius && spiralRadius <= outerRadius) {
                float spiralDist = abs(dist - spiralRadius);
                mask = max(mask, 1.0 - smoothstep(0.0, thickness, spiralDist));
            }
        }
    }
    ` : `
    // Archimedean spiral: r = a + b*theta
    float b = (outerRadius - innerRadius) / (turns * 2.0 * PI);
    
    // Check multiple windings
    for(float wind = 0.0; wind < turns; wind += 1.0) {
        float theta = (normalizedAngle + wind) * 2.0 * PI;
        float spiralRadius = innerRadius + b * theta;
        
        if(spiralRadius >= innerRadius && spiralRadius <= outerRadius) {
            float spiralDist = abs(dist - spiralRadius);
            mask = max(mask, 1.0 - smoothstep(0.0, thickness, spiralDist));
        }
    }
    `}
    
    return mix(background, foreground, mask);
}`
            }
        },
        'mask': {
            label: 'Mask',
            type: 'float',
            genCode(cc, funcName){
                const type = this.getOption('type')
                return `float ${funcName}(vec2 uv) {
    float turns = ${this.getInput('turns', cc)};
    float thickness = ${this.getInput('thickness', cc)};
    float innerRadius = ${this.getInput('innerRadius', cc)};
    float outerRadius = ${this.getInput('outerRadius', cc)};
    float rotation = ${this.getInput('rotation', cc)} * PI;
    
    // Rotate UV
    float cs = cos(rotation);
    float sn = sin(rotation);
    vec2 p = vec2(
        uv.x * cs - uv.y * sn,
        uv.x * sn + uv.y * cs
    );
    
    // Convert to polar coordinates
    float angle = atan(p.y, p.x);
    float dist = length(p);
    
    // Normalize angle to 0-1 range
    float normalizedAngle = (angle + PI) / (2.0 * PI);
    
    // Calculate spiral radius at every possible angle
    float mask = 0.0;
    
    ${type === 'logarithmic' ? `
    // Logarithmic spiral
    float a = innerRadius + 0.001;
    float b = log((outerRadius + 0.001) / a) / (turns * 2.0 * PI);
    
    for(float wind = 0.0; wind < turns; wind += 1.0) {
        float theta = (normalizedAngle + wind) * 2.0 * PI;
        float spiralRadius = a * exp(b * theta);
        
        if(spiralRadius >= innerRadius && spiralRadius <= outerRadius) {
            float spiralDist = abs(dist - spiralRadius);
            mask = max(mask, 1.0 - smoothstep(0.0, thickness, spiralDist));
        }
    }
    ` : type === 'fermat' ? `
    // Fermat spiral
    float a = outerRadius / sqrt(turns * 2.0 * PI);
    
    for(float sign = -1.0; sign <= 1.0; sign += 2.0) {
        for(float wind = 0.0; wind < turns; wind += 1.0) {
            float theta = (normalizedAngle + wind) * 2.0 * PI;
            float spiralRadius = a * sqrt(theta) * sign;
            spiralRadius = abs(spiralRadius);
            
            if(spiralRadius >= innerRadius && spiralRadius <= outerRadius) {
                float spiralDist = abs(dist - spiralRadius);
                mask = max(mask, 1.0 - smoothstep(0.0, thickness, spiralDist));
            }
        }
    }
    ` : `
    // Archimedean spiral
    float b = (outerRadius - innerRadius) / (turns * 2.0 * PI);
    
    for(float wind = 0.0; wind < turns; wind += 1.0) {
        float theta = (normalizedAngle + wind) * 2.0 * PI;
        float spiralRadius = innerRadius + b * theta;
        
        if(spiralRadius >= innerRadius && spiralRadius <= outerRadius) {
            float spiralDist = abs(dist - spiralRadius);
            mask = max(mask, 1.0 - smoothstep(0.0, thickness, spiralDist));
        }
    }
    `}
    
    return mask;
}`
            }
        }
    }
})