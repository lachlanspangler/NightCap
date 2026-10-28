// The server's clock (dev time travel lives server-side). Countdowns use server time, not the phone's.
let skewMs = 0;
export function syncServerClock(serverIso: string) {
  const s = Date.parse(serverIso);
  if (Number.isFinite(s)) skewMs = s - Date.now();
}
export const serverNow = () => new Date(Date.now() + skewMs);
