import { useEffect, useMemo, useRef, useState } from "react";
import { t, type TranslationKey } from "../../../electron/localization";
import {
  fileFormatCapabilities,
  skimDefaultFileExtensionSet,
  type FileFormatCategory
} from "../../../electron/formatCapabilities";
import type { SkimDisplayPreferences } from "../../shared/types";

const settingsFormatCategoryOrder: readonly FileFormatCategory[] = [
  "visual",
  "video",
  "audio",
  "text",
  "document",
  "project",
  "threeD",
  "archive",
  "data",
  "font",
  "model"
];

const settingsFormatCategoryOverrides: ReadonlyMap<string, FileFormatCategory> = new Map([
  [".pdf", "document"],
  [".rtf", "document"],
  [".psd", "project"],
  [".psb", "project"],
  [".ai", "project"],
  [".cdr", "project"]
]);

const formatCompactExtensionLabel = (extension: string, maximumLength = 7) => {
  const label = extension.slice(1).toUpperCase();
  if (label.length <= maximumLength) return label;
  const visibleLength = maximumLength - 1;
  const leadingLength = Math.ceil(visibleLength / 2);
  return `${label.slice(0, leadingLength)}…${label.slice(-Math.floor(visibleLength / 2))}`;
};

export interface SkimDisplaySettingsRowsProps {
  skimDisplay: SkimDisplayPreferences;
  onSkimDisplayChange: (skimDisplay: SkimDisplayPreferences) => void;
}

export const SkimDisplaySettingsRows = ({
  skimDisplay,
  onSkimDisplayChange
}: SkimDisplaySettingsRowsProps) => {
  const [skimDisplayExpanded, setSkimDisplayExpanded] = useState(false);
  const [skimDisplayClosing, setSkimDisplayClosing] = useState(false);
  const skimDisplayCollapseTimerRef = useRef<number | null>(null);
  const skimFormatGroups = useMemo(() => {
    const groups = new Map<FileFormatCategory, string[]>(
      settingsFormatCategoryOrder.map((category) => [category, []])
    );
    for (const capability of fileFormatCapabilities) {
      if (!capability.canBrowse) continue;
      const displayCategory = settingsFormatCategoryOverrides.get(capability.extension) ?? capability.category;
      const extensions = groups.get(displayCategory) ?? [];
      extensions.push(capability.extension);
      groups.set(displayCategory, extensions);
    }
    return settingsFormatCategoryOrder.map((category) => ({
      category,
      extensions: (groups.get(category) ?? []).sort((left, right) => (
        left.slice(1).localeCompare(right.slice(1), "en-US", { numeric: true, sensitivity: "base" })
      ))
    }));
  }, []);
  const selectedSkimExtensions = new Set(skimDisplay.customExtensions);
  const updateCustomSkimExtensions = (customExtensions: string[]) => onSkimDisplayChange({
    ...skimDisplay,
    customExtensions: [...new Set(customExtensions)].sort()
  });
  const toggleSkimCategory = (extensions: string[]) => {
    const allSelected = extensions.every((extension) => selectedSkimExtensions.has(extension));
    const nextExtensions = new Set(selectedSkimExtensions);
    for (const extension of extensions) {
      if (allSelected) nextExtensions.delete(extension);
      else nextExtensions.add(extension);
    }
    updateCustomSkimExtensions([...nextExtensions]);
  };
  const toggleSkimExtension = (extension: string) => {
    const nextExtensions = new Set(selectedSkimExtensions);
    if (nextExtensions.has(extension)) nextExtensions.delete(extension);
    else nextExtensions.add(extension);
    updateCustomSkimExtensions([...nextExtensions]);
  };
  const toggleSkimDisplayConfiguration = () => {
    if (skimDisplayClosing) return;
    if (!skimDisplayExpanded) {
      setSkimDisplayExpanded(true);
      return;
    }
    setSkimDisplayClosing(true);
    const collapseDuration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 240;
    skimDisplayCollapseTimerRef.current = window.setTimeout(() => {
      setSkimDisplayExpanded(false);
      setSkimDisplayClosing(false);
      skimDisplayCollapseTimerRef.current = null;
    }, collapseDuration);
  };

  useEffect(() => () => {
    if (skimDisplayCollapseTimerRef.current !== null) {
      window.clearTimeout(skimDisplayCollapseTimerRef.current);
    }
  }, []);

  return (
    <>
{skimDisplayExpanded ? (
            <div className={`cap-settings-expandable-shell${skimDisplayClosing ? " is-closing" : ""}`}>
              <div className="cap-settings-expandable-inner">
                <div className="cap-settings-skim-display-panel">
                  <div className="cap-settings-quick-actions-header cap-settings-skim-display-header">
                    <span className="cap-settings-label">{t("settings.skimDisplay")}</span>
                    <span className="cap-settings-value">
                      {t("settings.skimDisplaySummary", { selected: skimDisplay.customExtensions.length, total: fileFormatCapabilities.length })}
                    </span>
                    <div className="cap-settings-quick-actions-controls">
                      <button
                        className="cap-settings-pill"
                        type="button"
                        onClick={() => onSkimDisplayChange({ ...skimDisplay, showHiddenFiles: !skimDisplay.showHiddenFiles })}
                        title={skimDisplay.showHiddenFiles ? t("settings.hideHiddenFilesHint") : t("settings.showHiddenFilesHint")}
                      >
                        {skimDisplay.showHiddenFiles ? t("settings.hiddenFilesOn") : t("settings.hiddenFilesOff")}
                      </button>
                      <button
                        className="cap-settings-pill"
                        type="button"
                        onClick={() => updateCustomSkimExtensions([...skimDefaultFileExtensionSet])}
                        title={t("settings.resetSkimDisplayHint")}
                      >
                        {t("common.restoreDefault")}
                      </button>
                      <button className="cap-settings-pill cap-settings-expand-toggle" type="button" onClick={toggleSkimDisplayConfiguration} title={t("settings.finishSkimDisplayHint")} aria-expanded="true">
                        {t("settings.finishConfiguration")}
                      </button>
                    </div>
                  </div>
                  <div className="cap-settings-skim-format-groups">
                    {skimFormatGroups.map(({ category, extensions }) => {
                      const selectedCount = extensions.filter((extension) => selectedSkimExtensions.has(extension)).length;
                      return (
                        <section className="cap-settings-skim-format-group" key={category}>
                          <button
                            className="cap-settings-skim-category-heading"
                            type="button"
                            data-selected={selectedCount === extensions.length}
                            data-partial={selectedCount > 0 && selectedCount < extensions.length}
                            onClick={() => toggleSkimCategory(extensions)}
                            title={t("settings.toggleSkimCategoryHint")}
                            aria-label={t("settings.toggleSkimCategoryHint")}
                            aria-pressed={selectedCount === extensions.length ? true : selectedCount > 0 ? "mixed" : false}
                          >
                            <span className="cap-settings-skim-category-toggle" aria-hidden="true" />
                            <span>{t(`format.category.${category}` as TranslationKey)}</span>
                          </button>
                          <div className="cap-settings-skim-extensions">
                            {extensions.map((extension) => (
                              <button
                                className="cap-settings-pill cap-settings-skim-extension"
                                type="button"
                                key={extension}
                                data-selected={selectedSkimExtensions.has(extension)}
                                onClick={() => toggleSkimExtension(extension)}
                                title={t("settings.toggleSkimExtensionHint", { extension })}
                              >
                                {formatCompactExtensionLabel(extension)}
                              </button>
                            ))}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="cap-settings-row cap-settings-wide">
              <span className="cap-settings-label">{t("settings.skimDisplay")}</span>
              <span className="cap-settings-value">
                {t("settings.skimDisplaySummary", { selected: skimDisplay.customExtensions.length, total: fileFormatCapabilities.length })}
              </span>
              <button
                className="cap-settings-pill"
                type="button"
                onClick={() => onSkimDisplayChange({ ...skimDisplay, showHiddenFiles: !skimDisplay.showHiddenFiles })}
                title={skimDisplay.showHiddenFiles ? t("settings.hideHiddenFilesHint") : t("settings.showHiddenFilesHint")}
              >
                {skimDisplay.showHiddenFiles ? t("settings.hiddenFilesOn") : t("settings.hiddenFilesOff")}
              </button>
              <button
                className="cap-settings-pill"
                type="button"
                onClick={() => updateCustomSkimExtensions([...skimDefaultFileExtensionSet])}
                title={t("settings.resetSkimDisplayHint")}
              >
                {t("common.restoreDefault")}
              </button>
              <button className="cap-settings-pill cap-settings-expand-toggle" type="button" onClick={toggleSkimDisplayConfiguration} title={t("settings.configureSkimDisplayHint")} aria-expanded="false">{t("settings.configure")}</button>
            </div>
          )}
    </>
  );
};
