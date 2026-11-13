"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface TabsListProps extends React.HTMLAttributes<HTMLDivElement> {}

/**
 * Container for segmented tab triggers matching shadcn/ui TabsList styling.
 */
export const TabsList = React.forwardRef<HTMLDivElement, TabsListProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      role="tablist"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg bg-zinc-100 p-1 text-zinc-500",
        className
      )}
      {...props}
    />
  )
);
TabsList.displayName = "TabsList";

export interface TabsTriggerProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

/**
 * Individual tab button inside a TabsList.
 */
export const TabsTrigger = React.forwardRef<
  HTMLButtonElement,
  TabsTriggerProps
>(({ className, active = false, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    role="tab"
    aria-selected={active}
    tabIndex={active ? 0 : -1}
    className={cn(
      "inline-flex h-7.5 items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 text-[13px] font-medium transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
      active
        ? "bg-white text-zinc-900 shadow-2xs ring-1 ring-zinc-200/80"
        : "text-zinc-500 hover:text-zinc-900",
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = "TabsTrigger";
