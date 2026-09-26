import React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500 disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
          variant === 'default' && 'bg-indigo-600 text-white shadow hover:bg-indigo-500',
          variant === 'destructive' && 'bg-rose-600 text-white shadow-sm hover:bg-rose-500',
          variant === 'outline' && 'border border-zinc-200 bg-white shadow-sm hover:bg-zinc-100 hover:text-zinc-900 text-zinc-700',
          variant === 'secondary' && 'bg-zinc-100 text-zinc-900 shadow-sm hover:bg-zinc-200',
          variant === 'ghost' && 'hover:bg-zinc-100 hover:text-zinc-900 text-zinc-600',
          size === 'default' && 'h-9 px-4 py-2',
          size === 'sm' && 'h-8 rounded-lg px-3 text-xs',
          size === 'lg' && 'h-10 rounded-xl px-8',
          size === 'icon' && 'h-9 w-9 p-0',
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
