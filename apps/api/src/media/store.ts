// Media storage behind one interface (ADR 0006): local disk in mock mode, R2 in prod.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";

export interface MediaStore {
  put(key: string, bytes: Uint8Array, mime: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
}

const SAFE_KEY = /^[a-z0-9][a-z0-9/_-]*\.(jpg|png)$/;

export function assertSafeKey(key: string) {
  if (!SAFE_KEY.test(key) || key.includes("..")) throw new Error(`unsafe media key: ${key}`);
}

export class LocalDiskStore implements MediaStore {
  constructor(private readonly root: string) {}
  private path(key: string) {
    assertSafeKey(key);
    const p = normalize(join(this.root, key));
    if (!p.startsWith(normalize(this.root) + sep)) throw new Error("path escape");
    return p;
  }
  async put(key: string, bytes: Uint8Array) {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, bytes);
  }
  async get(key: string) {
    try {
      return new Uint8Array(await readFile(this.path(key)));
    } catch {
      return null;
    }
  }
  async delete(key: string) {
    await rm(this.path(key), { force: true });
  }
}

export class MemoryStore implements MediaStore {
  readonly files = new Map<string, Uint8Array>();
  async put(key: string, bytes: Uint8Array) {
    assertSafeKey(key);
    this.files.set(key, bytes);
  }
  async get(key: string) {
    return this.files.get(key) ?? null;
  }
  async delete(key: string) {
    this.files.delete(key);
  }
}

/** Prod: Cloudflare R2 over the S3 API. Stubbed until keys exist (STATUS → Needs from you). */
export class R2Store implements MediaStore {
  constructor(private readonly cfg: { accountId: string; bucket: string }) {}
  private nope(): never {
    throw new Error(`R2Store for bucket ${this.cfg.bucket} is not implemented in the prototype (ADR 0006)`);
  }
  async put() {
    this.nope();
  }
  async get(): Promise<Uint8Array | null> {
    this.nope();
  }
  async delete() {
    this.nope();
  }
}
