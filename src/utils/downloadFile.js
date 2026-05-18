/**
 * Triggers a file download and returns the object URL without revoking it,
 * so callers can surface a manual fallback button if the browser blocked auto-download.
 *
 * The caller is responsible for revoking the URL (call URL.revokeObjectURL(url))
 * when the fallback button is no longer needed.
 *
 * @param {Blob} blob
 * @param {string} filename
 * @returns {string} object URL
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
