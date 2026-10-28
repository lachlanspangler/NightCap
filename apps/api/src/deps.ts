import type { Clock } from "@nightcap/core";
import type { Db } from "@nightcap/db";
import type { Config } from "./config";
import type { MediaStore } from "./media/store";

/** Everything the app needs, injected (tests pass fakes; index.ts passes the real thing). */
export interface Deps {
  db: Db;
  clock: Clock;
  /** Dev time travel (mock mode only). */
  devClock?: { offsetMs: number; setOffset(ms: number): void };
  media: MediaStore;
  config: Config;
  random: { bytes(n: number): Uint8Array; float(): number; uuid(): string };
  /** Demo photo files for mock mode (dev viewfinder + seeding + simulate). */
  demoPhotos?: () => Promise<{ name: string; bytes: Uint8Array }[]>;
  log?: (msg: string) => void;
}

export type AppEnv = { Variables: { userId: string; deps: Deps } };
