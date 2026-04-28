import { ReactNode } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface SidebarProps {
  children: ReactNode;
  side: 'left' | 'right';
}

export function Sidebar({ children, side }: SidebarProps) {
  const borderClass = side === 'left' ? 'border-r' : 'border-l';
  const label = side === 'left' ? 'Drawing setup' : 'Machine controls';

  return (
    <aside
      aria-label={label}
      className={`relative w-full h-full overflow-hidden ${borderClass} border-foreground/5 bg-card flex flex-col`}
    >
      <ScrollArea className="flex-1">
        {children}
      </ScrollArea>
    </aside>
  );
}
