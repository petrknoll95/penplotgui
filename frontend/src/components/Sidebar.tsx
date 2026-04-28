import { ReactNode } from 'react';
import { PanelDragLayer } from './DraggablePanel';

interface SidebarProps {
  children: ReactNode;
}

export function Sidebar({ children }: SidebarProps) {
  return (
    <aside className="relative w-full h-full overflow-hidden border-l border-foreground/5 bg-card flex flex-col">
      <PanelDragLayer />
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </aside>
  );
}
