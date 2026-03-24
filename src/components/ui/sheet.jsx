"use client";
import * as React from "react"
import PropTypes from "prop-types"
import * as SheetPrimitive from "@radix-ui/react-dialog"
import { cva } from "class-variance-authority";
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const Sheet = SheetPrimitive.Root

const SheetTrigger = SheetPrimitive.Trigger

const SheetClose = SheetPrimitive.Close

const SheetPortal = SheetPrimitive.Portal

const DIALOG_TITLE_DISPLAY_NAME = SheetPrimitive.Title.displayName || "DialogTitle"
const DIALOG_DESCRIPTION_DISPLAY_NAME = SheetPrimitive.Description.displayName || "DialogDescription"

const hasSheetTitleChild = (children) => {
  let found = false
  const walk = (node) => {
    if (found || !React.isValidElement(node)) return
    const displayName = node.type?.displayName || node.type?.name
    if (displayName && (displayName === DIALOG_TITLE_DISPLAY_NAME || displayName === "DialogTitle")) {
      found = true
      return
    }
    React.Children.forEach(node.props?.children, walk)
  }
  React.Children.forEach(children, walk)
  return found
}

const hasSheetDescriptionChild = (children) => {
  let found = false
  const walk = (node) => {
    if (found || !React.isValidElement(node)) return
    const displayName = node.type?.displayName || node.type?.name
    if (displayName && displayName === DIALOG_DESCRIPTION_DISPLAY_NAME) {
      found = true
      return
    }
    React.Children.forEach(node.props?.children, walk)
  }
  React.Children.forEach(children, walk)
  return found
}

const SheetOverlay = React.forwardRef(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    className={cn(
      "fixed inset-0 z-50 bg-black/80  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
    ref={ref} />
))
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName

const sheetVariants = cva(
  "fixed z-50 gap-4 bg-background p-6 shadow-lg transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500 data-[state=open]:animate-in data-[state=closed]:animate-out",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        bottom:
          "inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        left: "inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
        right:
          "inset-y-0 right-0 h-full w-3/4 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
      },
    },
    defaultVariants: {
      side: "right",
    },
  }
)

const SheetContent = React.forwardRef((allProps, ref) => {
  const {
    side = "right",
    className,
    hideClose = false,
    children,
    ...rest
  } = allProps
  const fallbackDescriptionId = React.useId()
  const hasAriaDescribedbyKey = Object.prototype.hasOwnProperty.call(allProps, "aria-describedby")
  const rawAriaDescribedBy = hasAriaDescribedbyKey ? allProps["aria-describedby"] : undefined
  const { "aria-describedby": _ariaOmit, ...props } = rest
  const hasNonEmptyAriaDescribedBy =
    typeof rawAriaDescribedBy === "string" && rawAriaDescribedBy.length > 0
  const hasTitle = hasSheetTitleChild(children)
  const hasDescription = hasSheetDescriptionChild(children)
  const injectFallbackDescription = !hasDescription && !hasNonEmptyAriaDescribedBy
  const ariaDescribedByProp = hasNonEmptyAriaDescribedBy
    ? { "aria-describedby": rawAriaDescribedBy }
    : injectFallbackDescription
      ? { "aria-describedby": fallbackDescriptionId }
      : {}

  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        ref={ref}
        className={cn(sheetVariants({ side }), className)}
        {...ariaDescribedByProp}
        {...props}
      >
        {!hasTitle && (
          <SheetPrimitive.Title className="sr-only">Panel</SheetPrimitive.Title>
        )}
        {injectFallbackDescription && (
          <SheetPrimitive.Description id={fallbackDescriptionId} className="sr-only">
            Panel content
          </SheetPrimitive.Description>
        )}
        {!hideClose && (
          <SheetPrimitive.Close
            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
        {children}
      </SheetPrimitive.Content>
    </SheetPortal>
  )
})
SheetContent.displayName = SheetPrimitive.Content.displayName

const SheetHeader = ({
  className,
  ...props
}) => (
  <div
    className={cn("flex flex-col space-y-2 text-center sm:text-left", className)}
    {...props} />
)
SheetHeader.displayName = "SheetHeader"

const SheetFooter = ({
  className,
  ...props
}) => (
  <div
    className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}
    {...props} />
)
SheetFooter.displayName = "SheetFooter"

const SheetTitle = React.forwardRef(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold text-foreground", className)}
    {...props} />
))
SheetTitle.displayName = SheetPrimitive.Title.displayName

const SheetDescription = React.forwardRef(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props} />
))
SheetDescription.displayName = SheetPrimitive.Description.displayName

SheetOverlay.propTypes = {
  className: PropTypes.string
}

SheetContent.propTypes = {
  side: PropTypes.string,
  className: PropTypes.string,
  hideClose: PropTypes.bool,
  children: PropTypes.node,
  "aria-describedby": PropTypes.string,
}

SheetHeader.propTypes = {
  className: PropTypes.string
}

SheetFooter.propTypes = {
  className: PropTypes.string
}

SheetTitle.propTypes = {
  className: PropTypes.string
}

SheetDescription.propTypes = {
  className: PropTypes.string
}

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
