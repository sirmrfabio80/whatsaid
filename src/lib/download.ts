/**
 * Browser file-download helpers.
 *
 * These wrap the standard `Blob` + anchor-click pattern so callers
 * (export pipeline, ad-hoc reports) don't re-implement it.
 */

/**
 * Trigger a browser download of an in-memory string as a file.
 *
 * @param content  File contents
 * @param filename Suggested filename presented to the user
 * @param mime     MIME type for the blob (e.g. `"text/plain;charset=utf-8"`)
 */
export function downloadString(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
