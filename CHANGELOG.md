# Silvia 0.7-beta

## Workspaces
- Unlimited independent workspaces in a tab bar
- Click a tab to switch, double-click to rename, right-click for options
- Nodes can appear on multiple workspaces — toggle from the node right-click menu
- Cross-workspace connections show source tags on ports — click to jump to the source
- Ctrl+T to create a new workspace, Ctrl+1–9 to switch

## Main Input
- New left-side panel for global video and audio source management
- Video: file, webcam, or screen capture with live preview
- Audio: file, mic/line-in, or video audio with spectrum display, level meters, gain, and 3-band EQ
- Main Input node provides video texture, bass/bass+/mid/high levels, and oscilloscope output
- Panel collapses out of the way when not needed

## Compound Patches
- Save all open workspaces into a single .svs patch file
- Load compound patches to restore a full multi-workspace session
- "+New" button to load a patch into new workspace(s) without replacing existing ones
- Compound patches marked with a 📦 badge in the load browser

## New Nodes
- **Dither** — ordered dithering with Bayer 2×2/4×4/8×8 and hash noise patterns, with optional pixelation
- **Smoothstep** — soft threshold between two edges
- **Domain Warp** — fractal noise-driven UV distortion
- **Glitch** — digital glitch effects with block displacement, color channel shifting, and scanlines
- **Kuwahara** — painterly smoothing filter that preserves edges
- **Pixel Sort** — sort pixels by brightness/hue/saturation along rows or columns
- **Scatter** — randomly displaces pixels using noise-based offset
- **Tunnel 3D** — raymarched 3D tunnel fly-through with textured walls

## Enhancements
- **Edge Detection** — pixel/UV sample space option for resolution-independent behavior
- Media nodes use textureSize() for dynamic aspect ratio — no recompile on source change
- Main Input texture uploads deduplicated to once per frame per GL context
- Sampling cost warnings (🛆) on nodes that multiply upstream work — hover for details
- Mixer preview labels are clickable to jump to that workspace
- Save filename defaults to the active tab name
- Empty workspace cleaned up automatically if "load as new" produces no nodes

## Fixes
- Fixed VRAM leaks when swapping video sources (proper media element cleanup)
- Fixed race conditions in video node when changing sources rapidly
- Fixed preview stream leak on mixer channel reassignment
- Fixed texture binding order (activeTexture must precede bindTexture)
- Fixed audio source type not resetting on load failure
- Fixed in-place mutation of cached patch data on load
- Context menu scoped to editor area; fixed node placement offset

## Other
- Renamed "Master" to "Main" throughout the UI
- Howto guide updated with workspace, Main Input, and performance documentation
