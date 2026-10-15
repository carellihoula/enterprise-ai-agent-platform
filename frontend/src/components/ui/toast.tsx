"use client";

import React, { useEffect, useState } from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { X, AlertCircle, CheckCircle2, Info, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export interface ToastActionProps {
  children: React.ReactNode;
  onClick: (e?: React.MouseEvent) => void;
  className?: string;
}

export interface ToastOptions {
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: "default" | "destructive" | "success" | "info" | "warning";
  duration?: number;
  actionProps?: ToastActionProps;
}

export interface ToastItem extends ToastOptions {
  id: string;
}

type ToastListener = (toasts: ToastItem[]) => void;

let listeners: ToastListener[] = [];
let memoryToasts: ToastItem[] = [];

/**
 * Dispatches an updated toast list to all active subscriber components.
 */
function notifyListeners(): void {
  // [Architecture] Broadcast snapshot copy to protect subscriber immutability
  listeners.forEach((listener) => listener([...memoryToasts]));
}

/**
 * Imperative Toast API matching shadcn/ui interaction standards.
 */
export const toast = {
  /**
   * Adds a new toast notification.
   *
   * @param options Configuration for the toast message and action.
   * @returns Generated unique string identifier for the toast.
   */
  add(options: ToastOptions): string {
    const id = Math.random().toString(36).substring(2, 9);
    const item: ToastItem = {
      id,
      duration: options.duration ?? 5000,
      variant: options.variant ?? "default",
      ...options,
    };
    // [Performance] Cap concurrent active toasts to prevent viewport cluttering
    memoryToasts = [item, ...memoryToasts].slice(0, 5);
    notifyListeners();
    return id;
  },

  /**
   * Closes a specific toast by identifier.
   *
   * @param id The unique toast identifier.
   */
  close(id: string): void {
    memoryToasts = memoryToasts.filter((t) => t.id !== id);
    notifyListeners();
  },

  /**
   * Closes a specific toast or dismisses all toasts when no ID is provided.
   *
   * @param id Optional toast identifier.
   */
  dismiss(id?: string): void {
    if (id) {
      this.close(id);
    } else {
      memoryToasts = [];
      notifyListeners();
    }
  },

  /**
   * Convenience helper to display a destructive error toast.
   */
  error(description: React.ReactNode, title: React.ReactNode = "Error", options?: Partial<ToastOptions>): string {
    return this.add({
      variant: "destructive",
      title,
      description,
      ...options,
    });
  },

  /**
   * Convenience helper to display a success toast.
   */
  success(description: React.ReactNode, title: React.ReactNode = "Success", options?: Partial<ToastOptions>): string {
    return this.add({
      variant: "success",
      title,
      description,
      ...options,
    });
  },

  /**
   * Convenience helper to display an informational toast.
   */
  info(description: React.ReactNode, title: React.ReactNode = "Info", options?: Partial<ToastOptions>): string {
    return this.add({
      variant: "info",
      title,
      description,
      ...options,
    });
  },

  /**
   * Convenience helper to display a warning toast.
   */
  warning(description: React.ReactNode, title: React.ReactNode = "Warning", options?: Partial<ToastOptions>): string {
    return this.add({
      variant: "warning",
      title,
      description,
      ...options,
    });
  },
};

/**
 * Returns the matching Lucide indicator icon according to the toast variant.
 */
function getVariantIcon(variant?: ToastOptions["variant"]): React.ReactNode {
  switch (variant) {
    case "destructive":
      return <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />;
    case "success":
      return <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />;
    case "warning":
      return <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />;
    case "info":
      return <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />;
    default:
      return null;
  }
}

/**
 * Root Toaster component rendering active notifications in a portal viewport.
 */
export function Toaster(): React.ReactElement {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    // [Lifecycle] Subscribe to imperative store updates
    const handleUpdate = (updated: ToastItem[]) => setToasts(updated);
    listeners.push(handleUpdate);
    return () => {
      listeners = listeners.filter((l) => l !== handleUpdate);
    };
  }, []);

  return (
    <ToastPrimitive.Provider swipeDirection="right">
      {toasts.map((item) => (
        <ToastPrimitive.Root
          key={item.id}
          duration={item.duration}
          onOpenChange={(open) => {
            if (!open) {
              toast.close(item.id);
            }
          }}
          className={cn(
            "group pointer-events-auto relative flex w-full items-start justify-between gap-3 overflow-hidden rounded-lg border p-4 shadow-lg transition-all",
            "bg-white border-zinc-200 text-zinc-900",
            item.variant === "destructive" && "border-rose-200/80 bg-rose-50/30 text-zinc-900",
            item.variant === "success" && "border-emerald-200/80 bg-emerald-50/30 text-zinc-900",
            item.variant === "warning" && "border-amber-200/80 bg-amber-50/30 text-zinc-900",
            item.variant === "info" && "border-sky-200/80 bg-sky-50/30 text-zinc-900",
          )}
        >
          <div className="flex items-start gap-2.5 flex-1 min-w-0">
            {getVariantIcon(item.variant)}
            <div className="space-y-0.5 flex-1 min-w-0">
              {item.title && (
                <ToastPrimitive.Title className="text-xs font-semibold text-zinc-900 leading-tight">
                  {item.title}
                </ToastPrimitive.Title>
              )}
              {item.description && (
                <ToastPrimitive.Description className="text-xs text-zinc-600 leading-normal break-words">
                  {item.description}
                </ToastPrimitive.Description>
              )}
            </div>
          </div>

          {item.actionProps && (
            <ToastPrimitive.Action
              asChild
              altText={
                typeof item.actionProps.children === "string"
                  ? item.actionProps.children
                  : "Action"
              }
            >
              <Button
                variant="outline"
                size="sm"
                onClick={item.actionProps.onClick}
                className={cn(
                  "h-7 text-xs px-2.5 font-medium border-zinc-200 hover:bg-zinc-100 shrink-0",
                  item.actionProps.className,
                )}
              >
                {item.actionProps.children}
              </Button>
            </ToastPrimitive.Action>
          )}

          <ToastPrimitive.Close
            aria-label="Close notification"
            className="rounded-md p-1 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 transition-colors shrink-0 -mr-1 -mt-1 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </ToastPrimitive.Close>
        </ToastPrimitive.Root>
      ))}

      <ToastPrimitive.Viewport className="fixed bottom-0 right-0 z-50 flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px] pointer-events-none space-y-2" />
    </ToastPrimitive.Provider>
  );
}
