import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "font-mono uppercase focus-visible:ring-ring/50 bg-clip-padding text-sm font-medium focus-visible:ring-3 aria-invalid:ring-3 [&_svg:not([class*='size-'])]:size-3.5 group/button inline-flex shrink-0 items-center justify-center whitespace-nowrap transition-all outline-none select-none disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 h-(--button-height) gap-1 px-3 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5",
  {
    variants: {
      variant: {
        default: "bg-button-bg-idle text-button-text-idle hover:bg-button-bg-hover disabled:bg-button-bg-idle disabled:text-button-text-idle aria-pressed:bg-button-bg-active",
        outline: "bg-transparent shadow-[0_0_0_1px_var(--color-button-border-idle)_inset] hover:shadow-[0_0_0_0px_var(--color-button-border-hover)_inset] hover:bg-button-bg-hover aria-expanded:bg-muted aria-expanded:text-foreground aria-pressed:bg-button-bg-active",
        secondary: "bg-[rgba(50,50,50,1)] text-foreground hover:bg-[rgba(60,60,60,1)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost: "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
        destructive: "bg-red-500/10 hover:bg-red-500/20 focus-visible:ring-red-500/20 text-red-500",
        link: "text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      className={cn(buttonVariants({ variant, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
