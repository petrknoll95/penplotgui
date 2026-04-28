import * as React from "react"
import { Input as BaseInput } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({
  className,
  type,
  ...props
}: React.ComponentProps<typeof BaseInput>) {
  return (
    <BaseInput
      type={type}
      data-slot="input"
      className={cn(
        "flex h-(--button-height) w-full rounded-md border border-input bg-button-bg-idle px-2.5 py-1 text-sm text-button-text-idle transition-colors placeholder:text-muted-foreground hover:bg-button-bg-hover focus-visible:bg-button-bg-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Input }
