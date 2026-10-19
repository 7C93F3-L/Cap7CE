const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { pipeline } = require("node:stream/promises");
const { Readable } = require("node:stream");
const { createWriteStream } = require("node:fs");
const manifest = require("../third_party/node-runtime/manifest.json");
const digest = async file => crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");

// Builds pin the official bytes; neither PATH nor the installed version is a runtime fallback.
module.exports = async (root, destination) => {
  const cache = path.join(root, "artifacts/node-runtime", manifest.version, "node.exe");
  await fs.mkdir(path.dirname(cache), { recursive: true });
  let valid = false;
  try { valid = await digest(cache) === manifest.sha256; } catch { /* First build. */ }
  if (!valid) {
    const installed = path.join(process.env.ProgramFiles || "C:/Program Files", "nodejs/node.exe");
    try { if (await digest(installed) === manifest.sha256) { await fs.copyFile(installed, cache); valid = true; } } catch { /* Fetch pinned upstream. */ }
  }
  if (!valid) {
    const partial = path.join(path.dirname(cache), `${crypto.randomUUID()}.partial`);
    try {
      const response = await fetch(manifest.url, { signal: AbortSignal.timeout(120_000), redirect: "error" });
      if (!response.ok || !response.body) throw new Error("Pinned Node download failed.");
      await pipeline(Readable.fromWeb(response.body), createWriteStream(partial, { flags: "wx" }));
      if (await digest(partial) !== manifest.sha256) throw new Error("Pinned Node digest mismatch.");
      await fs.rename(partial, cache);
    } finally { await fs.rm(partial, { force: true }); }
  }
  if (await digest(cache) !== manifest.sha256) throw new Error("Pinned Node cache digest mismatch.");
  await fs.copyFile(cache, path.join(destination, "node.exe"));
  await fs.copyFile(path.join(root, "third_party/node-runtime/LICENSE"), path.join(destination, "LICENSE-node"));
  await fs.writeFile(path.join(destination, "runtime.json"), JSON.stringify(manifest, null, 2) + "\n");
};
