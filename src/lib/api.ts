/**
 * Client-side API helper — the counterpart the Worker's declarative dispatcher
 * (`src/worker/index.ts`, ROADMAP §2) never got on the browser side. ROADMAP §28.15.
 *
 * Before this, ~40 call sites across the chat and wiki components hand-rolled the
 * same block: build `Authorization: Bearer ${token}`, set `Content-Type`, await
 * `res.json()`, and then — in 7 of 49 cases — forget to check `res.ok` at all, so
 * a 401 or 500 flowed onward as if it were data. Silent failure is exactly what
 * this project's design law forbids (ROADMAP §9), so failure is centralised here
 * and is always thrown, never returned.
 *
 * Error contract, matching what every existing call site already did by hand:
 * the Worker replies `{ error: "..." }` on failure, and callers wrote
 * `if (!res.ok || data.error) setError(data.error ?? fallback)`. So BOTH a non-2xx
 * status AND a 2xx body carrying `error` throw an {@link ApiError} whose
 * `.message` is the server's own text — meaning a caller can surface
 * `e instanceof ApiError ? e.message : <network fallback>` and preserve the exact
 * behaviour it had, while a caller that forgets to catch now fails loudly.
 */

/** Thrown for any non-2xx response, or a 2xx body containing `error`. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

export interface ApiOptions {
  /** Supabase access token. Omit for endpoints that take no auth. */
  token?: string | null
  /** Abort signal, for request cancellation on unmount. */
  signal?: AbortSignal
  /** Extra headers, merged last. */
  headers?: Record<string, string>
}

type Body = unknown

/**
 * Bodies that `fetch` can send as-is and that must NEVER be JSON-stringified.
 * Getting this wrong is silent and total: `JSON.stringify(someFile)` yields the
 * string `"{}"`, so an avatar upload would "succeed" while transmitting nothing.
 * These also get no automatic Content-Type — either the browser must set it
 * (FormData needs to add its multipart boundary) or the caller knows the real
 * type and passes it via `opts.headers` (raw File/Blob uploads).
 */
function isRawBody(body: Body): boolean {
  return (
    body instanceof FormData ||
    body instanceof Blob || // covers File
    body instanceof ArrayBuffer ||
    body instanceof URLSearchParams ||
    ArrayBuffer.isView(body)
  )
}

function buildHeaders(body: Body, opts: ApiOptions): Record<string, string> {
  const headers: Record<string, string> = {}
  if (body !== undefined && !isRawBody(body)) {
    headers["Content-Type"] = "application/json"
  }
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`
  return { ...headers, ...opts.headers }
}

async function request<T>(method: string, path: string, body: Body, opts: ApiOptions): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: buildHeaders(body, opts),
    body: body === undefined ? undefined : isRawBody(body) ? (body as BodyInit) : JSON.stringify(body),
    signal: opts.signal,
  })

  // 204 and empty bodies are legitimate successes — don't try to parse them.
  const text = await res.text()
  let data: unknown = undefined
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      // A non-JSON body on a failed request is still useful error detail (e.g. an
      // HTML error page from an edge/proxy layer); keep it as the message.
      if (!res.ok) throw new ApiError(text.slice(0, 200) || `HTTP ${res.status}`, res.status)
      throw new ApiError(`Expected JSON from ${path} but got ${res.status} non-JSON`, res.status)
    }
  }

  const errorField =
    data && typeof data === "object" && "error" in data ? (data as { error?: unknown }).error : undefined

  if (!res.ok || errorField) {
    const message = typeof errorField === "string" && errorField ? errorField : `HTTP ${res.status}`
    throw new ApiError(message, res.status, data)
  }

  return data as T
}

export const apiGet = <T>(path: string, opts: ApiOptions = {}) => request<T>("GET", path, undefined, opts)
export const apiPost = <T>(path: string, body?: Body, opts: ApiOptions = {}) => request<T>("POST", path, body, opts)
export const apiPut = <T>(path: string, body?: Body, opts: ApiOptions = {}) => request<T>("PUT", path, body, opts)
export const apiPatch = <T>(path: string, body?: Body, opts: ApiOptions = {}) => request<T>("PATCH", path, body, opts)
export const apiDelete = <T>(path: string, body?: Body, opts: ApiOptions = {}) =>
  request<T>("DELETE", path, body, opts)

/** Message for a caught error, preferring the server's own text. */
export function apiErrorMessage(e: unknown, fallback = "Network error. Please try again."): string {
  return e instanceof ApiError ? e.message : fallback
}
