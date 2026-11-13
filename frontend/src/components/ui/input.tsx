import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

/**
 * Reusable shadcn/ui Input primitive supporting validation states and monospace typography.
 *
 * Args:
 *   className (string | undefined): Additional Tailwind CSS classes.
 *   type (string | undefined): HTML input type attribute.
 *
 * Returns:
 *   React.ReactElement: Styled input element.
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          "flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 py-1 text-sm text-zinc-900 shadow-2xs transition-colors placeholder:text-zinc-400 focus-visible:outline-none focus-visible:border-blue-600 focus-visible:ring-3 focus-visible:ring-blue-600/20 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-rose-600 aria-[invalid=true]:focus-visible:ring-rose-600/20",
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";
