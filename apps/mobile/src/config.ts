// Only public values reach the bundle (CLAUDE.md rule 7, doctor-enforced).
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "http://127.0.0.1:8788").replace(/\/$/, "");
export const MOCK = (process.env.EXPO_PUBLIC_MOCK ?? "1") === "1";
