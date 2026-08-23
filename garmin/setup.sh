#!/usr/bin/env bash
# One-time setup for building the Workout Log watch app: accept the SDK
# agreement, log in to Garmin (interactive, in your browser), select the SDK,
# and download the fenix 6 Pro device files.
#
# Your Garmin password is entered on Garmin's own page during `login` — it is
# never seen by this script or by Claude.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
TOOLS="$HOME/garmin-toolchain"
SDKMAN="$TOOLS/bin/connect-iq-sdk-manager"
SDK_VERSION="${SDK_VERSION:-*}"   # * = latest available; override to pin, e.g. SDK_VERSION=7.4.3

export JAVA_HOME="$TOOLS/jdk17/Contents/Home"

echo "1/4  Accepting the SDK agreement..."
HASH="$("$SDKMAN" agreement view 2>/dev/null | awk -F': ' '/Current Hash/ {print $2}')"
"$SDKMAN" agreement accept --agreement-hash="$HASH"

echo "2/4  Logging in to Garmin (a browser window will open)..."
"$SDKMAN" login

echo "3/4  Downloading the Connect IQ SDK ($SDK_VERSION)..."
"$SDKMAN" sdk set "$SDK_VERSION"

echo "4/4  Downloading device files for the manifest (fenix 6 Pro)..."
"$SDKMAN" device download --manifest "$HERE/manifest.xml"

echo ""
echo "Setup complete. Now run ./build.sh"
