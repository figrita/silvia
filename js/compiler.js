class CompileContext{
    constructor(input){
        this.functions = new Set()
        this.utils = new Set()
        this.uniforms = new Map()
        this.visited = new Set()
        this.input = input
    }

    build(){
        const mainFunctionBody = this.input.get(this, 'uv')
        const finalCode = `#version 300 es
    precision highp float;
    precision highp int;
    precision highp sampler2DArray;

    const float PI = 3.14159265359;
    
    // Uniforms
    uniform vec2 u_resolution;
    uniform float u_time;
    uniform sampler2DArray u_frame_history;
    uniform int u_current_frame_index;
    uniform int u_frame_buffer_size; // Now a uniform
    
    ${Array.from(this.uniforms.entries()).map(([name, def]) => {
            return `uniform ${def.type} ${name};`
        }).join('\n')}

    out vec4 fragColor;

    vec3 hsv2rgb2(vec3 c) {
        vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
        vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
        return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    }

    vec4 defaultUvMap(vec2 uv) {
        float hue = (atan(uv.y, uv.x) / (2.0 * 3.14159)) + 0.5;
        float saturation = length(uv) * 0.7;
        float value = 0.95;
        hue = fract(hue - u_time * 0.05);
        saturation = clamp(saturation, 0.0, 1.0);
        return vec4(hsv2rgb2(vec3(hue, saturation, value)), 1.0);
    }

    // Utilities
    ${Array.from(this.utils).join('\n')}

    // Node Functions
    ${Array.from(this.functions).join('\n')}

    void main() {
        vec2 screenUV = gl_FragCoord.xy / u_resolution;
        float aspectRatio = u_resolution.x / u_resolution.y;
        vec2 uv = vec2((2.0 * screenUV.x - 1.0) * aspectRatio, 2.0 * screenUV.y - 1.0);
        fragColor = ${mainFunctionBody};
    }
    `
        const uniformProviders = []
        for(const [name, def] of this.uniforms.entries()){
            uniformProviders.push({
                uniformName: name,
                type: def.type,
                sourcePort: def.sourcePort || null,
                sourceControl: def.sourceControl || null
            })
        }
        return {
            shaderCode: finalCode,
            uniformProviders,
            removeUniformProvider(nodeInstance){
                this.uniformProviders = this.uniformProviders.filter(provider =>
                    !provider.sourcePort || provider.sourcePort.parent !== nodeInstance
                )
            },
            removeAllUniformProviders(){
                this.uniformProviders = []
            }
        }
    }
}

export function compile(input, frameBufferSize){
    console.log('Starting shader compilation...')

    try {
        if(!input.connection){
            console.warn('No input connected to output node. Compilation aborted.')
            return null
        }
        const cc = new CompileContext(input)
        const result = cc.build()
        console.log('Shader compiled successfully!')
        console.log('Final shader code:')
        console.log(result.shaderCode)
        return result
    } catch(error){
        console.error('Shader compilation failed:', error)
        return null
    }
}

export async function compileAsync(input, frameBufferSize, onProgress = null){
    console.log('Starting async shader compilation...')

    try {
        if(!input.connection){
            console.warn('No input connected to output node. Compilation aborted.')
            return null
        }

        if(onProgress) onProgress('Building shader graph...')

        // Yield to main thread during compilation
        await new Promise(resolve => setTimeout(resolve, 0))

        const cc = new CompileContext(input)
        const result = cc.build()

        if(onProgress) onProgress('Shader code generated successfully')

        console.log('Async shader compiled successfully!')
        console.log('Final shader code:')
        console.log(result.shaderCode)
        return result
    } catch(error){
        console.error('Async shader compilation failed:', error)
        if(onProgress) onProgress('Compilation failed')
        return null
    }
}