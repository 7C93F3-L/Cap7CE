import path from "node:path";
import { serveCoreNode } from "../transport/server";
import { createNativeUpdateService } from "./service";
const root = process.argv[2];
if (process.argv.length !== 3 || !root || !path.isAbsolute(root)) process.exit(2);
let owner: ReturnType<typeof createNativeUpdateService> | null = null;
void serveCoreNode({
  async dispatch(method, args) {
    if (method === "initialize") {
      if (!Array.isArray(args) || args.length !== 1 || typeof args[0] !== "string" || !/^\d+\.\d+\.\d+$/.test(args[0])) throw new Error("invalid-update-version");
      owner ??= createNativeUpdateService(root, args[0]);
      return owner.dispatch("state", []);
    }
    if (!owner) throw new Error("update-not-initialized");
    return owner.dispatch(method, args);
  },
  async close() { await owner?.close(); }
}, ["initialize", "check", "download", "pause", "installer"]).catch(() => { process.exitCode = 1; process.stdin.destroy(); });
