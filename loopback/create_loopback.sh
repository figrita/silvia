#!/bin/bash
# Two sinks, one mic.
#
# Sinks (set any app's output to one of these):
#   Silvia_loopback         — goes to mic only
#   Silvia_loopback_monitor — goes to mic AND default speakers
#
# Mic (select in Silvia):
#   Silvia_mic

set -e

DEFAULT_SINK=$(pactl info | grep "Default Sink" | cut -d: -f2 | xargs)

# --- Silvia_loopback: the base sink, mic only ---
echo "Creating Silvia_loopback sink..."
pactl load-module module-null-sink \
  sink_name=Silvia_loopback \
  sink_properties=device.description="Silvia_loopback"

# --- Virtual mic from Silvia_loopback ---
echo "Creating Silvia_mic..."
pactl load-module module-virtual-source \
  source_name=Silvia_mic \
  master=Silvia_loopback.monitor \
  source_properties=device.description="Silvia_mic"

# --- Silvia_loopback_monitor: feeds into Silvia_loopback + default speakers ---
echo "Creating Silvia_loopback_monitor sink..."
pactl load-module module-null-sink \
  sink_name=Silvia_loopback_monitor \
  sink_properties=device.description="Silvia_loopback_monitor"

# Route monitor -> Silvia_loopback (which feeds the mic)
pactl load-module module-loopback \
  source=Silvia_loopback_monitor.monitor \
  sink=Silvia_loopback

# Route monitor -> default speakers
if [ -n "$DEFAULT_SINK" ]; then
  echo "  Passthrough to $DEFAULT_SINK..."
  pactl load-module module-loopback \
    source=Silvia_loopback_monitor.monitor \
    sink="$DEFAULT_SINK"
fi

echo ""
echo "Done!"
echo "  Silvia_loopback         — mic only (silent)"
echo "  Silvia_loopback_monitor — mic + speakers"
echo "  Select 'Silvia_mic' as input in Silvia."
