import React from 'react';
import { cn } from '@/lib/utils';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-2xl border border-zinc-200/80 bg-white text-zinc-900 shadow-sm hover:shadow transition-shadow',
        className
      )}
      {...props}
    />
  )
);
Card.displayName = 'Card';
