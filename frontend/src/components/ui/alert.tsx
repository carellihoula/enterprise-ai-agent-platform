import React from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'destructive';
}

export const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant = 'default', children, ...props }, ref) => (
    <div
      ref={ref}
      role="alert"
      className={cn(
        'relative w-full rounded-2xl border p-4 text-sm font-medium [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground [&>svg~*]:pl-7',
        variant === 'default' && 'bg-zinc-900 border-zinc-800 text-zinc-100',
        variant === 'destructive' && 'bg-rose-500/10 border-rose-500/30 text-rose-300 [&>svg]:text-rose-400',
        className
      )}
      {...props}
    >
      <AlertCircle className="w-4 h-4" />
      <div>{children}</div>
    </div>
  )
);
Alert.displayName = 'Alert';
