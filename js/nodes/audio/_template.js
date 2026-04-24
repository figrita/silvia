import {registerNode} from '../../registry.js'
import {audioRuntime} from '../../audioRuntime.js'
// import {autowire, StringToFragment} from '../../utils.js'  // custom UI
// import {getAudioContext} from '../../audioContext.js'      // if you need sampleRate or ctx directly

/**
 * Audio Template — copy this whole file into audio/<yourname>.js, then
 * delete the parts you don't need. Every ctx helper and every node hook
 * appears below at least once, with a one-line "reach for this when…"
 * comment so you can pick the right primitive on first read.
 *
 * What this node does: an LFO-modulated oscillator fed through a
 * one-pole lowpass, with a ring-buffer delay tap mixed in and a
 * gate-triggered step counter. It's intentionally kitchen-sink — every
 * piece is there so you can see the pattern.
 *
 * Core architecture recap (longer version in js/audioCompiler.js):
 *   • The compiler walks upstream from the SynthOut sink and emits a
 *     single per-sample JS loop into the AudioWorklet processor.
 *   • Your node contributes code via `genAudioSetup` (runs per sample,
 *     before outputs) and `output[k].genAudio` (returns an expression
 *     string used downstream).
 *   • State lives on `s.n<id>.<field>`; the engine preserves state
 *     across recompiles so edits don't click.
 *   • Params (knob values with `control`) are push-messaged from main
 *     thread and auto-smoothed unless you opt out.
 */
registerNode({
    slug: 'audio-template',
    icon: '🧩',
    label: 'Audio Template',
    tooltip: 'Reference node — every ctx helper and author hook shown once.',
    workspaceType: 'audio',

    // ─── Inputs ─────────────────────────────────────────────────────────
    // type: 'audio'   → sample-rate signal. No control → must be patched.
    //                   With control → knob that becomes a smoothed param.
    // type: 'action'  → UI trigger. The down/upCallback fire on main thread;
    //                   use audioRuntime.postGate(...) to forward into state.
    //
    // control.smoothMs: N → per-param time constant (default 5 ms)
    // control.smooth: false → skip smoothing, read p.<name> directly. Use
    //                   for stepped controls (bitcrush depth, quantizer step).
    // control.logScale: true → UI knob is log-scale (display only).
    input: {
        'audio':     {label: 'Audio',     type: 'audio', control: null},
        'freq':      {label: 'Freq',      type: 'audio', control: {default: 220,  min: 20,  max: 20000, step: 0.01, unit: 'Hz', logScale: true}},
        'depth':     {label: 'Depth',     type: 'audio', control: {default: 0.5,  min: 0,   max: 1,     step: 0.01}},
        'cutoff':    {label: 'Cutoff',    type: 'audio', control: {default: 1200, min: 20,  max: 20000, step: 0.01, unit: 'Hz', logScale: true, smoothMs: 20}},
        'steps':     {label: 'Steps',     type: 'audio', control: {default: 8,    min: 1,   max: 32,    step: 1,    smooth: false}},
        'mix':       {label: 'Mix',       type: 'audio', control: {default: 0.3,  min: 0,   max: 1,     step: 0.01}},
        'trigger':   {
            label: 'Trig', type: 'action', control: {},
            downCallback(){ audioRuntime.postGate(this.id, 'trigger', 1) },
            upCallback(){   audioRuntime.postGate(this.id, 'trigger', 0) }
        }
    },

    // ─── Outputs ────────────────────────────────────────────────────────
    // Every declared output needs a genAudio(ctx) that returns an expression
    // string. The compiler calls it ONLY if the output is referenced
    // downstream — unused outputs cost nothing.
    //
    // feedback: true → "past-only" output; reads from state, not the current
    //   sample's input. Pairs with genAudioTail below. This is the escape
    //   hatch for cycles (delay lines, self-resonant filters).
    output: {
        'out': {
            label: 'Out',
            type: 'audio',
            genAudio(ctx){
                // Combine setup-produced state with live upstream audio.
                // The _out_* variable is what downstream nodes read.
                const dry = ctx.in('audio')
                const wet = ctx.state('y')
                const mix = ctx.in('mix')
                return `(${dry}) * (1 - (${mix})) + (${wet}) * (${mix})`
            }
        },
        'step': {
            label: 'Step',
            type: 'audio',
            // Second output exposing the current step index as CV.
            // Cheap — the compiler only emits this const if someone wires it.
            genAudio(ctx){ return ctx.state('stepIdx') }
        }
    },

    // ─── Options ────────────────────────────────────────────────────────
    // Baked into generated code at compile time. Changing an option
    // triggers audioRuntime.invalidate() automatically for audio-workspace
    // nodes (see snode.js). Set `manualAudioInvalidate: true` on the node
    // definition to gate that behaviour yourself.
    options: {
        waveform: {
            label: 'Waveform',
            type: 'select',
            default: 'sine',
            choices: [
                {value: 'sine',     name: 'Sine'},
                {value: 'square',   name: 'Square'},
                {value: 'sawtooth', name: 'Saw'},
                {value: 'triangle', name: 'Triangle'}
            ]
        }
    },

    // ─── State ──────────────────────────────────────────────────────────
    // Plain values get deep-cloned per instance.
    //
    // {type: 'ring', seconds|samples: N} declares a ring buffer. The
    // compiler lazy-allocates (pow2-padded Float32Array) on first sample
    // and hides head/mask fields; use ctx.ring() to read/push.
    //
    // For state that needs computing once (wavetables, coefficient tables,
    // impulse responses), implement audioStateAllocator(sampleRate) below.
    // Action-input fields (e.g. 'trigger') need a matching state field so
    // the compiler can register it as a gate; the engine writes the
    // current value there when postGate is called.
    audioState: {
        phase: 0,              // for ctx.phasor
        y: 0,                  // filter state / general-purpose sample store
        trigger: 0,            // gate field (read by audioCompiler.collectGates)
        lastTrigger: 0,        // edge detection
        stepIdx: 0,            // advanced on each rising trigger
        buf: {type: 'ring', seconds: 0.5},
    },

    // ─── Optional main-thread state allocator ──────────────────────────
    // Runs once per compile, before the body executes, with sampleRate
    // available. Return fields to merge into stateInit. Typed arrays pass
    // through by reference; everything else is deep-cloned. mergeState
    // preserves the result across recompiles, so this is one-time work.
    //
    // Delete this if you don't need precomputed tables — ring buffers
    // alone cover most use cases.
    audioStateAllocator(sampleRate){
        // Example: a 2048-sample sine wavetable we could read via linear
        // interp for cheaper-than-Math.sin oscillation. Not actually used
        // in the body below — it's here to demonstrate the pattern.
        const size = 2048
        const table = new Float32Array(size)
        for(let i = 0; i < size; i++){
            table[i] = Math.sin(2 * Math.PI * i / size)
        }
        return {table}
    },

    // ─── Per-sample setup ──────────────────────────────────────────────
    // Wrapped in a `{}` block by the compiler, so local const/let never
    // collide with other nodes. Outputs that reference this node's state
    // read it via ctx.state(), so setup-locals don't need to be visible
    // outside this block.
    //
    // Emit lines with ctx.line(`...`). Use backtick template literals
    // with state refs interpolated — the generated code is plain JS.
    genAudioSetup(ctx){
        // ctx.phasor — advances `s.<nid>.phase` by rate and wraps to
        // [0, TAU). Returns the phase expression so you can feed it to
        // ctx.waveform immediately.
        const lfoPhase = ctx.phasor(ctx.in('freq'))

        // ctx.waveform — a named shape evaluated at a phase expression.
        // ctx.option returns the current option value at compile time;
        // changing it triggers a recompile.
        const lfo = ctx.waveform(lfoPhase, ctx.option('waveform'))

        // ctx.in for a param returns either the smoothed var name
        // (_v_n<id>_depth) or, for smooth:false params, p.<name> directly.
        // You never need to know which — just use the returned expression.
        const depth = ctx.in('depth')
        const cutoff = ctx.in('cutoff')
        const audio = ctx.in('audio')

        // Body-scope constants: PI, TAU, HALF_PI, INV_PI are emitted once
        // per body preamble. Don't inline 6.283185... ever again.

        // ctx.state(f) → `s.n<id>.<f>`. Both reads and writes go through
        // it; the compiler doesn't care which side you use it on.
        const y   = ctx.state('y')
        const trg = ctx.state('trigger')
        const lt  = ctx.state('lastTrigger')
        const idx = ctx.state('stepIdx')

        // ctx.literal(v) — safe compile-time literal injection for values
        // that aren't numbers. Prefer this over `${ctx.option('x')}` when
        // x might be a string: `${literal(x)}` produces `"name"`, bare
        // interpolation produces an un-quoted undefined.
        const defaultSteps = ctx.literal(8)  // baked as 8

        // ctx.ring — zero-runtime-cost inline ring buffer. Declared
        // above with {type: 'ring', seconds: 0.5}. Methods:
        //   r.length        `s.n<id>.buf.length`
        //   r.read(off)     sample `off` samples ago (negatives wrap)
        //   r.push(v)       write + advance, one statement
        //   r.write(v)      write only
        //   r.advance()     advance head only
        const r = ctx.ring('buf')
        const delayedSamp = r.read(`Math.round(sampleRate * 0.25)`)  // 250 ms tap

        // ctx.tmp() → a fresh globally-unique identifier if you need one.
        const tmp = ctx.tmp()

        // Now the actual DSP. Block is scoped so these locals don't leak.
        ctx.line(`
            // Rising-edge gate → step counter advances, wrapping at Steps.
            const _steps = Math.max(1, Math.min(32, Math.round(${ctx.in('steps')} || ${defaultSteps})));
            if(${trg} > 0.5 && ${lt} < 0.5){
                ${idx} = (${idx} + 1) % _steps;
            }
            ${lt} = ${trg};

            // LFO-modulated lowpass: cutoff = base + lfo*depth*base.
            const ${tmp} = Math.max(20, Math.min(sampleRate * 0.45, (${cutoff}) * (1 + (${lfo}) * (${depth}))));
            const _g = 1 - Math.exp(-TAU * ${tmp} / sampleRate);
            ${y} += ((${audio}) + ${delayedSamp} * 0.35 - ${y}) * _g;

            // Feed the filtered sample back into the ring for the tap above.
            ${r.push(y)}
        `)
    },

    // ─── Feedback tail (optional) ──────────────────────────────────────
    // Runs after the sink's _y is computed. Use this from a node with a
    // `feedback: true` output to capture downstream values into state
    // for the next sample. If no output is marked feedback:true, delete
    // this hook.
    //
    // genAudioTail(ctx){
    //     ctx.line(`${ctx.state('prev')} = ${ctx.y};`)
    // },

    // ─── Sink-only hook (SynthOut-style nodes) ─────────────────────────
    // genSinkAudio receives ctx.upstream (the pre-sink sample expression)
    // and returns the final-sample expression. Delete unless you're
    // building a custom audio sink.
    //
    // genSinkAudio(ctx){
    //     return `(${ctx.upstream}) * (${ctx.in('level')})`
    // },

    // ─── Lifecycle hooks ────────────────────────────────────────────────
    // Same set as any SNode: onCreate builds custom DOM in this.customArea,
    // onDestroy tears it down. See audio/mic.js or audio/synthout.js for
    // examples with buttons, canvases, and MediaStream management.
    //
    // onCreate(){ ... },
    // onDestroy(){ ... },
})
