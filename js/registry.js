import {deepClone} from './utils.js'

/**
 * @file This file manages the registration of all node types in the application.
 * It contains the JSDoc type definitions that provide rich, inline documentation
 * for the Node-API, enabling autocompletion and helpful tooltips in VS Code.
 *
 * @typedef {'color' | 'float' | 'action'} PortType
 * The data type of a port, determining what it can connect to and how its data is handled.
 *
 * @typedef {'select'} OptionType
 * The type of UI for a node option. Currently only 'select' is supported.
 *
 * @typedef {Object} NodeControlBase
 * @property {*} default - The default value for the control.
 * @property {number} [min] - For `s-number`, the minimum allowed value.
 * @property {number} [max] - For `s-number`, the maximum allowed value.
 * @property {number} [step] - For `s-number`, the increment/decrement step value.
 * @property {string} [unit] - For `s-number`, an optional unit string to display (e.g., '°', 's').
 *
 * @typedef {Object} NodePort
 * @property {string} label - The user-facing name of the port, displayed in the node UI.
 * @property {PortType} type - The data type of the port. Connections are only allowed between ports of the same type.
 * @property {NodeControlBase | {} | null} [control]
 *   If defined, an inline control is created for this port.
 *   - For 'float' or 'color' types, provide a `NodeControlBase` object.
 *   - For 'action' type, provide an empty object `{}` to create a trigger button.
 *   - If `null`, no control is created, and the input port **must** be connected to provide a value.
 * @property {(this: SNode, cc: object, funcName: string, uniformName?: string) => string} [genCode]
 *   **(Output Ports Only)**
 *   A function that generates the GLSL code for this output. The compiler calls this to build the final shader.
 *   `this` context is the `SNode` instance. Use `this.getInput(key, cc)` to get values from input ports.
 * @property {(this: SNode, uniformName: string, gl: WebGL2RenderingContext, program: WebGLProgram, textureUnit: number, textureMap: Map<any, WebGLTexture>) => void} [textureUniformUpdate]
 *   **(Output Ports Only)**
 *   If this output provides a texture (from an Image, Video, Canvas, etc.), this function is called
 *   every render frame to upload the texture data to the GPU.
 * @property {(this: SNode, uniformName: string, gl: WebGL2RenderingContext, program: WebGLProgram) => void} [floatUniformUpdate]
 *   **(Output Ports Only)**
 *   If this output provides a float value that changes at runtime (e.g., from Audio analysis), this function
 *   is called every render frame to update its corresponding uniform.
 * @property {(this: SNode) => void} [callback]
 *   **(Input Ports Only)**
 *   For an 'action' type input, this is the function that gets executed when the port is triggered by a connected
 *   'action' output or its own inline button.
 *
 * @typedef {Object} NodeOptionChoice
 * @property {string | number} value - The internal value to be stored when this option is selected.
 * @property {string} name - The user-facing text displayed in the dropdown.
 *
 * @typedef {Object} NodeOption
 * @property {string} label - The user-facing label for this option.
 * @property {OptionType} type - The type of UI control for the option.
 * @property {string | number} default - The default value for the option. Must match the type of one of the `choices` values.
 * @property {NodeOptionChoice[]} [choices] - An array of choices for 'select' type options.
 *
 * @typedef {import('./snode.js').SNode} SNode
 *
 * @typedef {Object} NodeDefinition The complete definition for a node type. This object is passed to `registerNode`.
 * @property {string} slug - A unique, machine-readable identifier for the node type (e.g., 'perlinnoise', 'colorshift').
 * @property {string} icon - An emoji used as the icon in the node header and menu.
 * @property {string} label - The user-facing name of the node.
 * @property {string} [tooltip] - Optional descriptive text shown as a tooltip in menus and on node headers.
 * @property {Record<string, NodePort>} [input] - An object defining the input ports for the node. The object keys are used as internal identifiers.
 * @property {Record<string, NodePort>} [output] - An object defining the output ports for the node. The object keys are used as internal identifiers.
 * @property {Record<string, NodeOption>} [options] - An object defining the configurable options (e.g., dropdowns) for the node.
 * @property {string[]} [shaderUtils] - An array of GLSL helper functions/constants required by this node's `genCode`. (e.g., from `shaderUtils.js`)
 * @property {Record<string, HTMLElement | null>} [elements] - A record for storing references to DOM elements created in `onCreate`. NOT saved in patches.
 * @property {Record<string, HTMLInputElement | null>} [fileSelectors] - A record for storing references to `<input type="file">` elements. NOT saved in patches.
 * @property {Record<string, any>} [values] - A record for storing serializable, user-controlled state that doesn't fit the standard `input` or `options` model. WILL be saved in patches.
 * @property {Record<string, any>} [runtimeState] - A record for storing non-serializable, runtime-only state, such as WebGL contexts, media streams, or interval IDs. NOT saved in patches.
 * @property {(this: SNode) => void} [onCreate] - Called once after the node's DOM element has been created and added to the document. Ideal for creating custom UI and attaching event listeners.
 * @property {(this: SNode) => void} [onDestroy] - Called just before the node is removed. Ideal for cleaning up resources like media streams or intervals.
 * @property {any} [key: string] - Allows for any other methods, especially internal helpers prefixed with `_`.
 */

export const nodeList = {}

export function register(meta, nodeFunc){
    nodeList[meta.slug] = {
        ...meta,
        create: nodeFunc
    }
}

/**
 * Registers a new node type with the application.
 * @param {NodeDefinition} nodeDef - The complete definition of the node.
 */
export function registerNode(nodeDef){
    // Determine IO signature for the menu from the definition
    const io = [[], []]
    if(nodeDef.input){
        io[0] = Object.values(nodeDef.input).map(port => port.type)
    }
    if(nodeDef.output){
        io[1] = Object.values(nodeDef.output).map(port => port.type)
    }

    // The factory function that will be called to create a new node instance.
    // It returns a deep copy of the original node definition object.
    function make(){
        return deepClone(nodeDef)
    }

    // The metadata for the menu.
    const meta = {
        slug: nodeDef.slug,
        icon: nodeDef.icon,
        label: nodeDef.label,
        tooltip: nodeDef.tooltip,
        io
    }

    // Register the node with its menu metadata and the factory function.
    register(meta, make)
}