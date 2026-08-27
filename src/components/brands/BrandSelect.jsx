import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ORG_DEFAULT_BRAND_VALUE, normalizeBrandId } from "@/lib/orgBrandStorage";

/**
 * @param {{
 *   brands?: Array<{ id: string, name?: string }>,
 *   value?: string | null,
 *   onChange?: (brandId: string | null) => void,
 *   disabled?: boolean,
 *   id?: string,
 *   label?: string,
 *   description?: string,
 * }} props
 */
export default function BrandSelect({
  brands = [],
  value,
  onChange,
  disabled = false,
  id = "document-brand",
  label = "Company / brand",
  description = "Used on this document. Switching the header brand does not change saved documents.",
}) {
  const selectValue = normalizeBrandId(value) || ORG_DEFAULT_BRAND_VALUE;
  return (
    <div className="space-y-2">
      {label ? (
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
      ) : null}
      <Select
        value={selectValue}
        onValueChange={(next) => onChange?.(normalizeBrandId(next))}
        disabled={disabled}
      >
        <SelectTrigger id={id} className="h-11">
          <SelectValue placeholder="Organization default" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ORG_DEFAULT_BRAND_VALUE}>Organization default</SelectItem>
          {brands.map((brand) => (
            <SelectItem key={brand.id} value={brand.id}>
              {brand.name || "Untitled brand"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
    </div>
  );
}
