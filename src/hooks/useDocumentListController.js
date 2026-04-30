import { useEffect, useMemo } from "react";

export function buildLookupMap(items = [], key = "id") {
  const map = new Map();
  items.forEach((item) => {
    const mapKey = item?.[key];
    if (mapKey !== undefined && mapKey !== null) {
      map.set(mapKey, item);
    }
  });
  return map;
}

export function getPaginationWindow(currentPage, totalPages, maxButtons = 5) {
  const length = Math.min(maxButtons, totalPages);
  return Array.from({ length }, (_, i) => {
    if (totalPages <= maxButtons) return i + 1;
    if (currentPage <= 3) return i + 1;
    if (currentPage >= totalPages - 2) return totalPages - (maxButtons - 1) + i;
    return currentPage - 2 + i;
  });
}

export function useDocumentListController({
  documents = [],
  currentPage,
  itemsPerPage,
  resetPageDeps = [],
  setCurrentPage,
  adapter,
  context = {},
}) {
  useEffect(() => {
    setCurrentPage(1);
  }, [setCurrentPage, ...resetPageDeps]);

  const processed = useMemo(() => {
    const list = Array.isArray(documents) ? documents : [];
    return adapter.process(list, context);
  }, [documents, adapter, context]);

  const totalItems = processed.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const start = (currentPage - 1) * itemsPerPage;
  const paginated = processed.slice(start, start + itemsPerPage);
  const visiblePages = getPaginationWindow(currentPage, totalPages);

  return {
    allRows: processed,
    paginatedRows: paginated,
    totalItems,
    totalPages,
    visiblePages,
  };
}

