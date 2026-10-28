// Injected clocks. Core never reads the system time; the API passes a Clock in.
export interface Clock {
  now(): Date;
}

/** A clock frozen at `iso` (tests). `advance(ms)` moves it. */
export function fixedClock(iso: string | Date) {
  let t = new Date(iso).getTime();
  return {
    now: () => new Date(t),
    advance(ms: number) {
      t += ms;
    },
    set(next: string | Date) {
      t = new Date(next).getTime();
    },
  };
}

/** Dev time travel: `base` shifted by an adjustable offset. */
export function offsetClock(base: Clock, offsetMs = 0) {
  let offset = offsetMs;
  return {
    now: () => new Date(base.now().getTime() + offset),
    get offsetMs() {
      return offset;
    },
    setOffset(ms: number) {
      offset = ms;
    },
  };
}
