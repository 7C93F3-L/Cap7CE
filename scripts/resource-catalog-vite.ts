import path from "node:path";
import type { Plugin } from "vite";
import paths from "../core/node/resourceCatalog/legacy-paths.json";

// Electron's compiler consumes CJS compatibility outputs; Vite consumes the
// canonical browser-safe TS modules so language/session state is not duplicated.
export function resourceCatalogAliases(): Plugin {
  const root = path.resolve(__dirname, "..");
  const aliases = new Map(Object.entries(paths).filter(([old]) => old.startsWith("electron/"))
    .map(([old, target]) => [path.resolve(root, old).replace(/\.ts$/, ""), path.resolve(root, target)]));
  return {
    name: "cap7ce-resource-catalog", enforce: "pre",
    resolveId(source, importer) {
      if (!importer || !source.startsWith(".")) return;
      const resolved = path.resolve(path.dirname(importer.split("?")[0]), source).replace(/\.ts$/, "");
      return aliases.get(resolved);
    }
  };
}
