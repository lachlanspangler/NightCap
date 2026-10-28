import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, cached, setCached, subscribe } from "./api";

/** GET with cache, refetch on invalidate, optional polling. */
export function useApi<T>(path: string | null, opts: { pollMs?: number } = {}) {
  const [data, setData] = useState<T | undefined>(() => (path ? cached<T>(path) : undefined));
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(!data);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    if (!path) return;
    try {
      const d = await api<T>("GET", path);
      setCached(path, d);
      if (alive.current) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (alive.current) setError(e instanceof ApiError ? e : new ApiError(0, "error", String(e)));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    alive.current = true;
    if (!path) return;
    const c = cached<T>(path);
    if (c) setData(c);
    void refresh();
    const unsub = subscribe(path, () => void refresh());
    const timer = opts.pollMs ? setInterval(() => void refresh(), opts.pollMs) : null;
    return () => {
      alive.current = false;
      unsub();
      if (timer) clearInterval(timer);
    };
  }, [path, refresh, opts.pollMs]);

  return { data, error, loading, refresh };
}
