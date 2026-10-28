#!/usr/bin/env node
// ideas.mjs — the NightCap ideas ledger CLI. The JSON is the source of truth; IDEAS.md is generated.
//
//   node scripts/ideas.mjs render            regenerate docs/IDEAS.md
//   node scripts/ideas.mjs check             exit 1 if the ledger is invalid or IDEAS.md is stale
//   node scripts/ideas.mjs next [n]          top n open ideas by score (default 8)
//   node scripts/ideas.mjs add --name "…" --pitch "…" --pillar night --kind feature \
//        --impact 4 --confidence 3 --effort 2 [--critical] [--closest "…"] [--status backlog]
//   node scripts/ideas.mjs set <id> <field> <value>
//   node scripts/ideas.mjs reject <id> "<reason>"
//
// Score = impact × confidence ÷ effort (+2 if on the demo's critical path), rounded to 0.1.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const LEDGER = join(root, "docs/ideas_ledger.json");
const OUT = join(root, "docs/IDEAS.md");

export const PILLARS = [
  "night",
  "sharing",
  "old_friends",
  "city",
  "drunk_ux",
  "privacy",
  "platform",
  "growth",
];
export const KINDS = ["core", "feature", "polish", "safety", "infra", "research"];
export const STATUSES = ["backlog", "planned", "building", "built", "parked", "merged", "rejected"];
const OPEN = new Set(["backlog", "planned", "building"]);

export function score(i) {
  const s = (i.impact * i.confidence) / i.effort + (i.critical ? 2 : 0);
  return Math.round(s * 10) / 10;
}

export function validate(ledger) {
  const errors = [];
  const ids = new Set();
  for (const i of ledger.ideas) {
    const where = i.id ?? "(no id)";
    if (!/^I-\d{3}$/.test(i.id ?? "")) errors.push(`${where}: bad id`);
    if (ids.has(i.id)) errors.push(`${where}: duplicate id`);
    ids.add(i.id);
    for (const f of ["name", "pitch"])
      if (!i[f] || typeof i[f] !== "string") errors.push(`${where}: missing ${f}`);
    if (!PILLARS.includes(i.pillar)) errors.push(`${where}: pillar ${i.pillar} not in ${PILLARS}`);
    if (!KINDS.includes(i.kind)) errors.push(`${where}: kind ${i.kind} not in ${KINDS}`);
    if (!STATUSES.includes(i.status)) errors.push(`${where}: status ${i.status} not in ${STATUSES}`);
    for (const f of ["impact", "confidence", "effort"]) {
      if (!Number.isInteger(i[f]) || i[f] < 1 || i[f] > 5)
        errors.push(`${where}: ${f} must be an integer 1–5`);
    }
    if (["rejected", "parked", "merged"].includes(i.status) && !i.reason)
      errors.push(`${where}: ${i.status} needs a reason`);
  }
  return errors;
}

const esc = (s) =>
  String(s ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ");

export function render(ledger) {
  const ideas = [...ledger.ideas].sort((a, b) => {
    const order = (s) => (OPEN.has(s) ? 0 : s === "built" ? 1 : s === "parked" ? 2 : s === "merged" ? 3 : 4);
    return order(a.status) - order(b.status) || score(b) - score(a) || a.id.localeCompare(b.id);
  });
  const count = (s) => ledger.ideas.filter((i) => i.status === s).length;
  const lines = [
    "# Ideas",
    "",
    "> Generated from `docs/ideas_ledger.json` by `make ideas`. Edit the JSON (or use `node scripts/ideas.mjs`), not this file.",
    "> Score = impact × confidence ÷ effort (each 1–5), +2 when it's on the demo's critical path (★).",
    "",
    `**${ledger.ideas.length} ideas**: ` + STATUSES.map((s) => `${s} ${count(s)}`).join(" · "),
    "",
    "Pillars: " +
      PILLARS.map((p) => `\`${p}\` ${ledger.ideas.filter((i) => i.pillar === p).length}`).join(" · "),
    "",
    "| id | status | pillar | name | pitch | closest | I/C/E | score | reason |",
    "|---|---|---|---|---|---|---|---|---|",
  ];
  for (const i of ideas) {
    lines.push(
      `| ${i.id} | ${i.status} | ${i.pillar} | ${esc(i.name)}${i.critical ? " ★" : ""} | ${esc(i.pitch)} | ${esc(i.closest)} | ${i.impact}/${i.confidence}/${i.effort} | ${score(i)} | ${esc(i.reason)} |`,
    );
  }
  return lines.join("\n") + "\n";
}

function load() {
  return JSON.parse(readFileSync(LEDGER, "utf8"));
}
function save(ledger) {
  writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + "\n");
  writeFileSync(OUT, render(ledger));
}
function nextId(ledger) {
  const max = ledger.ideas.reduce((m, i) => Math.max(m, Number(i.id.slice(2))), 0);
  return `I-${String(max + 1).padStart(3, "0")}`;
}
function parseFlags(argv) {
  const out = {};
  for (let k = 0; k < argv.length; k++) {
    const a = argv[k];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const val = argv[k + 1] && !argv[k + 1].startsWith("--") ? argv[++k] : true;
    out[key] = val;
  }
  return out;
}

function main(argv) {
  const [cmd, ...rest] = argv;
  if (cmd === "render") {
    save(load());
    console.log(`IDEAS.md regenerated (${load().ideas.length} ideas)`);
    return 0;
  }
  if (cmd === "check") {
    const ledger = load();
    const errors = validate(ledger);
    let md = "";
    try {
      md = readFileSync(OUT, "utf8");
    } catch {
      errors.push("docs/IDEAS.md missing");
    }
    if (md && md !== render(ledger)) errors.push("docs/IDEAS.md is stale: run `make ideas`");
    if (errors.length) {
      console.error(errors.join("\n"));
      return 1;
    }
    console.log(`ideas ledger ok (${ledger.ideas.length} ideas)`);
    return 0;
  }
  if (cmd === "next") {
    const n = Number(rest[0] ?? 8);
    const open = load()
      .ideas.filter((i) => OPEN.has(i.status))
      .sort((a, b) => score(b) - score(a));
    for (const i of open.slice(0, n))
      console.log(`${i.id}  ${String(score(i)).padStart(4)}  [${i.pillar}] ${i.name} — ${i.pitch}`);
    return 0;
  }
  if (cmd === "add") {
    const f = parseFlags(rest);
    const ledger = load();
    const idea = {
      id: nextId(ledger),
      kind: f.kind ?? "feature",
      pillar: f.pillar ?? "night",
      name: f.name,
      pitch: f.pitch,
      closest: f.closest ?? "",
      impact: Number(f.impact ?? 3),
      confidence: Number(f.confidence ?? 3),
      effort: Number(f.effort ?? 3),
      critical: Boolean(f.critical),
      status: f.status ?? "backlog",
      reason: f.reason ?? "",
    };
    ledger.ideas.push(idea);
    const errors = validate(ledger);
    if (errors.length) {
      console.error(errors.join("\n"));
      return 1;
    }
    save(ledger);
    console.log(`added ${idea.id} (score ${score(idea)})`);
    return 0;
  }
  if (cmd === "set") {
    const [id, field, ...v] = rest;
    const ledger = load();
    const idea = ledger.ideas.find((i) => i.id === id);
    if (!idea) {
      console.error(`no idea ${id}`);
      return 1;
    }
    const value = v.join(" ");
    idea[field] = ["impact", "confidence", "effort"].includes(field)
      ? Number(value)
      : field === "critical"
        ? value === "true"
        : value;
    const errors = validate(ledger);
    if (errors.length) {
      console.error(errors.join("\n"));
      return 1;
    }
    save(ledger);
    console.log(`${id}.${field} = ${value}`);
    return 0;
  }
  if (cmd === "reject") {
    const [id, ...why] = rest;
    return main(["set", id, "status", "rejected"]) || main(["set", id, "reason", ...why]);
  }
  console.error("usage: ideas.mjs render|check|next [n]|add …|set <id> <field> <value>|reject <id> <reason>");
  return 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(main(process.argv.slice(2)));
}
