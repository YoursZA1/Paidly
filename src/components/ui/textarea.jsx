import * as React from "react"
import PropTypes from "prop-types"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef(({ className, id: idProp, name: nameProp, ...props }, ref) => {
  const generatedId = React.useId();
  const id = idProp ?? generatedId;
  const name = nameProp ?? id;
  return (
    <textarea
      id={id}
      name={name}
      className={cn(
        "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      ref={ref}
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
