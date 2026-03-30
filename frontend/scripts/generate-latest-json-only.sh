#!/usr/bin/env bash
# Gera latest.json sem correr tauri build (precisa de src-tauri/target/release/bundle já existente).
# Uso: na pasta frontend/ →  npm run tauri:latest-json

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

REPO_ROOT="$(cd "$ROOT/.." && pwd)"
BUNDLE_DIR="$ROOT/src-tauri/target/release/bundle"
BACKEND_DESKTOP_DIR="${BACKEND_DESKTOP_DIR:-$REPO_ROOT/backend/data/desktop-updates}"
DEFAULT_DESKTOP_BASE="${SYNCYOU_DESKTOP_UPDATES_BASE:-http://localhost:3001/api/v1/desktop-updates}"

if [[ ! -d "$BUNDLE_DIR" ]]; then
  echo "Erro: não existe $BUNDLE_DIR — rode antes: npm run tauri build" >&2
  exit 1
fi

VERSION="$(node -e "console.log(JSON.parse(require('fs').readFileSync('src-tauri/tauri.conf.json','utf8')).version)")"
TAG="v${VERSION}"
RELEASE_DOWNLOAD_BASE="${RELEASE_DOWNLOAD_BASE:-$DEFAULT_DESKTOP_BASE}"
NOTES="${RELEASE_NOTES:-Release ${TAG}}"

node "$ROOT/scripts/generate-latest-json.cjs" "$BUNDLE_DIR" "$RELEASE_DOWNLOAD_BASE" "$NOTES"

MACOS_BUNDLE="$BUNDLE_DIR/macos"
if [[ -d "$MACOS_BUNDLE" ]]; then
  cp -f "$ROOT/latest.json" "$MACOS_BUNDLE/latest.json"
fi

mkdir -p "$BACKEND_DESKTOP_DIR"
cp -f "$ROOT/latest.json" "$BACKEND_DESKTOP_DIR/latest.json"
if [[ -f "$MACOS_BUNDLE/SyncYou.app.tar.gz" ]]; then
  cp -f "$MACOS_BUNDLE/SyncYou.app.tar.gz" "$BACKEND_DESKTOP_DIR/"
fi
if [[ -f "$MACOS_BUNDLE/SyncYou.app.tar.gz.sig" ]]; then
  cp -f "$MACOS_BUNDLE/SyncYou.app.tar.gz.sig" "$BACKEND_DESKTOP_DIR/"
fi

mkdir -p "$REPO_ROOT/release"
cp -f "$ROOT/latest.json" "$REPO_ROOT/release/latest.json"

echo ""
echo "Gerado:"
echo "  → $ROOT/latest.json"
echo "  → $MACOS_BUNDLE/latest.json (se existir macos/)"
echo "  → $BACKEND_DESKTOP_DIR/  (sirva com o Nest)"
echo "  → $REPO_ROOT/release/latest.json (opcional Git)"
echo ""
