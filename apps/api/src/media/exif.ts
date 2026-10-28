// Metadata stripping (PRIVACY_SAFETY "No location leaks", ADR 0006). Pure functions over bytes.
// JPEG: keep SOI, SOFn/DHT/DQT/DRI/SOS + scan data, APP0 (JFIF) and APP2 ICC profiles; drop APP1
// (Exif, XMP: GPS lives here), APP3–APP15 (incl. APP13 IPTC/Photoshop) and COM.
// PNG: drop tEXt, zTXt, iTXt, eXIf, tIME chunks.

export type ImageMime = "image/jpeg" | "image/png";

export function sniffMime(bytes: Uint8Array): ImageMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((b, i) => bytes[i] === b)) return "image/png";
  return null;
}

export class ImageError extends Error {}

function isIccApp2(bytes: Uint8Array, start: number, len: number) {
  const sig = "ICC_PROFILE";
  if (len < sig.length + 2) return false;
  for (let i = 0; i < sig.length; i++) if (bytes[start + 4 + i] !== sig.charCodeAt(i)) return false;
  return true;
}

/**
 * Walks every marker segment of the file, including segments between progressive scans, and
 * stops at the first EOI: anything appended after it (iPhone gain-map MPF images with their own
 * Exif, Pixel motion-photo MP4 trailers) is dropped (code review M1 #1).
 */
export function stripJpeg(bytes: Uint8Array): Uint8Array {
  if (sniffMime(bytes) !== "image/jpeg") throw new ImageError("not a jpeg");
  const out: Uint8Array[] = [bytes.subarray(0, 2)];
  let i = 2;
  let sawEoi = false;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) throw new ImageError("bad marker");
    while (bytes[i + 1] === 0xff) i++; // fill bytes
    const marker = bytes[i + 1];
    if (marker === undefined) break;
    if (marker === 0xd9) {
      out.push(bytes.subarray(i, i + 2));
      sawEoi = true;
      break; // drop any trailer
    }
    if (marker >= 0xd0 && marker <= 0xd7) {
      out.push(bytes.subarray(i, i + 2));
      i += 2;
      continue;
    }
    if (i + 4 > bytes.length) throw new ImageError("truncated segment");
    const len = (bytes[i + 2]! << 8) | bytes[i + 3]!;
    if (len < 2 || i + 2 + len > bytes.length) throw new ImageError("bad segment length");
    const segEnd = i + 2 + len;
    if (marker === 0xda) {
      // SOS header, then entropy-coded data up to the next real marker (not FF00 / RSTn / fill).
      let j = segEnd;
      while (j < bytes.length) {
        if (bytes[j] === 0xff) {
          const next = bytes[j + 1];
          if (next === 0x00 || (next !== undefined && next >= 0xd0 && next <= 0xd7) || next === 0xff) {
            j += next === 0xff ? 1 : 2;
            continue;
          }
          break;
        }
        j++;
      }
      out.push(bytes.subarray(i, j));
      i = j;
      continue;
    }
    const isApp = marker >= 0xe0 && marker <= 0xef;
    const keep = !isApp ? marker !== 0xfe : marker === 0xe0 || (marker === 0xe2 && isIccApp2(bytes, i, len));
    if (keep) out.push(bytes.subarray(i, segEnd));
    i = segEnd;
  }
  if (!sawEoi) out.push(Uint8Array.from([0xff, 0xd9]));
  const total = out.reduce((n, p) => n + p.length, 0);
  const res = new Uint8Array(total);
  let o = 0;
  for (const p of out) {
    res.set(p, o);
    o += p.length;
  }
  return res;
}

const PNG_DROP = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);

export function stripPng(bytes: Uint8Array): Uint8Array {
  if (sniffMime(bytes) !== "image/png") throw new ImageError("not a png");
  const out: Uint8Array[] = [bytes.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= bytes.length) {
    const len = ((bytes[i]! << 24) | (bytes[i + 1]! << 16) | (bytes[i + 2]! << 8) | bytes[i + 3]!) >>> 0;
    const type = String.fromCharCode(bytes[i + 4]!, bytes[i + 5]!, bytes[i + 6]!, bytes[i + 7]!);
    const end = i + 12 + len;
    if (end > bytes.length) throw new ImageError("truncated chunk");
    if (!PNG_DROP.has(type)) out.push(bytes.subarray(i, end));
    i = end;
    if (type === "IEND") break;
  }
  const total = out.reduce((n, p) => n + p.length, 0);
  const res = new Uint8Array(total);
  let o = 0;
  for (const p of out) {
    res.set(p, o);
    o += p.length;
  }
  return res;
}

/** Read width/height without decoding. */
export function imageSize(bytes: Uint8Array, mime: ImageMime): { width: number; height: number } | null {
  if (mime === "image/png") {
    if (bytes.length < 24) return null;
    const r = (k: number) =>
      ((bytes[k]! << 24) | (bytes[k + 1]! << 16) | (bytes[k + 2]! << 8) | bytes[k + 3]!) >>> 0;
    return { width: r(16), height: r(20) };
  }
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1]!;
    const len = (bytes[i + 2]! << 8) | bytes[i + 3]!;
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      return { height: (bytes[i + 5]! << 8) | bytes[i + 6]!, width: (bytes[i + 7]! << 8) | bytes[i + 8]! };
    }
    i += 2 + len;
  }
  return null;
}

export function stripMetadata(bytes: Uint8Array): { bytes: Uint8Array; mime: ImageMime } {
  const mime = sniffMime(bytes);
  if (!mime) throw new ImageError("unsupported image type (JPEG or PNG only)");
  return { bytes: mime === "image/jpeg" ? stripJpeg(bytes) : stripPng(bytes), mime };
}
