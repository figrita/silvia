# Silvia Developer Guide

## Overview

## Node Icon and Menu Guidelines

- **Unique Emoji Icons:** Each node should have a unique emoji icon for clarity and quick visual identification. Avoid using the same emoji for multiple nodes or for both categories and nodes. Prefer icons that are literal, playful, or visually hint at the node’s function.
- **Category Icons:** Category icons in the node menu should also be unique and not duplicate any node icon.
- **Menu Organization:** Node categories are organized by function signature (input/output types) and general purpose, not just by effect. The menu structure and node placement should be intuitive and predictable (“not surprising”).
- **Node Placement:** When designing new nodes, group them with similar nodes by their function signature (e.g., float→float, color→color, etc.). Document the expected input/output types in the node’s definition for easier categorization.
- **Emoji/Label Consistency:** If a node’s emoji or label changes, update both the node definition and any documentation/screenshots that reference it.

Silvia is a browser-based modular video synthesizer that compiles node graphs into GLSL shaders. The application runs entirely client-side from `index.html` with no build process required.

**Core Architecture:**
- `index.html` - Entry point, loads `main.js` as ES6 module
- `main.js` - Initializes all systems on `DOMContentLoaded`
- `js/snode.js` - Node instance class and lifecycle management
- `js/compiler.js` - Converts node graphs to GLSL shaders
- `js/webgl.js` - WebGL2 rendering engine with frame history support
- `js/registry.js` - Node type registration and JSDoc type definitions
- `js/connections.js` - Connection management and wire visualization

## Node System Architecture

### Node Registration

Nodes are registered using the `registerNode()` function from `js/registry.js`:

```javascript
export function registerNode(nodeDef){
    // nodeDef follows the NodeDefinition typedef in js/registry.js
    const io = [[], []]
    if(nodeDef.input){
        io[0] = Object.values(nodeDef.input).map(port => port.type)
    }
    if(nodeDef.output){
        io[1] = Object.values(nodeDef.output).map(port => port.type)
    }
    // Registration continues...
}
```

The registration system is decoupled - `js/registry.js` uses a `register()` function that accepts metadata and a factory function, while individual nodes call `registerNode()` with a complete definition object.

### Node Definition Structure

Every node follows the `NodeDefinition` typedef documented in `js/registry.js`:

```javascript
registerNode({
    slug: 'template',           // Unique identifier
    icon: '🧩',                // Emoji for UI
    label: 'Template Node',     // Display name
    
    input: {
        'someInput': {
            label: 'Some Input',
            type: 'float',      // 'float', 'color', or 'action'
            control: {default: 0.5, min: 0, max: 1, step: 0.01}
        }
    },
    
    output: {
        'someOutput': {
            label: 'Some Output',
            type: 'float',
            genCode(cc, funcName){ return '/* GLSL code */' }
        }
    },
    
    options: {
        'mode': {
            label: 'Mode',
            type: 'select',     // Currently only 'select' is supported
            default: 'A',
            choices: [{value: 'A', name: 'Mode A'}]
        }
    },
    
    // State management properties
    elements: {},          // DOM element references (populated by autowire)
    fileSelectors: {},     // File input element references
    values: {},           // Serializable custom state (saved in patches)
    runtimeState: {},     // Non-serializable runtime state
    
    // Lifecycle hooks
    onCreate(){ /* Called after DOM creation */ },
    onDestroy(){ /* Called before removal */ }
})
```

### Port Types

#### Worldspace and UV Conventions

- All nodes that generate or process patterns in UV space should use a square worldspace, centered at (0,0), with the height of all viewports and textures at 2.0 height, with whatever units width makes the pixel aspect square.
- Do not apply aspect ratio correction unless the node’s effect specifically requires it (e.g., for image or video sources).

The system supports three fundamental port types:

1. **`float`** - Numeric values, displayed as "number" in UI, green theme (#10b981)
2. **`color`** - Vec4 RGBA values, orange theme (#f59e0b)
3. **`action`** - Event triggers, purple theme (#8b5cf6)

Connections enforce strict type matching, though type conversion nodes can bridge between float and color types.

### Input Types: GPU/CPU Boundary

**CRITICAL:** WebGL has no efficient way to read float values back from the GPU:
- No `glReadPixels` for float textures (Apple blocked `EXT_color_buffer_float`)
- Reading RGBA pixels causes severe performance degradation
- Any GPU→CPU readback stalls the entire rendering pipeline

This architectural constraint fundamentally shapes the distinction between input ports and custom UI parameters.

#### When to Use Input Ports

Input ports should ONLY be used when the value:
1. **Passes to shaders as a uniform** - Used in `genCode()` for GLSL calculations
2. **Accepts connections from other nodes** - Enables data flow through the graph
3. **Stays entirely on the GPU** - Never influences CPU-side logic

#### When to Use Custom UI (CPU-only parameters)

Parameters that control CPU logic must use custom UI elements created in `onCreate()`:
- **Timing/sequencing** - BPM, duration, gate length
- **Grid/array dimensions** - Width, height, buffer sizes
- **Iteration counts** - Steps, samples, loop counts
- **UI state** - Playback controls, threshold settings
- **Animation parameters** - Start/end values, curve types
- **Any control flow logic** - Cannot be read back from GPU

Store these values in the `values` object for serialization.

#### Implementation Pattern

```javascript
// INCORRECT: Creates unnecessary shader uniform
input: {
    'bpm': {label: 'BPM', type: 'float', control: {default: 120, min: 20, max: 300}}
}

// CORRECT: CPU-only parameter with custom UI
values: {
    bpm: 120
},
onCreate(){
    const html = `<s-number value="${this.values.bpm}" min="20" max="300" data-el="bpmControl"></s-number>`
    // ... autowire and add listener
    this.elements.bpmControl.addEventListener('input', (e) => {
        this.values.bpm = parseFloat(e.target.value)
    })
}
```

### Action Callbacks: Gate Events

Action inputs support separate down/up callbacks for gate-style events:

```javascript
input: {
    'gate': {
        label: 'Gate',
        type: 'action',
        control: {},
        downCallback(){this._gateOn()},   // Triggered on note-on/button-down
        upCallback(){this._gateOff()}      // Triggered on note-off/button-up
    }
}
```

The older `callback` property is still supported for backwards compatibility but should not be used for new nodes.

### Dynamic Uniform Updates

Nodes can update GPU uniforms from CPU calculations using two mechanisms:

#### floatUniformUpdate - CPU→GPU per frame

For values calculated on the CPU that need to update each frame:

```javascript
output: {
    'output': {
        label: 'Output',
        type: 'float',
        genCode(cc, funcName, uniformName){
            return `float ${funcName}(vec2 uv) { return ${uniformName}; }`
        },
        floatUniformUpdate(uniformName, gl, program){
            const location = gl.getUniformLocation(program, uniformName)
            const value = this._getCurrentValue() // CPU calculation
            gl.uniform1f(location, value)
        }
    }
}
```

Used by: animation, envelope, ADSR, audio analysis, gamepad nodes.

## Phase Accumulation System

### The Discontinuity Problem

Traditional time-based animation uses `u_time * speed` calculations in shaders, which creates jarring discontinuities when speed parameters change. When a user slowly adjusts a speed control from 1.0 to 1.1, the phase instantly jumps, causing visible animation jumps.

### CPU Phase Accumulation Solution

The `PhaseAccumulator` class solves this by maintaining accumulated phase on the CPU with smooth speed transitions:

```javascript
import {PhaseAccumulator} from '../js/phaseAccumulator.js'

// In node definition
runtimeState: {
    phaseAccumulator: null
},
values: {
    speed: 1.0,
    isRunning: true
},

_getCurrentPhase(){
    // Initialize accumulator if needed
    if(!this.runtimeState.phaseAccumulator){
        this.runtimeState.phaseAccumulator = new PhaseAccumulator({
            initialSpeed: this.values.speed,
            transitionDuration: 0.05,  // 50ms smooth transitions
            minSpeed: -2.0,
            maxSpeed: 2.0
        })
    }
    
    if(!this.values.isRunning){
        // Return frozen phase when paused
        return this.runtimeState.phaseAccumulator.getPhase()
    }
    
    // Update and return current phase
    return this.runtimeState.phaseAccumulator.update(this.values.speed)
}
```

### Shader Integration

Phase-accumulated nodes declare phase uniforms in `genCode()` and update them via `floatUniformUpdate()`:

```javascript
genCode(cc, funcName, uniformName){
    // Declare phase uniform
    const phaseUniformName = `${uniformName}_phase`
    cc.uniforms.set(phaseUniformName, {
        type: 'float',
        sourcePort: this.output.output
    })
    
    return `vec4 ${funcName}(vec2 uv) {
        // Use accumulated phase instead of u_time * speed
        float phase = ${phaseUniformName};
        // Animation calculations using smooth phase...
    }`
},

floatUniformUpdate(uniformName, gl, program){
    if(uniformName.endsWith('_phase')) {
        const phase = this._getCurrentPhase()
        const location = gl.getUniformLocation(program, uniformName)
        if(location) {
            gl.uniform1f(location, phase)
        }
    }
}
```

### Key Features

- **Smooth Speed Transitions**: Parameter changes interpolate over configurable duration (default 50ms)
- **High Precision Timing**: Uses `performance.now()` for sub-millisecond accuracy
- **Pause/Resume Support**: Maintains frozen phase during pause, seamless resume
- **Speed Limits**: Configurable min/max speed clamping
- **Custom Transition Curves**: Pluggable interpolation functions (default: smoothstep)

### Implementation Pattern

1. **Custom UI Controls**: Phase-accumulated parameters use `values` object with custom `<s-number>` controls, NOT input ports
2. **CPU State Management**: PhaseAccumulator instances stored in `runtimeState` (non-serializable)
3. **Lifecycle Management**: Initialize accumulators lazily, clean up in `onDestroy()`
4. **Pause/Play Logic**: Use `pause()` and `resume()` methods, not phase resets

### When to Use Phase Accumulation

Use phase accumulation for nodes where:
- **Speed/Rate Parameters**: Any parameter that controls animation speed or frequency
- **User Interaction**: Parameters users frequently adjust during performance
- **Temporal Effects**: Nodes generating time-based patterns (tunnels, oscillators, rotation)
- **Smooth Control**: When seamless parameter changes are essential

### Examples

- **Tunnel PA**: Smooth speed and rotation transitions for tunnel effects
- **Oscillator**: Frequency changes without phase discontinuities  
- **Animation**: Linear interpolation with smooth speed adjustments
- **Rotozoom**: Rotation speed control with phase accumulation

This system provides professional-quality smooth parameter control essential for live performance and real-time interaction.

#### textureUniformUpdate - Texture data updates

For nodes providing texture data:

```javascript
output: {
    'output': {
        label: 'Output',
        type: 'color',
        genCode(cc, funcName, uniformName){
            return `vec4 ${funcName}(vec2 uv) {
                return texture(${uniformName}, uv);
            }`
        },
        textureUniformUpdate(uniformName, gl, program, textureUnit, textureMap){
            gl.activeTexture(gl.TEXTURE0 + textureUnit)
            gl.bindTexture(gl.TEXTURE_2D, texture)
            // Upload texture data...
        }
    }
}
```

Used by: image, video, webcam, text, screencapture nodes.

## Creating a New Node

### Node Registration and Slug Naming
- Node slugs should be unique and descriptive.
- If a node is renamed or its slug changes, update all references in categories and documentation.

### Basic Structure

1. Create a new file in `js/nodes/` directory
2. Import `registerNode` from `../registry.js`
3. Define the node following the `NodeDefinition` typedef
4. The node is automatically registered when `js/nodes/index.js` imports it

### Simple Math Node Example

```javascript
import {registerNode} from '../registry.js'

registerNode({
    slug: 'add',
    icon: '➕',
    label: 'Add',
    input: {
        'a': {
            label: 'A',
            type: 'float',
            control: {default: 0, min: -100, max: 100, step: 0.01}
        },
        'b': {
            label: 'B',
            type: 'float',
            control: {default: 0, min: -100, max: 100, step: 0.01}
        }
    },
    output: {
        'output': {
            label: 'Output',
            type: 'float',
            genCode(cc, funcName){
                return `float ${funcName}(vec2 uv) {
    return ${this.getInput('a', cc)} + ${this.getInput('b', cc)};
}`
            }
        }
    }
})
```

## Shader Compilation System

The `CompileContext` class in `js/compiler.js` manages shader generation:

```javascript
class CompileContext{
    constructor(input){
        this.functions = new Set()    // Generated GLSL functions
        this.utils = new Set()        // Utility functions from shaderUtils
        this.uniforms = new Map()      // Uniform declarations
        this.visited = new Set()       // Prevents circular dependencies
        this.input = input
    }
    
    build(){
        const mainFunctionBody = this.input.get(this, 'uv')
        // Builds complete GLSL shader with #version 300 es
    }
}
```

The `getInput()` method in `js/snode.js` handles input resolution:
- Connected inputs generate function calls
- Unconnected controls create uniforms
- Handles both float and color types appropriately

## Connection System

The `Connection` class in `js/connections.js` manages node wiring:

```javascript
constructor(source, destination, color = null){
    this.source = source
    this.destination = destination
    this.type = source.type
    this.color = color || getGoldenRatioColor()
    
    // Actions allow many-to-many, data connections are one-to-one on input
    // Triggers downstream recompilation for data connections
}
```

Visual wire rendering includes:
- Curved bezier paths for data connections
- Straight lines for action connections
- Golden ratio color assignment for visual distinction
- Support for "droopy cables" setting

## Custom Web Components

### s-number Component

The `s-number` element provides numeric input with advanced features:
- Mouse wheel adjustment with shift/ctrl modifiers
- Click-and-drag scrubbing
- Logarithmic scale support (`log-scale` attribute)
- Min/max editability via right-click
- MIDI learn via Alt/Option+Click
- Unit display support

### s-color Component

The `s-color` element provides HSL-based color picking:
- Popup interface with HSLA sliders
- Visual preview swatch
- Hex input support

## Theme System

The `ThemeManager` class manages a four-color theming system:

```javascript
export class ThemeManager {
    constructor() {
        this.colors = {
            main: '#f52fbcff',    // Pink - UI elements
            number: '#10b981ff',  // Green - float ports
            color: '#f59e0bff',   // Orange - color ports
            event: '#8b5cf6ff'    // Purple - action ports
        }
    }
}
```

Colors are applied as CSS custom properties in HSL format for dynamic theming.

## Persistence System

### Serialization

The `serializeWorkspace()` function in `js/save.js` captures:
- Node positions and types
- Control values
- Option selections
- Custom `values` objects
- MIDI mappings
- Connection topology

### Deserialization

The `deserializeWorkspace()` function in `js/load.js`:
1. Creates nodes with new IDs
2. Restores control and option values
3. Re-establishes connections
4. Restores MIDI mappings
5. Triggers `onCreate()` lifecycle hooks

## WebGL Rendering

The `WebGLRenderer` class manages shader execution:

```javascript
export class WebGLRenderer{
    constructor(canvas, initialFrameBufferSize = 10){
        this.gl = canvas.getContext('webgl2', {
            antialias: false,
            preserveDrawingBuffer: true
        })
        this.historyTexture = null  // 2D array texture for frame history
        this.frameBufferSize = initialFrameBufferSize  // Dynamic buffer size
    }
    
    render(time, shaderInfo, textureMap){
        // Sets uniforms including u_time, u_resolution, u_frame_history
        // Calls floatUniformUpdate and textureUniformUpdate
        // Renders to framebuffer then blits to canvas
    }
}
```

Key features:
- WebGL 2.0 with GLSL ES 3.00
- Frame history as 2D array texture
- Dynamic framebuffer resizing
- Efficient uniform management

## Menu System

The node menu provides two interfaces:
1. **Quick Menu** - Right-click context menu with search
2. **Start Menu** - Categorized grid of node buttons

Categories are defined in `js/categories.js` with icon groupings.

## MIDI System

### Architecture

The `MidiManager` class provides WebMIDI support:

1. **Auto-connection** - Connects to all available MIDI devices
2. **CC Mapping** - Maps control changes to s-number elements
3. **Note Mapping** - Maps notes to action buttons with gate support
4. **Learn Mode** - Alt/Option+Click to map/unmap controls

### Mapping Storage

- Stored in `dataset` attributes on DOM elements
- Serialized with patches in the `midiMappings` object per node
- Restored automatically on patch load
- No localStorage dependency

### Browser Support

- Native: Chrome, Edge, Brave
- Firefox: Requires Jazz-MIDI add-on (prompted on first use)

## Asset Management System

The `AssetManager` in `js/assetManager.js` provides unified asset handling for both web and Electron environments, with a consolidated user interface.

### Unified Asset Manager Interface

The system uses a single `showGlobalAssetManager()` method that adapts its behavior based on context:

```javascript
// Global asset manager (accessed via bottom toolbar button)
AssetManager.showGlobalAssetManager()

// Node-specific asset selection (called from media nodes)
AssetManager.showGlobalAssetManager({
    nodeType: 'image',  // 'image', 'video', or 'audio'
    onSelect: (assetPath, assetInfo) => {
        // Handle asset selection
        this.values.assetPath = assetPath
        this._loadFromAssetPath(assetPath)
    }
})
```

### Asset Manager Modes

#### Global Mode (Default)
- **Access**: Bottom toolbar "📂 Assets" button
- **Behavior**: All tabs active, full asset management capabilities
- **Title**: "📂 Asset Manager"
- **Features**: View, edit, delete, and organize all assets

#### Selection Mode (Node Context)
- **Access**: "📂 Assets" button within Image, Video, or Audio nodes
- **Behavior**: Focused on specific asset type, other tabs disabled
- **Title**: "📂 Select [Type] Asset" (e.g., "📂 Select Image Asset")
- **Features**: Asset selection with automatic modal close and node integration

### Tab Behavior

When opened in selection mode:
- **Active Tab**: Automatically shows the relevant tab (Images for image nodes, etc.)
- **Disabled Tabs**: Other asset types are grayed out and non-clickable
- **Visual Indicators**: Disabled tabs show reduced opacity and "not-allowed" cursor

### Media Node Integration

All media nodes (Image, Video, Audio) use the unified system:

```javascript
// Example from Image node
assetBrowserBtn.onclick = async (e) => {
    e.stopPropagation()
    AssetManager.showGlobalAssetManager({
        nodeType: 'image',
        onSelect: (assetPath, assetInfo) => {
            console.log('Selected image asset:', assetPath, assetInfo)
            this.values.assetPath = assetPath
            this._loadFromAssetPath(assetPath)
        }
    })
}
```

### Selection Flow

1. **User clicks Assets button** in a media node
2. **Asset manager opens** in selection mode for that asset type
3. **User clicks an asset** thumbnail
4. **Selection callback fires** with asset path and metadata
5. **Modal automatically closes** and asset loads into the node

### Asset Storage

- **Electron Mode**: Assets stored in workspace/assets/ directory with asset:// URLs
- **Web Mode**: Uses blob URLs for temporary asset references
- **Serialization**: Asset paths saved in patch files for persistence

### Asset Editing

The asset manager includes an integrated editing system for asset metadata:

#### Edit Panel Interface
- **Access**: Click on any asset card in Global Mode (Selection Mode retains selection behavior)
- **Layout**: Right-side panel slides out next to the asset grid
- **Features**: Asset preview, name editing, tag management, file path display

#### Editing Workflow
1. **Click any asset card** in Global Mode
2. **Panel slides out** with asset preview and current metadata
3. **Modify display name** in the text input field
4. **Add/remove tags** using the tag input system
5. **Save or Cancel** changes

#### Tag Management System
- **Add Tags**: Type tag name and press Enter (20 character limit)
- **Remove Tags**: Click × button on any tag
- **Duplicate Prevention**: Cannot add the same tag twice
- **Visual Design**: Pink tag pills with smooth hover effects
- **Keyboard Support**: Backspace on empty input removes last tag

#### Technical Implementation
```javascript
// Asset metadata updates via Electron API
await AssetManager.updateAssetInfo(assetPath, {
    originalName: newDisplayName,
    tags: ['tag1', 'tag2', 'tag3']
})
```

#### Data Structure
- **JSON Storage**: Tags stored as array in asset metadata file
- **Backward Compatibility**: Existing assets get empty tags array
- **Data Integrity**: Critical system fields protected during updates

### Tag-Based Filtering

The asset manager includes a powerful filtering system based on asset tags:

#### Filter Bar Interface
- **Location**: Horizontal bar between tab navigation and asset grid
- **Layout**: "Filter by tags:" label and tag input side-by-side
- **Persistence**: Filter state maintained across all asset type tabs

#### Filter Functionality
- **Add Filters**: Type tag name and press Enter to add filter
- **Remove Filters**: Click × on filter tags or backspace on empty input
- **AND Logic**: Assets must have ALL active filter tags to be shown
- **Real-time Updates**: Asset grid updates immediately upon filter changes

#### Visual Design
- **Green Filter Tags**: Distinguishable from pink edit tags
- **Smart Empty States**: Different messages for no assets vs. no filtered results
- **Cross-tab Consistency**: Same filters apply to Images, Videos, and Audio

#### Technical Implementation
```javascript
// Filter logic (AND operation)
const assets = allAssets.filter(asset => {
    if (activeFilters.size === 0) return true
    const assetTags = new Set(asset.tags || [])
    return Array.from(activeFilters).every(filterTag => assetTags.has(filterTag))
})
```

#### User Experience
- **Immediate Feedback**: Assets filter instantly upon adding/removing tags
- **Clear Communication**: Helpful empty states show active filters
- **Keyboard Navigation**: Full keyboard support for filter management
- **Visual Hierarchy**: Clear distinction between filter and edit interfaces

### Implementation Notes

- **Backward Compatibility**: Existing global asset manager calls work unchanged
- **Type Safety**: Asset selection validates type matching when nodeType is specified
- **UI Consistency**: Same styling and layout regardless of access method
- **Resource Management**: Proper cleanup of blob URLs and event listeners
- **Tag System**: Complete CRUD operations for asset tagging and filtering

This unified approach eliminates code duplication while providing specialized interfaces for different use cases.

## Common Development Tasks

### Manual Edits and Synchronization
- If you manually edit node files (e.g., icons, slugs), always synchronize those changes with the menu/category structure and documentation.

### Adding Shader Utilities

Register utilities in `js/shaderUtils.js` and reference in nodes:

```javascript
shaderUtils: [shaderUtils.RGB2HSV, shaderUtils.HSV2RGB]
```

The compiler automatically includes only referenced utilities.

### Node Categories

Add nodes to categories in `js/categories.js` for menu organization.

## Code Style Guidelines

### Comments
- Factual and concise
- Focus on what, not why or how
- No conversational language
- No temporal references

### Best Practices

1. **State Management**
   - `values`: Serializable, saved in patches
   - `runtimeState`: Non-serializable (WebGL textures, intervals)
   - `elements`: DOM references via autowire

2. **Resource Cleanup**
   - Stop animations in `onDestroy()`
   - Revoke object URLs
   - Clear intervals/timeouts
   - Delete WebGL resources

3. **Performance**
   - Minimize GPU→CPU readback
   - Use `requestAnimationFrame` for animations
   - Batch DOM updates
   - Reuse textures when possible

## Testing Checklist

1. Save/load patch integrity
2. MIDI mapping persistence
3. Memory leak prevention (especially textures)
4. Connection/disconnection behavior
5. Proper `onDestroy()` cleanup
6. Cross-browser compatibility

## Performance Guidelines

- No `glReadPixels` on float textures (not supported)
- Batch uniform updates
- Minimize texture uploads
- Use texture atlases where appropriate
- Profile with Chrome DevTools

## Directory Structure

## Pattern/Geometry Node Distinction
- Some nodes may belong to both “pattern” and “geometry” categories (e.g., phyllotaxis, spiral). Clarify this in documentation and menu placement.

```
silvia/
├── index.html           # Entry point
├── main.js             # Application initialization
├── js/                 # Core JavaScript modules
│   ├── snode.js        # Node instance class
│   ├── compiler.js     # GLSL compilation
│   ├── webgl.js        # WebGL rendering
│   ├── registry.js     # Node registration
│   ├── connections.js  # Connection management
│   └── nodes/          # Node definitions
│       ├── index.js    # Node imports
│       ├── _template.js # Node template with documentation
│       └── *.js        # Individual node implementations
├── electron/           # Electron-specific files
│   ├── main.electron.js # Main process
│   └── preload.js      # Preload script
├── assets/             # Static assets and icons
├── styles/             # CSS files
├── lib/                # Third-party libraries
└── components/         # Reusable UI components
```


Silvia Electron Implementation Guide

## Overview

Silvia runs as an Electron application to provide secure file system access for asset management while maintaining cross-platform compatibility. The Electron implementation handles workspace initialization, asset storage/retrieval, and secure protocol handling.

## Architecture Decisions

### Custom Protocol Implementation

**Decision**: Use `asset://` custom protocol for secure asset access
**Rationale**: 
- Restricts file access to only the workspace assets directory
- Prevents renderer from accessing arbitrary system files
- Maintains security boundary between renderer and main process

**Implementation**:
- Uses deprecated `protocol.registerFileProtocol` instead of `protocol.handle`
- **Why deprecated API**: `protocol.handle` doesn't support video seeking/range requests
- Video seeking is critical for video nodes, so we accept the deprecation warning

```javascript
// Register as privileged scheme before app ready
protocol.registerSchemesAsPrivileged([
    {
        scheme: 'asset',
        privileges: {
            standard: true,
            secure: true, 
            supportsFetchAPI: true,
            corsEnabled: true
        }
    }
])

// Register file protocol handler
protocol.registerFileProtocol('asset', (request, callback) => {
    // Parse asset://videos/filename.mp4 -> videos/filename.mp4
    const url = new URL(request.url)
    const relativePath = url.hostname + url.pathname
    const assetPath = path.join(workspacePath, 'assets', relativePath)
    
    // Security validation
    const normalizedAssetPath = path.normalize(assetPath)
    const normalizedWorkspacePath = path.normalize(path.join(workspacePath, 'assets'))
    if (!normalizedAssetPath.startsWith(normalizedWorkspacePath)) {
        throw new Error('Access denied: path outside assets directory')
    }
    
    callback({ path: assetPath })
})
```

### Workspace Management

**Decision**: User-selectable workspace directory with default fallback
**Rationale**:
- Users need control over where their projects are stored
- Default to Documents/Silvia for discoverability
- Each workspace is self-contained with assets/, patches/ subdirectories

**Structure**:
```
Workspace/
├── assets/
│   ├── images/
│   ├── videos/
│   └── audio/
└── patches/
```

### Asset Storage Strategy

**Decision**: Organized subdirectories with metadata files
**Rationale**:
- Type-based organization (images/, videos/, audio/)
- Unique filename generation prevents conflicts
- JSON metadata enables rich asset management
- Keeps original filenames in metadata for user reference

**Asset Workflow**:
1. File dropped/selected in renderer
2. IPC call to `copy-asset` with serialized file data
3. Generate unique filename: `crypto.randomBytes(8).toString('hex') + extension`
4. Save to appropriate subdirectory: `assets/{type}s/`
5. Create metadata file: `{id}.json` with original name, size, type, creation date
6. Return `asset://{type}s/{filename}` URL

### IPC Architecture

**Handlers**:
- `copy-asset`: Copy file data to workspace, return asset:// URL
- `resolve-asset-path`: Validate and pass through asset:// URLs
- `list-assets`: Enumerate assets by type for browser UI
- `delete-asset`: Remove asset file and metadata
- `get-asset-info`: Retrieve asset metadata
- `select-workspace`: Directory picker for workspace selection
- `get-workspace-path`: Return current workspace path

**Security**: All handlers validate workspace exists and paths are within bounds

### File Handling

**Decision**: ArrayBuffer serialization for file transfer
**Rationale**:
- Works across all file types (binary/text)
- Consistent handling regardless of file format
- Efficient for IPC transfer

**Buffer Handling**:
```javascript
// Handle multiple buffer types
let buffer
if (fileData instanceof ArrayBuffer) {
    buffer = Buffer.from(fileData)
} else if (fileData.buffer instanceof ArrayBuffer) {
    buffer = Buffer.from(fileData.buffer, fileData.byteOffset, fileData.byteLength)
} else {
    buffer = Buffer.from(fileData)
}
```

## Asset Management Integration

### URL Format
- **Storage**: `asset://videos/filename.mp4`
- **Parsing**: hostname="videos", pathname="/filename.mp4"
- **Resolution**: `assets/videos/filename.mp4`

### Renderer Integration
- AssetManager handles Electron vs Web mode detection
- Nodes store `asset://` URLs in `values.assetPath` for serialization
- Protocol handler resolves URLs for DOM element loading

### Security Boundaries
1. **Path Validation**: All file operations validate paths are within assets directory
2. **Protocol Restriction**: Custom protocol only serves from assets directory  
3. **IPC Validation**: All handlers check workspace initialization and path bounds

## Error Handling

### Protocol Errors
- File not found: Return error code -6 (FILE_NOT_FOUND)
- Access denied: Return error code -2 (GENERIC_FAILURE)
- Path outside assets: Throw error before callback

### IPC Errors
- Workspace not initialized: Return error/null
- File access failure: Log error and throw
- Invalid parameters: Return error status

## Performance Considerations

### Asset Storage
- Unique filenames prevent overwrites and caching issues
- Metadata separate from file data for fast enumeration
- Type-based directories for efficient filtering

### Memory Management
- Files transferred as ArrayBuffer (efficient for large files)
- Protocol handler uses direct file paths (no memory buffering)
- Metadata files small and cached as needed

## Development Patterns

### Adding New Asset Types
1. Update `copy-asset` handler to recognize new type
2. Add subdirectory creation in `initializeWorkspace`
3. Update protocol handler MIME type detection if needed
4. Add type to `list-assets` filtering

### Security Updates
- Always validate paths with `path.normalize()` and `startsWith()` checks
- Never trust file paths from renderer without validation
- Use workspace-relative paths for all operations

## Known Issues & Limitations

### Protocol Deprecation
- `protocol.registerFileProtocol` is deprecated but necessary for video seeking
- Future Electron versions may remove this API
- Alternative: Implement manual range request handling with `protocol.handle`

### Cross-Platform Paths
- Windows uses backslashes, protocol expects forward slashes
- Asset:// URLs use forward slash format consistently
- Path joining uses `path.join()` for platform compatibility

### File Access Permissions
- Workspace directory must be user-writable
- Asset files inherit workspace permissions
- No special permission handling beyond OS defaults

### Projector Window Security
- Projector windows use `about:blank` with injected content for maximum security
- No file system access required for projector functionality
- Window open handler only allows `asset://` protocol and `about:blank`
- HTML, CSS, and JavaScript injected directly via `document.write()`

## Testing Checklist

### Asset Operations
- [ ] Import image/video files
- [ ] Asset browser shows imported files
- [ ] Asset deletion removes file and metadata
- [ ] Video seeking/scrubbing works
- [ ] Save/load patch preserves asset references
- [ ] Cross-platform path handling

### Security Validation
- [ ] Cannot access files outside workspace
- [ ] Protocol rejects invalid paths
- [ ] IPC handlers validate inputs
- [ ] Path traversal attacks blocked

### Error Scenarios  
- [ ] Missing workspace directory
- [ ] Corrupted asset files
- [ ] Invalid asset URLs
- [ ] Insufficient disk space
- [ ] Permission denied errors

## Migration Notes

### From Web to Electron
- Blob URLs become `asset://` URLs
- File picker uses Electron dialog instead of web input
- Asset persistence automatic (no user download)

### Protocol Updates
- URL format changes require patch migration logic
- Asset metadata format is versioned for compatibility
- Workspace structure changes need migration tools