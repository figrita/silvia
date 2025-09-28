import {registerNode} from '../registry.js'

// Define the GLSL helper functions required for Perlin noise.
const MOD289_VEC3 = `vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }`
const MOD289_VEC4 = `vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }`
const PERMUTE = `vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }`
const TAYLOR_INV_SQRT = `vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472090914 * r; }`
const CNOISE_GLSL = `
// Classic Perlin noise
float cnoise(vec3 P) {
    vec3 Pi0 = floor(P);
    vec3 Pi1 = Pi0 + vec3(1.0);
    Pi0 = mod289(Pi0);
    Pi1 = mod289(Pi1);
    vec3 Pf0 = fract(P);
    vec3 Pf1 = Pf0 - vec3(1.0);
    vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
    vec4 iy = vec4(Pi0.yy, Pi1.yy);
    vec4 iz0 = Pi0.zzzz;
    vec4 iz1 = Pi1.zzzz;
    vec4 ixy = permute(permute(ix) + iy);
    vec4 ixy0 = permute(ixy + iz0);
    vec4 ixy1 = permute(ixy + iz1);
    vec4 gx0 = ixy0 * (1.0 / 7.0);
    vec4 gy0 = fract(floor(gx0) * (1.0 / 7.0)) - 0.5;
    gx0 = fract(gx0);
    vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
    vec4 sz0 = step(gz0, vec4(0.0));
    gx0 -= sz0 * (step(0.0, gx0) - 0.5);
    gy0 -= sz0 * (step(0.0, gy0) - 0.5);
    vec4 gx1 = ixy1 * (1.0 / 7.0);
    vec4 gy1 = fract(floor(gx1) * (1.0 / 7.0)) - 0.5;
    gx1 = fract(gx1);
    vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);
    vec4 sz1 = step(gz1, vec4(0.0));
    gx1 -= sz1 * (step(0.0, gx1) - 0.5);
    gy1 -= sz1 * (step(0.0, gy1) - 0.5);
    vec3 g000 = vec3(gx0.x,gy0.x,gz0.x);
    vec3 g100 = vec3(gx0.y,gy0.y,gz0.y);
    vec3 g010 = vec3(gx0.z,gy0.z,gz0.z);
    vec3 g110 = vec3(gx0.w,gy0.w,gz0.w);
    vec3 g001 = vec3(gx1.x,gy1.x,gz1.x);
    vec3 g101 = vec3(gx1.y,gy1.y,gz1.y);
    vec3 g011 = vec3(gx1.z,gy1.z,gz1.z);
    vec3 g111 = vec3(gx1.w,gy1.w,gz1.w);
    vec4 norm0 = taylorInvSqrt(vec4(dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110)));
    g000 *= norm0.x; g010 *= norm0.y; g100 *= norm0.z; g110 *= norm0.w;
    vec4 norm1 = taylorInvSqrt(vec4(dot(g001, g001), dot(g011, g011), dot(g101, g101), dot(g111, g111)));
    g001 *= norm1.x; g011 *= norm1.y; g101 *= norm1.z; g111 *= norm1.w;
    float n000 = dot(g000, Pf0);
    float n100 = dot(g100, vec3(Pf1.x, Pf0.yz));
    float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z));
    float n110 = dot(g110, vec3(Pf1.xy, Pf0.z));
    float n001 = dot(g001, vec3(Pf0.xy, Pf1.z));
    float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
    float n011 = dot(g011, vec3(Pf0.x, Pf1.yz));
    float n111 = dot(g111, Pf1);
    vec3 fade = Pf0 * Pf0 * Pf0 * (Pf0 * (Pf0 * 6.0 - 15.0) + 10.0);
    vec4 n_z = mix(vec4(n000, n100, n010, n110), vec4(n001, n101, n011, n111), fade.z);
    vec2 n_yz = mix(n_z.xy, n_z.zw, fade.y);
    float n_xyz = mix(n_yz.x, n_yz.y, fade.x);
    return 2.2 * n_xyz;
}`

registerNode({
    slug: 'perlinnoise',
    icon: '☁️',
    label: 'Perlin Noise',
    tooltip: 'Generates smooth, natural-looking noise patterns. This effect won an Oscar in Tron!',
    input: {
        'foreground': {label: 'Foreground', type: 'color', control: {default: '#ffffffff'}},
        'background': {label: 'Background', type: 'color', control: {default: '#000000ff'}},
        'scale': {label: 'Scale', type: 'float', control: {default: 10.0, min: 0.1, max: 100.0, step: 0.1}},
        'timeSpeed': {label: 'Time Speed', type: 'float', control: {default: 0.5, min: 0.0, max: 5.0, step: 0.01}},
        'contrast': {label: 'Contrast', type: 'float', control: {default: 1.0, min: 0.0, max: 5.0, step: 0.01}}
    },
    output: {
        'color': {
            label: 'Color',
            type: 'color',
            genCode(cc, funcName){
                const scale = this.getInput('scale', cc)
                const timeSpeed = this.getInput('timeSpeed', cc)
                const foreground = this.getInput('foreground', cc)
                const background = this.getInput('background', cc)
                const contrast = this.getInput('contrast', cc)

                return `vec4 ${funcName}(vec2 uv) {
    vec2 scaled_uv = uv * ${scale};
    
    vec3 noiseCoord = vec3(scaled_uv, u_time * ${timeSpeed});
    
    // cnoise() is available because we defined it above
    float noiseValue = cnoise(noiseCoord);
    
    // Map noise from [-1, 1] to [0, 1]
    float normalizedNoise = (noiseValue + 1.0) * 0.5;
    
    // Apply contrast
    float contrastedNoise = (normalizedNoise - 0.5) * ${contrast} + 0.5;
    contrastedNoise = clamp(contrastedNoise, 0.0, 1.0);
    
    // Mix colors based on the final noise value
    return mix(${background}, ${foreground}, contrastedNoise);
}`
            }
        },
        'mask': {
            label: 'Mask',
            type: 'float',
            range: '[0, 1]',
            genCode(cc, funcName){
                const scale = this.getInput('scale', cc)
                const timeSpeed = this.getInput('timeSpeed', cc)
                const contrast = this.getInput('contrast', cc)

                return `float ${funcName}(vec2 uv) {
    vec2 scaled_uv = uv * ${scale};
    
    vec3 noiseCoord = vec3(scaled_uv, u_time * ${timeSpeed});
    
    // cnoise() is available because we defined it above
    float noiseValue = cnoise(noiseCoord);
    
    // Map noise from [-1, 1] to [0, 1]
    float normalizedNoise = (noiseValue + 1.0) * 0.5;
    
    // Apply contrast
    float contrastedNoise = (normalizedNoise - 0.5) * ${contrast} + 0.5;
    contrastedNoise = clamp(contrastedNoise, 0.0, 1.0);
    
    return contrastedNoise;
}`
            }
        }
    },
    // The compiler will see this and inject these GLSL strings into the final shader.
    shaderUtils: [MOD289_VEC3, MOD289_VEC4, PERMUTE, TAYLOR_INV_SQRT, CNOISE_GLSL]
})