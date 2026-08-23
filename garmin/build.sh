#!/usr/bin/env bash
# Compile the Workout Log watch app into a sideloadable .prg for the fenix 6 Pro.
#
# Prerequisites (one-time, see setup.sh):
#   - ~/garmin-toolchain populated (JDK 17 + connect-iq-sdk-manager + dev key)
#   - `connect-iq-sdk-manager login` has been run (your Garmin account)
#   - the SDK + fenix6pro device files downloaded (setup.sh does this)
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
TOOLS="$HOME/garmin-toolchain"
SDKMAN="$TOOLS/bin/connect-iq-sdk-manager"
KEY="$TOOLS/developer_key.der"
DEVICE="fenix6pro"

export JAVA_HOME="$TOOLS/jdk17/Contents/Home"

SDK_BIN="$("$SDKMAN" sdk current-path --bin 2>/dev/null || true)"
if [ -z "$SDK_BIN" ] || [ ! -d "$SDK_BIN" ]; then
  echo "No Connect IQ SDK selected yet. Run ./setup.sh first (after logging in)." >&2
  exit 1
fi
export PATH="$SDK_BIN:$PATH"

mkdir -p "$HERE/bin"
OUT="$HERE/bin/workout-log.prg"

echo "Building for $DEVICE with SDK at $SDK_BIN ..."
monkeyc -f "$HERE/monkey.jungle" -o "$OUT" -y "$KEY" -d "$DEVICE" -w

echo ""
echo "Built: $OUT"
echo "Sideload: plug in the watch and copy it into GARMIN/APPS/ (see README.md)."
