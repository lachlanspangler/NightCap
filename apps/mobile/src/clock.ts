// The server's clock (dev time travel lives server-side). Countdowns use server time, not the phone's.
let skewMs = 0;
const subs = new Set<() => void>();
export function syncServerClock(serverIso: string) {
  const s = Date.parse(serverIso);
  if (!Number.isFinite(s)) return;
  const next = s - Date.now();
  const changed = Math.abs(next - skewMs) > 5_000;
  skewMs = next;
  if (changed) subs.forEach((f) => f());
}
export const serverNow = () => new Date(Date.now() + skewMs);
export function onServerClock(f: () => void) {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
}
