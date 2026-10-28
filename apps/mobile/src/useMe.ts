import { useEffect } from "react";
import { syncServerClock } from "./clock";
import { scaleFor } from "./theme";
import type { Me } from "./types";
import { useApi } from "./useApi";
import { useSession } from "./session";

/** Me + night mode (server-computed: local time in your tz, or you're in a live night). */
export function useMe() {
  const { token } = useSession();
  const q = useApi<Me>(token ? "/me" : null, { pollMs: 30_000 });
  useEffect(() => {
    if (q.data?.now) syncServerClock(q.data.now);
  }, [q.data?.now]);
  return { ...q, me: q.data, scale: scaleFor(q.data?.nightMode ?? false) };
}
