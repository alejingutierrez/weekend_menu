/** Apple update tags are opaque; retain compatibility with previous ISO tags. */
export function updatedSerials(
  rows: { serial: string; updatedAt: string }[],
  since?: string,
) {
  const tag = (s: string) =>
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z$/.test(s) &&
    Number.isFinite(Date.parse(s))
      ? s.replace(
          /(?:\.(\d+))?Z$/,
          (_, digits: string) => "." + (digits ?? "").padEnd(6, "0") + "Z",
        )
      : undefined;
  const latest =
    rows
      .map((r) => tag(r.updatedAt))
      .filter((t): t is string => Boolean(t))
      .sort()
      .at(-1) ?? "1970-01-01T00:00:00.000000Z";
  const parsed = since ? tag(since) : undefined;
  // Invalid or future tags must not hide real cards forever. Return a full resync.
  const cutoff = parsed && parsed <= latest ? parsed : "";
  return {
    serials: rows
      .filter((r) => (tag(r.updatedAt) ?? "") > cutoff)
      .map((r) => r.serial),
    lastUpdated: latest,
  };
}

export function validAppleIdentifiers(
  device: string,
  passType: string,
  serial?: string,
): boolean {
  return (
    device.length > 0 &&
    device.length <= 256 &&
    /^[A-Za-z0-9._-]+$/.test(device) &&
    Boolean(process.env.APPLE_PASS_TYPE_ID) &&
    passType === process.env.APPLE_PASS_TYPE_ID &&
    (!serial || (serial.length <= 128 && /^[A-Za-z0-9._-]+$/.test(serial)))
  );
}

export function retryDelaySeconds(attempt: number): number {
  return Math.min(3600, 30 * 2 ** Math.min(7, Math.max(0, attempt)));
}
