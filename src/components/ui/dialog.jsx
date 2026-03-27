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
    className={cn("sticky bottom-0 -mx-4 mt-2 flex flex-col-reverse gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:static sm:mx-0 sm:mt-0 sm:flex-row sm:justify-end sm:space-x-2 sm:gap-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0", className)}
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

  /** Stable id so Content `aria-describedby` always points at the injected sr-only Description (Radix may not merge when Content props were touched). */
  const fallbackDescriptionId = React.useId()

  /** hasOwnProperty distinguishes explicit undefined (opt-out) from omitted; empty string matches legacy “not provided”. */
  const hasAriaDescribedbyKey = Object.prototype.hasOwnProperty.call(allProps, "aria-describedby")
  const rawAriaDescribedBy = hasAriaDescribedbyKey ? allProps["aria-describedby"] : undefined
  const { "aria-describedby": _ariaOmit, ...props } = rest

  const hasNonEmptyAriaDescribedBy =
    typeof rawAriaDescribedBy === "string" && rawAriaDescribedBy.length > 0

  const hasTitle = hasDialogChild(children, DialogTitle)
  /**
   * Safety-first: unless caller provides a non-empty custom id, wire a fallback
   * Description + aria-describedby target. This avoids Radix warnings even when
   * child detection fails in wrapped/HMR edge cases.
   */
  const injectFallbackDescription = !hasNonEmptyAriaDescribedBy

  /**
   * Non-empty aria-describedby: caller controls the id.
   * Fallback Description: wire explicitly — do not pass aria-describedby={undefined} (that clears the link).
   * Otherwise omit the prop and let Radix handle Description supplied by the caller.
   */
  const ariaDescribedByProp = hasNonEmptyAriaDescribedBy
    ? { "aria-describedby": rawAriaDescribedBy }
    : injectFallbackDescription
      ? { "aria-describedby": fallbackDescriptionId }
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
          "fixed left-[50%] top-[50%] z-[100] grid w-[calc(100%-1rem)] max-w-lg max-h-[calc(100dvh-1.5rem)] translate-x-[-50%] translate-y-[-50%] gap-4 overflow-y-auto overscroll-contain border bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:w-full sm:max-h-[90vh] sm:p-6 sm:rounded-lg",
          className
        )}
        {...ariaDescribedByProp}
        {...props}>
        {!hasTitle && <DialogPrimitive.Title className="sr-only">Dialog</DialogPrimitive.Title>}
        {injectFallbackDescription && (
          <DialogPrimitive.Description id={fallbackDescriptionId} className="sr-only">
            Dialog content
          </DialogPrimitive.Description>
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
