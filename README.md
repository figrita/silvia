# Silvia

> A browser-based modular video synthesizer that compiles node graphs into GLSL shaders

![Silvia Logo](assets/icons/silvia_logo_name.png)

Silvia is a powerful, real-time video synthesizer that runs entirely in your browser or as a portable desktop application. Create stunning visuals by connecting nodes in a graph-based interface that generates optimized GLSL shaders on the fly.

## ✨ Features

- **🎹 Modular Design** - Connect nodes to build complex visual effects
- **⚡ Real-time Performance** - Hardware-accelerated WebGL2 rendering  
- **🎵 MIDI Integration** - Map hardware controllers to any parameter
- **📱 Cross-Platform** - Runs in browsers and as portable desktop apps
- **🔄 Live Coding** - No compilation step, instant visual feedback
- **💾 Portable** - Self-contained with no system dependencies
- **🎨 Rich Node Library** - 80+ built-in nodes for patterns, effects, and utilities

## 🚀 Quick Start

1. Clone it
2. Start any server in the directory (e.g. `npx serve .`, `python -m http.server`, whatever)
3. Open `http://localhost:8000` (or whatever port your server uses)

No build step, no react, just good old vanilla javascript and html5.

### Portable Builds
```bash
npm run build        # All platforms
npm run build-win    # Windows .exe
npm run build-mac    # macOS .app  
npm run build-linux  # Linux executable
```

## 🎮 Getting Started

1. **Right-click** in the workspace to open the node menu
2. **Add nodes** like Output, Circle, or Oscillator
3. **Connect ports** by dragging from output to input
4. **Adjust parameters** with mouse wheel or click-drag
5. **Map MIDI** with Alt+Click on any control
6. **Save patches** with Ctrl+S (.svs files)

## 📚 Documentation

- **[FAQ.md](FAQ.md)** - Frequently asked questions and troubleshooting
- **[BUILD.md](BUILD.md)** - Building portable executables

## 🎵 MIDI Support

Silvia supports WebMIDI for hardware controller integration:

- **Chrome/Edge/Brave** - Native WebMIDI support
- **Firefox** - Requires [Jazz-MIDI plugin](https://jazz-soft.net/)
- **Alt+Click** any control to map MIDI CC or notes
- **Automatic device detection** - Connect controllers and start playing


## 🏗️ Architecture

Silvia compiles node graphs into optimized GLSL fragment shaders:

```
Node Graph → GLSL Shader → WebGL2 → Canvas
```

- **Nodes** define GLSL functions and uniforms
- **Connections** create function call chains  
- **Compiler** generates optimized shader code
- **WebGL2** renders with hardware acceleration

### Adding New Nodes

See the template at `js/nodes/_template.js`.

## 📄 License

AGPLv3 - See [LICENSE](LICENSE) for details.

### Third-Party Components
- Some shader code from Shadertoy (WTFPL/CC0 licensed)
- gifler.js (Apache 2.0)
- modern-normalize (MIT)
- some stack overflow snippets in js/shaderUtils.js
- See individual files for specific attributions

---

**[Download Latest Release](https://github.com/figrita/silvia/releases) | [Report Issues](https://github.com/figrita/silvia/issues)**