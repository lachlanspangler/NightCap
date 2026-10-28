import { formatCountdown } from "@nightcap/core";
import { useEffect, useState } from "react";
import { serverNow } from "../clock";

/** Re-renders every 15s; uses the server clock (so dev time travel shows correctly). */
export function useCountdown(targetIso: string | null | undefined) {
  const [now, setNow] = useState(serverNow());
  useEffect(() => {
    const t = setInterval(() => setNow(serverNow()), 15_000);
    return () => clearInterval(t);
  }, []);
  if (!targetIso) return { ms: 0, label: "" };
  const ms = Date.parse(targetIso) - now.getTime();
  return { ms, label: formatCountdown(ms) };
}
