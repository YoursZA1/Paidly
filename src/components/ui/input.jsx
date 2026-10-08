import * as React from "react"
import PropTypes from "prop-types"

import { cn } from "@/lib/utils"
import { decimalInputValue, formatDecimalNumber } from "@/utils/decimalInput"

function withInputValue(event, value) {
  return {
    ...event,
    target: { ...event.target, value },
    currentTarget: { ...event.currentTarget, value },
  };
}

const Input = React.forwardRef(({ className, type, id: idProp, name: nameProp, value, onChange, onFocus, onBlur, inputMode, ...props }, ref) => {
  const generatedId = React.useId();
  const id = idProp ?? generatedId;
  const name = nameProp ?? id;
  const decimal = type === "number";
  const [focused, setFocused] = React.useState(false);
  const [draft, setDraft] = React.useState("");

  const emit = (event, next) => {
    onChange?.(withInputValue(event, next));
  };

  return (
    <input
      type={decimal ? "text" : type}
      inputMode={decimal ? inputMode || "decimal" : inputMode}
      lang={decimal ? "en-ZA" : undefined}
      id={id}
      name={name}
      value={decimal ? (value === undefined ? undefined : focused ? draft : formatDecimalNumber(value)) : value}
      onFocus={(event) => {
        if (decimal) {
          setDraft(value == null || value === "" ? "" : formatDecimalNumber(value));
          setFocused(true);
        }
        onFocus?.(event);
      }}
      onBlur={(event) => {
        if (decimal) {
          const next = decimalInputValue(draft);
          setFocused(false);
          if (next != null) emit(event, next);
        }
        onBlur?.(event);
      }}
      onChange={(event) => {
        if (!decimal) {
          onChange?.(event);
          return;
        }
        const nextDraft = event.target.value;
        setDraft(nextDraft);
        if (nextDraft.trim() === "") {
          emit(event, "");
          return;
        }
        const next = decimalInputValue(nextDraft);
        if (next != null) emit(event, next);
      }}
      className={cn(
        "flex h-12 w-full rounded-input border border-input bg-transparent px-3 py-0 text-base shadow-sm transition-[color,box-shadow,border-color] duration-150 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground placeholder:opacity-100 hover:border-ring/40 focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        decimal && "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
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
