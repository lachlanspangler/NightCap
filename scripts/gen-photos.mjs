#!/usr/bin/env node
// gen-photos.mjs — deterministic, procedurally generated "night out" photos for demo mode.
// No stock photos (licensing) and no people's faces (privacy): out-of-focus bar/club/street scenes
// with bokeh, neon, backlit silhouettes, grain and vignette. Same seed → same pixels.
//
//   node scripts/gen-photos.mjs [--count 48] [--out .data/demo-photos] [--size 720x960]
//
// Writes PNG with node:zlib, then converts to JPEG with macOS `sips` or `ffmpeg` if present
// (JPEG is ~10× smaller); otherwise keeps PNG (the API accepts both).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce(
      (acc, a, i, all) =>
        a.startsWith("--")
          ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true]]
          : acc,
      [],
    ),
);
const COUNT = Number(args.count ?? 48);
const OUT = args.out?.startsWith("/") ? args.out : join(root, args.out ?? ".data/demo-photos");
const [W, H] = (args.size ?? "720x960").split("x").map(Number);

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SCENES = {
  bar: {
    bg: [
      [0.1, 0.04, 0.03],
      [0.03, 0.01, 0.02],
    ],
    lights: [
      [1.0, 0.62, 0.25],
      [1.0, 0.45, 0.18],
      [0.95, 0.8, 0.5],
    ],
    bokeh: [40, 90],
    size: [18, 70],
  },
  club: {
    bg: [
      [0.06, 0.01, 0.1],
      [0.01, 0.0, 0.04],
    ],
    lights: [
      [1.0, 0.15, 0.7],
      [0.2, 0.6, 1.0],
      [0.6, 0.2, 1.0],
    ],
    bokeh: [30, 70],
    size: [14, 60],
    lasers: true,
  },
  street: {
    bg: [
      [0.02, 0.03, 0.08],
      [0.06, 0.03, 0.02],
    ],
    lights: [
      [1.0, 0.55, 0.15],
      [0.35, 0.6, 1.0],
      [1.0, 0.2, 0.2],
    ],
    bokeh: [25, 60],
    size: [10, 45],
    streaks: true,
  },
  diner: {
    bg: [
      [0.07, 0.12, 0.12],
      [0.02, 0.05, 0.06],
    ],
    lights: [
      [0.5, 1.0, 0.9],
      [1.0, 0.3, 0.4],
      [1.0, 0.95, 0.8],
    ],
    bokeh: [20, 40],
    size: [20, 80],
    neon: true,
  },
  rooftop: {
    bg: [
      [0.04, 0.05, 0.14],
      [0.01, 0.01, 0.03],
    ],
    lights: [
      [1.0, 0.85, 0.55],
      [0.7, 0.8, 1.0],
      [1.0, 0.6, 0.3],
    ],
    bokeh: [80, 160],
    size: [4, 16],
    skyline: true,
  },
  pregame: {
    bg: [
      [0.16, 0.09, 0.06],
      [0.05, 0.03, 0.03],
    ],
    lights: [
      [1.0, 0.75, 0.45],
      [1.0, 0.9, 0.7],
      [0.9, 0.5, 0.6],
    ],
    bokeh: [15, 35],
    size: [30, 110],
    flash: true,
  },
};
const SCENE_ORDER = ["pregame", "bar", "bar", "club", "street", "diner", "rooftop", "club", "bar", "street"];

// Separable box blur, in place, RGB float image.
function boxBlur(img, r) {
  if (r <= 0) return;
  const tmp = new Float32Array(img.length);
  const pass = (src, dst, horizontal) => {
    const outer = horizontal ? H : W,
      inner = horizontal ? W : H;
    for (let o = 0; o < outer; o++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        const idx = (i) => (horizontal ? (o * W + i) * 3 + c : (i * W + o) * 3 + c);
        for (let i = -r; i <= r; i++) sum += src[idx(Math.min(inner - 1, Math.max(0, i)))];
        for (let i = 0; i < inner; i++) {
          dst[idx(i)] = sum / (2 * r + 1);
          sum += src[idx(Math.min(inner - 1, i + r + 1))] - src[idx(Math.max(0, i - r))];
        }
      }
    }
  };
  pass(img, tmp, true);
  pass(tmp, img, false);
}

function render(seed) {
  const rnd = mulberry32(seed * 7919 + 17);
  const sceneName = SCENE_ORDER[seed % SCENE_ORDER.length];
  const s = SCENES[sceneName];
  const img = new Float32Array(W * H * 3);
  const add = (x, y, r, g, b) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const k = (y * W + x) * 3;
    img[k] += r;
    img[k + 1] += g;
    img[k + 2] += b;
  };

  // Background: vertical gradient with a random tilt.
  const tilt = (rnd() - 0.5) * 0.6;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = Math.min(1, Math.max(0, y / H + (x / W - 0.5) * tilt));
      const k = (y * W + x) * 3;
      for (let c = 0; c < 3; c++) img[k + c] = s.bg[0][c] * (1 - t) + s.bg[1][c] * t;
    }
  }

  // A warm "flash" falloff from the centre for pregame / some shots.
  if (s.flash || rnd() < 0.25) {
    const cx = W * (0.4 + rnd() * 0.2),
      cy = H * (0.45 + rnd() * 0.15),
      rr = W * 0.75;
    const tone = s.flash ? [0.32, 0.22, 0.16] : [0.14, 0.1, 0.09];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const d = Math.hypot(x - cx, y - cy) / rr;
        const f = Math.max(0, 1 - d * d);
        const k = (y * W + x) * 3;
        img[k] += tone[0] * f;
        img[k + 1] += tone[1] * f;
        img[k + 2] += tone[2] * f;
      }
  }

  // Skyline: dark blocks with lit windows (rooftop).
  if (s.skyline) {
    let x = 0;
    while (x < W) {
      const bw = 30 + rnd() * 90,
        bh = H * (0.15 + rnd() * 0.3),
        top = H * 0.62 - bh;
      for (let yy = Math.max(0, Math.floor(top)); yy < H * 0.62; yy++)
        for (let xx = Math.floor(x); xx < Math.min(W, x + bw); xx++) {
          const k = (yy * W + xx) * 3;
          img[k] *= 0.35;
          img[k + 1] *= 0.35;
          img[k + 2] *= 0.4;
          if (xx % 9 < 3 && yy % 13 < 5 && rnd() < 0.02) {
            img[k] += 0.9;
            img[k + 1] += 0.75;
            img[k + 2] += 0.45;
          }
        }
      x += bw + rnd() * 10;
    }
  }

  // Bokeh discs: soft-edged, slightly brighter rims, additive.
  const n = Math.floor(s.bokeh[0] + rnd() * (s.bokeh[1] - s.bokeh[0]));
  for (let i = 0; i < n; i++) {
    const col = s.lights[Math.floor(rnd() * s.lights.length)];
    const r = s.size[0] + rnd() ** 2 * (s.size[1] - s.size[0]);
    const cx = rnd() * W,
      cy = rnd() * H * (s.skyline ? 0.62 : 0.85);
    const a = 0.12 + rnd() * 0.35;
    for (let y = Math.floor(cy - r); y <= cy + r; y++)
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        const d = Math.hypot(x - cx, y - cy) / r;
        if (d > 1) continue;
        const edge = Math.min(1, (1 - d) * 6);
        const rim = d > 0.82 ? 1.35 : 1;
        const f = a * edge * rim;
        add(x, y, col[0] * f, col[1] * f, col[2] * f);
      }
  }

  // Laser beams (club): thin bright lines from a top source.
  if (s.lasers) {
    const sx = W * (0.2 + rnd() * 0.6);
    for (let i = 0; i < 7; i++) {
      const col = s.lights[i % s.lights.length];
      const ang = Math.PI * (0.15 + rnd() * 0.7);
      for (let t = 0; t < H * 1.4; t += 0.7) {
        const x = Math.round(sx + Math.cos(ang) * t),
          y = Math.round(Math.sin(ang) * t);
        for (let w = -2; w <= 2; w++) {
          const f = 0.28 * (1 - Math.abs(w) / 3);
          add(x + w, y, col[0] * f, col[1] * f, col[2] * f);
        }
      }
    }
  }

  // Light streaks (street): long horizontal smears, like a slow shutter from a cab.
  if (s.streaks) {
    for (let i = 0; i < 14; i++) {
      const col = s.lights[Math.floor(rnd() * s.lights.length)];
      const y0 = H * (0.35 + rnd() * 0.4),
        len = W * (0.3 + rnd() * 0.7),
        x0 = rnd() * W - len / 2,
        th = 2 + rnd() * 5,
        slope = (rnd() - 0.5) * 0.3;
      for (let t = 0; t < len; t++)
        for (let w = -th; w <= th; w++) {
          const f = 0.22 * (1 - Math.abs(w) / (th + 1)) * Math.sin((t / len) * Math.PI);
          add(Math.round(x0 + t), Math.round(y0 + t * slope + w), col[0] * f, col[1] * f, col[2] * f);
        }
    }
  }

  // Neon sign (diner): a glowing rounded rectangle outline.
  if (s.neon) {
    const col = s.lights[Math.floor(rnd() * 2)];
    const x0 = W * 0.15,
      y0 = H * (0.12 + rnd() * 0.1),
      w = W * 0.7,
      h = H * 0.12;
    for (let y = Math.floor(y0 - 30); y < y0 + h + 30; y++)
      for (let x = Math.floor(x0 - 30); x < x0 + w + 30; x++) {
        const dx = Math.max(x0 - x, 0, x - (x0 + w)),
          dy = Math.max(y0 - y, 0, y - (y0 + h));
        const outside = Math.hypot(dx, dy);
        const inside = Math.min(x - x0, x0 + w - x, y - y0, y0 + h - y);
        const d = outside > 0 ? outside : Math.max(0, inside);
        const f = Math.exp(-((d - 0) ** 2) / 40) * 0.9 + Math.exp(-d / 18) * 0.15;
        add(x, y, col[0] * f, col[1] * f, col[2] * f);
      }
  }

  // Silhouettes of friends: soft head + rounded shoulders, feathered edges, rim-lit from the side
  // the light comes from. Some shots have nobody in them (just the room).
  const people = rnd() < 0.15 ? 0 : 1 + Math.floor(rnd() * 3);
  const light = { x: rnd() < 0.5 ? -0.7 : 0.7, y: -0.7 };
  const smooth = (e0, e1, v) => {
    const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  for (let p = 0; p < people; p++) {
    const cx = W * ((p + 0.5) / people + (rnd() - 0.5) * 0.18);
    const scale = 0.85 + rnd() * 0.6;
    const hr = W * 0.07 * scale,
      hy = H * (0.5 + rnd() * 0.1),
      tilt = (rnd() - 0.5) * 0.35;
    const neckY = hy + hr * 0.9;
    const bx = cx + (rnd() - 0.5) * hr * 0.4,
      brx = hr * (2.2 + rnd() * 0.6),
      bry = hr * 1.7,
      by = neckY + bry * 0.95;
    const raised = s.lasers && rnd() < 0.6; // a hand up at the club
    const rim = s.lights[Math.floor(rnd() * s.lights.length)];
    const body = s.flash ? [0.2, 0.13, 0.1] : [0.012, 0.01, 0.014];
    const x0 = Math.max(0, Math.floor(cx - brx * 1.4)),
      x1 = Math.min(W, Math.ceil(cx + brx * 1.4));
    for (let y = Math.max(0, Math.floor(hy - hr * 1.6)); y < H; y++)
      for (let x = x0; x < x1; x++) {
        // Head: tilted ellipse.
        const dx = x - cx,
          dy = y - hy;
        const u = (dx * Math.cos(tilt) + dy * Math.sin(tilt)) / hr,
          v = (-dx * Math.sin(tilt) + dy * Math.cos(tilt)) / (hr * 1.22);
        const dHead = Math.hypot(u, v);
        // Shoulders/torso: a wide ellipse, only below the neck.
        const bu = (x - bx) / brx,
          bv = (y - by) / bry;
        // Below the widest point the torso just continues down off the frame.
        const dBody = y > neckY ? (y > by ? Math.abs(bu) : Math.hypot(bu, bv)) : 9;
        // Neck: a short column joining them.
        const dNeck = y > hy && y < neckY + hr * 0.6 ? Math.abs(dx) / (hr * 0.45) : 9;
        // Raised arm: a thin slanted capsule.
        let dArm = 9;
        if (raised) {
          const ax = cx + brx * 0.8,
            ay = by - bry * 0.4,
            ex = ax + hr * 1.2,
            ey = hy - hr * 3;
          const t = Math.max(
            0,
            Math.min(1, ((x - ax) * (ex - ax) + (y - ay) * (ey - ay)) / ((ex - ax) ** 2 + (ey - ay) ** 2)),
          );
          dArm = Math.hypot(x - (ax + t * (ex - ax)), y - (ay + t * (ey - ay))) / (hr * 0.32);
        }
        const d = Math.min(dHead, dBody, dNeck, dArm);
        if (d > 1.15) continue;
        const feather = 3 / hr;
        const inside = 1 - smooth(1 - feather, 1 + feather, d);
        const k = (y * W + x) * 3;
        const mix = 0.94 * inside;
        img[k] = img[k] * (1 - mix) + body[0] * mix;
        img[k + 1] = img[k + 1] * (1 - mix) + body[1] * mix;
        img[k + 2] = img[k + 2] * (1 - mix) + body[2] * mix;
        // Rim light: a thin band just inside the edge, facing the light.
        let nx, ny;
        if (d === dHead) {
          nx = u;
          ny = v;
        } else if (d === dBody) {
          nx = bu;
          ny = y > by ? 0 : bv;
        } else {
          nx = Math.sign(dx);
          ny = 0;
        }
        const nl = Math.hypot(nx, ny) || 1;
        const facing = Math.max(0, (nx / nl) * light.x + (ny / nl) * light.y);
        const band = Math.exp(-(((d - 0.97) / 0.035) ** 2));
        const rf = band * (0.15 + facing * 0.9) * 0.7;
        img[k] += rim[0] * rf;
        img[k + 1] += rim[1] * rf;
        img[k + 2] += rim[2] * rf;
      }
  }

  // A few big out-of-focus foreground discs in front of everyone (depth).
  for (let i = 0; i < (rnd() < 0.5 ? 3 : 0); i++) {
    const col = s.lights[Math.floor(rnd() * s.lights.length)];
    const r = W * (0.12 + rnd() * 0.12),
      cx = rnd() * W,
      cy = H * (0.6 + rnd() * 0.4),
      a = 0.05 + rnd() * 0.06;
    for (let y = Math.floor(cy - r); y <= cy + r; y++)
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        const d = Math.hypot(x - cx, y - cy) / r;
        if (d <= 1) add(x, y, col[0] * a, col[1] * a, col[2] * a);
      }
  }

  // Bloom/halation: blur the highlights wide and add them back (film glow around lights).
  {
    const hi = new Float32Array(img.length);
    for (let k = 0; k < img.length; k++) hi[k] = Math.max(0, img[k] - 0.35);
    boxBlur(hi, 14);
    boxBlur(hi, 14);
    for (let k = 0; k < img.length; k++) img[k] += hi[k] * 0.9;
  }
  // Night photos are never tack sharp.
  boxBlur(img, 1);

  // Optional handheld motion blur (horizontal box blur).
  if (rnd() < 0.35) {
    const radius = 2 + Math.floor(rnd() * 5);
    const row = new Float32Array(W * 3);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++)
        for (let c = 0; c < 3; c++) {
          let sum = 0,
            cnt = 0;
          for (let d = -radius; d <= radius; d++) {
            const xx = x + d;
            if (xx >= 0 && xx < W) {
              sum += img[(y * W + xx) * 3 + c];
              cnt++;
            }
          }
          row[x * 3 + c] = sum / cnt;
        }
      img.set(row, y * W * 3);
    }
  }

  // Tone map, vignette, grain → 8-bit RGB.
  const out = Buffer.alloc(W * H * 3);
  const exposure = 1.1 + rnd() * 0.5;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const vx = x / W - 0.5,
        vy = y / H - 0.5;
      const vig = 1 - Math.min(1, (vx * vx + vy * vy) * 1.6);
      const grain = (rnd() - 0.5) * 0.05;
      const k = (y * W + x) * 3;
      for (let c = 0; c < 3; c++) {
        const v = img[k + c] * exposure * (0.35 + 0.65 * vig) + grain;
        const tm = v / (1 + v); // Reinhard
        out[k + c] = Math.max(0, Math.min(255, Math.round(Math.pow(tm, 0.85) * 255 * 1.25)));
      }
    }
  return { rgb: out, scene: sceneName };
}

// --- PNG encoding (RGB8) -----------------------------------------------------------------
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(rgb) {
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0;
    rgb.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 6 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function toJpeg(pngPath, jpgPath) {
  const has = (cmd) => {
    try {
      execFileSync("which", [cmd], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  };
  if (has("sips")) {
    execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "82", pngPath, "--out", jpgPath], {
      stdio: "ignore",
    });
    return true;
  }
  if (has("ffmpeg")) {
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", pngPath, "-q:v", "4", jpgPath]);
    return true;
  }
  return false;
}

mkdirSync(OUT, { recursive: true });
const existing = existsSync(OUT) ? readdirSync(OUT).filter((f) => /^night-\d{3}\.(jpg|png)$/.test(f)) : [];
if (existing.length >= COUNT && !args.force) {
  console.log(`gen-photos: ${existing.length} photos already in ${OUT} (use --force to regenerate)`);
  process.exit(0);
}
const manifest = [];
const t0 = Date.now();
for (let i = 0; i < COUNT; i++) {
  const { rgb, scene } = render(i + 1);
  const base = join(OUT, `night-${String(i + 1).padStart(3, "0")}`);
  writeFileSync(`${base}.png`, png(rgb));
  const jpg = toJpeg(`${base}.png`, `${base}.jpg`);
  if (jpg) rmSync(`${base}.png`);
  manifest.push({ file: `${base.split("/").pop()}.${jpg ? "jpg" : "png"}`, scene });
}
writeFileSync(join(OUT, "manifest.json"), JSON.stringify({ width: W, height: H, photos: manifest }, null, 2));
console.log(`gen-photos: ${COUNT} photos → ${OUT} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
