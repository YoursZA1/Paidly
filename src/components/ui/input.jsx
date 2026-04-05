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
        "flex h-12 w-full rounded-input border border-input bg-transparent px-3 py-0 text-base shadow-sm transition-[color,box-shadow,border-color] file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground placeholder:opacity-100 focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
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
