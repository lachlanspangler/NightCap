import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { clearCache, invalidateAll, setToken } from "./api";

const KEY = "nightcap.session.v1";

interface Session {
  ready: boolean;
  token: string | null;
  userId: string | null;
  signIn(token: string, userId: string): Promise<void>;
  signOut(): Promise<void>;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ ready: boolean; token: string | null; userId: string | null }>({
    ready: false,
    token: null,
    userId: null,
  });

  useEffect(() => {
    SecureStore.getItemAsync(KEY)
      .then((raw) => {
        const s = raw ? (JSON.parse(raw) as { token: string; userId: string }) : null;
        setToken(s?.token ?? null);
        setState({ ready: true, token: s?.token ?? null, userId: s?.userId ?? null });
      })
      .catch(() => setState({ ready: true, token: null, userId: null }));
  }, []);

  const signIn = useCallback(async (token: string, userId: string) => {
    setToken(token);
    clearCache();
    await SecureStore.setItemAsync(KEY, JSON.stringify({ token, userId })).catch(() => undefined);
    setState({ ready: true, token, userId });
    invalidateAll();
  }, []);

  const signOut = useCallback(async () => {
    setToken(null);
    clearCache();
    await SecureStore.deleteItemAsync(KEY).catch(() => undefined);
    setState({ ready: true, token: null, userId: null });
  }, []);

  const value = useMemo(() => ({ ...state, signIn, signOut }), [state, signIn, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSession outside SessionProvider");
  return s;
}
