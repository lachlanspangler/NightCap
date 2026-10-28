#!/usr/bin/env node
// setup-env.mjs — create/repair .env from .env.example. Generates random dev secrets per machine.
// Never overwrites a value you've set. Safe to run any time (make setup / make heal).
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const example = readFileSync(join(root, ".env.example"), "utf8");
const envPath = join(root, ".env");
const current = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
const have = new Map(current.split("\n").map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l)).filter(Boolean).map((m) => [m[1], m[2]]));
const GENERATE = new Set(["DEV_JWT_SECRET", "MEDIA_URL_SECRET"]);
const out = [];
let added = 0;
for (const line of example.split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
  if (!m) {
    out.push(line);
    continue;
  }
  const [, key, def] = m;
  let val = have.get(key);
  if (val === undefined || (val === "" && GENERATE.has(key))) {
    val = GENERATE.has(key) ? randomBytes(32).toString("base64url") : def;
    added++;
  }
  out.push(`${key}=${val}`);
}
// Keep any extra keys the user added.
for (const [k, v] of have) if (!new RegExp(`^${k}=`, "m").test(example)) out.push(`${k}=${v}`);
writeFileSync(envPath, out.join("\n"), { mode: 0o600 });
console.log(`setup-env: .env ${current ? "updated" : "created"} (${added} value${added === 1 ? "" : "s"} filled)`);
