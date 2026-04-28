"use client"

import * as React from "react"
import { Toggle as BaseToggle } from "@base-ui/react/toggle"
import { ToggleGroup as BaseToggleGroup } from "@base-ui/react/toggle-group"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

interface ToggleGroupProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "defaultValue" | "onChange"> {
  defaultValue?: readonly string[]
  disabled?: boolean
  loopFocus?: boolean
  multiple?: boolean
  onValueChange?: (value: string[]) => void
  orientation?: "horizontal" | "vertical"
  value?: readonly string[]
}

const toggleGroupItemVariants = cva(
  "inline-flex h-8 min-w-8 flex-1 items-center justify-center rounded-md border border-button-border-idle bg-button-bg-idle px-2 text-sm font-medium text-button-text-idle transition-colors outline-none hover:border-button-border-hover hover:bg-button-bg-hover focus-visible:ring-2 focus-visible:ring-ring/50 data-[pressed]:border-primary/70 data-[pressed]:bg-primary data-[pressed]:text-primary-foreground disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      size: {
        default: "h-8 px-2",
        sm: "h-7 px-2 text-sm",
        xs: "h-6 px-1.5 text-sm",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

function ToggleGroup({ className, ...props }: ToggleGroupProps) {
  return (
    <BaseToggleGroup
      data-slot="toggle-group"
      className={cn("flex items-center gap-1", className)}
      {...props}
    />
  )
}

function ToggleGroupItem({
  className,
  size,
  ...props
}: React.ComponentProps<typeof BaseToggle> &
  VariantProps<typeof toggleGroupItemVariants>) {
  return (
    <BaseToggle
      data-slot="toggle-group-item"
      className={cn(toggleGroupItemVariants({ size, className }))}
      {...props}
    />
  )
}

export { ToggleGroup, ToggleGroupItem, toggleGroupItemVariants }
