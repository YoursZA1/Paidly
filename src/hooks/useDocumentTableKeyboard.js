import { useCallback, useState } from "react";

function isEditingField(target) {
  if (!target || typeof target !== "object") return false;
  const tag = String(target.tagName || "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return Boolean(target.isContentEditable);
}

export function useDocumentTableKeyboard({ rowCount, onEdit } = {}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const count = Math.max(0, Number(rowCount) || 0);

  const onKeyDown = useCallback(
    (event) => {
      if (isEditingField(event.target)) return;
      if (count <= 0) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((i) => Math.min(count - 1, i + 1));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (event.key === "Home") {
        event.preventDefault();
        setActiveIndex(0);
        return;
      }
      if (event.key === "End") {
        event.preventDefault();
        setActiveIndex(count - 1);
        return;
      }
      if (event.key === "Enter" && typeof onEdit === "function") {
        event.preventDefault();
        onEdit(Math.min(count - 1, Math.max(0, activeIndex)));
      }
    },
    [activeIndex, count, onEdit]
  );

  return { activeIndex, setActiveIndex, onKeyDown };
}
