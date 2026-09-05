import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { DOCUMENT_TABLE_DENSITIES } from "@/lib/documentTableDensity";

const LABELS = {
  comfortable: "Comfortable",
  cozy: "Cozy",
  compact: "Compact",
};

export default function DocumentTableDensityToggle({ density, onDensityChange, className }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="text-xs font-medium text-muted-foreground sr-only sm:not-sr-only sm:inline">
        Density
      </span>
      <ToggleGroup
        type="single"
        value={density}
        onValueChange={(value) => {
          if (DOCUMENT_TABLE_DENSITIES.includes(value)) onDensityChange(value);
        }}
        variant="outline"
        size="sm"
        className="justify-start rounded-lg"
        aria-label="Table row density"
      >
        {DOCUMENT_TABLE_DENSITIES.map((key) => (
          <ToggleGroupItem
            key={key}
            value={key}
            aria-label={LABELS[key]}
            title={LABELS[key]}
            className="h-8 px-2.5 text-xs data-[state=on]:bg-muted data-[state=on]:text-foreground"
          >
            {LABELS[key]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
