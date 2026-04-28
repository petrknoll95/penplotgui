"use client"

import * as React from "react"
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"

import { cn } from "@/lib/utils"

interface TooltipProps {
  align?: "start" | "center" | "end"
  children: React.ReactElement
  content: React.ReactNode
  delay?: number
  side?: "top" | "right" | "bottom" | "left"
  sideOffset?: number
}

function Tooltip({
  align = "center",
  children,
  content,
  delay = 350,
  side = "top",
  sideOffset = 6,
}: TooltipProps) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger
        delay={delay}
        render={<span className="inline-flex" />}
      >
        {children}
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Positioner
          align={align}
          side={side}
          sideOffset={sideOffset}
          className="z-50 outline-none"
        >
          <TooltipPrimitive.Popup
            data-slot="tooltip-content"
            className={cn(
              "max-w-[260px] rounded-md border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-lg shadow-black/30 outline-none",
              "data-[closed]:scale-[0.98] data-[closed]:opacity-0 data-[open]:scale-100 data-[open]:opacity-100"
            )}
          >
            {content}
          </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

export { Tooltip }
