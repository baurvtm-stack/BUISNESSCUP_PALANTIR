import "server-only";

export class InvalidBodyError extends Error {
  constructor(public readonly status: 400 | 413, message: string) { super(message); }
}

/** Bound streamed bodies as well as Content-Length: do not buffer arbitrary request sizes. */
export async function readJsonBody(request: Request): Promise<unknown> {
  const limit = 16384;
  if (Number(request.headers.get("content-length")) > limit) throw new InvalidBodyError(413, "Body is too large");
  const reader = request.body?.getReader();
  if (!reader) throw new InvalidBodyError(400, "Body must be JSON");
  let length = 0;
  let body = "";
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new InvalidBodyError(413, "Body is too large");
      }
      body += decoder.decode(value, { stream: true });
    }
    return JSON.parse(body + decoder.decode());
  } catch (error) {
    if (error instanceof InvalidBodyError) throw error;
    throw new InvalidBodyError(400, "Body must be JSON");
  } finally {
    reader.releaseLock();
  }
}
