#!/usr/bin/env node
// doctor.mjs — self-healing checks (docs/WORKFLOW.md §0). `--heal` applies the safe repairs.
// Exit 1 on any red. Never touches anything outside this repo; never stops processes.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const heal = process.argv.includes("--heal");
const results = [];
const add = (level, name, detail = "", fix = null) => results.push({ level, name, detail, fix });
const read = (p) => readFileSync(join(root, p), "utf8");
const run = (cmd, args) =>
  execFileSync(cmd, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

// 1. .env has every key in .env.example and dev secrets are filled.
{
  const keys = [...read(".env.example").matchAll(/^([A-Z0-9_]+)=/gm)].map((m) => m[1]);
  const env = existsSync(join(root, ".env")) ? read(".env") : "";
  const missing = keys.filter((k) => !new RegExp(`^${k}=`, "m").test(env));
  const emptySecrets = ["DEV_JWT_SECRET", "MEDIA_URL_SECRET"].filter(
    (k) => !new RegExp(`^${k}=.+`, "m").test(env),
  );
  if (!env)
    add("amber", ".env", "missing (mock mode still works with ephemeral secrets)", () =>
      run("node", ["scripts/setup-env.mjs"]),
    );
  else if (missing.length || emptySecrets.length)
    add("amber", ".env", `missing: ${[...missing, ...emptySecrets].join(", ")}`, () =>
      run("node", ["scripts/setup-env.mjs"]),
    );
  else add("green", ".env", `${keys.length} keys`);
}

// 2. Ideas ledger valid and IDEAS.md in sync.
try {
  run("node", ["scripts/ideas.mjs", "check"]);
  add("green", "ideas ledger", "valid, IDEAS.md in sync");
} catch (e) {
  const msg = String(e.stderr || e.message)
    .trim()
    .split("\n")[0];
  add(
    /stale/.test(msg) ? "amber" : "red",
    "ideas ledger",
    msg,
    /stale/.test(msg) ? () => run("node", ["scripts/ideas.mjs", "render"]) : null,
  );
}

// 3. Every ADR is in the index.
{
  const files = readdirSync(join(root, "docs/adr")).filter((f) => /^\d{4}-.+\.md$/.test(f));
  const index = read("docs/adr/README.md");
  const unlisted = files.filter((f) => !index.includes(f));
  add(
    unlisted.length ? "red" : "green",
    "ADR index",
    unlisted.length ? `not listed: ${unlisted.join(", ")}` : `${files.length} ADRs`,
  );
}

// 4. No secrets in tracked files.
{
  const tracked = run("git", ["ls-files"])
    .split("\n")
    .filter((f) => f && !/\.(png|jpg|jpeg|gif|mp4|mov|lock)$/.test(f) && f !== "package-lock.json");
  const patterns = [
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key"],
    [/\bsk_(live|test)_[A-Za-z0-9]{16,}/, "stripe-style secret"],
    [/\bsk\.[A-Za-z0-9]{40,}/, "mapbox secret token"],
    [/service_role["']?\s*[:=]\s*["']ey[A-Za-z0-9_-]{20,}/, "supabase service_role key"],
    [/\beyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, "JWT"],
    [
      /(DEV_JWT_SECRET|MEDIA_URL_SECRET|R2_SECRET_ACCESS_KEY|SUPABASE_JWT_SECRET)=[A-Za-z0-9_-]{16,}/,
      "secret value",
    ],
  ];
  const hits = [];
  for (const f of tracked) {
    let text;
    try {
      text = readFileSync(join(root, f), "utf8");
    } catch {
      continue;
    }
    for (const [re, what] of patterns) if (re.test(text)) hits.push(`${f} (${what})`);
  }
  add(
    hits.length ? "red" : "green",
    "no secrets in git",
    hits.length ? hits.join(", ") : `${tracked.length} files scanned`,
  );
}

// 5. Mobile bundle env: only the two public EXPO_PUBLIC_ keys.
{
  const allowed = new Set(["EXPO_PUBLIC_API_URL", "EXPO_PUBLIC_MOCK"]);
  const used = new Set();
  const walk = (d) => {
    if (!existsSync(d)) return;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (["node_modules", ".expo", "ios", "android"].includes(e.name)) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx|js|json)$/.test(e.name))
        for (const m of readFileSync(p, "utf8").matchAll(/EXPO_PUBLIC_[A-Z0-9_]+/g)) used.add(m[0]);
    }
  };
  walk(join(root, "apps/mobile"));
  for (const m of read(".env.example").matchAll(/^(EXPO_PUBLIC_[A-Z0-9_]+)=/gm)) used.add(m[1]);
  const bad = [...used].filter((k) => !allowed.has(k));
  add(
    bad.length ? "red" : "green",
    "bundle env",
    bad.length ? `unexpected public keys: ${bad.join(", ")}` : [...used].join(", ") || "none",
  );
}

// 6. Ports are ours (shared laptop rules).
{
  const ex = read(".env.example");
  const want = { METRO_PORT: "8091", API_PORT: "8788", SUPABASE_API_PORT: "54421" };
  const wrong = Object.entries(want).filter(([k, v]) => !new RegExp(`^${k}=${v}$`, "m").test(ex));
  const cfg = existsSync(join(root, "supabase/config.toml")) ? read("supabase/config.toml") : "";
  const supaOk = /project_id\s*=\s*"nightcap"/.test(cfg) && /port\s*=\s*54421/.test(cfg);
  add(
    wrong.length || !supaOk ? "red" : "green",
    "ports",
    wrong.length
      ? `wrong: ${wrong.map(([k]) => k).join(", ")}`
      : supaOk
        ? "metro 8091, api 8788, supabase 54421+"
        : "supabase/config.toml missing project_id/ports",
  );
}

// 7. PID files point at live processes we started.
{
  const dir = join(root, ".run");
  const stale = [];
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".pid"))) {
      const pid = Number(readFileSync(join(dir, f), "utf8"));
      try {
        process.kill(pid, 0);
      } catch {
        stale.push(f);
      }
    }
  }
  add(
    stale.length ? "amber" : "green",
    "run state",
    stale.length ? `stale: ${stale.join(", ")}` : "clean",
    stale.length ? () => stale.forEach((f) => rmSync(join(dir, f))) : null,
  );
}

// 8. Our simulator still exists (if we've created one).
{
  const f = join(root, ".sim-udid");
  if (!existsSync(f)) add("green", "simulator", "not created yet (scripts/sim.sh create)");
  else {
    const udid = readFileSync(f, "utf8").trim();
    let ok = false;
    try {
      ok = run("xcrun", ["simctl", "list", "devices"]).includes(udid);
    } catch {
      /* no xcode */
    }
    add(
      ok ? "green" : "amber",
      "simulator",
      ok ? `NightCap iPhone ${udid.slice(0, 8)}…` : "UDID in .sim-udid not found (scripts/sim.sh create)",
    );
  }
}

// 9. Demo photos exist.
{
  const d = join(root, ".data/demo-photos");
  const n = existsSync(d) ? readdirSync(d).filter((x) => /\.(jpg|png)$/.test(x)).length : 0;
  add(
    n >= 24 ? "green" : "amber",
    "demo photos",
    `${n} photos`,
    n >= 24 ? null : () => run("node", ["scripts/gen-photos.mjs", "--count", "48"]),
  );
}

// 10. Migrations numbered contiguously; every table has RLS (checked in tests) and is mentioned in a test.
{
  const migs = readdirSync(join(root, "packages/db/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const gaps = migs.filter((f, i) => !f.startsWith(String(i).padStart(4, "0")));
  const tables = new Set();
  for (const m of migs)
    for (const t of read(`packages/db/migrations/${m}`).matchAll(
      /create table (?:if not exists )?public\.([a-z_]+)/g,
    ))
      tables.add(t[1]);
  const testText = ["packages/db/test", "apps/api/test"]
    .flatMap((d) => readdirSync(join(root, d)).map((f) => read(`${d}/${f}`)))
    .join("\n");
  const untested = [...tables].filter(
    (t) =>
      !testText.includes(t) &&
      !["code_attempts", "nudges_sent", "deferred_actions", "notifications"].includes(t),
  );
  add(
    gaps.length || untested.length ? "red" : "green",
    "migrations",
    gaps.length
      ? `gaps: ${gaps.join(", ")}`
      : untested.length
        ? `tables never mentioned in tests: ${untested.join(", ")}`
        : `${migs.length} migrations, ${tables.size} tables`,
  );
}

// 11. Diary has today's entry if there were commits today.
{
  const today = new Date().toISOString().slice(0, 10);
  let commitsToday = 0;
  try {
    commitsToday = run("git", ["log", "--since=midnight", "--oneline"]).split("\n").filter(Boolean).length;
  } catch {
    /* no git */
  }
  const diary = read("docs/DIARY.md");
  add(
    commitsToday && !diary.includes(`## ${today}`) ? "amber" : "green",
    "diary",
    commitsToday ? `${commitsToday} commits today` : "no commits today",
  );
}

// Report (+ heal)
const icon = { green: "🟢", amber: "🟠", red: "🔴" };
let red = 0;
for (const r of results) {
  if (heal && r.fix && r.level !== "green") {
    try {
      r.fix();
      r.detail += " → healed";
      r.level = "green";
    } catch (e) {
      r.detail += ` → heal failed: ${e.message}`;
    }
  }
  if (r.level === "red") red++;
  console.log(`${icon[r.level]} ${r.name.padEnd(18)} ${r.detail}`);
}
process.exit(red ? 1 : 0);
