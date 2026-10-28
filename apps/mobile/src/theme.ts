// Design tokens (ADR 0008). Night = darkroom (live + developing). Dawn = an unlocked album.
// theme.test.ts enforces contrast: night text ≥ 7:1 (AAA, DRUNK_UX), dawn text ≥ 4.5:1.
import { TARGETS } from "@nightcap/core";

export const night = {
  bg: "#0C0A14",
  surface: "#17131F",
  surface2: "#221C2E",
  line: "#342B47",
  text: "#F7EFE2",
  textDim: "#C4BAD0",
  textFaint: "#A79DB6",
  amber: "#FFB44D",
  amberDeep: "#E8892B",
  amberInk: "#1A1006", // text on amber
  safelight: "#FF6A47",
  plum: "#9B7BE0",
  danger: "#FF7A7A",
  success: "#7BE3B5",
} as const;

export const dawn = {
  bg: "#FFF5EE",
  surface: "#FFFFFF",
  surface2: "#FBE9E1",
  line: "#F0D5CB",
  text: "#24182A",
  textDim: "#5E4A60",
  textFaint: "#6F5B71",
  accent: "#C2412F",
  accentInk: "#FFFFFF",
  gradient: ["#FFD3B4", "#FFB6C9", "#D9C5F6"] as const,
} as const;

export const fonts = {
  display: "Fraunces_700Bold",
  displaySemi: "Fraunces_600SemiBold",
  displayItalic: "Fraunces_600SemiBold_Italic",
  body: "Inter_400Regular",
  bodySemi: "Inter_600SemiBold",
  bodyBold: "Inter_700Bold",
  bodyBlack: "Inter_800ExtraBold",
} as const;

export interface Scale {
  nightMode: boolean;
  /** Minimum height for any tappable. */
  target: number;
  /** Primary action height. */
  primary: number;
  /** Multiplier for type. */
  type: number;
  gap: number;
}

export function scaleFor(nightMode: boolean): Scale {
  return nightMode
    ? { nightMode, target: TARGETS.nightMin, primary: TARGETS.nightPrimary, type: 1.12, gap: TARGETS.spacing }
    : { nightMode, target: TARGETS.dayMin, primary: 64, type: 1, gap: 12 };
}

export const type = {
  hero: 44,
  title: 30,
  heading: 22,
  body: 17,
  label: 15,
  small: 13,
  counter: 64,
  code: 56,
} as const;

// --- contrast (WCAG 2.x) ---------------------------------------------------------------
function channel(c: number) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
export function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}
export function contrast(a: string, b: string) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Every text-on-background pair the app uses. */
export const TEXT_PAIRS: { name: string; fg: string; bg: string; min: number }[] = [
  ...(["bg", "surface", "surface2"] as const).flatMap((bg) =>
    (["text", "textDim", "textFaint"] as const).map((fg) => ({
      name: `night ${fg} on ${bg}`,
      fg: night[fg],
      bg: night[bg],
      min: 7,
    })),
  ),
  { name: "night amberInk on amber", fg: night.amberInk, bg: night.amber, min: 7 },
  { name: "night amber on bg", fg: night.amber, bg: night.bg, min: 7 },
  ...(["bg", "surface", "surface2"] as const).flatMap((bg) =>
    (["text", "textDim", "textFaint"] as const).map((fg) => ({
      name: `dawn ${fg} on ${bg}`,
      fg: dawn[fg],
      bg: dawn[bg],
      min: 4.5,
    })),
  ),
  { name: "dawn accentInk on accent", fg: dawn.accentInk, bg: dawn.accent, min: 4.5 },
  ...dawn.gradient.map((g, i) => ({ name: `dawn text on gradient ${i}`, fg: dawn.text, bg: g, min: 4.5 })),
];
