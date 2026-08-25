const fs = require("node:fs/promises");
const path = require("node:path");

module.exports = async function createExternalRuntimeDirectories(context) {
  await Promise.all([
    fs.mkdir(path.join(context.appOutDir, "llama.cpp"), { recursive: true }),
    fs.mkdir(path.join(context.appOutDir, "models"), { recursive: true }),
  ]);
};
