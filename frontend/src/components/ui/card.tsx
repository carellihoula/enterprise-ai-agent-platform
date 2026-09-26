import React from 'react';
import { cn } from '@/lib/utils';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-2xl border border-zinc-800 bg-zinc-900 text-zinc-100 shadow-lg',
        className
      )}
      {...props}
    />
  )
);
Card.displayName = 'Card';
