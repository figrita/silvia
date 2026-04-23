import {registerNode} from '../registry.js'
import {getAudioContext, ensureAudioRunning} from '../audioContext.js'
import {audioRuntime} from '../audioRuntime.js'
import {autowire, StringToFragment} from '../utils.js'

/**
 * SynthOut — the only audio-accepting node allowed on a video workspace.
 * Acts as the graph sink: registering with the audio runtime compiles the
 * upstream audio graph into a single AudioWorkletProcessor, whose output
 * is both routed to the speakers and tapped by an AnalyserNode that
 * drives the on-node oscilloscope.
 *
 * The master level is baked into the compiled processor as a parameter,
 * so dragging the knob is zipper-free and CV into Level is sample-accurate.
 */
registerNode({
    slug: 'synthout',
    icon: '📢',
    label: 'Synth Out',
    tooltip: 'Routes audio to the speakers and displays the waveform. Compile sink for the audio graph.',

    input: {
        'audio': {label: 'Audio', type: 'audio', control: null},
        'level': {label: 'Level', type: 'float', control: {default: 0.8, min: 0, max: 1, step: 0.01}}
    },
    output: {},

    audioState: {},

    elements: {
        scope: null,
        levelControl: null
    },
    runtimeState: {
        analyser: null,
        waveformData: null,
        scopeFrameId: null,
        audioHue: '195',
        workletNode: null
    },

    genSinkAudio(ctx){
        const level = ctx.in('level')
        return `(${ctx.upstream}) * (${level})`
    },

    onCreate(){
        const ctx = getAudioContext()
        if(!ctx) return

        const analyser = ctx.createAnalyser()
        analyser.fftSize = 512
        analyser.smoothingTimeConstant = 0.4
        this.runtimeState.analyser = analyser
        this.runtimeState.waveformData = new Uint8Array(analyser.fftSize)

        ensureAudioRunning().catch(() => {})
        audioRuntime.registerSink(this)

        if(!this.customArea) return

        const html = `
            <div class="synthout-custom">
                <canvas data-el="scope" width="220" height="64"></canvas>
            </div>
        `
        const fragment = StringToFragment(html)
        const wired = autowire(fragment)
        this.elements.scope = wired.scope
        this.customArea.appendChild(fragment)

        const hueVar = getComputedStyle(document.body).getPropertyValue('--audio-hue').trim()
        if(hueVar) this.runtimeState.audioHue = hueVar

        this._startScope()
    },

    /**
     * Called by audioRuntime after each (re)compile. `workletNode` is null
     * when the graph is silent (nothing connected). Tap the worklet into
     * the analyser so the scope tracks whatever is actually audible.
     */
    _onWorkletReady(workletNode){
        const analyser = this.runtimeState.analyser
        const prev = this.runtimeState.workletNode
        if(prev){
            try { prev.disconnect(analyser) } catch(e){}
        }
        this.runtimeState.workletNode = workletNode
        if(workletNode && analyser){
            try { workletNode.connect(analyser) } catch(e){}
        }
    },

    _startScope(){
        const canvas = this.elements.scope
        if(!canvas) return
        const ctx2d = canvas.getContext('2d')
        const data = this.runtimeState.waveformData
        const hue = this.runtimeState.audioHue

        const render = () => {
            if(this.isDestroyed) return
            this.runtimeState.analyser?.getByteTimeDomainData(data)

            const w = canvas.width, h = canvas.height
            ctx2d.fillStyle = `hsl(${hue}, 20%, 6%)`
            ctx2d.fillRect(0, 0, w, h)

            ctx2d.strokeStyle = `hsl(${hue}, 75%, 60%)`
            ctx2d.lineWidth = 1.5
            ctx2d.beginPath()
            const step = w / data.length
            for(let i = 0; i < data.length; i++){
                const y = (data[i] / 255) * h
                if(i === 0) ctx2d.moveTo(i * step, y)
                else ctx2d.lineTo(i * step, y)
            }
            ctx2d.stroke()

            this.runtimeState.scopeFrameId = requestAnimationFrame(render)
        }
        render()
    },

    onDestroy(){
        audioRuntime.unregisterSink(this)
        if(this.runtimeState.scopeFrameId){
            cancelAnimationFrame(this.runtimeState.scopeFrameId)
            this.runtimeState.scopeFrameId = null
        }
        try { this.runtimeState.analyser?.disconnect() } catch(e){}
    }
})
