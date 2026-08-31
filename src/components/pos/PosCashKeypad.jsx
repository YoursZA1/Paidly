import { Banknote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { applyPosCashKey } from "@/lib/pos/posCashKeypad";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "back"];

/**
 * Touch-first cash pad. Minimum ~44px targets.
 */
export default function PosCashKeypad({ value, onChange, className }) {
  const press = (key) => {
    onChange(applyPosCashKey(value, key));
  };

  return (
    <div className={cn("grid grid-cols-3 gap-2", className)}>
      {KEYS.map((key) => (
        <Button
          key={key}
          type="button"
          variant={key === "back" ? "secondary" : "outline"}
          className="h-14 min-h-11 text-xl font-semibold tabular-nums touch-manipulation sm:h-16"
          onClick={() => press(key)}
          aria-label={key === "back" ? "Backspace" : key === "00" ? "Double zero" : `Digit ${key}`}
        >
          {key === "back" ? "⌫" : key}
        </Button>
      ))}
      <Button
        type="button"
        variant="ghost"
        className="col-span-3 h-11 min-h-11 text-sm touch-manipulation"
        onClick={() => press("clear")}
      >
        <Banknote className="size-4" />
        Clear amount
      </Button>
    </div>
  );
}
