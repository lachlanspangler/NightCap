// Runtime config. Reads process.env (and a repo-root .env if present). Missing prod keys → mock mode.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

export function loadDotEnv(path = join(REPO_ROOT, ".env")): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || line.trim().startsWith("#")) continue;
    out[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
  }
  return out;
}

export interface Config {
  mode: "mock" | "prod";
  port: number;
  jwtSecret: string;
  jwtSecretEphemeral: boolean;
  mediaSecret: string;
  pgliteDir: string | null;
  mediaDir: string;
  databaseUrl: string | null;
  r2: { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string } | null;
  /** Keys a real deployment still needs (STATUS → Needs from you). */
  missing: string[];
}

export function loadConfig(
  env: Record<string, string | undefined> = { ...loadDotEnv(), ...process.env },
  randomSecret: () => string,
): Config {
  const missing: string[] = [];
  const need = (k: string) => {
    const v = env[k];
    if (!v) missing.push(k);
    return v || null;
  };
  const databaseUrl = need("DATABASE_URL");
  const supabaseSecret = need("SUPABASE_JWT_SECRET");
  const r2Account = need("R2_ACCOUNT_ID");
  const r2Key = need("R2_ACCESS_KEY_ID");
  const r2Secret = need("R2_SECRET_ACCESS_KEY");
  const wantsProd = env.NIGHTCAP_MODE === "prod";
  const mode: Config["mode"] = wantsProd && missing.length === 0 ? "prod" : "mock";
  const devSecret = env.DEV_JWT_SECRET || null;
  const jwtSecret = mode === "prod" ? supabaseSecret! : (devSecret ?? randomSecret());
  const resolveDir = (p: string) => (p.startsWith("/") ? p : join(REPO_ROOT, p));
  return {
    mode,
    port: Number(env.API_PORT || 8788),
    jwtSecret,
    jwtSecretEphemeral: mode === "mock" && !devSecret,
    mediaSecret: env.MEDIA_URL_SECRET || randomSecret(),
    pgliteDir: env.PGLITE_DIR === "" ? null : resolveDir(env.PGLITE_DIR || ".data/pglite"),
    mediaDir: resolveDir(env.MEDIA_DIR || ".data/media"),
    databaseUrl,
    r2:
      mode === "prod"
        ? {
            accountId: r2Account!,
            accessKeyId: r2Key!,
            secretAccessKey: r2Secret!,
            bucket: env.R2_BUCKET || "nightcap-media",
          }
        : null,
    missing,
  };
}
