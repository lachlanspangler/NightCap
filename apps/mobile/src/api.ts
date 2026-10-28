// Tiny API client: bearer token, JSON, friendly errors, and a cache with subscribers so screens
// refresh after mutations (invalidate by path prefix). No third-party data library needed.
import { API_URL } from "./config";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly body: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

let token: string | null = null;
export const setToken = (t: string | null) => {
  token = t;
};
export const getToken = () => token;

export const mediaUrl = (path: string | null | undefined) =>
  path ? (path.startsWith("http") ? path : `${API_URL}${path}`) : null;

export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { method, headers, body: payload });
  } catch {
    throw new ApiError(0, "offline", "Can't reach NightCap right now. Check your connection?");
  }
  const text = await res.text();
  const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok)
    throw new ApiError(
      res.status,
      String(json.error ?? "error"),
      String(json.message ?? "Something went wrong."),
      json,
    );
  if (method !== "GET") invalidateAll();
  return json as T;
}

// --- cache ------------------------------------------------------------------------------
type Listener = () => void;
const cache = new Map<string, unknown>();
const listeners = new Map<string, Set<Listener>>();

export function cached<T>(path: string): T | undefined {
  return cache.get(path) as T | undefined;
}
export function setCached(path: string, value: unknown) {
  cache.set(path, value);
}
export function subscribe(path: string, l: Listener) {
  const set = listeners.get(path) ?? new Set();
  set.add(l);
  listeners.set(path, set);
  return () => {
    set.delete(l);
  };
}
/** After any write, every mounted query refetches (cheap at prototype scale, always correct). */
export function invalidateAll() {
  for (const set of listeners.values()) for (const l of set) l();
}
export function clearCache() {
  cache.clear();
}
