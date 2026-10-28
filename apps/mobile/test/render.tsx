import { render } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { UndoProvider } from "../src/components/Undo";
import { SessionProvider } from "../src/session";
import { setCached } from "../src/api";

/** Render inside the app's providers, with cached API responses pre-seeded (no network). */
export function renderScreen(ui: ReactElement, cache: Record<string, unknown> = {}) {
  for (const [k, v] of Object.entries(cache)) setCached(k, v);
  return render(
    <SessionProvider>
      <UndoProvider>{ui}</UndoProvider>
    </SessionProvider>,
  );
}

export function mockFetch(routes: Record<string, unknown>) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, "");
    const method = init?.method ?? "GET";
    calls.push({ method, path, body: init?.body });
    const key = Object.keys(routes).find((k) => k === `${method} ${path}` || k === path);
    const body = key ? routes[key] : { error: "not_found", message: "nope" };
    return { ok: !!key, status: key ? 200 : 404, text: async () => JSON.stringify(body) } as Response;
  }) as unknown as typeof fetch;
  return calls;
}
