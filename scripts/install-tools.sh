#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────
# Memory OS — Video analysis tools installer
# Downloads yt-dlp + ffmpeg static binaries
# into the tools/ directory at project root.
# ──────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TOOLS_DIR="$SCRIPT_DIR/../tools"
mkdir -p "$TOOLS_DIR"

OS="$(uname -s)"
ARCH="$(uname -m)"

echo "→ OS: $OS / Arch: $ARCH"
echo "→ Tools dir: $TOOLS_DIR"
echo ""

# ── yt-dlp ────────────────────────────────

YT_DLP="$TOOLS_DIR/yt-dlp"

if [ -x "$YT_DLP" ] && [ "${1:-}" != "--force" ]; then
  echo "✓ yt-dlp already installed ($( "$YT_DLP" --version 2>/dev/null || echo "unknown" ))"
else
  echo "↓ Downloading yt-dlp..."
  case "$OS" in
    Darwin)
      curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos" -o "$YT_DLP"
      ;;
    Linux)
      curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux" -o "$YT_DLP"
      ;;
    *)
      echo "✗ Unsupported OS: $OS"
      exit 1
      ;;
  esac
  chmod +x "$YT_DLP"
  echo "✓ yt-dlp installed ($( "$YT_DLP" --version 2>/dev/null || echo "done" ))"
fi

# ── ffmpeg ─────────────────────────────────

FFMPEG="$TOOLS_DIR/ffmpeg"

if [ -x "$FFMPEG" ] && [ "${1:-}" != "--force" ]; then
  echo "✓ ffmpeg already installed ($( "$FFMPEG" -version 2>/dev/null | head -1 || echo "unknown" ))"
else
  echo "↓ Downloading ffmpeg..."
  case "$OS" in
    Darwin)
      # evermeet.cx static build
      TMP_ZIP="$(mktemp -d)/ffmpeg.zip"
      curl -fsSL "https://evermeet.cx/ffmpeg/getrelease/zip" -o "$TMP_ZIP"
      unzip -o "$TMP_ZIP" -d "$TOOLS_DIR" > /dev/null
      rm -rf "$(dirname "$TMP_ZIP")"
      ;;
    Linux)
      # johnvansickle.com static build
      TMP_TAR="$(mktemp -d)/ffmpeg.tar.xz"
      curl -fsSL "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz" -o "$TMP_TAR"
      tar -xf "$TMP_TAR" -C "$TOOLS_DIR" --strip-components=1 --wildcards "*/ffmpeg"
      rm -rf "$(dirname "$TMP_TAR")"
      ;;
    *)
      echo "✗ Unsupported OS: $OS"
      exit 1
      ;;
  esac
  chmod +x "$FFMPEG"
  echo "✓ ffmpeg installed ($( "$FFMPEG" -version 2>/dev/null | head -1 || echo "done" ))"
fi

echo ""
echo "── All tools ready ──"
echo "   yt-dlp: $(command -v "$YT_DLP")"
echo "   ffmpeg: $(command -v "$FFMPEG")"
