import { quickCommandDomains, quickCommandSpecs, type QuickCommandDomain, type QuickCommandSpec } from "./commandRegistry";
import { t } from "../../electron/localization";

export interface ParsedQuickCommand {
  domain: QuickCommandDomain;
  action: string;
  args: string[];
  raw: string;
}

export type QuickCommandParseResult =
  | { type: "search" }
  | { type: "valid"; command: ParsedQuickCommand }
  | { type: "unknown"; command: ParsedQuickCommand }
  | { type: "missing-argument"; command: ParsedQuickCommand; message: string };

export interface QuickCommandParseOptions {
  commandEnabled?: boolean;
}

const quickCommandDomainSet = new Set<string>(quickCommandDomains);

const tokenizeCommandRemainder = (value: string) => {
  const tokens: string[] = [];
  let current = "";
  let inQuote = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "\"") {
      inQuote = !inQuote;
      continue;
    }

    if (/\s/.test(character) && !inQuote) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += character;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
};

const getParsedQuickCommand = (input: string): ParsedQuickCommand | null => {
  const trimmedInput = input.trim();
  const match = trimmedInput.match(/^([a-z]+)([:：])(.*)$/i);
  if (!match) {
    return null;
  }

  const domain = match[1].toLowerCase();
  if (!quickCommandDomainSet.has(domain)) {
    return null;
  }

  const remainder = match[3].trim();
  const tokens = tokenizeCommandRemainder(remainder);
  const action = tokens[0]?.toLowerCase() ?? "";
  const args = tokens.slice(1);
  const raw = `${domain}:${remainder}`.trimEnd();
  return {
    domain: domain as QuickCommandDomain,
    action,
    args,
    raw
  };
};

const fixedArgsMatch = (spec: QuickCommandSpec, args: string[]) => {
  const fixedArgs = spec.fixedArgs ?? [];
  if (args.length < fixedArgs.length) {
    return false;
  }

  return fixedArgs.every((fixedArg, index) => args[index]?.toLowerCase() === fixedArg.toLowerCase());
};

const hasEnoughRequiredArgs = (spec: QuickCommandSpec, args: string[]) => {
  const fixedArgCount = spec.fixedArgs?.length ?? 0;
  const requiredArgCount = spec.requiredArgs ?? 0;
  return args.length >= fixedArgCount + requiredArgCount;
};

const isExactSpecMatch = (spec: QuickCommandSpec, args: string[]) => {
  const fixedArgCount = spec.fixedArgs?.length ?? 0;
  const requiredArgCount = spec.requiredArgs ?? 0;
  if (!fixedArgsMatch(spec, args)) {
    return false;
  }

  if (requiredArgCount === 0) {
    return args.length === fixedArgCount;
  }

  return args.length >= fixedArgCount + requiredArgCount;
};

export const parseQuickCommand = (input: string, options: QuickCommandParseOptions = {}): QuickCommandParseResult => {
  const command = getParsedQuickCommand(input);
  if (!command) {
    return { type: "search" };
  }

  if (options.commandEnabled === false && !(command.domain === "cmd" && command.action === "on" && command.args.length === 0)) {
    return { type: "search" };
  }

  const sameActionSpecs = quickCommandSpecs.filter((spec) => (
    spec.domain === command.domain && spec.action === command.action
  ));
  const exactSpec = sameActionSpecs.find((spec) => isExactSpecMatch(spec, command.args));
  if (exactSpec) {
    return { type: "valid", command };
  }

  const missingArgumentSpec = sameActionSpecs.find((spec) => (
    fixedArgsMatch(spec, command.args) && !hasEnoughRequiredArgs(spec, command.args)
  ));
  if (missingArgumentSpec) {
    return {
      type: "missing-argument",
      command,
      message: missingArgumentSpec.missingArgumentKey ? t(missingArgumentSpec.missingArgumentKey) : t("command.missingArgumentGeneric")
    };
  }

  return { type: "unknown", command };
};
