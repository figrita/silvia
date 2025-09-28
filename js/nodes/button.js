import {registerNode} from '../registry.js'
import {autowire, StringToFragment} from '../utils.js'

registerNode({
    slug: 'button',
    icon: '🔘',
    label: 'Button',
    tooltip: 'Simple button control that triggers action outputs when clicked. Useful for triggering multiple events at once.',
    elements: {
        button: null
    },
    input: {},
    output: {
        'onPress': {
            label: 'On Press',
            type: 'action'
        }
    },
    onCreate(){
        if(!this.customArea){return}

        const html = `
            <div style="padding: 0.5rem;">
                <button data-el="button" style="width: 100%; padding: 0.5rem; font-family: monospace;">Press Me</button>
            </div>
        `
        const fragment = StringToFragment(html)
        this.elements = autowire(fragment)

        this.elements.button.addEventListener('click', () => {
            // This is the core logic: when the UI button is clicked,
            // it triggers the "onPress" output action port.
            this.triggerAction('onPress')
        })

        this.customArea.appendChild(fragment)
    }
})