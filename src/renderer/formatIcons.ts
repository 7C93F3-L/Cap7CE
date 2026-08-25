import skimFileSvg from "./assets/icons/skim-file.svg?raw";
import { fileFormatCapabilityByExtension } from "../../electron/formatCapabilities";

const formatIconModules = import.meta.glob<string>("./assets/icons/format-*.svg", {
  eager: true,
  query: "?raw",
  import: "default"
});

const formatIconSvgByName = Object.fromEntries(
  Object.entries(formatIconModules).map(([assetPath, svg]) => [
    assetPath.slice(assetPath.lastIndexOf("/") + 1, -4),
    svg
  ])
) as Record<string, string>;

export const getFormatIconSvgByName = (iconName = "") => formatIconSvgByName[iconName] ?? skimFileSvg;

export const getFormatIconSvg = (extension: string, iconName = "") => {
  const normalizedExtension = extension.startsWith(".") ? extension.toLowerCase() : `.${extension.toLowerCase()}`;
  const resolvedIconName = fileFormatCapabilityByExtension.get(normalizedExtension)?.iconName ?? iconName;
  return getFormatIconSvgByName(resolvedIconName);
};
