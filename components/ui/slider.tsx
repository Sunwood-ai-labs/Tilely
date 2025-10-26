import * as React from "react";
import { cn } from "@/lib/utils";

type SliderProps = {
  className?: string;
  min?: number;
  max?: number;
  step?: number;
  value?: number[];
  defaultValue?: number[];
  disabled?: boolean;
  onValueChange?: (values: number[]) => void;
  ["aria-label"]?: string;
  ["aria-labelledby"]?: string;
};

const DEFAULT_STEP = 1;

const Slider = React.forwardRef<HTMLDivElement, SliderProps>(
  (
    {
      className,
      min = 0,
      max = 100,
      step = DEFAULT_STEP,
      value,
      defaultValue,
      disabled = false,
      onValueChange,
      ...props
    },
    ref
  ) => {
    const thumbCount = value?.length ?? defaultValue?.length ?? 1;
    const initialValue = React.useMemo(() => {
      if (value) return value;
      if (defaultValue) return defaultValue;
      if (thumbCount === 2) return [min, max];
      return [min];
    }, [defaultValue, min, max, thumbCount, value]);

    const isControlled = value !== undefined;
    const [internalValue, setInternalValue] = React.useState(initialValue);
    const activeValues = (isControlled ? value : internalValue) ?? initialValue;
    const trackRef = React.useRef<HTMLDivElement | null>(null);
    const [activeThumb, setActiveThumb] = React.useState<number | null>(null);

    // sync default change when uncontrolled
    React.useEffect(() => {
      if (!isControlled && defaultValue) {
        setInternalValue(defaultValue);
      }
    }, [defaultValue, isControlled]);

    const sortedValues = React.useMemo(() => {
      if (activeValues.length <= 1) return activeValues;
      // keep original order to respect user control
      return activeValues.map((val, index) => ({ val, index })).sort((a, b) => a.val - b.val);
    }, [activeValues]);

    const clampToStep = React.useCallback(
      (raw: number) => {
        const clamped = Math.min(Math.max(raw, min), max);
        const snapped =
          Math.round((clamped - min) / step) * step + min;
        const precision = (() => {
          const stepString = step.toString();
          const decimalIndex = stepString.indexOf(".");
          return decimalIndex === -1 ? 0 : stepString.length - decimalIndex - 1;
        })();
        return Number(snapped.toFixed(precision));
      },
      [min, max, step]
    );

    const emitChange = React.useCallback(
      (next: number[]) => {
        if (!isControlled) {
          setInternalValue(next);
        }
        onValueChange?.(next);
      },
      [isControlled, onValueChange]
    );

    const updateValueAtIndex = React.useCallback(
      (index: number, nextValue: number) => {
        const next = [...activeValues];
        next[index] = clampToStep(nextValue);
        if (next.length === 2) {
          const otherIndex = index === 0 ? 1 : 0;
          if (index === 0) {
            next[index] = Math.min(next[index], next[otherIndex]);
          } else {
            next[index] = Math.max(next[index], next[otherIndex]);
          }
        }
        emitChange(next);
      },
      [activeValues, clampToStep, emitChange]
    );

    const valueFromClientX = React.useCallback(
      (clientX: number) => {
        const track = trackRef.current;
        if (!track) return min;
        const rect = track.getBoundingClientRect();
        if (rect.width === 0) return min;
        const ratio = (clientX - rect.left) / rect.width;
        const raw = min + ratio * (max - min);
        return clampToStep(raw);
      },
      [clampToStep, max, min]
    );

    React.useEffect(() => {
      if (activeThumb === null) return;

      const handlePointerMove = (event: PointerEvent) => {
        event.preventDefault();
        const nextValue = valueFromClientX(event.clientX);
        updateValueAtIndex(activeThumb, nextValue);
      };

      const handlePointerUp = () => {
        setActiveThumb(null);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp, { once: true });

      return () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      };
    }, [activeThumb, updateValueAtIndex, valueFromClientX]);

    const handleTrackPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      event.preventDefault();
      const pointerValue = valueFromClientX(event.clientX);
      const nearestIndex = activeValues.reduce((nearest, current, index) => {
        const nearestDiff = Math.abs(activeValues[nearest] - pointerValue);
        const currentDiff = Math.abs(current - pointerValue);
        return currentDiff < nearestDiff ? index : nearest;
      }, 0);
      updateValueAtIndex(nearestIndex, pointerValue);
      setActiveThumb(nearestIndex);
    };

    const handleThumbPointerDown = (
      event: React.PointerEvent<HTMLButtonElement>,
      index: number
    ) => {
      if (disabled) return;
      event.preventDefault();
      event.currentTarget.focus();
      setActiveThumb(index);
    };

    const handleThumbKeyDown = (
      event: React.KeyboardEvent<HTMLButtonElement>,
      index: number
    ) => {
      if (disabled) return;
      const keyMap: Record<string, number> = {
        ArrowLeft: -1,
        ArrowDown: -1,
        ArrowRight: 1,
        ArrowUp: 1,
        PageDown: -10,
        PageUp: 10,
        Home: Number.NEGATIVE_INFINITY,
        End: Number.POSITIVE_INFINITY
      };
      const movement = keyMap[event.key];
      if (movement === undefined) return;
      event.preventDefault();

      if (movement === Number.NEGATIVE_INFINITY) {
        updateValueAtIndex(index, min);
        return;
      }
      if (movement === Number.POSITIVE_INFINITY) {
        updateValueAtIndex(index, max);
        return;
      }

      const delta = movement * step;
      updateValueAtIndex(index, activeValues[index] + delta);
    };

    const getPercentage = React.useCallback(
      (val: number) => ((val - min) / (max - min)) * 100,
      [max, min]
    );

    const sortedForRange = [...activeValues].sort((a, b) => a - b);
    const rangeStart = getPercentage(sortedForRange[0]);
    const rangeEnd = getPercentage(sortedForRange[sortedForRange.length - 1]);

    return (
      <div
        ref={(node) => {
          trackRef.current = node;
          if (typeof ref === "function") {
            ref(node);
          } else if (ref) {
            ref.current = node;
          }
        }}
        className={cn("relative flex w-full touch-none select-none items-center", className)}
        onPointerDown={handleTrackPointerDown}
        role="presentation"
        {...props}
      >
        <div className="relative h-2 w-full rounded-full bg-secondary">
          <div
            className="absolute h-full rounded-full bg-primary"
            style={{
              left: `${rangeStart}%`,
              width: `${Math.max(rangeEnd - rangeStart, 0)}%`
            }}
          />
        </div>
        {activeValues.map((current, index) => {
          const percent = getPercentage(current);
          return (
            <button
              key={index}
              type="button"
              role="slider"
              aria-valuemin={min}
              aria-valuemax={max}
              aria-valuenow={current}
              aria-disabled={disabled}
              aria-orientation="horizontal"
              className="absolute h-4 w-4 -translate-y-1/2 rounded-full border border-primary bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50"
              style={{
                left: `calc(${percent}% - 8px)`,
                top: "50%"
              }}
              disabled={disabled}
              onPointerDown={(event) => handleThumbPointerDown(event, index)}
              onKeyDown={(event) => handleThumbKeyDown(event, index)}
              data-state={current === min ? "min" : current === max ? "max" : "default"}
            />
          );
        })}
      </div>
    );
  }
);

Slider.displayName = "Slider";

export { Slider };
