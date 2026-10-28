import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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

describe("metadata hidden in progressive scans and trailers (code review M1 #1)", () => {
  const seg = (marker: number, payload: number[]) => [
    0xff,
    marker,
    ((payload.length + 2) >> 8) & 0xff,
    (payload.length + 2) & 0xff,
    ...payload,
  ];
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
  const sos = seg(0xda, [1, 1, 0, 0, 63, 0]);
  it("drops an APP1 that sits between two scans", () => {
    const jpeg = Uint8Array.from([
      0xff,
      0xd8,
      ...seg(0xe0, ascii("JFIF\0")),
      ...sos,
      0x11,
      0xff,
      0x00,
      0x22,
      ...seg(0xe1, ascii("Exif\0\0GPS=44.97,-93.26")),
      ...sos,
      0x33,
      0xff,
      0xd0,
      0x44,
      0xff,
      0xd9,
    ]);
    const out = Buffer.from(stripJpeg(jpeg)).toString("latin1");
    expect(out).not.toContain("GPS");
    expect(out).toContain("\x11\xff\x00\x22");
    expect(out).toContain("\x33\xff\xd0\x44");
    expect(out.endsWith("\xff\xd9")).toBe(true);
  });
  it("drops anything appended after EOI (gain maps, motion-photo video)", () => {
    const trailer = [
      0xff,
      0xd8,
      ...seg(0xe1, ascii("Exif\0\0GPS=44.97,-93.26")),
      0xff,
      0xd9,
      ...ascii("ftypmp42 video"),
    ];
    const jpeg = Uint8Array.from([0xff, 0xd8, ...sos, 0x55, 0xff, 0xd9, ...trailer]);
    const out = Buffer.from(stripJpeg(jpeg)).toString("latin1");
    expect(out).not.toContain("GPS");
    expect(out).not.toContain("ftyp");
    expect(out.length).toBe(2 + sos.length + 1 + 2);
  });
  it("adds a missing EOI", () => {
    const jpeg = Uint8Array.from([0xff, 0xd8, ...sos, 0x66, 0x77]);
    expect(Buffer.from(stripJpeg(jpeg)).toString("latin1").endsWith("\xff\xd9")).toBe(true);
  });
});

describe("real photos survive stripping", () => {
  const dir = join(dirname(fileURLToPath(import.meta.url)), "../../../.data/demo-photos");
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".jpg")) : [];
  it.skipIf(files.length === 0)(
    "every generated JPEG keeps its frame + scan data and still ends in EOI",
    () => {
      for (const f of files) {
        const input = new Uint8Array(readFileSync(join(dir, f)));
        const out = stripJpeg(input);
        expect(imageSize(out, "image/jpeg")).toEqual(imageSize(input, "image/jpeg"));
        expect(out.length).toBeGreaterThan(input.length * 0.95);
        expect(out.at(-2)).toBe(0xff);
        expect(out.at(-1)).toBe(0xd9);
      }
    },
  );
});
