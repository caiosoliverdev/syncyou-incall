#!/usr/bin/env bash
# Release Tauri: build assinado por plataforma + upload opcional para o API (POST /api/v1/desktop-updates/publish).
#
# Uso: na pasta frontend/ →  npm run tauri:release
#      Chave privada por defeito: ../syncyou.key (raiz incall/). Sobrescreva: TAURI_SIGNING_KEY_FILE
#
# Versão: no fim do prompt (ou TAURI_RELEASE_VERSION em CI) o script grava a mesma versão em
# package.json, tauri.conf.json, Cargo.toml, package-lock.json e Cargo.lock (o updater usa Cargo.toml).
# Pergunta o alvo: macOS (Apple Silicon), macOS Intel, Windows ou Linux.
#
# Token Bearer para o upload (MESMO valor que DESKTOP_UPDATES_PUBLISH_TOKEN no backend) — defina abaixo.
# Base do API: defina DESKTOP_UPDATES_API_BASE no mesmo bloco que o token.
#
# Modo não interativo (CI):
#   TAURI_RELEASE_NON_INTERACTIVE=1
#   TAURI_RELEASE_VERSION=0.0.3   # opcional: grava esta versão em package.json, tauri.conf, Cargo.toml, package-lock, Cargo.lock
#   TAURI_UPDATER_PLATFORM=darwin-aarch64   # ou darwin-x86_64, windows-x86_64, linux-x86_64, linux-aarch64
#   TAURI_RUST_TARGET=aarch64-apple-darwin  # triplo Rust correspondente
#   TAURI_SIGNING_PRIVATE_KEY ou TAURI_SIGNING_PRIVATE_KEY_PATH

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

REPO_ROOT="$(cd "$ROOT/.." && pwd)"
DEFAULT_KEY="${TAURI_SIGNING_KEY_FILE:-$REPO_ROOT/syncyou.key}"
# Base pública do manifest (latest.json). Local: SYNCYOU_DESKTOP_UPDATES_BASE=http://localhost:3001/api/v1/desktop-updates
DEFAULT_DESKTOP_UPDATES_BASE="${SYNCYOU_DESKTOP_UPDATES_BASE:-https://teste2.syncyou.com.br/api/v1/desktop-updates}"

# --- MESMO token que DESKTOP_UPDATES_PUBLISH_TOKEN no backend (.env). Local: DESKTOP_UPDATES_API_BASE=http://localhost:3001 ---
DESKTOP_UPDATES_PUBLISH_TOKEN='syncyou-local-desktop-publish-dev'
DESKTOP_UPDATES_API_BASE='https://teste2.syncyou.com.br'
# --------------------------------------------------------------------------------------------------------

# Grava a mesma versão em todos os ficheiros que o updater / build usam (evita Cargo.toml ≠ package.json).
sync_release_version_files() {
  local v="$1"
  VERSION_TO_SET="$v" node -e '
const fs = require("fs");
const v = process.env.VERSION_TO_SET;
if (!v) process.exit(1);

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
pkg.version = v;
fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");

const tauri = JSON.parse(fs.readFileSync("src-tauri/tauri.conf.json", "utf8"));
tauri.version = v;
fs.writeFileSync("src-tauri/tauri.conf.json", JSON.stringify(tauri, null, 2) + "\n");

let cargo = fs.readFileSync("src-tauri/Cargo.toml", "utf8");
const cargoLines = cargo.split("\n");
let cargoN = 0;
for (let i = 0; i < cargoLines.length; i++) {
  if (/^version = "[^"]*"\s*$/.test(cargoLines[i])) {
    cargoLines[i] = `version = "${v}"`;
    cargoN++;
    break;
  }
}
if (cargoN !== 1) {
  console.error("Cargo.toml: não foi possível atualizar version em [package].");
  process.exit(1);
}
fs.writeFileSync("src-tauri/Cargo.toml", cargoLines.join("\n"));

const lockPath = "package-lock.json";
if (fs.existsSync(lockPath)) {
  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  lock.version = v;
  if (lock.packages && lock.packages[""]) lock.packages[""].version = v;
  fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + "\n");
}

const cargoLockPath = "src-tauri/Cargo.lock";
const lockRaw = fs.readFileSync(cargoLockPath, "utf8");
const eol = lockRaw.includes("\r\n") ? "\r\n" : "\n";
const ll = lockRaw.split(/\r?\n/);
let appLockOk = false;
for (let i = 0; i < ll.length - 2; i++) {
  if (
    ll[i] === "[[package]]" &&
    ll[i + 1] === "name = \"app\"" &&
    /^version = "[^"]+"$/.test(ll[i + 2] || "")
  ) {
    ll[i + 2] = "version = \"" + v + "\"";
    appLockOk = true;
    break;
  }
}
if (!appLockOk) {
  console.error("Cargo.lock: pacote name = \"app\" não encontrado.");
  process.exit(1);
}
const endsWithNl = /(?:\r\n|\n)$/.test(lockRaw);
let outLock = ll.join(eol);
if (endsWithNl && !/(?:\r\n|\n)$/.test(outLock)) outLock += eol === "\r\n" ? "\r\n" : "\n";
fs.writeFileSync(cargoLockPath, outLock);
console.log("Versão sincronizada em: package.json, tauri.conf.json, Cargo.toml, package-lock.json, Cargo.lock");
'
}

read_version_from_package() {
  node -e "console.log(JSON.parse(require('fs').readFileSync('package.json','utf8')).version)"
}

# --- modo interativo vs CI ---
INTERACTIVE=0
if [[ "${TAURI_RELEASE_INTERACTIVE:-}" == 1 ]]; then
  INTERACTIVE=1
elif [[ -z "${TAURI_RELEASE_NON_INTERACTIVE:-}" ]] && [[ -z "${CI:-}" ]] && [[ -c /dev/tty ]]; then
  INTERACTIVE=1
fi

CURRENT_VER="$(read_version_from_package)"

if [[ "$INTERACTIVE" -eq 1 ]]; then
  echo ""
  echo "=== SyncYou — release Tauri ==="
  echo "    (versão actual em package.json: ${CURRENT_VER})"
  echo ""
  read -r -p "Versão deste release [${CURRENT_VER}]: " INPUT_VER < /dev/tty
  VERSION="${INPUT_VER:-$CURRENT_VER}"
  if [[ -z "$VERSION" ]]; then
    echo "Versão vazia." >&2
    exit 1
  fi

  echo ""
  echo "Alvo do build (updater Tauri):"
  echo "  1) macOS — Apple Silicon (darwin-aarch64)"
  echo "  2) macOS — Intel (darwin-x86_64)"
  echo "  3) Windows (windows-x86_64)"
  echo "  4) Linux x86_64 AppImage (linux-x86_64)"
  echo "  5) Linux arm64 AppImage (linux-aarch64)"
  DEFAULT_PT=1
  if [[ "$(uname -s)" == "Darwin" ]] && [[ "$(uname -m)" != "arm64" ]]; then
    DEFAULT_PT=2
  fi
  read -r -p "Opção [${DEFAULT_PT}]: " PT_CHOICE < /dev/tty
  PT_CHOICE="${PT_CHOICE:-$DEFAULT_PT}"
  case "$PT_CHOICE" in
    1)
      TAURI_UPDATER_PLATFORM="${TAURI_UPDATER_PLATFORM:-darwin-aarch64}"
      RUST_TARGET="${TAURI_RUST_TARGET:-aarch64-apple-darwin}"
      ;;
    2)
      TAURI_UPDATER_PLATFORM="${TAURI_UPDATER_PLATFORM:-darwin-x86_64}"
      RUST_TARGET="${TAURI_RUST_TARGET:-x86_64-apple-darwin}"
      ;;
    3)
      TAURI_UPDATER_PLATFORM="${TAURI_UPDATER_PLATFORM:-windows-x86_64}"
      RUST_TARGET="${TAURI_RUST_TARGET:-x86_64-pc-windows-msvc}"
      ;;
    4)
      TAURI_UPDATER_PLATFORM="${TAURI_UPDATER_PLATFORM:-linux-x86_64}"
      RUST_TARGET="${TAURI_RUST_TARGET:-x86_64-unknown-linux-gnu}"
      ;;
    5)
      TAURI_UPDATER_PLATFORM="${TAURI_UPDATER_PLATFORM:-linux-aarch64}"
      RUST_TARGET="${TAURI_RUST_TARGET:-aarch64-unknown-linux-gnu}"
      ;;
    *)
      echo "Opção inválida." >&2
      exit 1
      ;;
  esac

  DEFAULT_NOTES="Release v${VERSION} (${TAURI_UPDATER_PLATFORM})"
  read -r -p "Notas (opcional) [${DEFAULT_NOTES}]: " INPUT_NOTES < /dev/tty
  NOTES="${INPUT_NOTES:-$DEFAULT_NOTES}"

else
  if [[ -n "${TAURI_RELEASE_VERSION:-}" ]]; then
    VERSION="${TAURI_RELEASE_VERSION}"
  else
    VERSION="$(read_version_from_package)"
  fi
  NOTES="${RELEASE_NOTES:-Release v${VERSION}}"
  if [[ -z "${TAURI_UPDATER_PLATFORM:-}" ]] || [[ -z "${TAURI_RUST_TARGET:-}" ]]; then
    echo "Erro (CI): defina TAURI_UPDATER_PLATFORM e TAURI_RUST_TARGET." >&2
    exit 1
  fi
fi

echo ""
echo "==> Sincronizar versão ${VERSION} (package.json, tauri.conf.json, Cargo.toml, package-lock.json, Cargo.lock)"
sync_release_version_files "${VERSION}"

export TAURI_UPDATER_PLATFORM

# PATH do ambiente apontando para ficheiro inexistente (ex. placeholder em .zshrc) impede usar incall/syncyou.key
if [[ -n "${TAURI_SIGNING_PRIVATE_KEY_PATH:-}" ]] && [[ ! -f "${TAURI_SIGNING_PRIVATE_KEY_PATH}" ]]; then
  echo "Aviso: TAURI_SIGNING_PRIVATE_KEY_PATH inexistente (${TAURI_SIGNING_PRIVATE_KEY_PATH}) — ignorado. Corra: unset TAURI_SIGNING_PRIVATE_KEY_PATH" >&2
  unset TAURI_SIGNING_PRIVATE_KEY_PATH
fi

if [[ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ]]; then
  if [[ -n "${TAURI_SIGNING_PRIVATE_KEY_PATH:-}" ]] && [[ -f "${TAURI_SIGNING_PRIVATE_KEY_PATH}" ]]; then
    export TAURI_SIGNING_PRIVATE_KEY="$(cat "${TAURI_SIGNING_PRIVATE_KEY_PATH}")"
    echo "==> Chave: ${TAURI_SIGNING_PRIVATE_KEY_PATH}"
  elif [[ -f "$DEFAULT_KEY" ]]; then
    export TAURI_SIGNING_PRIVATE_KEY="$(cat "$DEFAULT_KEY")"
    echo "==> Chave: ${DEFAULT_KEY}"
  elif [[ "$INTERACTIVE" -eq 1 ]]; then
    read -r -p "Arquivo da chave privada do updater [${DEFAULT_KEY}]: " INPUT_KEY < /dev/tty
    KEYFILE="${INPUT_KEY:-$DEFAULT_KEY}"
    KEYFILE="${KEYFILE/#\~/$HOME}"
    if [[ ! -f "$KEYFILE" ]]; then
      echo "" >&2
      echo "Erro: arquivo não encontrado: ${KEYFILE}" >&2
      echo "Gere na raiz do repo: cd \"${REPO_ROOT}/frontend\" && npm run tauri signer generate -w \"${REPO_ROOT}/syncyou.key\"" >&2
      exit 1
    fi
    export TAURI_SIGNING_PRIVATE_KEY="$(cat "$KEYFILE")"
  else
    echo "Erro: coloque ${DEFAULT_KEY} ou defina TAURI_SIGNING_PRIVATE_KEY / TAURI_SIGNING_PRIVATE_KEY_PATH (ficheiro que exista)." >&2
    exit 1
  fi
fi

if [[ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ]]; then
  echo "Erro: chave privada não definida." >&2
  exit 1
fi

if [[ "$INTERACTIVE" -eq 1 ]] && [[ -z "${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}" ]]; then
  read -r -s -p "Senha da chave (Enter se não tiver): " KEYPASS < /dev/tty
  echo ""
  if [[ -n "${KEYPASS:-}" ]]; then
    export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$KEYPASS"
  fi
fi

RELEASE_DOWNLOAD_BASE="${RELEASE_DOWNLOAD_BASE:-$DEFAULT_DESKTOP_UPDATES_BASE}"
JSON_DIR="${RELEASE_JSON_OUTDIR:-$ROOT}"
UPLOAD_API_BASE="${DESKTOP_UPDATES_API_BASE}"
# Com `tauri build --target …` os bundles ficam em target/<triple>/release/bundle/, não em target/release/bundle/
BUNDLE_DIR="$ROOT/src-tauri/target/${RUST_TARGET}/release/bundle"

echo ""
echo "==> Versão: ${VERSION}  |  plataforma updater: ${TAURI_UPDATER_PLATFORM}  |  Rust target: ${RUST_TARGET}"
echo "==> npm run tauri build -- --target ${RUST_TARGET}"
npm run tauri build -- --target "${RUST_TARGET}"

echo "==> Gerando latest.json local em ${JSON_DIR} (URL alinhada com GET .../desktop-updates/files/...)"
(
  cd "$JSON_DIR"
  node "$ROOT/scripts/generate-latest-json.cjs" "$BUNDLE_DIR" "$RELEASE_DOWNLOAD_BASE" "$NOTES"
)

PUBLISH_TOKEN="${DESKTOP_UPDATES_PUBLISH_TOKEN:-}"
ARTIFACT_LINES=()
while IFS= read -r line; do ARTIFACT_LINES+=("$line"); done < <(
  node "$ROOT/scripts/find-updater-artifact.cjs" "$BUNDLE_DIR" "$TAURI_UPDATER_PLATFORM"
)
INSTALLER_PATH="${ARTIFACT_LINES[0]:-}"
SIG_PATH="${ARTIFACT_LINES[1]:-}"

if [[ -z "$PUBLISH_TOKEN" ]]; then
  echo ""
  echo "Aviso: DESKTOP_UPDATES_PUBLISH_TOKEN vazio — não foi feito upload ao backend."
  echo "        Edite o bloco no início de scripts/tauri-release.sh (ou o mesmo valor no backend)."
  echo "        Manifest dinâmico: ${UPLOAD_API_BASE}/api/v1/desktop-updates/latest.json"
else
  echo ""
  echo "==> A enviar artefactos para ${UPLOAD_API_BASE} ..."
  TMP_UPLOAD_BODY="$(mktemp)"
  CURL_ARGS=(
    -sS -X POST "${UPLOAD_API_BASE}/api/v1/desktop-updates/publish"
    -H "Authorization: Bearer ${PUBLISH_TOKEN}"
    -o "$TMP_UPLOAD_BODY"
    -w "%{http_code}"
    -F "appVersion=${VERSION}"
    -F "platform=${TAURI_UPDATER_PLATFORM}"
    -F "bundle=@${INSTALLER_PATH}"
    -F "signature=@${SIG_PATH}"
  )
  if [[ -n "${NOTES}" ]]; then
    CURL_ARGS+=(-F "notes=${NOTES}")
  fi
  if ! HTTP_CODE="$(curl "${CURL_ARGS[@]}")"; then
    cat "$TMP_UPLOAD_BODY" 2>/dev/null || true
    echo "" >&2
    rm -f "$TMP_UPLOAD_BODY"
    echo "Erro: curl não ligou a ${UPLOAD_API_BASE} (backend Nest a correr? PORT=3001?)." >&2
    exit 1
  fi
  cat "$TMP_UPLOAD_BODY"
  echo ""
  rm -f "$TMP_UPLOAD_BODY"
  if [[ "${HTTP_CODE}" != "200" && "${HTTP_CODE}" != "201" ]]; then
    echo "" >&2
    echo "Erro: upload falhou (HTTP ${HTTP_CODE:-?}). Sem registo na BD, GET latest.json devolve 404." >&2
    echo "  • No backend (.env): DESKTOP_UPDATES_PUBLISH_TOKEN igual ao valor em scripts/tauri-release.sh" >&2
    echo "  • API_PUBLIC_ORIGIN no backend (.env — URL pública do API, sem / no fim)" >&2
    echo "  • Reinicie o Nest depois de editar o .env" >&2
    exit 1
  fi
  echo "==> Upload concluído. Manifest: ${UPLOAD_API_BASE}/api/v1/desktop-updates/latest.json"
fi

MACOS_BUNDLE="$BUNDLE_DIR/macos"
if [[ -f "$JSON_DIR/latest.json" ]] && [[ -d "$MACOS_BUNDLE" ]] && [[ "$TAURI_UPDATER_PLATFORM" == darwin-* ]]; then
  cp -f "$JSON_DIR/latest.json" "$MACOS_BUNDLE/latest.json"
  echo "==> latest.json copiado para $MACOS_BUNDLE/latest.json"
fi

if [[ -d "$REPO_ROOT/release" ]] && [[ -f "$JSON_DIR/latest.json" ]]; then
  cp -f "$JSON_DIR/latest.json" "$REPO_ROOT/release/latest.json"
  echo "==> (Opcional) ${REPO_ROOT}/release/latest.json"
fi

echo ""
echo "==> Concluído. Base do manifest no cliente (tauri.conf endpoints): ${RELEASE_DOWNLOAD_BASE}/latest.json"
echo "    Produção: HTTPS, API_PUBLIC_ORIGIN no servidor, e dangerousInsecureTransportProtocol: false quando for TLS."
echo ""
