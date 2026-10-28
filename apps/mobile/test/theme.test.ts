import { TARGETS } from "@nightcap/core";
import { contrast, scaleFor, TEXT_PAIRS } from "../src/theme";

describe("design tokens (ADR 0008, DRUNK_UX)", () => {
  it.each(TEXT_PAIRS)("$name meets $min:1", ({ fg, bg, min }) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(min);
  });
  it("night mode scales targets up to the drunk-proof minimums", () => {
    expect(scaleFor(true).target).toBeGreaterThanOrEqual(TARGETS.nightMin);
    expect(scaleFor(true).primary).toBeGreaterThanOrEqual(TARGETS.nightPrimary);
    expect(scaleFor(false).target).toBeGreaterThanOrEqual(44);
    expect(scaleFor(true).type).toBeGreaterThan(scaleFor(false).type);
  });
});
