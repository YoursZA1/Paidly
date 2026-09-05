import { cn } from "@/lib/utils";
import { documentTableCellClass } from "@/lib/documentTableDensity";

export const DOC_NUM_CLASS = "text-right tabular-nums";

export function documentNumericClass(extra) {
  return cn(DOC_NUM_CLASS, extra);
}

export function documentRowCellClass(density, extra) {
  return cn(documentTableCellClass(density), extra);
}
