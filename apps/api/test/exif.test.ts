import { describe, expect, it } from "vitest";
import { imageSize, sniffMime, stripJpeg, stripMetadata, stripPng } from "../src/media/exif";
import { jpegWithGps } from "./helpers";

const text = (b: Uint8Array) => Buffer.from(b).toString("latin1");

describe("metadata stripping (no location leaks)", () => {
  it("removes EXIF GPS, XMP, IPTC and comments from JPEGs, keeps JFIF + ICC + image data", () => {
    const input = jpegWithGps();
    expect(text(input)).toContain("GPSLatitude");
    const out = stripJpeg(input);
    const s = text(out);
    for (const leak of ["GPSLatitude", "Exif", "xmpmeta", "Minneapolis", "8BIM", "Maya's apartment"])
      expect(s).not.toContain(leak);
    expect(s).toContain("JFIF");
    expect(s).toContain("ICC_PROFILE");
    expect(out[0]).toBe(0xff);
    expect(out[1]).toBe(0xd8);
    expect(out.at(-2)).toBe(0xff);
    expect(out.at(-1)).toBe(0xd9);
    // entropy-coded data (with its 0xFF00 stuffing) is copied untouched
    expect(s).toContain("\x12\x34\xff\x00\x56");
  });
  it("reads the size from SOF", () => {
    expect(imageSize(stripJpeg(jpegWithGps()), "image/jpeg")).toEqual({ width: 32, height: 16 });
  });
  it("strips PNG text/eXIf/time chunks", () => {
    const chunk = (type: string, data: number[]) => {
      const len = [0, 0, 0, data.length];
      return [...len, ...[...type].map((c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0];
    };
    const ihdr = chunk("IHDR", [0, 0, 0, 4, 0, 0, 0, 3, 8, 2, 0, 0, 0]);
    const textC = chunk("tEXt", [...Buffer.from("Location\0Dinkytown")]);
    const exif = chunk("eXIf", [...Buffer.from("GPS")]);
    const idat = chunk("IDAT", [1, 2, 3]);
    const iend = chunk("IEND", []);
    const png = Uint8Array.from([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a,
      ...ihdr,
      ...textC,
      ...exif,
      ...idat,
      ...iend,
    ]);
    const out = stripPng(png);
    expect(text(out)).not.toContain("Dinkytown");
    expect(text(out)).not.toContain("eXIf");
    expect(text(out)).toContain("IDAT");
    expect(imageSize(out, "image/png")).toEqual({ width: 4, height: 3 });
  });
  it("rejects non-images and truncated JPEGs", () => {
    expect(sniffMime(Buffer.from("GIF89a"))).toBeNull();
    expect(() => stripMetadata(Buffer.from("<svg/>"))).toThrow();
    expect(() => stripJpeg(jpegWithGps().subarray(0, 30))).toThrow();
  });
});
