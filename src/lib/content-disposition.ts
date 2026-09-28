/**
 * Build a `Content-Disposition` value that survives non-ASCII filenames.
 *
 * HTTP header values must be ByteStrings (latin-1), so a raw Arabic filename
 * throws. The ASCII `filename=` is therefore sanitised, and the real name is
 * carried by RFC 5987 `filename*`, which browsers prefer.
 */
export function contentDisposition(filename: string): string {
  const encoded = encodeURIComponent(filename);

  // Strip anything outside printable ASCII, collapsing the gaps it leaves.
  const ascii = filename
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/["\\]/g, "");

  const fallback = ascii.length > 0 ? ascii : "certificate";
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
