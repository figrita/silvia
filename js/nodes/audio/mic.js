import {registerNode} from '../../registry.js'
import {getAudioContext, ensureAudioRunning} from '../../audioContext.js'
import {autowire, StringToFragment} from '../../utils.js'

/**
 * Microphone input. Owns a per-instance MediaStream + MediaStreamSourceNode
 * that feeds a persistent GainNode. The audio compiler sees this node in the
 * graph and assigns it a worklet-input slot; the runtime connects this
 * GainNode to that slot so the raw mic samples appear in `inputs[idx][0]`
 * inside the processor's `process()`.
 *
 * Browser permission happens on the Enable button click — a trusted user
 * gesture on every browser.
 */
registerNode({
    slug: 'audio-mic',
    icon: '🎤',
    label: 'Microphone',
    tooltip: 'Live microphone input. Click Enable to arm the mic and grant permission.',
    workspaceType: 'audio',

    input: {},

    output: {
        'out': {
            label: 'Out',
            type: 'audio',
            genAudio(ctx){
                if(ctx.micIdx < 0) return '0'
                return `((inputs[${ctx.micIdx}] && inputs[${ctx.micIdx}][0]) ? inputs[${ctx.micIdx}][0][i] : 0)`
            }
        }
    },

    elements: {
        enableBtn: null,
        statusEl: null
    },
    runtimeState: {
        outGain: null,
        stream: null,
        srcNode: null
    },

    audioState: {},

    onCreate(){
        const ctx = getAudioContext()
        if(!ctx) return

        const outGain = ctx.createGain()
        outGain.gain.value = 1.0
        this.runtimeState.outGain = outGain

        if(!this.customArea) return

        const html = `
            <div class="audio-ctl-stack">
                <button class="mic-enable-btn" data-el="enableBtn">Enable Mic</button>
                <div class="mic-status" data-el="statusEl">Permission not requested</div>
            </div>
        `
        const fragment = StringToFragment(html)
        const wired = autowire(fragment)
        this.elements.enableBtn = wired.enableBtn
        this.elements.statusEl = wired.statusEl
        this.customArea.appendChild(fragment)

        this.elements.enableBtn.addEventListener('click', () => this._enable())
    },

    async _enable(){
        if(this.runtimeState.stream) return
        const ctx = getAudioContext()
        await ensureAudioRunning()

        this.elements.statusEl.textContent = 'Requesting permission…'
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                }
            })
            if(this.isDestroyed){
                stream.getTracks().forEach(t => t.stop())
                return
            }
            this.runtimeState.stream = stream
            const src = ctx.createMediaStreamSource(stream)
            src.connect(this.runtimeState.outGain)
            this.runtimeState.srcNode = src

            this.elements.enableBtn.style.display = 'none'
            this.elements.statusEl.textContent = 'Live'
            this.elements.statusEl.classList.add('mic-live')

            const [track] = stream.getAudioTracks()
            track?.addEventListener('ended', () => this._disable())
        } catch(e){
            this.elements.statusEl.textContent = `Denied: ${e.name || 'error'}`
        }
    },

    _disable(){
        try { this.runtimeState.srcNode?.disconnect() } catch(e){}
        this.runtimeState.stream?.getTracks().forEach(t => t.stop())
        this.runtimeState.srcNode = null
        this.runtimeState.stream = null
        if(this.elements.enableBtn){
            this.elements.enableBtn.style.display = ''
        }
        if(this.elements.statusEl){
            this.elements.statusEl.textContent = 'Stopped'
            this.elements.statusEl.classList.remove('mic-live')
        }
    },

    onDestroy(){
        this._disable()
        try { this.runtimeState.outGain?.disconnect() } catch(e){}
    }
})
