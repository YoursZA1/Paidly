import { BUSINESS_TYPE_OPTIONS } from "@shared/businessType.js";

/**
 * @param {{ value?: string | null, onChange: (id: string) => void, disabled?: boolean, name?: string }} props
 */
export default function BusinessTypePicker({ value, onChange, disabled = false, name = "business-type" }) {
  return (
    <div className="grid gap-2" role="radiogroup" aria-label="Business type">
      {BUSINESS_TYPE_OPTIONS.map((option) => {
        const selected = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            name={name}
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(option.id)}
            className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
              selected ? "border-primary bg-primary/10" : "border-border hover:bg-muted/40"
            } disabled:opacity-60`}
          >
            <span className="block text-sm font-medium text-foreground">{option.label}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground sm:text-sm">{option.description}</span>
          </button>
        );
      })}
    </div>
  );
}
