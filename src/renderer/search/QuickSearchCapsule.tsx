import { useRef, type Ref } from "react";

interface QuickSearchCapsuleProps {
  ariaLabel: string;
  inputRef?: Ref<HTMLInputElement>;
  operationHintVisible?: boolean;
  placeholder: string;
  value: string;
  onCancel: () => void;
  onChange: (value: string) => void;
  onComposingChange?: (composing: boolean) => void;
  onSubmit: (value: string) => void;
}

export const QuickSearchCapsule = ({
  ariaLabel,
  inputRef,
  operationHintVisible = false,
  placeholder,
  value,
  onCancel,
  onChange,
  onComposingChange,
  onSubmit
}: QuickSearchCapsuleProps) => {
  const composingRef = useRef(false);
  const compositionGuardUntilRef = useRef(0);
  const isCompositionActive = () => composingRef.current || Date.now() < compositionGuardUntilRef.current;

  return (
    <div className="cap-capsule-stage">
      <form
        className="cap-capsule"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          if (!isCompositionActive()) onSubmit(value);
        }}
      >
        <input
          className={operationHintVisible ? "cap-operation-hint" : undefined}
          ref={inputRef}
          value={value}
          placeholder={placeholder}
          title={placeholder || undefined}
          onChange={(event) => onChange(event.target.value)}
          onCompositionStart={() => {
            composingRef.current = true;
            onComposingChange?.(true);
          }}
          onCompositionEnd={(event) => {
            composingRef.current = false;
            compositionGuardUntilRef.current = Date.now() + 180;
            onChange(event.currentTarget.value);
            onComposingChange?.(false);
          }}
          onKeyDown={(event) => {
            const composing = (event.nativeEvent as KeyboardEvent).isComposing || isCompositionActive();
            if (event.key === "Enter" && composing) {
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              if (!composing) onCancel();
            }
          }}
          aria-label={ariaLabel}
          autoComplete="off"
        />
      </form>
    </div>
  );
};
