#!/usr/bin/env node
/**
 * Imprime o caminho do bundle e do .sig (uma linha cada) para o par bundleDir + platformKey.
 * Uso: node scripts/find-updater-artifact.cjs <bundleDir> <platformKey>
 */

const { findInstallerAndSig } = require("./updater-bundle-utils.cjs");

const [bundleDir, platformKey] = process.argv.slice(2);
if (!bundleDir || !platformKey) {
  console.error(
    "Uso: node scripts/find-updater-artifact.cjs <bundleDir> <platformKey>",
  );
  process.exit(1);
}

const { installerPath, sigPath } = findInstallerAndSig(bundleDir, platformKey);
if (!installerPath) {
  console.error(`Bundle não encontrado para ${platformKey} em ${bundleDir}`);
  process.exit(1);
}
if (!sigPath) {
  console.error(`Assinatura em falta para:\n  ${installerPath}`);
  process.exit(1);
}
console.log(installerPath);
console.log(sigPath);
