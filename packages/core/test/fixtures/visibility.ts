// Table-driven visibility cases shared by the core test (album.test.ts) and the SQL/RLS test
// (packages/db/test/visibility.test.ts). If core and RLS ever disagree, one of them fails.
import type { NightPhase } from "../../src/night";
import type { ShotStatus } from "../../src/album";

export interface VisibilityCase {
  name: string;
  author: "maya" | "theo" | "jules" | "sam";
  viewer: "maya" | "theo" | "jules" | "sam";
  status: ShotStatus;
  phase: NightPhase;
  /** Participants of the night. */
  participants: ("maya" | "theo" | "jules" | "sam")[];
  hiddenBy?: ("maya" | "theo" | "jules" | "sam")[];
  /** [blocker, blocked] */
  blocks?: [string, string][];
  expected: boolean;
}

const all = ["maya", "theo", "jules"] as ("maya" | "theo" | "jules" | "sam")[];

export const VISIBILITY_CASES: VisibilityCase[] = [
  { name: "author sees own shot while live", author: "maya", viewer: "maya", status: "held", phase: "live", participants: all, expected: true },
  { name: "author sees own shot while developing", author: "maya", viewer: "maya", status: "held", phase: "developing", participants: all, expected: true },
  { name: "author sees own discarded shot", author: "maya", viewer: "maya", status: "discarded", phase: "unlocked", participants: all, expected: true },
  { name: "author sees own hidden shot", author: "maya", viewer: "maya", status: "kept", phase: "unlocked", participants: all, hiddenBy: ["theo"], expected: true },
  { name: "author does not see own deleted shot", author: "maya", viewer: "maya", status: "deleted", phase: "unlocked", participants: all, expected: false },
  { name: "friend can't see while live", author: "maya", viewer: "theo", status: "held", phase: "live", participants: all, expected: false },
  { name: "friend can't see while developing", author: "maya", viewer: "theo", status: "kept", phase: "developing", participants: all, expected: false },
  { name: "friend sees after unlock (held = kept by default)", author: "maya", viewer: "theo", status: "held", phase: "unlocked", participants: all, expected: true },
  { name: "friend sees kept shot after unlock", author: "maya", viewer: "theo", status: "kept", phase: "unlocked", participants: all, expected: true },
  { name: "discarded never revealed", author: "maya", viewer: "theo", status: "discarded", phase: "unlocked", participants: all, expected: false },
  { name: "deleted never revealed", author: "maya", viewer: "theo", status: "deleted", phase: "unlocked", participants: all, expected: false },
  { name: "non-participant never sees (crew member who stayed home)", author: "maya", viewer: "sam", status: "kept", phase: "unlocked", participants: all, expected: false },
  { name: "hidden by a subject: others can't see", author: "maya", viewer: "jules", status: "kept", phase: "unlocked", participants: all, hiddenBy: ["theo"], expected: false },
  { name: "hidden by a subject: the hider can't see either", author: "maya", viewer: "theo", status: "kept", phase: "unlocked", participants: all, hiddenBy: ["theo"], expected: false },
  { name: "viewer blocked author: invisible", author: "maya", viewer: "theo", status: "kept", phase: "unlocked", participants: all, blocks: [["theo", "maya"]], expected: false },
  { name: "author blocked viewer: invisible (mutual)", author: "maya", viewer: "theo", status: "kept", phase: "unlocked", participants: all, blocks: [["maya", "theo"]], expected: false },
  { name: "unrelated block doesn't matter", author: "maya", viewer: "theo", status: "kept", phase: "unlocked", participants: all, blocks: [["jules", "maya"]], expected: true },
  { name: "guest participant sees after unlock", author: "maya", viewer: "sam", status: "kept", phase: "unlocked", participants: [...all, "sam"], expected: true },
];
