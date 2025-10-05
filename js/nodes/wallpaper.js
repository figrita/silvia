import {registerNode} from '../registry.js'
import {SNode} from '../snode.js'
import {autowire, StringToFragment} from '../utils.js'

// --- Symmetry Type Constants (passed to shader) ---
const SYMMETRY_TYPES = {
    p1: 0, p2: 1,
    pm: 2, pg: 3, cm: 4,
    pmm: 5, pmg: 6, pgg: 7, cmm: 8,
    p4: 9, p4m: 10, p4g: 11,
    p3: 12, p31m: 13, p3m1: 14,
    p6: 15, p6m: 16
}

// --- UI Data: Dropdown options with metadata for hints ---
const symmetryOptions = [
    {value: SYMMETRY_TYPES.p1, name: 'p1 (Generic)', lattice: 'generic'},
    {value: SYMMETRY_TYPES.p2, name: 'p2 (Generic)', lattice: 'generic'},
    {value: SYMMETRY_TYPES.pm, name: 'pm (Rectangular)', lattice: 'rect'},
    {value: SYMMETRY_TYPES.pg, name: 'pg (Rectangular)', lattice: 'rect'},
    {value: SYMMETRY_TYPES.cm, name: 'cm (Rhombic)', lattice: 'rhombic'},
    {value: SYMMETRY_TYPES.pmm, name: 'pmm (Rectangular)', lattice: 'rect'},
    {value: SYMMETRY_TYPES.pmg, name: 'pmg (Rectangular)', lattice: 'rect'},
    {value: SYMMETRY_TYPES.pgg, name: 'pgg (Rectangular)', lattice: 'rect'},
    {value: SYMMETRY_TYPES.cmm, name: 'cmm (Rhombic)', lattice: 'rhombic'},
    {value: SYMMETRY_TYPES.p4, name: 'p4 (Square)', lattice: 'square'},
    {value: SYMMETRY_TYPES.p4m, name: 'p4m (Square)', lattice: 'square'},
    {value: SYMMETRY_TYPES.p4g, name: 'p4g (Square)', lattice: 'square'},
    {value: SYMMETRY_TYPES.p3, name: 'p3 (Hexagonal)', lattice: 'hex'},
    {value: SYMMETRY_TYPES.p31m, name: 'p31m (Hexagonal)', lattice: 'hex'},
    {value: SYMMETRY_TYPES.p3m1, name: 'p3m1 (Hexagonal)', lattice: 'hex'},
    {value: SYMMETRY_TYPES.p6, name: 'p6 (Hexagonal)', lattice: 'hex'},
    {value: SYMMETRY_TYPES.p6m, name: 'p6m (Hexagonal)', lattice: 'hex'}
]

// UI Data: Hint text for each symmetry type to guide the user.
const symmetryHints = {
    [SYMMETRY_TYPES.p1]: 'Generic lattice. Uses Lattice Param. All coeffs are independent.',
    [SYMMETRY_TYPES.p2]: 'Generic lattice with 2-fold rotation. Uses Lattice Param.',
    [SYMMETRY_TYPES.pm]: 'Rectangular lattice with horizontal mirrors. Uses Lattice Param.',
    [SYMMETRY_TYPES.pg]: 'Rectangular lattice with horizontal glides. Uses Lattice Param.',
    [SYMMETRY_TYPES.cm]: 'Rhombic (centered) lattice with diagonal mirrors. Uses Lattice Param.',
    [SYMMETRY_TYPES.pmm]: 'Rectangular lattice with horizontal & vertical mirrors.',
    [SYMMETRY_TYPES.pmg]: 'Rectangular lattice with vertical mirrors & horizontal glides.',
    [SYMMETRY_TYPES.pgg]: 'Rectangular lattice with horizontal & vertical glides.',
    [SYMMETRY_TYPES.cmm]: 'Rhombic (centered) lattice with full mirror symmetry.',
    [SYMMETRY_TYPES.p4]: 'Square lattice with 4-fold rotation. Lattice Param is ignored.',
    [SYMMETRY_TYPES.p4m]: 'Square lattice with 4-fold rotation and diagonal mirrors.',
    [SYMMETRY_TYPES.p4g]: 'Square lattice with 4-fold rotation and diagonal glides.',
    [SYMMETRY_TYPES.p3]: 'Hexagonal lattice with 3-fold rotation. Lattice Param is ignored.',
    [SYMMETRY_TYPES.p31m]: 'Hexagonal lattice with 3-fold rotation and one mirror set.',
    [SYMMETRY_TYPES.p3m1]: 'Hexagonal lattice with 3-fold rotation and another mirror set.',
    [SYMMETRY_TYPES.p6]: 'Hexagonal lattice with 6-fold rotation.',
    [SYMMETRY_TYPES.p6m]: 'Hexagonal lattice with 6-fold rotation and mirrors.'
}


registerNode({
    slug: 'wallpaper',
    icon: '💠',
    label: 'Wallpaper',
    tooltip: 'Generates mathematical wallpaper patterns with various symmetry groups.',

    input: {
        'input': {label: 'Input', type: 'color', control: null},
        'scale': {label: 'Frequency', type: 'float', control: {default: 5.0, min: 0.1, max: 20.0, step: 0.01, unit: '/⬓'}},
        'texScale': {label: 'Texture Scale', type: 'float', control: {default: 0.5, min: 0.01, max: 5.0, step: 0.01}},
        'latticeParam': {label: 'Lattice Param', type: 'float', control: {default: 1.0, min: 0.1, max: 5.0, step: 0.01}},
        'coeff1': {label: 'Coeff 1', type: 'float', control: {default: 1.0, min: -2.0, max: 2.0, step: 0.01}},
        'coeff2': {label: 'Coeff 2', type: 'float', control: {default: 0.5, min: -2.0, max: 2.0, step: 0.01}},
        'coeff3': {label: 'Coeff 3', type: 'float', control: {default: 0.2, min: -2.0, max: 2.0, step: 0.01}},
        'coeff4': {label: 'Coeff 4', type: 'float', control: {default: 0.1, min: -2.0, max: 2.0, step: 0.01}},
        'coeff5': {label: 'Coeff 5', type: 'float', control: {default: 0.0, min: -2.0, max: 2.0, step: 0.01}},
        'coeff6': {label: 'Coeff 6', type: 'float', control: {default: 0.0, min: -2.0, max: 2.0, step: 0.01}}
    },

    output: {
        'output': {
            label: 'Output',
            type: 'color',
            genCode(cc, funcName){
                const inputTexture = this.getInput('input', cc, 'finalUV')
                const scale = this.getInput('scale', cc)
                const texScale = this.getInput('texScale', cc)
                const latticeParam = this.getInput('latticeParam', cc)
                const c1 = this.getInput('coeff1', cc)
                const c2 = this.getInput('coeff2', cc)
                const c3 = this.getInput('coeff3', cc)
                const c4 = this.getInput('coeff4', cc)
                const c5 = this.getInput('coeff5', cc)
                const c6 = this.getInput('coeff6', cc)
                const symmetryType = this.values.symmetryType

                const freqPairs = `
                    const vec2 nm1=vec2(1,0); const vec2 nm2=vec2(0,1);
                    const vec2 nm3=vec2(1,1); const vec2 nm4=vec2(1,-1);
                    const vec2 nm5=vec2(2,1); const vec2 nm6=vec2(1,2);
                `

                return `vec4 ${funcName}(vec2 uv) {
    vec2 z = uv * ${scale};
    vec2 f = vec2(0.0);
    vec2 XY;
    int sym_type = ${symmetryType};

    ${freqPairs}

    if (sym_type <= ${SYMMETRY_TYPES.p2}) { XY = getXY_generic(z, ${latticeParam}); }
    else if (sym_type == ${SYMMETRY_TYPES.cm} || sym_type == ${SYMMETRY_TYPES.cmm}) { XY = getXY_rhombic(z, ${latticeParam}); }
    else if (sym_type >= ${SYMMETRY_TYPES.p4} && sym_type <= ${SYMMETRY_TYPES.p4g}) { XY = getXY_square(z); }
    else if (sym_type >= ${SYMMETRY_TYPES.p3}) { XY = getXY_hex(z); }
    else { XY = getXY_rect(z, ${latticeParam}); }

    if (sym_type == ${SYMMETRY_TYPES.p1}) { f = ${c1}*E_nm(nm1,XY)+${c2}*E_nm(nm2,XY)+${c3}*E_nm(nm3,XY)+${c4}*E_nm(nm4,XY)+${c5}*E_nm(nm5,XY)+${c6}*E_nm(nm6,XY); }
    else if (sym_type == ${SYMMETRY_TYPES.p2}) { f = ${c1}*T_nm(nm1,XY)+${c2}*T_nm(nm2,XY)+${c3}*T_nm(nm3,XY)+${c4}*T_nm(nm4,XY)+${c5}*T_nm(nm5,XY)+${c6}*T_nm(nm6,XY); }
    else if (sym_type == ${SYMMETRY_TYPES.pm}) { f = ${c1}*(E_nm(nm1,XY)+E_nm(vec2(1,-0),XY))+${c2}*(E_nm(nm2,XY)+E_nm(vec2(0,-1),XY))+${c3}*(E_nm(nm3,XY)+E_nm(vec2(1,-1),XY))+${c4}*(E_nm(nm5,XY)+E_nm(vec2(2,-1),XY)); }
    else if (sym_type == ${SYMMETRY_TYPES.pg}) { f = ${c1}*(E_nm(nm1,XY)-E_nm(vec2(1,-0),XY))+${c2}*(E_nm(nm2,XY)+E_nm(vec2(0,-1),XY))+${c3}*(E_nm(nm3,XY)-E_nm(vec2(1,-1),XY))+${c4}*(E_nm(vec2(2,1),XY)+E_nm(vec2(2,-1),XY)); }
    else if (sym_type == ${SYMMETRY_TYPES.cm}) { f = ${c1}*(E_nm(nm1,XY)+E_nm(nm2,XY))+${c2}*E_nm(nm3,XY)+${c3}*(E_nm(nm5,XY)+E_nm(nm6,XY))+${c4}*E_nm(vec2(2,2),XY); }
    else if (sym_type == ${SYMMETRY_TYPES.pmm}) { f = ${c1}*T_nm(nm1,XY)+${c2}*T_nm(nm2,XY)+${c3}*T_nm(nm3,XY); }
    else if (sym_type == ${SYMMETRY_TYPES.pmg}) { f = ${c1}*T_nm(nm2,XY)+${c2}*(T_nm(nm1,XY)-T_nm(vec2(1,-0),XY))+${c3}*(T_nm(nm3,XY)-T_nm(vec2(1,-1),XY)); }
    else if (sym_type == ${SYMMETRY_TYPES.pgg}) { f = ${c1}*T_nm(nm3,XY)+${c2}*(T_nm(nm1,XY)-T_nm(vec2(1,-0),XY))+${c3}*(T_nm(nm2,XY)-T_nm(vec2(0,-1),XY)); }
    else if (sym_type == ${SYMMETRY_TYPES.cmm}) { f = ${c1}*T_nm(nm3,XY)+${c2}*(T_nm(nm1,XY)+T_nm(nm2,XY))+${c3}*(T_nm(nm5,XY)+T_nm(nm6,XY)); }
    else if (sym_type == ${SYMMETRY_TYPES.p4}) { f = ${c1}*S_nm(nm1,XY)+${c2}*S_nm(nm2,XY)+${c3}*S_nm(nm3,XY)+${c4}*S_nm(nm5,XY); }
    else if (sym_type == ${SYMMETRY_TYPES.p4m}) { f = ${c1}*S_nm(nm1,XY)+${c2}*S_nm(nm3,XY)+${c3}*(S_nm(nm5,XY)+S_nm(nm6,XY))+${c4}*S_nm(vec2(2,0),XY); }
    else if (sym_type == ${SYMMETRY_TYPES.p4g}) { f = ${c1}*S_nm(nm3,XY)+${c2}*(S_nm(nm1,XY)-S_nm(nm2,XY))+${c3}*(S_nm(nm5,XY)-S_nm(nm6,XY))+${c4}*S_nm(vec2(2,2),XY); }
    else if (sym_type == ${SYMMETRY_TYPES.p3}) { f = ${c1}*W_nm(nm1,XY)+${c2}*W_nm(nm2,XY)+${c3}*W_nm(nm3,XY)+${c4}*W_nm(nm5,XY); }
    else if (sym_type == ${SYMMETRY_TYPES.p31m}) { f = ${c1}*(W_nm(nm1,XY)+W_nm(nm2,XY))+${c2}*W_nm(nm3,XY)+${c3}*(W_nm(nm5,XY)+W_nm(nm6,XY))+${c4}*W_nm(vec2(2,0),XY); }
    else if (sym_type == ${SYMMETRY_TYPES.p3m1}) { f = ${c1}*(W_nm(nm1,XY)+W_nm(vec2(0,-1),XY))+${c2}*(W_nm(nm2,XY)+W_nm(vec2(-1,0),XY))+${c3}*W_nm(nm3,XY); }
    else if (sym_type == ${SYMMETRY_TYPES.p6}) { f = ${c1}*(W_nm(nm1,XY)+W_nm(-nm1,XY))+${c2}*(W_nm(nm2,XY)+W_nm(-nm2,XY))+${c3}*(W_nm(nm3,XY)+W_nm(-nm3,XY)); }
    else if (sym_type == ${SYMMETRY_TYPES.p6m}) { f = ${c1}*W_nm(nm1,XY)+${c2}*W_nm(nm3,XY)+${c3}*(W_nm(nm5,XY)+W_nm(nm6,XY)); }

    vec2 finalUV = (f.xy * ${texScale}) + 0.5;
    return ${inputTexture};
}`
            }
        }
    },

    values: {
        symmetryType: SYMMETRY_TYPES.p6m
    },

    onCreate(){
        if(!this.customArea){return}

        const html = `
            <div style="padding: 0.5rem; display:flex; flex-direction:column; gap: 0.5rem;">
                <div class="custom-control-group">
                    <label for="${this.id}-symmetryType">Symmetry Type</label>
                    <select class="slct" id="${this.id}-symmetryType" data-el="symmetrySelect">
                        ${symmetryOptions.map(opt => `<option value="${opt.value}" data-lattice="${opt.lattice}" title="${symmetryHints[opt.value]}">${opt.name}</option>`).join('')}
                    </select>
                </div>
                <textarea data-el="hint" rows="3" readonly style="font-size: 0.8rem; color: var(--text-muted); padding: 0.2rem 0.4rem; background: var(--bg-secondary); border-radius: 4px; border: 1px solid var(--border-subtle); resize: none; min-height: 3.5em; width: 100%; box-sizing: border-box;"></textarea>
                <div style="margin-top: 0.5rem; font-size: 0.75rem; opacity: 0.7; font-style: italic;">
                    Based on "Creating Symmetry" by Frank A. Farris
                </div>
            </div>
        `
        const fragment = StringToFragment(html)
        this.elements = autowire(fragment)
        this.customArea.appendChild(fragment)
        
        this.elements.symmetrySelect.value = this.values.symmetryType

        this.elements.symmetrySelect.addEventListener('change', e => {
            this.values.symmetryType = parseInt(e.target.value)
            this._updateHint()
            SNode.refreshDownstreamOutputs(this)
        })
        
        this._updateHint()
    },

    _updateHint(){
        if(this.elements.hint){
            this.elements.hint.textContent = symmetryHints[this.values.symmetryType] || ''
        }
    },
    
    shaderUtils: [
        `vec2 cmul(vec2 a, vec2 b) { return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x); }`,
        `vec2 cexp_i(float angle) { return vec2(cos(angle), sin(angle)); }`,
        `vec2 getXY_square(vec2 z) { return z; }`,
        `vec2 getXY_hex(vec2 z) { return vec2(z.x + z.y/sqrt(3.0), 2.0*z.y/sqrt(3.0)); }`,
        `vec2 getXY_rect(vec2 z, float L) { return vec2(z.x, z.y / max(0.001, L)); }`,
        `vec2 getXY_rhombic(vec2 z, float b) { float b_safe = max(0.001, b); return vec2(z.x + z.y/(2.0*b_safe), z.x - z.y/(2.0*b_safe)); }`,
        `vec2 getXY_generic(vec2 z, float L) { vec2 omega = vec2(0.5, L); float eta = max(0.001, omega.y); return vec2(z.x - (omega.x/eta)*z.y, z.y/eta); }`,
        `vec2 E_nm(vec2 nm, vec2 XY) { return cexp_i(2.0 * PI * dot(nm, XY)); }`,
        `vec2 W_nm(vec2 nm, vec2 XY) {
            vec2 nm2 = vec2(nm.y, -nm.x - nm.y);
            vec2 nm3 = vec2(-nm.x - nm.y, nm.x);
            return (E_nm(nm, XY) + E_nm(nm2, XY) + E_nm(nm3, XY)) / 3.0;
        }`,
        `vec2 S_nm(vec2 nm, vec2 XY) {
            vec2 nm2 = vec2(nm.y, -nm.x);
            vec2 nm3 = vec2(-nm.x, -nm.y);
            vec2 nm4 = vec2(-nm.y, nm.x);
            return (E_nm(nm, XY) + E_nm(nm2, XY) + E_nm(nm3, XY) + E_nm(nm4, XY)) / 4.0;
        }`,
        `vec2 T_nm(vec2 nm, vec2 XY) { return (E_nm(nm, XY) + E_nm(-nm, XY)) * 0.5; }`
    ]
})