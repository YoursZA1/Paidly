import * as React from "react"
import PropTypes from "prop-types"

import { cn } from "@/lib/utils"

const Input = React.forwardRef(({ className, type, id: idProp, name: nameProp, ...props }, ref) => {
  const generatedId = React.useId();
  const id = idProp ?? generatedId;
  const name = nameProp ?? id;
  return (
    <input
      type={type}
      id={id}
      name={name}
      className={cn(
        "flex h-9 w-full rounded-xl border border-input bg-transparent px-3 py-2 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      ref={ref}
      {...props}
    />
  );
})
Input.displayName = "Input"

Input.propTypes = {
  className: PropTypes.string,
  type: PropTypes.string,
  id: PropTypes.string,
  name: PropTypes.string
}

export { Input }
