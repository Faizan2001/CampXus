#!/usr/bin/env bash
set -euo pipefail

# Generates optimized avatar thumbnails for the landing presence demo.
# Requires ImageMagick `convert` in PATH.
#
# Output:
#   public/assets/landing-friends/thumbs/<name>-160.webp
#   public/assets/landing-friends/thumbs/<name>-160.jpg
#   public/assets/landing-friends/thumbs/<name>-320.webp
#   public/assets/landing-friends/thumbs/<name>-320.jpg
#
# Usage:
#   bash scripts/optimize-landing-friends-images.sh

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

IN_DIR="public/assets/landing-friends"
OUT_DIR="public/assets/landing-friends/thumbs"

mkdir -p "$OUT_DIR"

FILES=(
  "atifdp.jpg"
  "aurkodp.jpeg"
  "aurpadp.jpeg"
  "dev-picture-1.jpg"
  "hashmitadp.jpeg"
  "mehaldp.jpeg"
  "moin_dp.jpeg"
  "omardp.jpeg"
  "salmandp.jpeg"
  "sameedp.jpeg"
  "samiya_dp.jpeg"
  "shams_dp.jpeg"
)

if ! command -v convert >/dev/null 2>&1; then
  echo "❌ ImageMagick 'convert' not found in PATH"
  exit 1
fi

for f in "${FILES[@]}"; do
  in="${IN_DIR}/${f}"
  base="${f%.*}"

  echo "→ ${f}"

  for size in 160 320; do
    out_webp="${OUT_DIR}/${base}-${size}.webp"
    out_jpg="${OUT_DIR}/${base}-${size}.jpg"

    convert "$in" \
      -auto-orient -strip -filter Lanczos \
      -resize ${size}x${size}^ -gravity center -extent ${size}x${size} \
      -define webp:method=6 -quality 82 \
      "$out_webp"

    convert "$in" \
      -auto-orient -strip -filter Lanczos \
      -resize ${size}x${size}^ -gravity center -extent ${size}x${size} \
      -interlace Plane -sampling-factor 4:2:0 -quality 86 \
      "$out_jpg"
  done
done

echo "✅ Wrote thumbnails to ${OUT_DIR}/"
