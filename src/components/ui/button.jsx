import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

/** Light haptic feedback on supported devices (e.g. Android, some browsers). No-op if not supported. */
function triggerHaptic() {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    navigator.vibrate(10)
  }
}

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-input text-sm font-medium transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:transition-transform [&_svg]:duration-200 motion-reduce:transition-none motion-reduce:active:scale-100",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-elevation hover:bg-primary/90 hover:shadow-elevation-md hover:scale-[1.02] [&_svg]:hover:scale-110",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 hover:scale-[1.02] [&_svg]:hover:scale-110",
        outline:
          "border border-input bg-transparent hover:bg-accent hover:text-accent-foreground hover:scale-[1.01] [&_svg]:hover:scale-105",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 hover:scale-[1.02] [&_svg]:hover:scale-110",
        ghost: "hover:bg-accent hover:text-accent-foreground hover:scale-[1.01] [&_svg]:hover:scale-105",
        link: "text-primary underline-offset-4 hover:underline [&_svg]:hover:translate-x-0.5",
      },
      size: {
        /** Touch-first: 48px min height, 10px radius (rounded-input on base) */
        default: "min-h-12 h-12 px-4 py-0",
        sm: "min-h-11 h-11 rounded-input px-3 text-xs",
        lg: "min-h-12 h-12 rounded-input px-8 text-base",
        icon: "size-12 min-h-12 min-w-12 shrink-0 rounded-input p-0",
      },
    },
    compoundVariants: [
      {
        variant: "link",
        class:
          "h-auto min-h-0 rounded-none px-0 py-1 shadow-none hover:shadow-none hover:scale-100 active:scale-100 [&_svg]:hover:scale-100 [&_svg]:hover:translate-x-0.5",
      },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, onClick, noHaptic, ...props }, ref) => {
  const handleClick = (e) => {
    if (!noHaptic) triggerHaptic()
    onClick?.(e)
  }
  const Comp = asChild ? Slot : "button"
  return (
    (<Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      onClick={handleClick}
      {...props} />)
  );
})
Button.displayName = "Button"

export { Button, buttonVariants };
export default Button;
