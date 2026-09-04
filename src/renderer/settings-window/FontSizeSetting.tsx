import { useEffect, useRef, useState, type CSSProperties } from "react";
import { t } from "../../../electron/localization";
import type { UiFontSize } from "../../shared/types";
import { uiFontSizeOptions } from "../typography";
import "./FontSizeSetting.css";

interface FontSizeSettingProps {
  value: UiFontSize;
  onChange: (value: UiFontSize) => void;
}

const getScaleLabel = (size: UiFontSize) => {
  if (size === 12) return t("stableSettings.uiFontSize.small");
  if (size === 13) return t("stableSettings.uiFontSize.standard");
  if (size === 16) return t("stableSettings.uiFontSize.large");
  return "";
};

const FontSizeSetting = ({ value, onChange }: FontSizeSettingProps) => {
  const [draftValue, setDraftValue] = useState(value);
  const draftValueRef = useRef(value);
  const lastCommittedValueRef = useRef(value);
  useEffect(() => {
    draftValueRef.current = value;
    lastCommittedValueRef.current = value;
    setDraftValue(value);
  }, [value]);
  const updateDraftValue = (nextValue: UiFontSize) => {
    draftValueRef.current = nextValue;
    setDraftValue(nextValue);
  };
  const commit = () => {
    const nextValue = draftValueRef.current;
    if (nextValue === lastCommittedValueRef.current) return;
    lastCommittedValueRef.current = nextValue;
    onChange(nextValue);
  };
  const progress = ((draftValue - uiFontSizeOptions[0]) / (uiFontSizeOptions[uiFontSizeOptions.length - 1] - uiFontSizeOptions[0])) * 100;
  return (
    <div className="cap-font-size-setting" style={{ "--cap-font-size-progress": `${progress}%` } as CSSProperties}>
      <input type="range" min={12} max={16} step={1} value={draftValue} aria-label={t("stableSettings.uiFontSize")} onChange={(event) => updateDraftValue(Number(event.target.value) as UiFontSize)} onPointerUp={commit} onKeyUp={commit} onBlur={commit} />
      <div className="cap-font-size-scale" aria-hidden="true">
        {uiFontSizeOptions.map((size) => <span key={size}>{getScaleLabel(size)}</span>)}
      </div>
    </div>
  );
};

export default FontSizeSetting;
