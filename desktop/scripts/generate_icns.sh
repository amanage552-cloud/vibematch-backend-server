#!/usr/bin/env bash
set -euo pipefail
# Generates an .icns icon from ../public/assets/icon.png using macOS sips and iconutil
# Run this on macOS locally: bash desktop/scripts/generate_icns.sh

SRC=../public/assets/icon.png
OUT_DIR=build/icon.iconset
OUT_ICNS=../public/assets/icon.icns

if [[ ! -f "$SRC" ]]; then
  echo "Source PNG not found at $SRC" >&2
  exit 1
fi

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

echo "Generating iconset from $SRC..."
# create sizes
sips -z 16 16     "$SRC" --out "$OUT_DIR/icon_16x16.png"
sips -z 32 32     "$SRC" --out "$OUT_DIR/icon_16x16@2x.png"
sips -z 32 32     "$SRC" --out "$OUT_DIR/icon_32x32.png"
sips -z 64 64     "$SRC" --out "$OUT_DIR/icon_32x32@2x.png"
sips -z 128 128   "$SRC" --out "$OUT_DIR/icon_128x128.png"
sips -z 256 256   "$SRC" --out "$OUT_DIR/icon_128x128@2x.png"
sips -z 256 256   "$SRC" --out "$OUT_DIR/icon_256x256.png"
sips -z 512 512   "$SRC" --out "$OUT_DIR/icon_256x256@2x.png"
sips -z 512 512   "$SRC" --out "$OUT_DIR/icon_512x512.png"

echo "Packing iconset to $OUT_ICNS..."
iconutil -c icns "$OUT_DIR" -o "$OUT_ICNS"

echo "Generated $OUT_ICNS"
rm -rf "$OUT_DIR"
