import * as React from "react"
import { Collapsible } from "radix-ui"
import { CaretDown, DotsSixVertical } from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import type { ConnectDragSource } from "react-dnd"

interface SidebarPanelProps {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
  dragRef?: ConnectDragSource
}

export function SidebarPanel({ title, children, defaultOpen = true, dragRef }: SidebarPanelProps) {
  const [open, setOpen] = React.useState(defaultOpen)

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      <div className="flex w-full items-center border-b border-foreground/5 hover:bg-foreground/5 transition-colors">
        {dragRef && (
          <div
            ref={dragRef}
            className="flex items-center justify-center px-2 py-4 cursor-grab active:cursor-grabbing text-foreground/40 hover:text-foreground/60 transition-colors"
          >
            <DotsSixVertical weight="bold" className="size-4" />
          </div>
        )}
        <Collapsible.Trigger className={cn(
          "flex flex-1 items-center justify-between text-xs font-medium py-4 pr-4 cursor-pointer",
          !dragRef && "pl-4"
        )}>
          <span>{title}</span>
          <CaretDown
            weight="bold"
            className={cn(
              "size-3 text-foreground/60 transition-transform duration-200",
              open && "rotate-180"
            )}
          />
        </Collapsible.Trigger>
      </div>
      <Collapsible.Content className="data-[state=closed]:animate-collapse-up data-[state=open]:animate-collapse-down overflow-hidden">
        {children}
      </Collapsible.Content>
    </Collapsible.Root>
  )
}
