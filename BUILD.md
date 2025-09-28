# Building Silvia - Portable Executables Only

Silvia builds **portable executables only** - no installers, no system dependencies. Just download, unzip, and run!

## Build Commands

```bash
# Build all platforms
npm run build

# Individual platforms  
npm run build-win    # Windows portable .exe
npm run build-mac    # macOS portable .app bundle  
npm run build-linux  # Linux portable directory
```

## Output Files

All builds go to `dist/` directory:

### Windows
- `dist/win-unpacked/` - Directory with Silvia.exe and resources  
- **Usage**: Double-click `Silvia.exe` to run, or `.\Silvia.exe myPatch.svs`
- **Benefits**: Fast startup, no extraction delay, true portability

### macOS  
- `dist/mac/Silvia.app/` - Self-contained app bundle
- **Usage**: Double-click Silvia.app to run

### Linux
- `dist/linux-unpacked/` - Directory with executable and resources
- **Usage**: `./dist/linux-unpacked/silvia` or `./silvia myPatch.svs`

## Portable Workspace

Each Silvia installation creates its own workspace in the same directory:

```
win-unpacked/         # (Windows directory)
├── Silvia.exe        # Main executable
├── assets/           # Media files imported by nodes
│   ├── images/
│   ├── videos/ 
│   └── audio/
├── patches/          # All .svs patch files 
```

## Features

✅ **Fully Portable** - Copy entire folder anywhere, works identically  
✅ **No Installation** - No system registry/folder modifications  
✅ **Self-Contained** - All patches and assets stay with executable  
✅ **File Association** - `.svs` files open in Silvia (when supported by OS)  
✅ **Command Line** - `silvia.exe myPatch.svs` opens patch directly  
✅ **Drag & Drop** - Drop `.svs` files onto executable to open  

## Prerequisites

- Node.js 16+ 
- `npm install` to install dependencies

## Development

```bash
npm start           # Run in development mode
npm run web         # Run web version (browser)
```

The portable approach means users get a clean, simple experience with no system pollution!