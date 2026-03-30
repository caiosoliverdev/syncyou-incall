/**
 * Utilitários partilhados para localizar artefactos do updater Tauri 2 após `tauri build`.
 */

const fs = require("fs");
const path = require("path");

function walkFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) out.push(...walkFiles(p));
    else out.push(p);
  }
  return out;
}

function findUpdaterPath(all, key) {
  if (key.startsWith("darwin")) {
    const tgz = all.find(
      (f) =>
        f.includes(`${path.sep}macos${path.sep}`) &&
        f.endsWith(".app.tar.gz") &&
        !f.endsWith(".sig"),
    );
    return tgz ?? null;
  }
  if (key.startsWith("linux")) {
    const img = all.find((f) => f.endsWith(".AppImage"));
    if (img) return img;
    const tgz = all.find(
      (f) =>
        (f.includes(`${path.sep}appimage${path.sep}`) ||
          f.includes(`${path.sep}linux${path.sep}`)) &&
        f.endsWith(".tar.gz") &&
        !f.endsWith(".sig"),
    );
    return tgz ?? null;
  }
  if (key.startsWith("windows")) {
    const setup = all.find(
      (f) =>
        (f.endsWith(".exe") && f.toLowerCase().includes("setup")) ||
        f.endsWith(".msi"),
    );
    return setup ?? null;
  }
  return null;
}

/**
 * @param {string} bundleDir - ex.: src-tauri/target/release/bundle
 * @param {string} platformKey - ex.: darwin-aarch64
 */
function findInstallerAndSig(bundleDir, platformKey) {
  const absBundle = path.resolve(bundleDir);
  const all = walkFiles(absBundle);
  const installerPath = findUpdaterPath(all, platformKey);
  if (!installerPath || !fs.existsSync(installerPath)) {
    return { installerPath: null, sigPath: null };
  }
  const sigPath = `${installerPath}.sig`;
  if (!fs.existsSync(sigPath)) {
    return { installerPath, sigPath: null };
  }
  return { installerPath, sigPath };
}

module.exports = {
  walkFiles,
  findUpdaterPath,
  findInstallerAndSig,
};
