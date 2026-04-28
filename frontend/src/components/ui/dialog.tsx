"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"

interface DialogProps {
  children?: React.ReactNode
  defaultOpen?: boolean
  disablePointerDismissal?: boolean
  modal?: boolean | "trap-focus"
  onOpenChange?: (open: boolean) => void
  open?: boolean
}

function Dialog({ onOpenChange, ...props }: DialogProps) {
  return (
    <DialogPrimitive.Root
      onOpenChange={(open) => onOpenChange?.(open)}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Popup>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        data-slot="dialog-backdrop"
        className="t-dialog-backdrop fixed inset-0 z-50 bg-black/70"
      />
      <DialogPrimitive.Viewport
        data-slot="dialog-viewport"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <DialogPrimitive.Popup
          data-slot="dialog-content"
          finalFocus={false}
          className={cn(
            "t-modal w-full max-w-[360px] rounded-lg border border-border bg-card p-6 text-card-foreground shadow-xl shadow-black/40 outline-none",
            className
          )}
          {...props}
        >
          {children}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Viewport>
    </DialogPrimitive.Portal>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-sm font-semibold", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

const DialogClose = DialogPrimitive.Close

export { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle }
