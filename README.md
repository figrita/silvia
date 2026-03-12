# Silvia

![Silvia Logo](assets/icons/silvia_logo_name.png)

Modular video synthesizer. Runs in the browser or as a desktop app. Connect nodes, get visuals.

Silvia compiles node graphs into GLSL fragment shaders and renders them with WebGL2. No build step, no framework -- vanilla JS and HTML5.

## Quick Start

1. Clone it
2. Start any server (`npx serve .`, `python -m http.server`, etc.)
3. Open `http://localhost:8000`

### Desktop Builds

```bash
npm run build        # All platforms
npm run build-win    # Windows .exe
npm run build-mac    # macOS .app
npm run build-linux  # Linux executable
```

## Getting Started

1. **Right-click** the workspace to open the node menu
2. **Add nodes** -- Output, Circle, Oscillator, etc.
3. **Connect ports** by dragging from output to input
4. **Adjust values** with mouse wheel or click-drag
5. **Map MIDI** with Alt+Click on any control
6. **Save** with Ctrl+S (`.svs` files)

## Features

- 125+ nodes -- patterns, filters, feedback, utilities
- WebGL2 hardware rendering
- MIDI controller mapping (CC and Note)
- Frame history buffer for feedback and time effects
- Multi-output chaining and cross-output feedback loops
- Workspace tabs for scene organization
- Recording and snapshots
- Projection window for second monitors

## MIDI

Silvia uses WebMIDI. Chrome, Edge, and Brave support it natively. Firefox needs the [Jazz-MIDI plugin](https://jazz-soft.net/).

Alt+Click any control to map it. Mappings persist across sessions.

## Architecture

```
Node Graph --> Compiler --> GLSL Fragment Shader --> WebGL2 --> Canvas
```

Each node defines a GLSL function. Connections become function call chains. The compiler flattens the graph into a single shader per Output node. Output nodes maintain their own frame history buffer for feedback.

To add a node, see `js/nodes/_template.js`.

## Docs

- [FAQ.md](FAQ.md) -- Troubleshooting
- [BUILD.md](BUILD.md) -- Desktop builds

## License

AGPLv3 -- see [LICENSE](LICENSE).

Third-party licenses are in [`licenses/`](licenses/):

- [Lucide icons](licenses/lucide.txt) (ISC)
- [gifler.js](licenses/gifler.txt) (Apache 2.0)
- [modern-normalize](licenses/modern-normalize.txt) (MIT)
- [Shadertoy code](licenses/shadertoy.txt) (WTFPL / CC0)

---

[Download](https://github.com/figrita/silvia/releases) | [Issues](https://github.com/figrita/silvia/issues)