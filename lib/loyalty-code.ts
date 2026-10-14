/** Accept printed codes with whitespace/hyphens without changing their identity. */
export function normalizeCode(code: string): string {
  return code.replace(/[\s-]/g, "").toUpperCase();
}
