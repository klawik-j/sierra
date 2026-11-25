import type { FastifyInstance } from "fastify";

/** Minimal in-process HTTP client with a cookie jar (used by the seed script and tests). */
export function injectClient(app: FastifyInstance) {
  let cookie = "";
  async function call<T = any>(method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", url: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await app.inject({
      method,
      url,
      payload: body as object | undefined,
      headers: { "x-requested-with": "sierra", ...(cookie ? { cookie } : {}), ...headers },
    });
    const set = res.headers["set-cookie"];
    if (set) cookie = (Array.isArray(set) ? set[0] : set).split(";")[0];
    const type = String(res.headers["content-type"] ?? "");
    return { status: res.statusCode, body: (type.includes("json") ? res.json() : res.rawPayload) as T, headers: res.headers };
  }
  /** Like `call` but throws on a non-2xx answer. */
  async function ok<T = any>(method: Parameters<typeof call>[0], url: string, body?: unknown) {
    const res = await call<T>(method, url, body);
    if (res.status >= 300) throw new Error(`${method} ${url} -> ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
  }
  return { call, ok, get cookie() { return cookie; } };
}
