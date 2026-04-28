import * as React from "react"
import { Button as BaseButton } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border text-sm font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/55 active:translate-y-px data-[disabled]:pointer-events-none data-[disabled]:opacity-45 disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "border-primary/70 bg-primary text-primary-foreground hover:bg-primary/90",
        outline:
          "border-button-border-idle bg-button-bg-idle text-button-text-idle hover:border-button-border-hover hover:bg-button-bg-hover hover:text-button-text-hover data-[popup-open]:bg-button-bg-active",
        secondary:
          "border-secondary bg-secondary text-secondary-foreground hover:bg-secondary/85",
        ghost:
          "border-transparent bg-transparent text-foreground/75 hover:bg-muted hover:text-foreground",
        destructive:
          "border-destructive/35 bg-destructive/16 text-destructive-foreground hover:bg-destructive/24 focus-visible:ring-destructive/35",
        link: "border-transparent bg-transparent text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-8 px-3",
        xs: "h-6 rounded-sm px-2 text-sm [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 rounded-md px-2.5 text-sm [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 px-3.5",
        icon: "size-8",
        "icon-xs": "size-6 rounded-sm [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7 rounded-md",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: React.ComponentProps<typeof BaseButton> & VariantProps<typeof buttonVariants>) {
  return (
    <BaseButton
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
