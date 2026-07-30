export interface StreamUrlOptions {
  format?: "aac" | "mp3" | "opus" | "raw";
  maxBitRate?: number;
}

export interface StreamUrlContext {
  baseUrl: string;
  username: string;
  token: string;
  salt: string;
  clientName: string;
  apiVersion: string;
}

export function buildStreamUrl(
  ctx: StreamUrlContext,
  trackId: string,
  options: StreamUrlOptions = {},
): string {
  const params = new URLSearchParams({
    u: ctx.username,
    t: ctx.token,
    s: ctx.salt,
    v: ctx.apiVersion,
    c: ctx.clientName,
    id: trackId,
  });

  if (options.format && options.format !== "raw") {
    params.set("format", options.format);
  }
  if (options.maxBitRate && options.maxBitRate > 0) {
    params.set("maxBitRate", String(options.maxBitRate));
  }

  return `${ctx.baseUrl}/rest/stream?${params.toString()}`;
}
