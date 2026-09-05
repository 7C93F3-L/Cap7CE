const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const electronBuildDirectory = path.resolve(projectRoot, "dist-electron");
const electronBuildInfo = path.resolve(projectRoot, "tsconfig.electron.tsbuildinfo");

if (
  path.dirname(electronBuildDirectory) !== projectRoot ||
  path.basename(electronBuildDirectory) !== "dist-electron" ||
  path.dirname(electronBuildInfo) !== projectRoot ||
  path.basename(electronBuildInfo) !== "tsconfig.electron.tsbuildinfo"
) {
  throw new Error("Refusing to clean unexpected Electron build targets.");
}

fs.rmSync(electronBuildDirectory, { recursive: true, force: true });
fs.rmSync(electronBuildInfo, { force: true });
