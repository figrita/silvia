import {registerNode} from '../registry.js'

registerNode({
    slug: 'kaleidoscope',
    icon: '🌸',
    label: 'Kaleidoscope',
    tooltip: 'Creates kaleidoscope effects by reflecting input in triangular segments. Choose source segment and style for different patterns.',
    input: {
        'input': {
            label: 'Input',
            type: 'color',
            control: null
        },
        'segments': {
            label: 'Segments',
            type: 'float',
            control: {default: 6, min: 2, max: 32, step: 1}
        },
        'offset': {
            label: 'Offset',
            type: 'float',
            control: {default: 0, min: -1, max: 1, step: 0.01, unit: '⬓'}
        },
        'twist': {
            label: 'Twist',
            type: 'float',
            control: {default: 0, min: -5, max: 5, step: 0.01}
        },
        'zoom': {
            label: 'Zoom',
            type: 'float',
            control: {default: 1.0, min: 0.1, max: 5.0, step: 0.01}
        },
        'sourceSegment': {
            label: 'Source Segment',
            type: 'float',
            control: {default: 1, min: 1, max: 6, step: 1}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const segments = this.getInput('segments', cc)
                const offset = this.getInput('offset', cc)
                const twist = this.getInput('twist', cc)
                const zoom = this.getInput('zoom', cc)
                const sourceSegment = this.getInput('sourceSegment', cc)
                const style = this.getOption('style')

                const modeLogic = (() => {
                    switch(style){
                        case 'continuous':
                            return `
        // --- Continuous Mode ---
        // This mode repeats the source wedge without mirroring, creating a rotating fan effect.
        {
            float r = length(p_in);
            float a = atan(p_in.y, p_in.x);
            a += r * ${twist};
            r /= ${zoom};
            
            float segmentAngle = 2.0 * PI / ${segments};
            float sourceIndex = floor(${sourceSegment} - 1.0);
            float localAngle = mod(a, segmentAngle) + (sourceIndex * segmentAngle);
            
            r += ${offset};
            
            sampleUV = vec2(r * cos(localAngle), r * sin(localAngle));
        }`
                        case 'spiral':
                            return `
        // --- Spiral Mode ---
        // This unwraps the polar coordinates, mapping angle to the U (x) axis
        // and inverse radius to the V (y) axis, creating a tunnel-like spiral.
        {
            float r = length(p_in);
            float a = atan(p_in.y, p_in.x);
            
            // Apply twist directly to the angle
            a += r * ${twist};

            // Map angle to the U coordinate, offset by source segment
            float sourceIndex = floor(${sourceSegment} - 1.0);
            float u = fract((a + sourceIndex * 2.0 * PI / ${segments}) / (2.0 * PI) * ${segments});

            // Map inverse radius to the V coordinate, affected by zoom
            // Adding a small value to r avoids division by zero at the center
            float v = (1.0 / max(r, 0.001)) / ${zoom};
            
            // Apply radial offset
            v += ${offset};
            
            // Convert from [0,1] texture space back to [-1,1] world space for sampling
            sampleUV = vec2(u * 2.0 - 1.0, v * 2.0 - 1.0);
        }`
                        case 'classic':
                        default:
                            return `
        // --- Classic Mode ---
        // Mirrors every other wedge to create perfect symmetry, like a traditional kaleidoscope.
        {
            float r = length(p_in);
            float a = atan(p_in.y, p_in.x);
            a += r * ${twist};
            r /= ${zoom};
            
            float segmentAngle = 2.0 * PI / ${segments};
            float segmentIndex = floor(a / segmentAngle);
            float localAngle = mod(a, segmentAngle);
            
            // This is the core of the classic effect: mirror every other segment.
            if (mod(segmentIndex, 2.0) == 1.0) {
                localAngle = segmentAngle - localAngle;
            }
            
            // Offset to the source segment
            float sourceIndex = floor(${sourceSegment} - 1.0);
            localAngle += sourceIndex * segmentAngle;
            
            r += ${offset};

            // The y-compression is a stylistic choice for the 'classic' look.
            sampleUV = vec2(
                r * cos(localAngle),
                r * sin(localAngle) * 0.5 
            );
        }`
                    }
                })()

                return `vec4 ${funcName}(vec2 uv) {
    vec2 p_in = uv;
    vec2 sampleUV;

    ${modeLogic}
    
    return ${this.getInput('input', cc, 'sampleUV')};
}`
            }
        }
    },
    options: {
        'style': {
            label: 'Style',
            type: 'select',
            default: 'classic',
            choices: [
                {value: 'classic', name: 'Classic'},
                {value: 'continuous', name: 'Continuous'},
                {value: 'spiral', name: 'Spiral'}
            ]
        }
    },
    
    onCreate(){
        if(!this.nodeEl){return}

        const segmentsControl = this.nodeEl.querySelector('[data-input-el=\"segments\"]')
        const sourceSegmentControl = this.nodeEl.querySelector('[data-input-el=\"sourceSegment\"]')

        if(segmentsControl && sourceSegmentControl){
            // This listener updates the 'max' attribute of the sourceSegment control
            // whenever the number of segments changes.
            segmentsControl.addEventListener('change', () => {
                const newMax = parseInt(segmentsControl.value, 10)

                // Update the max property of the s-number element
                sourceSegmentControl.max = newMax

                // Also update the attribute for serialization
                sourceSegmentControl.setAttribute('max', newMax)

                // Clamp the current value if it's now out of bounds
                if(parseInt(sourceSegmentControl.value, 10) > newMax){
                    sourceSegmentControl.value = newMax
                    // Manually trigger a change event so the node can react if needed
                    sourceSegmentControl.dispatchEvent(new Event('change', {bubbles: true}))
                }
            })
        }
    }
})