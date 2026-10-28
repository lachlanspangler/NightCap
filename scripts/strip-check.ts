// Dev check: strip every demo photo and write it to .data/strip-check/ so a real decoder (sips)
// can confirm the output is still a valid image.  npx tsx scripts/strip-check.ts
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stripJpeg } from "../apps/api/src/media/exif";

const src = ".data/demo-photos";
const out = ".data/strip-check";
mkdirSync(out, { recursive: true });
const files = readdirSync(src).filter((f) => f.endsWith(".jpg"));
for (const f of files) writeFileSync(join(out, f), stripJpeg(new Uint8Array(readFileSync(join(src, f)))));
console.log(`stripped ${files.length} → ${out}`);
