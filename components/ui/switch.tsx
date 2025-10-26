import * as React from "react";
import { cn } from "@/lib/utils";

type SwitchProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> & {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
};

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  (
    { className, checked, defaultChecked = false, disabled, onCheckedChange, onClick, ...props },
    ref
  ) => {
    const isControlled = checked !== undefined;
    const [internalChecked, setInternalChecked] = React.useState(defaultChecked);

    React.useEffect(() => {
      if (!isControlled) {
        setInternalChecked(defaultChecked);
      }
    }, [defaultChecked, isControlled]);

    const currentChecked = isControlled ? checked! : internalChecked;

    const handleToggle = (next: boolean) => {
      if (!isControlled) {
        setInternalChecked(next);
      }
      onCheckedChange?.(next);
    };

    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(event);
      if (event.defaultPrevented || disabled) {
        return;
      }
      handleToggle(!currentChecked);
    };

    return (
      <button
        type="button"
        role="switch"
        aria-checked={currentChecked}
        data-state={currentChecked ? "checked" : "unchecked"}
        data-disabled={disabled ? "" : undefined}
        className={cn(
          "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[state=checked]:bg-primary data-[state=unchecked]:bg-secondary disabled:cursor-not-allowed disabled:opacity-60",
          className
        )}
        disabled={disabled}
        onClick={handleClick}
        ref={ref}
        {...props}
      >
        <span
          className={cn(
            "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform",
            currentChecked ? "translate-x-[22px]" : "translate-x-0.5"
          )}
        />
      </button>
    );
  }
);

Switch.displayName = "Switch";

export { Switch };
