# Silvia 0.7

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
- **Dither** — ordered dithering with Bayer 2×2/4×4/8×8 and blue noise patterns, with optional pixelation
- **Smoothstep** — soft threshold between two edges

## Other
- Sampling cost warnings (🛆) on nodes that multiply upstream work — hover for details
- Mixer preview labels are clickable to jump to that workspace
- Save filename defaults to the active tab name
- Renamed "Master" to "Main" throughout the UI
- Howto guide updated with workspace, Main Input, and performance documentation
