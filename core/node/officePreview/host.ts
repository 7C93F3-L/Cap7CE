import path from "node:path";
import { serveCoreNode } from "../transport/server";
import { createOfficePreviewOwner } from "./api";
const root = process.argv[2];
if (process.argv.length !== 3 || !root || !path.isAbsolute(root)) process.exit(2);
void serveCoreNode(createOfficePreviewOwner(root), ["cache.acquire", "cache.release", "cache.clear", "cache.stats", "office.prepare"]).catch(() => { process.exitCode = 1; process.stdin.destroy(); });
