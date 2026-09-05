import { useCallback, useState } from "react";
import {
  documentTableCellClass,
  documentTableRowHeight,
  persistDocumentTableDensity,
  readStoredDocumentTableDensity,
} from "@/lib/documentTableDensity";

export function useDocumentTableDensity() {
  const [density, setDensityState] = useState(readStoredDocumentTableDensity);

  const setDensity = useCallback((next) => {
    setDensityState(persistDocumentTableDensity(next));
  }, []);

  return {
    density,
    setDensity,
    rowHeight: documentTableRowHeight(density),
    cellClass: documentTableCellClass(density),
  };
}
