import path from "node:path";
import { createVisualCacheDispatcher } from "./dispatch";
import { serveCoreNode } from "../transport/server";
const root = process.argv[2];
if (process.argv.length !== 3 || !root || !path.isAbsolute(root)) process.exit(2);
void serveCoreNode(createVisualCacheDispatcher(root, path.dirname(process.argv[1])), ["read", "write", "temporaryImage"])
  .catch(() => { process.exitCode = 1; process.stdin.destroy(); });
