"use client"

import * as React from "react"
import PropTypes from "prop-types"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-[100] bg-black/80  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props} />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

/** True if `Component` appears anywhere under `children` (deep). Handles forwardRef + odd HMR duplicates via displayName. */
const hasDialogChild = (children, Component) => {
  if (!Component) return false
  const targetName = Component.displayName ?? Component.name
  let found = false
  const matches = (node) => {
    if (node.type === Component) return true
    const n = node.type?.displayName ?? node.type?.name
    return Boolean(targetName && n && n === targetName)
  }
  const walk = (node) => {
    if (found || node == null) return
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    if (!React.isValidElement(node)) return
    if (matches(node)) {
      found = true
      return
    }
    const ch = node.props?.children
    if (ch != null) React.Children.forEach(ch, walk)
  }
  React.Children.forEach(children, walk)
  return found
}

const DialogHeader = ({
  className,
  ...props
}) => (
  <div
    className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)}
    {...props} />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}) => (
  <div
    className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}
    {...props} />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props} />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName || "DialogTitle"

const DialogDescription = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props} />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName || "DialogDescription"

const DialogContent = React.forwardRef((allProps, ref) => {
  const {
    className,
    children,
    onOpenAutoFocus,
    ...rest
  } = allProps

  /** hasOwnProperty distinguishes explicit undefined (opt-out) from omitted; empty string matches legacy “not provided”. */
  const hasAriaDescribedbyKey = Object.prototype.hasOwnProperty.call(allProps, "aria-describedby")
  const rawAriaDescribedBy = hasAriaDescribedbyKey ? allProps["aria-describedby"] : undefined
  const { "aria-describedby": _ariaOmit, ...props } = rest

  const hasNonEmptyAriaDescribedBy =
    typeof rawAriaDescribedBy === "string" && rawAriaDescribedBy.length > 0
  const explicitAriaOptOut = hasAriaDescribedbyKey && rawAriaDescribedBy === undefined

  const hasTitle = hasDialogChild(children, DialogTitle)
  const hasDescription = hasDialogChild(children, DialogDescription)
  const injectFallbackDescription =
    !hasDescription && !hasNonEmptyAriaDescribedBy && !explicitAriaOptOut

  /**
   * Radix sets aria-describedby → descriptionId; if no Description mounts, DescriptionWarning fires.
   * Omit or aria-describedby="": inject sr-only Description when no DialogDescription (same as pre-refactor).
   * Non-empty string: custom id, no fallback.
   * Explicit undefined: opt out — no fallback; Radix link cleared via spread below.
   */
  const ariaDescribedByProp = hasNonEmptyAriaDescribedBy
    ? { "aria-describedby": rawAriaDescribedBy }
    : explicitAriaOptOut
      ? { "aria-describedby": undefined }
      : {}

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        onOpenAutoFocus={onOpenAutoFocus ?? ((e) => {
          const el = e.currentTarget.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
          if (el && typeof el.focus === 'function') {
            e.preventDefault();
            el.focus();
          }
        })}
        tabIndex={-1}
        className={cn(
          "fixed left-[50%] top-[50%] z-[100] grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
          className
        )}
        {...ariaDescribedByProp}
        {...props}>
        {!hasTitle && <DialogPrimitive.Title className="sr-only">Dialog</DialogPrimitive.Title>}
        {injectFallbackDescription && (
          <DialogPrimitive.Description className="sr-only">Dialog content</DialogPrimitive.Description>
        )}
        {children}
        <DialogPrimitive.Close
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
          <X className="w-4 h-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
})
DialogContent.displayName = DialogPrimitive.Content.displayName

DialogOverlay.propTypes = {
  className: PropTypes.string
}

DialogContent.propTypes = {
  className: PropTypes.string,
  children: PropTypes.node,
  /** Omit or "" for auto fallback; non-empty string for custom id; explicit undefined to opt out (see source). */
  'aria-describedby': PropTypes.string,
  onOpenAutoFocus: PropTypes.func,
}

DialogHeader.propTypes = {
  className: PropTypes.string
}

DialogFooter.propTypes = {
  className: PropTypes.string
}

DialogTitle.propTypes = {
  className: PropTypes.string
}

DialogDescription.propTypes = {
  className: PropTypes.string
}

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
