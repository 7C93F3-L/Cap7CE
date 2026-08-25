import type { TranslationKey } from "../../electron/localization";

export const quickCommandDomains = [
  "see",
  "win",
  "tag",
  "dir",
  "cache",
  "skim",
  "set",
  "ui",
  "line",
  "key",
  "cmd",
  "lang",
  "llama",
  "model",
  "app"
] as const;

export type QuickCommandDomain = typeof quickCommandDomains[number];

export interface QuickCommandSpec {
  domain: QuickCommandDomain;
  action: string;
  fixedArgs?: string[];
  requiredArgs?: number;
  missingArgumentKey?: TranslationKey;
}

export const quickCommandSpecs: QuickCommandSpec[] = [
  { domain: "see", action: "all" },
  { domain: "see", action: "dir", requiredArgs: 1, missingArgumentKey: "command.missingDirectoryName" },
  { domain: "win", action: "line" },
  { domain: "win", action: "cap" },
  { domain: "win", action: "micro" },
  { domain: "win", action: "mini" },
  { domain: "win", action: "normal" },
  { domain: "win", action: "max" },
  { domain: "win", action: "top", fixedArgs: ["on"] },
  { domain: "win", action: "top", fixedArgs: ["off"] },
  { domain: "tag", action: "dir" },
  { domain: "tag", action: "dir", requiredArgs: 1, missingArgumentKey: "command.missingDirectoryName" },
  { domain: "tag", action: "sort" },
  { domain: "tag", action: "sort", fixedArgs: ["asc"] },
  { domain: "tag", action: "sort", fixedArgs: ["desc"] },
  { domain: "tag", action: "show", fixedArgs: ["all"] },
  { domain: "tag", action: "hide", fixedArgs: ["all"] },
  { domain: "tag", action: "hide", fixedArgs: ["dir"] },
  { domain: "tag", action: "hide", fixedArgs: ["sort"] },
  { domain: "dir", action: "add", requiredArgs: 1, missingArgumentKey: "command.missingDirectoryPath" },
  { domain: "dir", action: "delete", requiredArgs: 1, missingArgumentKey: "command.missingDirectoryName" },
  { domain: "dir", action: "rename", requiredArgs: 2, missingArgumentKey: "command.missingDirectoryName" },
  { domain: "dir", action: "refresh" },
  { domain: "cache", action: "clear" },
  { domain: "cache", action: "thumb" },
  { domain: "cache", action: "preview" },
  { domain: "cache", action: "model" },
  { domain: "cache", action: "skim" },
  { domain: "skim", action: "" },
  { domain: "skim", action: "root" },
  { domain: "set", action: "" },
  { domain: "set", action: "quick" },
  { domain: "set", action: "cmd" },
  { domain: "ui", action: "light" },
  { domain: "ui", action: "dark" },
  { domain: "ui", action: "auto" },
  { domain: "ui", action: "main", requiredArgs: 1, missingArgumentKey: "command.missingColor" },
  { domain: "ui", action: "accent", requiredArgs: 1, missingArgumentKey: "command.missingColor" },
  { domain: "ui", action: "reset" },
  { domain: "line", action: "on" },
  { domain: "line", action: "off" },
  { domain: "key", action: "global", fixedArgs: ["on"] },
  { domain: "key", action: "global", fixedArgs: ["off"] },
  { domain: "key", action: "reset" },
  { domain: "cmd", action: "on" },
  { domain: "cmd", action: "off" },
  { domain: "lang", action: "auto" },
  { domain: "lang", action: "cn" },
  { domain: "lang", action: "en" },
  { domain: "llama", action: "start" },
  { domain: "llama", action: "stop" },
  { domain: "llama", action: "use", requiredArgs: 1, missingArgumentKey: "command.missingRuntimeName" },
  { domain: "llama", action: "refresh" },
  { domain: "model", action: "refresh" },
  { domain: "model", action: "use", requiredArgs: 1, missingArgumentKey: "command.missingModelName" },
  { domain: "app", action: "startup", fixedArgs: ["on"] },
  { domain: "app", action: "startup", fixedArgs: ["off"] },
  { domain: "app", action: "hints", fixedArgs: ["on"] },
  { domain: "app", action: "hints", fixedArgs: ["off"] },
  { domain: "app", action: "quit" }
];
