const fs = require("node:fs"), path = require("node:path");
module.exports = (root, _, failures) => {
  const read = file => fs.readFileSync(path.join(root, file), "utf8");
  const ordering = read("core/src/Cap7CE.Core.Catalog/Queries/CatalogRandomOrdering.cs");
  if (ordering.split(/\r?\n/).length > 60 || /System\.Net|Process\.|File\.|Directory\.|Task\.Delay|Timer|INSERT |UPDATE |ALTER |CREATE TABLE/i.test(ordering))
    failures.push("Random ordering must remain a small, deterministic, read-only identity function.");
  for (const anchor of ["isDeterministic: true", "uint seed", "volume", "reference"])
    if (!ordering.includes(anchor)) failures.push(`Random ordering is missing ${anchor}.`);
  const protocol = read("core/src/Cap7CE.Core.Host/CoreRequestDispatcher.cs");
  if (!protocol.includes("productCursor.RandomSeed") || !protocol.includes("RandomSeed: start.RandomSeed"))
    failures.push("Random seeds must survive both signed cursor creation and resumption.");
  const hook = read("src/renderer/catalog-workspace/useCatalogRandomBrowse.ts");
  if (/setInterval|setTimeout|useEffect|window\.cap7ce|\.sort\(/.test(hook))
    failures.push("Random browse state must not poll, read files, sort a partial page or change its seed in effects.");
};
