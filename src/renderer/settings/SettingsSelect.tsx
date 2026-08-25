import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties
} from "react";
import type React from "react";
import { createPortal } from "react-dom";

const viewportMenuGap = 5;

export type SettingsSelectOption = {
  value: string;
  label: string;
};

export interface SettingsSelectProps {
  value: string;
  options: SettingsSelectOption[];
  disabled?: boolean;
  ariaLabel: string;
  title: string;
  className: string;
  menuStyle: CSSProperties;
  onChange: (value: string) => void;
}

export const SettingsSelect = ({
  value,
  options,
  disabled = false,
  ariaLabel,
  title,
  className,
  menuStyle,
  onChange
}: SettingsSelectProps) => {
  const listboxId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [anchor, setAnchor] = useState<{ left: number; top: number; bottom: number; width: number } | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const selectedOption = options[selectedIndex] ?? options[0];

  const closeMenu = useCallback(() => {
    setIsOpen(false);
    setAnchor(null);
    setMenuPosition(null);
  }, []);

  const openMenu = useCallback((initialActiveIndex = selectedIndex) => {
    if (disabled || !triggerRef.current || options.length === 0) {
      return;
    }
    const bounds = triggerRef.current.getBoundingClientRect();
    setActiveIndex(initialActiveIndex);
    setMenuPosition(null);
    setAnchor({
      left: bounds.left,
      top: bounds.top,
      bottom: bounds.bottom,
      width: bounds.width
    });
    setIsOpen(true);
  }, [disabled, options.length, selectedIndex]);

  const selectOption = useCallback((index: number) => {
    const option = options[index];
    if (!option) return;
    if (option.value !== value) {
      onChange(option.value);
    }
    closeMenu();
    triggerRef.current?.focus();
  }, [closeMenu, onChange, options, value]);

  useLayoutEffect(() => {
    if (!isOpen || !anchor || !menuRef.current) {
      return;
    }
    const bounds = menuRef.current.getBoundingClientRect();
    const belowTop = anchor.bottom + viewportMenuGap;
    const aboveTop = anchor.top - bounds.height - viewportMenuGap;
    const top = belowTop + bounds.height <= window.innerHeight - viewportMenuGap
      ? belowTop
      : Math.max(viewportMenuGap, aboveTop);
    const left = Math.min(
      Math.max(viewportMenuGap, anchor.left),
      Math.max(viewportMenuGap, window.innerWidth - bounds.width - viewportMenuGap)
    );
    setMenuPosition({ left, top });
  }, [anchor, isOpen, options.length]);

  useEffect(() => {
    if (!isOpen) return;

    const closeForOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node
        && (triggerRef.current?.contains(target) || menuRef.current?.contains(target))
      ) {
        return;
      }
      closeMenu();
    };
    const closeForScroll = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) {
        return;
      }
      closeMenu();
    };
    const closeForViewportChange = () => closeMenu();
    document.addEventListener("pointerdown", closeForOutsidePointer, true);
    window.addEventListener("resize", closeForViewportChange);
    window.addEventListener("blur", closeForViewportChange);
    window.addEventListener("scroll", closeForScroll, true);
    return () => {
      document.removeEventListener("pointerdown", closeForOutsidePointer, true);
      window.removeEventListener("resize", closeForViewportChange);
      window.removeEventListener("blur", closeForViewportChange);
      window.removeEventListener("scroll", closeForScroll, true);
    };
  }, [closeMenu, isOpen]);

  useLayoutEffect(() => {
    if (!isOpen || !menuPosition) return;
    menuRef.current
      ?.querySelector<HTMLElement>(`#${CSS.escape(`${listboxId}-option-${activeIndex}`)}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, isOpen, listboxId, menuPosition]);

  useEffect(() => {
    if (disabled) {
      closeMenu();
    }
  }, [closeMenu, disabled]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled || options.length === 0) {
      return;
    }

    if (!isOpen) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openMenu(selectedIndex);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
      return;
    }
    if (event.key === "Tab") {
      closeMenu();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectOption(activeIndex >= 0 ? activeIndex : selectedIndex);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setActiveIndex(event.key === "Home" ? 0 : options.length - 1);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => {
        if (current < 0) {
          return direction > 0 ? 0 : options.length - 1;
        }
        return (current + direction + options.length) % options.length;
      });
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        className={`cap-settings-select ${className}${isOpen ? " is-open" : ""}`}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        aria-activedescendant={isOpen && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
        title={title}
        onClick={() => isOpen ? closeMenu() : openMenu(-1)}
        onKeyDown={handleKeyDown}
      >
        <span className="cap-settings-select-value" title={selectedOption?.label}>{selectedOption?.label}</span>
      </button>
      {isOpen && anchor && createPortal(
        <div
          ref={menuRef}
          id={listboxId}
          className="context-menu cap-settings-select-menu"
          data-context-menu="true"
          role="listbox"
          aria-label={ariaLabel}
          style={{
            ...menuStyle,
            left: menuPosition?.left ?? anchor.left,
            top: menuPosition?.top ?? anchor.bottom + viewportMenuGap,
            width: anchor.width,
            visibility: menuPosition ? "visible" : "hidden"
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="cap7ce-menu-motion-surface">
            {options.map((option, index) => (
              <button
                key={option.value}
                id={`${listboxId}-option-${index}`}
                className={index === activeIndex ? "is-active" : undefined}
                type="button"
                role="option"
                aria-selected={option.value === value}
                tabIndex={-1}
                title={option.label}
                onPointerEnter={() => setActiveIndex(-1)}
                onClick={() => selectOption(index)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
