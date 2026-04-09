import * as React from "react"
import PropTypes from "prop-types"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef(({ className, id: idProp, name: nameProp, value, ...props }, ref) => {
  const generatedId = React.useId();
  const id = idProp ?? generatedId;
  const name = nameProp ?? id;
  // API rows often use null; React controlled textareas require string or undefined (never null).
  const safeValue = value === null ? "" : value;
  return (
    <textarea
      id={id}
      name={name}
      className={cn(
        "flex min-h-[60px] w-full rounded-input border border-input bg-transparent px-3 py-3 text-base shadow-sm transition-[color,box-shadow,border-color] placeholder:text-muted-foreground placeholder:opacity-100 focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      ref={ref}
      {...(safeValue !== undefined ? { value: safeValue } : {})}
      {...props}
    />
  );
})
Textarea.displayName = "Textarea"

Textarea.propTypes = {
  className: PropTypes.string,
  id: PropTypes.string,
  name: PropTypes.string,
}

export { Textarea }
