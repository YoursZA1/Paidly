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
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:transition-transform [&_svg]:duration-200 motion-reduce:transition-none motion-reduce:active:scale-100",
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
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-10 rounded-xl px-8",
        icon: "h-9 w-9",
      },
    },
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
