import { fileFormatCapabilities } from "./formatCapabilities";

export const supportedVisualFileExtensions = fileFormatCapabilities
  .filter((capability) => capability.canAIIndex)
  .map((capability) => capability.extension);

export const supportedVisualFileExtensionSet: ReadonlySet<string> = new Set(
  supportedVisualFileExtensions
);
