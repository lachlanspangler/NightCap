// Which albums you've already watched develop (per user, persisted, so the ceremony happens once,
// not on every cold start: design review M1 #1).
import * as SecureStore from "expo-secure-store";

const key = (userId: string) => `nightcap.revealed.${userId.replace(/[^A-Za-z0-9]/g, "")}`;
const memory = new Map<string, Set<string>>();

export async function loadRevealed(userId: string): Promise<Set<string>> {
  const cached = memory.get(userId);
  if (cached) return cached;
  let ids: string[] = [];
  try {
    ids = JSON.parse((await SecureStore.getItemAsync(key(userId))) ?? "[]") as string[];
  } catch {
    ids = [];
  }
  const set = new Set(ids);
  memory.set(userId, set);
  return set;
}

export async function markRevealed(userId: string, nightId: string) {
  const set = await loadRevealed(userId);
  set.add(nightId);
  const recent = [...set].slice(-200);
  await SecureStore.setItemAsync(key(userId), JSON.stringify(recent)).catch(() => undefined);
}
