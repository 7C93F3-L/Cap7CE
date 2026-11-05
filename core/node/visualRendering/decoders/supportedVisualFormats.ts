import { fileFormatCapabilities } from "../../resourceCatalog/domain/formats/formatCapabilities";

export const supportedVisualFileExtensions = fileFormatCapabilities
  .filter((capability) => capability.canThumbnail)
  .map((capability) => capability.extension);

export const supportedVisualFileExtensionSet: ReadonlySet<string> = new Set(
  supportedVisualFileExtensions
);
