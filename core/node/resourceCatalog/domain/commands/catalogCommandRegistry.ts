import { quickCommandSpecs, type QuickCommandSpec } from "./commandRegistry";
import { parseQuickCommand } from "./commandParser";

const retainedDomains = new Set(["set", "win", "ui", "line", "key", "cmd", "lang", "llama", "model", "app"]);
export const catalogCommandSpecs: readonly QuickCommandSpec[] = [
  ...quickCommandSpecs.filter(spec => retainedDomains.has(spec.domain)
    || spec.domain === "see" && spec.action !== "scope"
    || spec.domain === "dir" && ["add", "rename", "refresh"].includes(spec.action)
    || spec.domain === "cache" && spec.action === "clear"),
  { domain: "dir", action: "remove", requiredArgs: 1, missingArgumentKey: "command.missingDirectoryName" },
  { domain: "see", action: "root" },
  ...(["hidden", "subfolders"] as const).flatMap(action => ["on", "off"].map(value => ({ domain: "see" as const, action, fixedArgs: [value] })))
];
export const parseCatalogCommand = (input: string, commandEnabled = true) => {
  const parsed = parseQuickCommand(input, { commandEnabled, specs: catalogCommandSpecs });
  if (parsed.type !== "valid") return parsed;
  const { command } = parsed;
  const fixed = catalogCommandSpecs.find(spec => spec.domain === command.domain && spec.action === command.action)?.fixedArgs?.length ?? 0;
  return { ...parsed, command: { ...command, args: command.args.map((value, index) => index < fixed ? value.toLowerCase() : value) } };
};
