#!/bin/bash
# Remove the virtual audio modules created by create_loopback.sh

echo "Removing loopback modules..."
pactl unload-module module-loopback 2>/dev/null && echo "  Removed loopback" || echo "  No loopback found"

echo "Removing virtual source..."
pactl unload-module module-virtual-source 2>/dev/null && echo "  Removed virtual source" || echo "  No virtual source found"

echo "Removing null sink..."
pactl unload-module module-null-sink 2>/dev/null && echo "  Removed null sink" || echo "  No null sink found"

echo "Done! Audio routing restored to defaults."
