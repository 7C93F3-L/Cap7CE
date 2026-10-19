import path from "node:path";
import { serveCoreNode } from "../transport/server";
import { createProviderPreviewService } from "./api";
if (process.argv.length !== 3 || !process.argv[2] || !path.isAbsolute(process.argv[2])) process.exit(2);
void serveCoreNode(createProviderPreviewService(), []).catch(() => { process.exitCode = 1; process.stdin.destroy(); });
