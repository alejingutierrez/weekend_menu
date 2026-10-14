/** Read at most limit bytes, even without a truthful Content-Length. */
export async function readLimitedJson(
  request: Request,
  limit: number,
): Promise<unknown> {
  if (Number(request.headers.get("content-length") ?? 0) > limit)
    throw new Error("Body too large");
  if (!request.body) return null;
  const reader = request.body.getReader(),
    chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) throw new Error("Body too large");
      chunks.push(value);
    }
  } catch (e) {
    await reader.cancel().catch(() => {});
    throw e;
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
