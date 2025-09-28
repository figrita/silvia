export const shaderUtils = {
    RGB2HSV: `vec3 rgb2hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}`,

    HSV2RGB: `vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}`,

    RGB2LUM: `float rgb2lum(vec3 color) {
    return dot(color, vec3(0.299, 0.587, 0.114));
}`,
    RANDOM: `float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
}`,

    HASH_RANDOM: `
// Hash-based random function - much better than sin/fract approach
// Credit: Stack Overflow answer by Spatial (2013)
// https://stackoverflow.com/questions/4200224/random-noise-functions-for-glsl

// Bob Jenkins' One-At-A-Time hashing algorithm
uint hash_rng(uint x) {
    x += (x << 10u);
    x ^= (x >> 6u);
    x += (x << 3u);
    x ^= (x >> 11u);
    x += (x << 15u);
    return x;
}

uint hash_rng(uvec2 v) { return hash_rng(v.x ^ hash_rng(v.y)); }

// Construct float in [0:1] range from mantissa bits
float floatConstruct_rng(uint m) {
    const uint ieeeMantissa = 0x007FFFFFu;
    const uint ieeeOne = 0x3F800000u;
    m &= ieeeMantissa;
    m |= ieeeOne;
    float f = uintBitsToFloat(m);
    return f - 1.0;
}

float random_rng(vec2 v) { return floatConstruct_rng(hash_rng(floatBitsToUint(v))); }
`,
    SLIDERULE_NORMALIZE: `
// basis ID: 0=[0,1], 1=[0,360], 2=[-1,1], 3=[0,255], 5=[0,2PI]
float normalize_sliderule(float val, int basis) {
    if (basis == 1) return val / 360.0;
    if (basis == 2) return (val + 1.0) / 2.0;
    if (basis == 3) return val / 255.0;
    if (basis == 5) return val / (2.0 * PI);
    return val; // basis 0 is already normalized
}`,
    SLIDERULE_EXPAND: `
// basis ID: 0=[0,1], 1=[0,360], 2=[-1,1], 3=[0,255], 5=[0,2PI]
float expand_sliderule(float val, int basis) {
    if (basis == 1) return val * 360.0;
    if (basis == 2) return (val * 2.0) - 1.0;
    if (basis == 3) return val * 255.0;
    if (basis == 5) return val * (2.0 * PI);
    return val; // basis 0
}`,

    BITMAP_FONT: `
// Based on https://www.shadertoy.com/view/XtBSWz by Nikos Papadopoulos, 4rknova / 2015 WTFPL
// Based on FlyGuy's shader: https://www.shadertoy.com/view/llSGRm
// Bitmap font data for debug text rendering
#define FONTSC_SZ vec2(2.5, 5.0)
#define SCREEN_SZ vec2(800.0, 600.0)
#define CHR vec4(6.0,7.0,6.0*FONTSC_SZ.x,9.0*FONTSC_SZ.y)
#define DWN_SC 2.0

// Character definitions - numbers and basic symbols only
vec2 c_per = vec2(0,1560), c_dsh = vec2(7,1572864), c_0 = vec2(935221,731292);
vec2 c_1 = vec2(274497,33308), c_2 = vec2(934929,1116222), c_3 = vec2(934931,1058972);
vec2 c_4 = vec2(137380,1302788), c_5 = vec2(2048263,1058972), c_6 = vec2(401671,1190044);
vec2 c_7 = vec2(2032673,66576), c_8 = vec2(935187,1190044), c_9 = vec2(935187,1581336);

vec2 digit(float d) {
    float z = floor(d);
    if (z == 0.) return c_0; else if (z == 1.) return c_1;
    else if (z == 2.) return c_2; else if (z == 3.) return c_3;
    else if (z == 4.) return c_4; else if (z == 5.) return c_5;
    else if (z == 6.) return c_6; else if (z == 7.) return c_7;
    else if (z == 8.) return c_8; else if (z == 9.) return c_9;
    return c_0;
}

float bit(float n, float b) {
    b = clamp(b,-1.0,22.0);
    return floor(mod(floor(n / pow(2.0,floor(b))),2.0));
}

float spr(vec2 sprite, vec2 size, vec2 uv) {
    uv = floor(uv / FONTSC_SZ);
    float b = (size.x - uv.x - 1.0) + uv.y * size.x;
    bool bounds = all(greaterThanEqual(uv,vec2(0.0))) && all(lessThan(uv,size));
    return bounds ? bit(sprite.x, b - 21.0) + bit(sprite.y, b) : 0.0;
}

float print_char(vec2 ch, vec2 pos, vec2 uv) {
    return spr(ch, CHR.xy, uv - pos);
}

float print_number(float number, vec2 pos, vec2 uv, float decimalPlaces) {
    float result = 0.0;
    vec2 charPos = pos;
    
    // Handle negative numbers
    if (number < 0.0) {
        result += print_char(c_dsh, charPos, uv);
        charPos.x += CHR.z;
        number = -number;
    }
    
    // Print integer part
    float intPart = floor(number);
    if (intPart == 0.0) {
        result += print_char(c_0, charPos, uv);
        charPos.x += CHR.z;
    } else {
        // Print up to 6 digits
        float temp = intPart;
        float digitCount = 0.0;
        while (temp >= 1.0 && digitCount < 6.0) {
            temp /= 10.0;
            digitCount += 1.0;
        }
        
        // Print digits from left to right
        for (float i = 0.0; i < 6.0; i += 1.0) {
            if (i >= digitCount) break;
            float divisor = pow(10.0, digitCount - i - 1.0);
            float digit_val = floor(mod(intPart / divisor, 10.0));
            result += print_char(digit(digit_val), charPos, uv);
            charPos.x += CHR.z;
        }
    }
    
    // Print decimal point and fractional part if decimalPlaces > 0
    if (decimalPlaces > 0.0) {
        result += print_char(c_per, charPos, uv);
        charPos.x += CHR.z;
        
        float fracPart = fract(number);
        for (float i = 0.0; i < 4.0; i += 1.0) {
            if (i >= decimalPlaces) break;
            fracPart *= 10.0;
            float digit_val = floor(fracPart);
            result += print_char(digit(digit_val), charPos, uv);
            charPos.x += CHR.z;
            fracPart = fract(fracPart);
        }
    }
    
    return result;
}

`,

    SIMPLEX2D: `
// Simplex 2D noise
vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }

float snoise(vec2 v){
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                       -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy) );
    vec2 x0 = v -   i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
    + i.x + vec3(0.0, i1.x, 1.0 ));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
      dot(x12.zw,x12.zw)), 0.0);
    m = m*m ;
    m = m*m ;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
}`,

    SIMPLEX3D: `
// Simplex 3D noise
vec3 mod289_3d(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289_3d(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute3d(vec4 x) { return mod289_3d(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt3d(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise3(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    
    // First corner
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    
    // Other corners
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    
    // Permutations
    i = mod289_3d(i);
    vec4 p = permute3d(permute3d(permute3d(
        i.z + vec4(0.0, i1.z, i2.z, 1.0))
        + i.y + vec4(0.0, i1.y, i2.y, 1.0))
        + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    
    // Gradients
    float n_ = 0.142857142857; // 1.0/7.0
    vec3 ns = n_ * D.wyz - D.xzx;
    
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    
    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    
    // Normalize gradients
    vec4 norm = taylorInvSqrt3d(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;
    
    // Mix contributions
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}`
}