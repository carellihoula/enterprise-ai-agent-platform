"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface SwitchProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

/**
 * Accessible shadcn/ui Switch primitive for boolean state toggling.
 *
 * Args:
 *   checked (boolean): Current boolean state of the switch.
 *   onCheckedChange ((checked: boolean) => void | undefined): Callback invoked when toggled.
 *   className (string | undefined): Optional additional CSS classes.
 *
 * Returns:
 *   React.ReactElement: Accessible button element with role="switch".
 */
export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked, onCheckedChange, className, onClick, ...props }, ref) => {
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(e);
      if (!e.defaultPrevented && onCheckedChange) {
        onCheckedChange(!checked);
      }
    };

    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        ref={ref}
        onClick={handleClick}
        className={cn(
          "peer relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50",
          checked ? "bg-zinc-900" : "bg-zinc-300",
          className
        )}
        {...props}
      >
        <span
          className={cn(
            "pointer-events-none block h-4 w-4 rounded-full bg-white shadow-xs ring-0 transition-transform",
            checked ? "translate-x-4" : "translate-x-0"
          )}
        />
      </button>
    );
  }
);
Switch.displayName = "Switch";
