const BYTES_PER_KILOBYTE = 1024;
const KILOBYTES_PER_MEGABYTE = 1024;

/** Size label shared by the library table and the upload dialog. */
export function formatMediaFileSize(sizeBytes: number): string {
  const kilobytes = sizeBytes / BYTES_PER_KILOBYTE;
  if (kilobytes < BYTES_PER_KILOBYTE) {
    return `${Math.max(1, Math.round(kilobytes))} KB`;
  }
  return `${(kilobytes / KILOBYTES_PER_MEGABYTE).toFixed(1)} MB`;
}

/** UTC timestamps are stored; the browser renders them in the viewer's zone. */
export function formatMediaTimestamp(value: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
