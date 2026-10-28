// API entrypoint: config → PGlite (mock) → seed → ticker → serve on 127.0.0.1:8788.
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { offsetClock } from "@nightcap/core";
import { createPglite } from "@nightcap/db";
import { createApp } from "./app";
import { loadConfig, REPO_ROOT } from "./config";
import type { Deps } from "./deps";
import { LocalDiskStore, R2Store } from "./media/store";
import { tick } from "./services/tick";
import { isSeeded, seedDemo } from "./services/seed";

const log = (m: string) => console.log(`[nightcap-api] ${new Date().toISOString().slice(11, 19)} ${m}`);

async function main() {
  const config = loadConfig(undefined, () => randomBytes(32).toString("base64url"));
  if (config.mode !== "mock")
    throw new Error(
      "prod mode isn't wired in the prototype (postgres.js adapter + R2Store are stubs). See STATUS.md.",
    );
  if (config.jwtSecretEphemeral)
    log("DEV_JWT_SECRET missing: using an ephemeral secret (tokens die on restart). Run `make setup`.");
  log(`mock mode (missing for prod: ${config.missing.join(", ")})`);

  if (config.pgliteDir) await mkdir(config.pgliteDir, { recursive: true });
  const { db } = await createPglite(config.pgliteDir ?? undefined);
  const devClock = offsetClock({ now: () => new Date() });
  const photosDir = join(REPO_ROOT, ".data/demo-photos");
  let photoCache: { name: string; bytes: Uint8Array }[] | null = null;
  const demoPhotos = async () => {
    if (!photoCache) {
      photoCache = existsSync(photosDir)
        ? readdirSync(photosDir)
            .filter((f) => /\.(jpg|png)$/.test(f))
            .sort()
            .map((name) => ({ name, bytes: new Uint8Array(readFileSync(join(photosDir, name))) }))
        : [];
      if (!photoCache.length) log("no demo photos found: run `node scripts/gen-photos.mjs`");
    }
    return photoCache;
  };
  const deps: Deps = {
    db,
    clock: devClock,
    devClock,
    media: config.r2 ? new R2Store(config.r2) : new LocalDiskStore(config.mediaDir),
    config,
    random: {
      bytes: (n) => new Uint8Array(randomBytes(n)),
      float: () => randomBytes(4).readUInt32BE() / 2 ** 32,
      uuid: () => randomUUID(),
    },
    demoPhotos,
    log,
  };
  if (!(await isSeeded(deps))) await seedDemo(deps);

  const app = createApp(deps);
  const ticker = setInterval(() => void tick(deps).catch((e) => log(`ticker: ${e}`)), 30_000);
  void tick(deps);
  // Bind to loopback only (builder-security: private by default). The simulator reaches it via 127.0.0.1.
  const server = serve(
    { fetch: app.fetch, port: config.port, hostname: process.env.API_HOST ?? "127.0.0.1" },
    (i) => log(`listening on http://${i.address}:${i.port}`),
  );
  const pidFile = join(REPO_ROOT, ".run/api.pid");
  await mkdir(join(REPO_ROOT, ".run"), { recursive: true });
  await writeFile(pidFile, String(process.pid));
  const stop = () => {
    clearInterval(ticker);
    server.close();
    void db.close().finally(() => process.exit(0));
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
