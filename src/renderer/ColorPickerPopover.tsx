import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { createPortal } from "react-dom";

const viewportGap = 5;

type HsvColor = {
  hue: number;
  saturation: number;
  value: number;
};

type PopoverPosition = {
  left: number;
  top: number;
};

interface ColorPickerPopoverProps {
  anchorRef: RefObject<HTMLButtonElement | null>;
  value: string;
  ariaLabel: string;
  menuStyle?: CSSProperties;
  onPreview: (value: string) => void;
  onCommit: (value: string) => void;
  onClose: () => void;
}

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.min(maximum, Math.max(minimum, value))
);

const toHexByte = (value: number) => (
  Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0").toUpperCase()
);

const hexToHsv = (hex: string): HsvColor => {
  const red = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const green = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(hex.slice(5, 7), 16) / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  let hue = 0;

  if (delta !== 0) {
    if (maximum === red) {
      hue = 60 * (((green - blue) / delta) % 6);
    } else if (maximum === green) {
      hue = 60 * ((blue - red) / delta + 2);
    } else {
      hue = 60 * ((red - green) / delta + 4);
    }
  }

  if (hue < 0) {
    hue += 360;
  }

  return {
    hue,
    saturation: maximum === 0 ? 0 : delta / maximum,
    value: maximum
  };
};

const hsvToHex = ({ hue, saturation, value }: HsvColor) => {
  const normalizedHue = ((hue % 360) + 360) % 360;
  const chroma = value * saturation;
  const hueSegment = normalizedHue / 60;
  const intermediate = chroma * (1 - Math.abs((hueSegment % 2) - 1));
  const offset = value - chroma;
  let red = 0;
  let green = 0;
  let blue = 0;

  if (hueSegment < 1) {
    red = chroma;
    green = intermediate;
  } else if (hueSegment < 2) {
    red = intermediate;
    green = chroma;
  } else if (hueSegment < 3) {
    green = chroma;
    blue = intermediate;
  } else if (hueSegment < 4) {
    green = intermediate;
    blue = chroma;
  } else if (hueSegment < 5) {
    red = intermediate;
    blue = chroma;
  } else {
    red = chroma;
    blue = intermediate;
  }

  return `#${toHexByte((red + offset) * 255)}${toHexByte((green + offset) * 255)}${toHexByte((blue + offset) * 255)}`;
};

const getTextColorForBackground = (color: string) => {
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  return red * 0.299 + green * 0.587 + blue * 0.114 > 160 ? "#191919" : "#ffffff";
};

const getHueColor = (hue: number) => hsvToHex({ hue, saturation: 1, value: 1 });

const getPopoverPosition = (
  anchor: DOMRect,
  popover: DOMRect
): PopoverPosition => {
  const preferredTop = anchor.bottom + viewportGap;
  const top = preferredTop + popover.height <= window.innerHeight - viewportGap
    ? preferredTop
    : Math.max(viewportGap, anchor.top - popover.height - viewportGap);
  const left = clamp(
    anchor.left,
    viewportGap,
    Math.max(viewportGap, window.innerWidth - popover.width - viewportGap)
  );

  return { left, top };
};

const ColorPickerPopover = ({
  anchorRef,
  value,
  ariaLabel,
  menuStyle,
  onPreview,
  onCommit,
  onClose
}: ColorPickerPopoverProps) => {
  const normalizedValue = /^#[0-9a-fA-F]{6}$/.test(value) ? value.toUpperCase() : "#000000";
  const initialHexRef = useRef(normalizedValue);
  const initialHex = initialHexRef.current;
  const initialHsv = hexToHsv(initialHex);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const hsvRef = useRef(initialHsv);
  const draftHexRef = useRef(initialHex);
  const inputBaseHexRef = useRef(initialHex);
  const [hsv, setHsv] = useState(initialHsv);
  const [draftHex, setDraftHex] = useState(initialHex);
  const [inputValue, setInputValue] = useState(initialHex);
  const [position, setPosition] = useState<PopoverPosition | null>(null);

  const applyHsv = (nextHsv: HsvColor) => {
    const nextHex = hsvToHex(nextHsv);
    hsvRef.current = nextHsv;
    draftHexRef.current = nextHex;
    inputBaseHexRef.current = nextHex;
    setHsv(nextHsv);
    setDraftHex(nextHex);
    setInputValue(nextHex);
    onPreview(nextHex);
  };

  const updatePosition = () => {
    const anchor = anchorRef.current;
    const popover = popoverRef.current;
    if (!anchor || !popover) {
      return;
    }
    setPosition(getPopoverPosition(anchor.getBoundingClientRect(), popover.getBoundingClientRect()));
  };

  useLayoutEffect(() => {
    updatePosition();
  }, []);

  useEffect(() => {
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (popoverRef.current?.contains(target) || anchorRef.current?.contains(target)) {
        return;
      }
      onCommit(draftHexRef.current);
      onClose();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      onPreview(initialHex);
      onClose();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [anchorRef, initialHex, onClose, onCommit, onPreview]);

  const updateSaturationValue = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const saturation = clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
    const nextValue = 1 - clamp((event.clientY - bounds.top) / bounds.height, 0, 1);
    applyHsv({
      ...hsvRef.current,
      saturation,
      value: nextValue
    });
  };

  const updateHue = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const hue = clamp((event.clientX - bounds.left) / bounds.width, 0, 1) * 360;
    applyHsv({
      ...hsvRef.current,
      hue
    });
  };

  const beginPointerDrag = (
    event: ReactPointerEvent<HTMLDivElement>,
    update: (pointerEvent: ReactPointerEvent<HTMLDivElement>) => void
  ) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    update(event);
  };

  const updateHexInput = (rawValue: string) => {
    const includesHash = rawValue.trimStart().startsWith("#");
    const digits = rawValue.replace(/[^0-9a-fA-F]/g, "").slice(0, 6).toUpperCase();
    setInputValue(`${includesHash ? "#" : ""}${digits}`);

    if (digits.length === 0) {
      return;
    }

    const baseDigits = inputBaseHexRef.current.slice(1);
    const nextHex = `#${digits}${baseDigits.slice(digits.length)}`;
    const nextHsv = hexToHsv(nextHex);
    hsvRef.current = nextHsv;
    draftHexRef.current = nextHex;
    setHsv(nextHsv);
    setDraftHex(nextHex);
    onPreview(nextHex);
  };

  const positionedStyle: CSSProperties = position
    ? { left: position.left, top: position.top, visibility: "visible" }
    : { left: 0, top: 0, visibility: "hidden" };
  const hueColor = getHueColor(hsv.hue);

  return createPortal(
    <div
      ref={popoverRef}
      className="context-menu cap-color-picker"
      data-context-menu="true"
      style={{ ...menuStyle, ...positionedStyle }}
      role="dialog"
      aria-label={ariaLabel}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <div className="cap7ce-menu-motion-surface cap-color-picker-motion-surface">
        <div
          className="cap-color-picker-saturation"
          style={{ "--cap-picker-hue": hueColor } as CSSProperties}
          role="slider"
          aria-label={ariaLabel}
          aria-valuenow={Math.round(hsv.saturation * 100)}
          aria-valuetext={draftHex}
          tabIndex={0}
          onPointerDown={(event) => beginPointerDrag(event, updateSaturationValue)}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              updateSaturationValue(event);
            }
          }}
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
              return;
            }
            event.preventDefault();
            const nextHsv = { ...hsvRef.current };
            if (event.key === "ArrowLeft") nextHsv.saturation = clamp(nextHsv.saturation - 0.01, 0, 1);
            if (event.key === "ArrowRight") nextHsv.saturation = clamp(nextHsv.saturation + 0.01, 0, 1);
            if (event.key === "ArrowUp") nextHsv.value = clamp(nextHsv.value + 0.01, 0, 1);
            if (event.key === "ArrowDown") nextHsv.value = clamp(nextHsv.value - 0.01, 0, 1);
            applyHsv(nextHsv);
          }}
        >
          <span
            className="cap-color-picker-saturation-thumb"
            style={{
              left: `${hsv.saturation * 100}%`,
              top: `${(1 - hsv.value) * 100}%`
            }}
          />
        </div>
        <div
          className="cap-color-picker-hue"
          role="slider"
          aria-label={ariaLabel}
          aria-valuemin={0}
          aria-valuemax={360}
          aria-valuenow={Math.round(hsv.hue)}
          tabIndex={0}
          onPointerDown={(event) => beginPointerDrag(event, updateHue)}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              updateHue(event);
            }
          }}
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
              return;
            }
            event.preventDefault();
            applyHsv({
              ...hsvRef.current,
              hue: (hsvRef.current.hue + (event.key === "ArrowRight" ? 1 : -1) + 360) % 360
            });
          }}
        >
          <span
            className="cap-color-picker-hue-thumb"
            style={{ left: `${(hsv.hue / 360) * 100}%` }}
          />
        </div>
        <input
          className="cap-color-picker-hex"
          value={inputValue}
          maxLength={7}
          spellCheck={false}
          autoComplete="off"
          aria-label={ariaLabel}
          style={{
            background: draftHex,
            color: getTextColorForBackground(draftHex)
          }}
          onFocus={(event) => {
            inputBaseHexRef.current = draftHexRef.current;
            event.currentTarget.select();
          }}
          onChange={(event) => updateHexInput(event.target.value)}
        />
      </div>
    </div>,
    document.body
  );
};

export default ColorPickerPopover;
