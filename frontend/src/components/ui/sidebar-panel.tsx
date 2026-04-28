import * as React from "react"
import { Collapsible } from "@base-ui/react/collapsible"
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
    <Collapsible.Root open={open} onOpenChange={setOpen} className="w-full">
      <div className="flex w-full items-center border-y border-foreground/5 transition-colors bg-card hover:bg-[color-mix(in_oklch,var(--color-white)_5%,var(--color-card))] sticky top-0">
        {dragRef && (
          <div
            ref={dragRef}
            className="flex cursor-grab items-center justify-center px-2 py-4 text-foreground/40 transition-colors hover:text-foreground/60 active:cursor-grabbing"
          >
            <DotsSixVertical weight="bold" className="size-4" />
          </div>
        )}
        <Collapsible.Trigger
          className={cn(
            "flex flex-1 cursor-pointer items-center justify-between py-4 pr-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/45",
            !dragRef && "pl-4"
          )}
        >
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
      <Collapsible.Panel className="overflow-hidden data-[closed]:animate-collapse-up data-[open]:animate-collapse-down bg-[color-mix(in_oklch,var(--color-black)_5%,var(--color-card))]">
        {children}
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}
