/**
 * audioCompiler.js — visited-recursive, pull-based audio compiler.
 *
 * Pass 1 walks upstream from the sink, recording which (node, outputKey)
 * pairs are referenced anywhere downstream. Pass 2 emits in topological
 * order: optional node-level setup (genAudioSetup) followed by `const`
 * declarations for each *requested* output, in declaration order. Outputs
 * that aren't referenced are never evaluated — their genAudio is not
 * called and no code is emitted for them.
 *
 * Per-output genAudio mirrors the video compiler's per-output genCode:
 * each output port owns its own expression generator.
 *
 * Output shape:
 *   {
 *     body:       string,   // for new Function(s, p, inputs, ch0, ch1,
 *                            //                 blockSize, sampleRate, body)
 *     stateInit:  object,   // per-nid initial state, plus reserved `_psmooth`
 *     params:     Map,      // name → {node, inputKey, init, min, max}
 *     gateMap:    object,   // nid → {actionKey: initialValue}
 *     micNodes:   Node[],   // discovery order; defines engine input slots
 *     sinkNode:   Node
 *   }
 *
 * Node authoring:
 *   output[k].genAudio(ctx)
 *     Required for every declared output. Returns the expression string
 *     used wherever this output is referenced. Called only for outputs
 *     that are actually used downstream.
 *
 *   node.genAudioSetup(ctx)
 *     Optional. Runs once per sample, before any of this node's outputs
 *     are evaluated. Use it for shared state updates that multiple
 *     outputs read from. Emit lines via ctx.line(); they're wrapped in
 *     a scoping block so local const/let declarations don't leak across
 *     nodes. Outputs read state via ctx.state(), not setup-locals.
 *
 *   node.genSinkAudio(ctx)
 *     Sink-only. Receives `ctx.upstream` (the pre-sink expression) and
 *     returns the final-sample expression assigned to ch0[i].
 *
 *   output[k].feedback === true
 *     Marks an output as past-only — its value is forward-declared at
 *     the TOP of the per-sample loop from this node's state, so
 *     consumers that emit before this node can still reference it.
 *     Semantically this means the output reads state as captured at
 *     the start of the iteration, i.e. from the previous sample's
 *     tail. Pass 1 stops walking upstream from such an output so
 *     cycles compile without infinite recursion; pass 1.5 walks the
 *     node's inputs separately and defers the node's position in
 *     `order` until after those upstreams, so modulators (e.g. an LFO
 *     into delay.time) emit before the feedback node's setup reads
 *     them.
 *
 *   node.genAudioTail(ctx)
 *     Required-with-feedback. Runs at the end of each loop iteration,
 *     after the sink's _y is computed. Captures the just-computed
 *     downstream values via ctx.in() and writes them into state for
 *     the next iteration to read.
 *
 *   node.audioStateAllocator(sampleRate) → {fields}
 *     Optional main-thread hook for state that depends on sampleRate
 *     or that's cheaper to compute once (wavetables, impulse responses,
 *     biquad coefficient tables). Returned fields are merged into the
 *     node's stateInit. Typed arrays pass through by reference;
 *     everything else is deep-cloned. mergeState preserves the result
 *     across recompiles so the allocation is one-time per node.
 *
 * ctx surface:
 *   ctx.in(key)      Connected → upstream output var (`_out_n<id>_<key>`).
 *                    Unconnected float w/ control → smoothed param ref
 *                    (`_v_n<id>_<key>`). Else → '0'.
 *   ctx.state(f)     `s.n<id>.<f>`.
 *   ctx.option(k)    Option value baked at compile time (literal).
 *   ctx.line(stmt)   Append a statement at this point in the loop body.
 *   ctx.tmp()        Fresh globally-unique temp name.
 *   ctx.ring(key)    Ring-buffer helper. Requires the state field to be
 *                    declared as `{type: 'ring', seconds|samples: N}`;
 *                    the compiler emits lazy pow2 allocation and the
 *                    hidden head/mask fields. Returns inline-emitting
 *                    primitives:
 *                      .length        → `s.n<id>.<key>.length`
 *                      .read(off)     → sample `off` samples back
 *                                        (bitmask wraps negatives)
 *                      .write(v)      → write at head, no advance
 *                      .advance()     → bump head by one with wrap
 *                      .push(v)       → write + advance, one statement
 *                      .head          → the head l-value if you need it
 *                    All strings are plain JS — no per-sample calls.
 *   ctx.phasor(rate[, stateKey])
 *                    Emit per-sample advance + wrap of a phase
 *                    accumulator; returns the phase expression.
 *                    Default state field is 'phase'.
 *   ctx.waveform(phaseExpr, shape)
 *                    Return a waveform expression evaluated at phase
 *                    (radians, `[0, TAU)`). Shapes: 'sine', 'square',
 *                    'sawtooth', 'triangle'.
 *   ctx.literal(v)   JSON-stringify a compile-time value for safe
 *                    embedding in generated code. Prefer this over
 *                    `${ctx.option('x')}` when x may be a string.
 *   ctx.upstream     (sink only) the expression for the pre-sink sample.
 *   ctx.y            (tails only) the literal '_y' — the just-computed
 *                    sink output sample. Use it from a sink's
 *                    genAudioTail to capture rendered audio into state
 *                    for a feedback output (`output.out` with
 *                    feedback: true → tap the speaker output one
 *                    sample later).
 *   ctx.micIdx       (mic nodes) the engine-input slot index assigned.
 *   ctx.sr / ctx.i   Literals 'sampleRate' / 'i'.
 *
 * Body-scope constants (emitted once in the preamble, visible to
 * every expression): PI, TAU, HALF_PI, INV_PI.
 *
 * Smoothing overrides per port:
 *   port.control.smoothMs  Custom time constant in ms (default 5).
 *   port.control.smooth: false
 *                         Skip smoothing entirely; expression reads
 *                         p.<name> directly. Use for gate-like /
 *                         stepped controls that should snap.
 */

import {deepClone} from './utils.js'

export class AudioCompileError extends Error {
    constructor(message){
        super(message)
        this.name = 'AudioCompileError'
    }
}

/**
 * Typed-array-safe clone for audio state. The node-authoring surface may
 * hand us Float32Arrays (from audioStateAllocator, or eventually from
 * declarative buffer types) that deepClone would iterate the wrong way.
 * We pass those by reference — they're freshly minted per compile, so
 * sharing isn't a concern. Plain objects still get a recursive clone.
 */
function cloneAudioState(src){
    const out = {}
    for(const k in src){
        const v = src[k]
        if(ArrayBuffer.isView(v)) out[k] = v
        else if(v === null || typeof v !== 'object') out[k] = v
        else out[k] = deepClone(v)
    }
    return out
}

/**
 * Split a node's audioState into plain fields + ring-buffer declarations.
 *
 * A field declared as `{type: 'ring', seconds: N}` (or `{type: 'ring',
 * samples: N}`) becomes three real state fields under the bufKey:
 *   <bufKey>         — the Float32Array (null until first-sample alloc)
 *   _<bufKey>Head    — write-head index, wraps via bitmask
 *   _<bufKey>Mask    — length - 1 (buffer is padded to next pow2)
 *
 * The spec object itself never reaches the worklet; it drives the emitter.
 */
function extractRings(audioState){
    const rings = []
    const plainInit = {}
    for(const k in (audioState || {})){
        const v = audioState[k]
        if(v && typeof v === 'object' && !ArrayBuffer.isView(v) && v.type === 'ring'){
            if(typeof v.seconds !== 'number' && typeof v.samples !== 'number'){
                throw new AudioCompileError(
                    `Ring state '${k}' must specify 'seconds' or 'samples'.`
                )
            }
            rings.push({bufKey: k, spec: v})
            plainInit[k] = null
            plainInit[`_${k}Head`] = 0
            plainInit[`_${k}Mask`] = 0
        } else {
            plainInit[k] = v
        }
    }
    return {stateInit: cloneAudioState(plainInit), rings}
}

function currentControlValue(node, inputKey){
    // Ask the node for its live input value. SNode.getInputValue reads
    // the DOM when the node is rendered and falls back to the port
    // default; nodes with custom controls can override the hook.
    if(typeof node.getInputValue === 'function'){
        return node.getInputValue(inputKey)
    }
    return node.input?.[inputKey]?.control?.default ?? 0
}

class CompileContext {
    constructor(sampleRate = 0){
        this.sampleRate = sampleRate
        this.params = new Map()
        this.stateInit = Object.create(null)
        this.gateMap = Object.create(null)
        this.micNodes = []
        this.tmpCounter = 0

        // Pass 1 — usage collection.
        this.usage = new Map()    // nodeId → {node, usedOutputs: Set<outKey>}
        this.order = []           // nodeIds in post-order (topological)
        this.visiting = new Set()

        // Pass 2 — emission. Lines accumulated here become the main loop
        // body. Tail lines run at the end of each iteration, after the
        // sink's _y is computed but before the sample is written; they
        // capture downstream values into feedback-node state for the
        // next iteration.
        this.lines = []
        this.tailLines = []

        // Nodes whose output is `feedback: true` and which therefore
        // need their inputs walked in pass 1.5 and a tail emitted.
        this.feedbackNodes = []

        // Forward-declarations for feedback outputs. These read state
        // only, so they're emitted at the top of the per-sample loop —
        // before any consumer runs — letting nodes that reference a
        // feedback output compile in topological order without the
        // feedback node itself having to be emitted first.
        // (Their value is the state from the previous iteration, which
        // is the semantics of `feedback: true` anyway — "past-only".)
        this.feedbackDecls = []

        // Deduped `order` push. A node reached via both a normal and a
        // feedback output would otherwise get pushed twice (once from
        // markUsedOutput, once from walkFeedbackInputs).
        this._orderSet = new Set()

        // Ring-buffer declarations per node, collected during emit.
        // Keyed by node.id → Array<{bufKey, spec}>. ctx.ring(key)
        // looks its node up here to build the read/push helpers.
        this._rings = new Map()
    }

    _pushOrder(nodeId){
        if(this._orderSet.has(nodeId)) return
        this._orderSet.add(nodeId)
        this.order.push(nodeId)
    }

    registerParam(node, inputKey){
        const name = `n${node.id}_${inputKey}`
        if(!this.params.has(name)){
            const port = node.input[inputKey]
            const ctrl = port.control || {}
            // `smooth: false` → expression references p.<name> directly
            // (gate-like params, quantizer steps, bitcrush depth — they
            // should snap). Otherwise params get a per-sample one-pole
            // lowpass with τ = smoothMs (default 5 ms).
            const smoothed = ctrl.smooth !== false
            const smoothMs = Number.isFinite(ctrl.smoothMs) ? ctrl.smoothMs : 5
            this.params.set(name, {
                node, inputKey,
                init: currentControlValue(node, inputKey),
                min: ctrl.min,
                max: ctrl.max,
                smoothed,
                smoothMs
            })
        }
        return this.params.get(name).smoothed ? `_v_${name}` : `p.${name}`
    }

    /** Register a smoothed param that ISN'T tied to a declared input
     *  port — for custom-UI nodes (fourtrack channel strips, etc.) that
     *  want zipper-free knob drags without making every knob a port.
     *  Same name scheme as port-derived params (`n<id>_<key>`), so
     *  audioRuntime.setNodeParam(nodeId, key, v) flows the value
     *  through unchanged; the auto-listener in _attachParamListeners
     *  silently skips since there's no matching `data-input-el`.
     *  Author wires the UI control to setNodeParam directly. */
    registerCustomParam(node, key, init, opts){
        const o = opts || {}
        const name = `n${node.id}_${key}`
        if(!this.params.has(name)){
            const smoothed = o.smooth !== false
            const smoothMs = Number.isFinite(o.smoothMs) ? o.smoothMs : 5
            this.params.set(name, {
                node, inputKey: key,
                init: Number.isFinite(init) ? init : 0,
                min: o.min,
                max: o.max,
                smoothed,
                smoothMs
            })
        }
        return this.params.get(name).smoothed ? `_v_${name}` : `p.${name}`
    }

    collectGates(node){
        const nid = `n${node.id}`
        const slot = this.stateInit[nid]
        if(!slot) return
        for(const key in (node.input || {})){
            const port = node.input[key]
            if(port?.type === 'action' && key in slot){
                this.gateMap[nid] = this.gateMap[nid] || {}
                this.gateMap[nid][key] = slot[key] ?? 0
            }
        }
    }

    // --- Pass 1: usage collection ---

    /** Walk every connected input of the sink. The sink itself isn't a
     *  producing node, but goes into `visiting` so any back-edge that
     *  references it as an output source is caught as a cycle. */
    markSinkInputs(sinkNode){
        this.visiting.add(sinkNode.id)
        try {
            this._recurseInputs(sinkNode)
        } finally {
            this.visiting.delete(sinkNode.id)
        }
    }

    markUsedOutput(node, outputKey){
        const outPort = node.output?.[outputKey]
        if(!outPort){
            throw new AudioCompileError(
                `Node ${node.slug}#${node.id} has no output named '${outputKey}'.`
            )
        }
        // A `feedback: true` output reads from state, not from this
        // sample's input — so it can sit in a cycle without infinite
        // recursion. Don't recurse into the node's inputs from here;
        // pass 1.5 picks them up after the main walk.
        const isFeedback = !!outPort.feedback
        if(this.visiting.has(node.id) && !isFeedback){
            throw new AudioCompileError(
                `Feedback cycle at node ${node.slug}#${node.id}. ` +
                `Break the cycle with an explicit delay (an output marked feedback: true).`
            )
        }
        const existing = this.usage.get(node.id)
        if(existing){
            existing.usedOutputs.add(outputKey)
            // Still need to register as a feedback node if this output is one.
            if(isFeedback && !this.feedbackNodes.includes(node)){
                this.feedbackNodes.push(node)
            }
            return
        }
        // Don't double-add to visiting if we entered via a path that
        // already marked this node — happens when the sink itself is
        // referenced as a feedback output during its own input walk.
        const alreadyVisiting = this.visiting.has(node.id)
        if(!alreadyVisiting) this.visiting.add(node.id)
        const entry = {node, usedOutputs: new Set([outputKey])}
        this.usage.set(node.id, entry)
        try {
            // Mic slot index is assigned by discovery order in pass 1.
            if(node.slug === 'audio-mic' && !this.micNodes.includes(node)){
                this.micNodes.push(node)
            }
            if(isFeedback){
                if(!this.feedbackNodes.includes(node)) this.feedbackNodes.push(node)
            } else {
                this._recurseInputs(node)
            }
        } finally {
            if(!alreadyVisiting) this.visiting.delete(node.id)
        }
        // Feedback-only discoveries defer their order push until pass
        // 1.5 has walked their inputs — otherwise any modulators reached
        // through those inputs (e.g. an LFO into delay.time) end up
        // emitted *after* the feedback node that reads them, and the
        // generated body hits TDZ on the forward reference.
        if(!isFeedback) this._pushOrder(node.id)
    }

    /** Pass 1.5 — walk the inputs of every feedback node so any nodes
     *  on the feedback path that aren't otherwise reachable from the
     *  sink still get emitted. Existing-usage nodes short-circuit
     *  inside markUsedOutput, so already-walked subgraphs are cheap.
     *
     *  After draining the walk, push feedback nodes in reverse
     *  discovery order so that nested feedback chains (Y consumes X's
     *  feedback output, where both are feedback nodes) emit their
     *  setup in dependency order — innermost first. */
    walkFeedbackInputs(){
        for(let i = 0; i < this.feedbackNodes.length; i++){
            this._recurseInputs(this.feedbackNodes[i])
        }
        for(let i = this.feedbackNodes.length - 1; i >= 0; i--){
            this._pushOrder(this.feedbackNodes[i].id)
        }
    }

    _recurseInputs(node){
        for(const key in (node.input || {})){
            const port = node.input[key]
            if(port?.connection){
                this.markUsedOutput(port.connection.parent, port.connection.key)
            }
        }
    }

    // --- Pass 2: emission ---

    _makeCtx(node, {sinkUpstreamExpr = null, lineSink = null} = {}){
        const nid = `n${node.id}`
        const micIdx = node.slug === 'audio-mic' ? this.micNodes.indexOf(node) : -1
        const cc = this
        const sink = lineSink || cc.lines

        const ctx = {
            sr: 'sampleRate',
            i: 'i',
            nid,
            micIdx,
            // The just-computed sink output sample. Only valid inside
            // genAudioTail (tails run after `const _y = …;` is emitted).
            y: '_y',

            in(inputKey){
                const port = node.input?.[inputKey]
                if(!port) return '0'
                if(port.connection){
                    const upNid = `n${port.connection.parent.id}`
                    return `_out_${upNid}_${port.connection.key}`
                }
                // Knob inputs become smoothed params. `audio` and
                // `float` are equivalent here — a knob is a constant
                // audio signal (DC), and float is the legacy name kept
                // for hybrid nodes (button, bpmclock) that also live
                // in the video graph.
                if((port.type === 'audio' || port.type === 'float') && port.control){
                    return cc.registerParam(node, inputKey)
                }
                return '0'
            },

            state(f){ return `s.${nid}.${f}` },
            option(k){ return node.optionValues?.[k] ?? node.options?.[k]?.default },
            line(stmt){ sink.push(stmt) },
            tmp(){ return `_t_${nid}_${cc.tmpCounter++}` },

            /**
             * Ring-buffer helper. Returns inline-emitting read/write
             * primitives for a state field declared as
             * `{type: 'ring', seconds|samples: N}`. All returned
             * strings are plain JS expressions/statements — no
             * per-sample function calls, no indirection.
             *
             *   r.length              `s.n<id>.<key>.length`
             *   r.read(offsetExpr)    sample from `offsetExpr` samples
             *                         back; negative/large offsets
             *                         wrap automatically via bitmask.
             *   r.write(valueExpr)    write to head (no advance).
             *   r.advance()           bump head by one (wrap).
             *   r.push(valueExpr)     write + advance as one statement.
             *   r.head                the head index l-value if you
             *                         need to manipulate it directly.
             */
            ring(bufKey){
                const rings = cc._rings.get(node.id) || []
                if(!rings.some(r => r.bufKey === bufKey)){
                    throw new AudioCompileError(
                        `ctx.ring('${bufKey}') on ${node.slug}#${node.id} ` +
                        `requires audioState.${bufKey} to be declared as ` +
                        `{type: 'ring', seconds|samples: N}.`
                    )
                }
                const buf  = `s.${nid}.${bufKey}`
                const head = `s.${nid}._${bufKey}Head`
                const mask = `s.${nid}._${bufKey}Mask`
                return {
                    length: `${buf}.length`,
                    head,
                    read(offsetExpr){
                        return `${buf}[((${head}) - (${offsetExpr})) & ${mask}]`
                    },
                    write(valueExpr){
                        return `${buf}[${head}] = (${valueExpr});`
                    },
                    advance(){
                        return `${head} = (${head} + 1) & ${mask};`
                    },
                    push(valueExpr){
                        return `${buf}[${head}] = (${valueExpr}); ${head} = (${head} + 1) & ${mask};`
                    }
                }
            },

            /**
             * Phasor — emits the per-sample advance + wrap for a phase
             * accumulator and returns the phase expression so callers
             * can evaluate a waveform on it. The node must declare the
             * phase field in its audioState:
             *
             *   audioState: { phase: 0 }
             *   genAudioSetup(ctx){
             *       const phase = ctx.phasor(ctx.in('freq'))
             *       ctx.line(`${ctx.state('out')} = Math.sin(${phase});`)
             *   }
             *
             * The phase advances by `rate * TAU / sampleRate` per sample
             * and wraps to `[0, TAU)` in both directions (supports
             * negative rates for reverse sweeps). Override the state
             * field name with the second argument for nodes that
             * carry multiple phasors.
             */
            phasor(rateExpr, stateKey = 'phase'){
                const phase = `s.${nid}.${stateKey}`
                sink.push(`${phase} += (${rateExpr}) * TAU / sampleRate;`)
                sink.push(`if(${phase} >= TAU) ${phase} -= TAU;`)
                sink.push(`else if(${phase} < 0) ${phase} += TAU;`)
                return phase
            },

            /**
             * Waveform — evaluate a named shape at a phase expression
             * (phase is in radians, `[0, TAU)`). Supported shapes:
             * 'sine', 'square', 'sawtooth', 'triangle'. Unknown names
             * fall back to sine so new shapes can be added without
             * breaking saved patches.
             */
            waveform(phaseExpr, shape){
                switch(shape){
                    case 'square':   return `((${phaseExpr}) < PI ? 1 : -1)`
                    case 'sawtooth': return `((${phaseExpr}) * INV_PI - 1)`
                    case 'triangle': return `(2 * Math.abs((${phaseExpr}) * INV_PI - 1) - 1)`
                    case 'sine':
                    default:         return `Math.sin(${phaseExpr})`
                }
            },

            /**
             * Bake any JS-literal-compatible value into generated code.
             * Strings get quoted, numbers/booleans/null pass through,
             * plain objects JSON-stringify. Use this for option values
             * and config that need to appear inside emitted code, to
             * avoid the silent-undefined trap when an author inlines
             * `${ctx.option('x')}` into a template where x is a string.
             */
            literal(value){
                if(value === undefined) return 'undefined'
                return JSON.stringify(value)
            },

            /**
             * Smoothed param for custom-UI nodes — registers a param
             * not tied to a declared input port and returns the same
             * `_v_n<id>_<key>` smoothed reference that ctx.in() returns
             * for knob-driven inputs. Author wires their UI control to
             *     audioRuntime.setNodeParam(this.id, key, value)
             * on input. Body uses the returned expression in place of
             * a baked-in literal, so knob drags cause zero recompiles
             * and the engine's built-in one-pole smoother (default 5 ms)
             * keeps the audio zipper-free.
             *
             * `init` is the value the smoother starts at on first
             * compile (and on subsequent compiles where mergeState
             * doesn't already have the carry-over slot in `_psmooth`).
             * `opts` mirrors the input-port control's smooth-related
             * fields: {smooth: false, smoothMs, min, max}.
             */
            smoothParam(key, init, opts){
                return cc.registerCustomParam(node, key, init, opts)
            }
        }
        if(sinkUpstreamExpr !== null){
            ctx.upstream = sinkUpstreamExpr
        }
        return ctx
    }

    /** Wrap setup output in a block so any const/let it declares is
     *  scoped to this node and can't collide with another instance of
     *  the same node type. If the setup emitted no lines, drop the
     *  empty block to keep the body tidy. */
    _withSetupBlock(target, setupFn){
        const before = target.length
        target.push(`{`)
        setupFn()
        if(target.length === before + 1){
            target.pop()
        } else {
            target.push(`}`)
        }
    }

    /** Pass 3 — emit each feedback node's tail. Tails run after the
     *  sink's _y is computed, so they can reference downstream values
     *  (`_out_n<x>_<k>`) that closed the cycle this iteration. */
    emitFeedbackTails(){
        for(const node of this.feedbackNodes){
            if(typeof node.genAudioTail !== 'function') continue
            const ctx = this._makeCtx(node, {lineSink: this.tailLines})
            this._withSetupBlock(this.tailLines, () => node.genAudioTail.call(node, ctx))
        }
    }

    emitNode(node, usedOutputs){
        const nid = `n${node.id}`
        const {stateInit, rings} = extractRings(node.audioState)

        // Optional main-thread hook for state that can't be expressed
        // declaratively — precomputed wavetables, impulse responses,
        // coefficient tables. Runs once per compile; mergeState in the
        // worklet preserves the resulting typed arrays across
        // recompiles so the allocation cost is one-time per node.
        if(typeof node.audioStateAllocator === 'function'){
            const extra = node.audioStateAllocator.call(node, this.sampleRate)
            if(extra && typeof extra === 'object'){
                for(const k in extra){
                    const v = extra[k]
                    stateInit[k] = ArrayBuffer.isView(v) ? v : deepClone(v)
                }
            }
        }

        this.stateInit[nid] = stateInit
        if(rings.length) this._rings.set(node.id, rings)
        this.collectGates(node)

        // Ring buffers allocate lazily on first sample (because length
        // depends on sampleRate). Pad to next pow2 so reads/writes can
        // use `& mask` instead of `% length`; the bitmask also
        // correctly wraps negative offsets in JS integer coercion.
        for(const {bufKey, spec} of rings){
            const buf  = `s.${nid}.${bufKey}`
            const mask = `s.${nid}._${bufKey}Mask`
            const reqExpr = spec.samples != null
                ? `(${spec.samples} | 0)`
                : `(Math.ceil((${spec.seconds}) * sampleRate) + 1)`
            this.lines.push(
                `if(!${buf}){ const _req = Math.max(2, ${reqExpr}); ` +
                `const _len = 1 << (32 - Math.clz32(_req - 1)); ` +
                `${buf} = new Float32Array(_len); ${mask} = _len - 1; }`
            )
        }

        const ctx = this._makeCtx(node)

        if(typeof node.genAudioSetup === 'function'){
            this._withSetupBlock(this.lines, () => node.genAudioSetup.call(node, ctx))
        }

        // Emit only requested outputs, in declaration order. Output
        // expressions read state and outer-scope params/upstream vars,
        // so the per-node setup block scope above doesn't restrict them.
        for(const outKey in (node.output || {})){
            if(!usedOutputs.has(outKey)) continue
            const outPort = node.output[outKey]
            if(typeof outPort.genAudio !== 'function'){
                throw new AudioCompileError(
                    `Output '${outKey}' on ${node.slug}#${node.id} is missing genAudio.`
                )
            }
            const expr = outPort.genAudio.call(node, ctx)
            if(typeof expr !== 'string'){
                throw new AudioCompileError(
                    `Output '${outKey}' on ${node.slug}#${node.id} genAudio must return an expression string.`
                )
            }
            // feedback outputs read state only; hoist them to the top
            // of the loop body so consumers can reference them even
            // when their emit order places them before this node.
            const line = `const _out_${nid}_${outKey} = ${expr};`
            if(outPort.feedback){
                this.feedbackDecls.push(line)
            } else {
                this.lines.push(line)
            }
        }
    }

    /** Final-expression emit for the sink. Setup + outputs are handled
     *  by emitNode (the sink is treated as a regular node for those
     *  purposes); this only runs genSinkAudio for the `_y` formula.
     *
     *  genSinkAudio may return:
     *    - a string  → mono; the same value is written to ch0 and ch1
     *    - {l, r}    → stereo; ch0 gets .l, ch1 gets .r. Used by sinks
     *                  that mix down to a true stereo bus (fourtrack). */
    emitSinkExpression(sinkNode, upstreamExpr){
        if(typeof sinkNode.genSinkAudio !== 'function') return upstreamExpr
        const ctx = this._makeCtx(sinkNode, {sinkUpstreamExpr: upstreamExpr})
        const result = sinkNode.genSinkAudio.call(sinkNode, ctx)
        if(typeof result === 'string') return result
        if(result && typeof result.l === 'string' && typeof result.r === 'string') return result
        return upstreamExpr
    }
}

function assembleBody(cc, finalExpr){
    // Only smoothed params pay for the per-sample lowpass + _psmooth
    // carry-over. `smooth: false` params reference `p.<name>` directly
    // at their use sites, with no hoist/update/writeback here.
    const smoothed = [...cc.params].filter(([, s]) => s.smoothed)
    const kDecls = smoothed.map(([name, spec]) => {
        const tauSec = spec.smoothMs / 1000
        return `const K_SMOOTH_${name} = 1 - Math.exp(-1 / (sampleRate * ${tauSec}));`
    })
    const hoists  = smoothed.map(([name]) => `let _v_${name} = s._psmooth.${name};`)
    const updates = smoothed.map(([name]) => `    _v_${name} += (p.${name} - _v_${name}) * K_SMOOTH_${name};`)
    const writes  = smoothed.map(([name]) => `s._psmooth.${name} = _v_${name};`)

    const lines = [
        `'use strict';`,
        // Math constants hoisted once per body so nodes don't have to
        // inline 6.283185... everywhere. Available to every emitted
        // expression inside the main loop.
        `const PI = Math.PI;`,
        `const TAU = 6.283185307179586;`,
        `const HALF_PI = 1.5707963267948966;`,
        `const INV_PI = 0.3183098861837907;`
    ]
    if(kDecls.length) lines.push(...kDecls)
    lines.push(``)
    if(hoists.length){
        lines.push(...hoists, ``)
    }
    lines.push(`for(let i = 0; i < blockSize; i++){`)
    if(updates.length) lines.push(...updates)
    // Feedback outputs are forward-declared here so consumers that
    // emit before the feedback node (e.g. a Mix reading delay.out
    // while an LFO modulates delay.time) can still reference them.
    // They read state captured at the top of the loop — i.e. from the
    // previous iteration — which is the "past-only" contract anyway.
    if(cc.feedbackDecls.length) lines.push(...cc.feedbackDecls.map(s => `    ${s}`))
    lines.push(...cc.lines.map(s => `    ${s}`))
    // Sinks that opt into stereo return {l, r}; mono sinks return a
    // string and we copy the same value to both channels. `_y` is also
    // declared in the stereo case (as the L/R average) so genAudioTail
    // hooks that reference `ctx.y` keep working.
    const stereo = finalExpr && typeof finalExpr === 'object'
    if(stereo){
        lines.push(`    const _yL = ${finalExpr.l};`)
        lines.push(`    const _yR = ${finalExpr.r};`)
        lines.push(`    const _y = (_yL + _yR) * 0.5;`)
    } else {
        lines.push(`    const _y = ${finalExpr};`)
    }
    if(cc.tailLines.length) lines.push(...cc.tailLines.map(s => `    ${s}`))
    if(stereo){
        lines.push(`    ch0[i] = _yL;`, `    if(ch1) ch1[i] = _yR;`, `}`)
    } else {
        lines.push(`    ch0[i] = _y;`, `    if(ch1) ch1[i] = _y;`, `}`)
    }
    if(writes.length){
        lines.push(``, ...writes)
    }
    return lines.join('\n')
}

export function compileGraph(sinkNode, sinkInputKey = 'audio', sampleRate = 0){
    const sinkPort = sinkNode.input?.[sinkInputKey]
    const srcPort = sinkPort?.connection
    // Always compile registered sinks, even when nothing is plugged in.
    // Sinks with internal state (fourtrack's track buffers, anything
    // that wants to keep ticking from its allocator output) need their
    // body running to render that state to the speakers; sinks with
    // nothing to do (a freshly-added synthout with no audio input)
    // just produce zero from their unconnected ctx.in() expressions
    // and ctx.upstream defaulting to '0'.

    const cc = new CompileContext(sampleRate)

    // Pass 1 — walk every connected input of the sink so any node that
    // contributes (audio path, modulated knobs) becomes part of the
    // compile and gets its outputs marked as used.
    cc.markSinkInputs(sinkNode)

    // Pass 1.5 — walk inputs of every feedback node, picking up
    // anything reachable only via the cycle. New feedback nodes
    // discovered during this pass get processed too because we iterate
    // by length, not by snapshot.
    cc.walkFeedbackInputs()

    // The sink is treated like any other node for setup + output
    // emission. If nothing referenced its outputs during pass 1/1.5,
    // it still needs to be in the emit list so its setup runs and its
    // state/gates get registered.
    if(!cc.usage.has(sinkNode.id)){
        cc.usage.set(sinkNode.id, {node: sinkNode, usedOutputs: new Set()})
        cc._pushOrder(sinkNode.id)
    } else {
        // The sink may have been discovered only via a feedback path
        // during pass 1/1.5 (which defers its order push). Ensure it's
        // in the emit list before pass 2 iterates.
        cc._pushOrder(sinkNode.id)
    }

    // Pass 2 — emit traversed nodes (and the sink) in topological order.
    for(const nid of cc.order){
        const {node, usedOutputs} = cc.usage.get(nid)
        cc.emitNode(node, usedOutputs)
    }

    // Sink's genSinkAudio runs after every node (including the sink
    // itself) is emitted; it has access to all `_out_n<x>_<k>` consts.
    // Multi-input sinks with no `sinkInputKey` connection get a literal
    // '0' upstream — their genSinkAudio is expected to read its own
    // state (e.g. fourtrack's master mix bus) instead.
    const upstreamExpr = srcPort
        ? `_out_n${srcPort.parent.id}_${srcPort.key}`
        : '0'
    const finalExpr = cc.emitSinkExpression(sinkNode, upstreamExpr)

    // Pass 3 — feedback tails. These run after `_y` is computed, so
    // they can read the values that closed the cycle this iteration.
    cc.emitFeedbackTails()

    // Reserved nid holds the per-param smoother carry-over. The engine's
    // state-merge logic preserves it across recompiles just like any
    // other state slot, so sweeps through a graph edit stay zipper-free.
    // Unsmoothed params read `p.<name>` directly and don't need a slot.
    const psmoothInit = {}
    for(const [name, spec] of cc.params){
        if(spec.smoothed) psmoothInit[name] = spec.init
    }
    cc.stateInit._psmooth = psmoothInit

    const body = assembleBody(cc, finalExpr)

    return {
        body,
        stateInit: cc.stateInit,
        params: cc.params,
        gateMap: cc.gateMap,
        micNodes: cc.micNodes,
        sinkNode
    }
}
