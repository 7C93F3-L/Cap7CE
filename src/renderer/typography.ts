import { useLayoutEffect, useMemo, type CSSProperties } from "react";
import type { UiFontSize } from "../shared/types";

export const defaultUiFontSize: UiFontSize = 13;
export const uiFontSizeOptions: UiFontSize[] = [12, 13, 14, 15, 16];

export const normalizeUiFontSize = (value: unknown): UiFontSize => {
  const size = Number(value) as UiFontSize;
  return uiFontSizeOptions.includes(size) ? size : defaultUiFontSize;
};

export const useUiFontSize = (value: unknown) => {
  const size = normalizeUiFontSize(value);
  useLayoutEffect(() => {
    document.documentElement.style.setProperty("--cap-ui-font-base", `${size}px`);
  }, [size]);
  return useMemo(() => ({ "--cap-ui-font-base": `${size}px` }) as CSSProperties, [size]);
};
