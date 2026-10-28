import { randomBytes, randomUUID } from "node:crypto";
import { fixedClock, offsetClock } from "@nightcap/core";
import { createPglite, makeUser, type Db } from "@nightcap/db";
import { createApp } from "../src/app";
import { mintToken } from "../src/auth";
import { loadConfig, type Config } from "../src/config";
import type { Deps } from "../src/deps";
import { MemoryStore } from "../src/media/store";

/** A tiny but structurally valid JPEG with an EXIF APP1 that contains GPS tags. */
export function jpegWithGps(): Uint8Array {
  const seg = (marker: number, payload: number[]) => [
    0xff,
    marker,
    ((payload.length + 2) >> 8) & 0xff,
    (payload.length + 2) & 0xff,
    ...payload,
  ];
  const ascii = (s: string) => [...s].map((ch) => ch.charCodeAt(0));
  const app0 = seg(0xe0, [...ascii("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  const app1 = seg(0xe1, [
    ...ascii("Exif"),
    0,
    0,
    ...ascii("MM"),
    0,
    42,
    ...ascii("GPSLatitude=44.9778N;GPSLongitude=93.2650W"),
  ]);
  const xmp = seg(0xe1, [
    ...ascii("http://ns.adobe.com/xap/1.0/"),
    0,
    ...ascii("<x:xmpmeta>photoshop:City=Minneapolis</x:xmpmeta>"),
  ]);
  const icc = seg(0xe2, [...ascii("ICC_PROFILE"), 0, 1, 1, 1, 2, 3]);
  const app13 = seg(0xed, [...ascii("Photoshop 3.0"), 0, ...ascii("8BIM-IPTC-location")]);
  const com = seg(0xfe, ascii("taken at Maya's apartment"));
  const dqt = seg(0xdb, [0, ...Array(64).fill(1)]);
  const sof = seg(0xc0, [8, 0, 16, 0, 32, 1, 1, 0x11, 0]); // 32×16, 1 component
  const dht = seg(0xc4, [0, 0, 1, ...Array(15).fill(0), 0]);
  const sos = seg(0xda, [1, 1, 0, 0, 63, 0]);
  return Uint8Array.from([
    0xff,
    0xd8,
    ...app0,
    ...app1,
    ...xmp,
    ...icc,
    ...app13,
    ...com,
    ...dqt,
    ...sof,
    ...dht,
    ...sos,
    0x12,
    0x34,
    0xff,
    0x00,
    0x56,
    0xff,
    0xd9,
  ]);
}

export interface TestApp {
  app: ReturnType<typeof createApp>;
  deps: Deps;
  db: Db;
  clock: ReturnType<typeof fixedClock>;
  media: MemoryStore;
  user(
    name: string,
    opts?: { birthdate?: string },
  ): Promise<{ id: string; token: string; h: Record<string, string> }>;
  req(
    method: string,
    path: string,
    opts?: { token?: string; json?: unknown; form?: FormData },
  ): Promise<{ status: number; body: any }>;
}

export async function testApp(opts: { mode?: Config["mode"]; now?: string } = {}): Promise<TestApp> {
  const { db } = await createPglite();
  const clock = fixedClock(opts.now ?? "2026-10-31T02:00:00Z"); // Fri 21:00 CDT
  const dev = offsetClock(clock);
  const media = new MemoryStore();
  const config = {
    ...loadConfig({}, () => "test-secret"),
    mode: opts.mode ?? "mock",
    jwtSecret: "jwt-test-secret",
    mediaSecret: "media-test-secret",
  } as Config;
  const deps: Deps = {
    db,
    clock: dev,
    devClock: dev,
    media,
    config,
    random: {
      bytes: (n) => new Uint8Array(randomBytes(n)),
      float: () => randomBytes(4).readUInt32BE() / 2 ** 32,
      uuid: () => randomUUID(),
    },
    demoPhotos: async () => [{ name: "a.jpg", bytes: jpegWithGps() }],
    // Surface unexpected 500s in test output (routine request logs stay quiet).
    log: (m) => {
      if (m.startsWith("unhandled")) console.error(m);
    },
  };
  const app = createApp(deps);
  const t: TestApp = {
    app,
    deps,
    db,
    clock,
    media,
    async user(name, o = {}) {
      const id = await makeUser(db, name, { birthdate: o.birthdate });
      const token = mintToken(deps, id);
      return { id, token, h: { Authorization: `Bearer ${token}` } };
    },
    async req(method, path, o = {}) {
      const headers: Record<string, string> = {};
      if (o.token) headers.Authorization = `Bearer ${o.token}`;
      let bodyInit: string | FormData | undefined;
      if (o.json !== undefined) {
        headers["content-type"] = "application/json";
        bodyInit = JSON.stringify(o.json);
      } else if (o.form) bodyInit = o.form;
      const res = await app.request(path, { method, headers, body: bodyInit });
      const ct = res.headers.get("content-type") ?? "";
      const body = ct.includes("json") ? await res.json() : new Uint8Array(await res.arrayBuffer());
      return { status: res.status, body };
    },
  };
  return t;
}

export function photoForm(bytes: Uint8Array = jpegWithGps()): FormData {
  const f = new FormData();
  f.append("photo", new File([bytes], "shot.jpg", { type: "image/jpeg" }));
  return f;
}
