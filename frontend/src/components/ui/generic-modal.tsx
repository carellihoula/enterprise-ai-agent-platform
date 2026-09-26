'use client';

/**
 * GenericModal component providing a reusable dialog container built on shadcn/ui primitives.
 */

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

export interface GenericModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidthClassName?: string;
}

export const GenericModal: React.FC<GenericModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  icon,
  children,
  footer,
  maxWidthClassName = 'max-w-md',
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={`${maxWidthClassName} bg-white border-zinc-200`}>
        <DialogHeader>
          <div className="flex items-center gap-2">
            {icon}
            <DialogTitle>{title}</DialogTitle>
          </div>
          {description && (
            <DialogDescription className="text-xs text-zinc-500">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="py-2">{children}</div>

        {footer && <DialogFooter className="pt-2 border-t border-zinc-100">{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
};
