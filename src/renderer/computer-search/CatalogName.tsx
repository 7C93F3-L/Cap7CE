import { useLayoutEffect, useRef, useState } from "react";
import { catalogNameLabel } from "./catalogNameLabel";

export default function CatalogName({ name, className, isFile = false }: { name: string; className: string; isFile?: boolean }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [label, setLabel] = useState<{ name: string; text: string } | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const context = document.createElement("canvas").getContext("2d");
    if (!context) return;
    let live = true;
    const update = () => {
      if (!live) return;
      const style = getComputedStyle(element);
      context.font = style.font || `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const spacing = parseFloat(style.letterSpacing) || 0;
      const measure = (text: string) => context.measureText(text).width + Math.max(0, Array.from(text).length - 1) * spacing;
      const width = Math.max(0, element.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0));
      const text = catalogNameLabel(name, width, isFile, measure);
      setLabel(previous => previous?.name === name && previous.text === text ? previous : { name, text });
    };
    const observer = new ResizeObserver(update);
    observer.observe(element); update();
    void document.fonts.ready.then(update);
    return () => { live = false; observer.disconnect(); };
  }, [name, isFile]);
  return <span ref={ref} className={className} title={name}>{label?.name === name ? label.text : name}</span>;
}
