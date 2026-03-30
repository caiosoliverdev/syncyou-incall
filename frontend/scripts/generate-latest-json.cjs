#!/usr/bin/env node
/**
 * Gera latest.json no formato do updater Tauri 2, associando o bundle correto à chave de plataforma.
 *
 * O binário `tauri-latest-json` (crates.io) classifica qualquer .tar.gz como "linux" e trata .dmg como
 * darwin-aarch64 sem .sig correspondente — quebrando builds macOS. Este script usa o .app.tar.gz do
 * updater e a chave darwin-* / linux-* / windows-* conforme o host (ou TAURI_UPDATER_PLATFORM).
 *
 * Uso (cwd = pasta frontend):
 *   node scripts/generate-latest-json.cjs <bundleDir> <downloadBaseUrl> [notes]
 */

const fs = require("fs");
const path = require("path");
const { findInstallerAndSig } = require("./updater-bundle-utils.cjs");

const [bundleDir, downloadBase, notesArg] = process.argv.slice(2);
const notes = notesArg ?? "";

if (!bundleDir || !downloadBase) {
  console.error(
    "Uso: node scripts/generate-latest-json.cjs <bundleDir> <downloadBaseUrl> [notes]",
  );
  process.exit(1);
}

function platformKeyFromEnv() {
  const o = process.env.TAURI_UPDATER_PLATFORM;
  if (o) return o;
  const p = process.platform;
  const a = process.arch;
  if (p === "darwin") return a === "arm64" ? "darwin-aarch64" : "darwin-x86_64";
  if (p === "linux") return a === "arm64" ? "linux-aarch64" : "linux-x86_64";
  if (p === "win32") return "windows-x86_64";
  throw new Error(`Plataforma não suportada: ${p} ${a}`);
}

const key = platformKeyFromEnv();
const absBundle = path.resolve(bundleDir);
const { installerPath, sigPath } = findInstallerAndSig(absBundle, key);

if (!installerPath || !fs.existsSync(installerPath)) {
  console.error(
    `Não foi encontrado o artefato do updater para ${key} em:\n  ${absBundle}`,
  );
  process.exit(1);
}

if (!sigPath || !fs.existsSync(sigPath)) {
  console.error(`Assinatura não encontrada (esperado ao lado do bundle):\n  ${installerPath}.sig`);
  process.exit(1);
}

const pkgPath = path.join(process.cwd(), "package.json");
const version = JSON.parse(fs.readFileSync(pkgPath, "utf8")).version;
const signature = fs.readFileSync(sigPath, "utf8").trim();
const fileName = path.basename(installerPath);
const base = downloadBase.replace(/\/$/, "");
const url = `${base}/files/${version}/${key}/${encodeURIComponent(fileName)}`;

const payload = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    [key]: {
      signature,
      url,
    },
  },
};

const outFile = path.join(process.cwd(), "latest.json");
fs.writeFileSync(outFile, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`✅ latest.json → ${outFile}`);
console.log(`   Plataforma: ${key}  |  Artefato: ${fileName}`);
