import React from 'react';
import { cn } from '../../lib/utils';

export function ScrollArea({ className = '', children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('relative overflow-auto', className)} {...props}>
      {children}
    </div>
  );
}

export function ScrollBar({ orientation = 'vertical' }: { orientation?: 'horizontal' | 'vertical' }) {
  return <div className="scrollbar" />;
}

