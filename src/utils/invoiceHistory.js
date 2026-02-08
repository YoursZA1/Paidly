export const createHistoryEntry = ({ action, summary, changes = [], meta = {} }) => {
  const id = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return {
    id,
    timestamp: new Date().toISOString(),
    action,
    summary,
    changes,
    meta,
  };
};

export const appendHistory = (history = [], entry, limit = 50) => {
  const safeHistory = Array.isArray(history) ? history : [];
  return [entry, ...safeHistory].slice(0, limit);
};

export const diffInvoiceFields = (previous = {}, next = {}, fields = []) => {
  return fields.reduce((acc, field) => {
    const from = previous?.[field];
    const to = next?.[field];
    const isEqual = Array.isArray(from) || Array.isArray(to)
      ? JSON.stringify(from ?? null) === JSON.stringify(to ?? null)
      : from === to;

    if (!isEqual) {
      acc.push({
        field,
        from: from ?? null,
        to: to ?? null,
      });
    }

    return acc;
  }, []);
};
