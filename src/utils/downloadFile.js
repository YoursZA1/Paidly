/**
 * Triggers a file download and returns the object URL without revoking it,
 * so callers can surface a manual fallback button if the browser blocked auto-download.
 *
 * The caller is responsible for revoking the URL (call URL.revokeObjectURL(url))
 * when the fallback button is no longer needed.
 */
export function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  try {
    a.click();
  } catch {
    // browser blocked the auto-download; caller should show a fallback link
  }
  document.body.removeChild(a);
  return url;
}

/**
 * Builds a CSV from an array of objects and triggers a download.
 * Returns { url } — an object URL the caller can use for a fallback button.
 * Caller must call URL.revokeObjectURL(url) when the fallback is no longer needed.
 */
export function exportToCsv(data, filename, columns) {
  const headers = columns ?? (data.length > 0 ? Object.keys(data[0]) : []);
  const escape = (val) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const csvContent = [
    headers.map(escape).join(','),
    ...data.map((row) => headers.map((col) => escape(row[col])).join(',')),
  ].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = triggerDownload(blob, filename);
  return { url };
}
