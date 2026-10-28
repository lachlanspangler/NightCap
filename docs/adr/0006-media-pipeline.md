# ADR 0006: Media pipeline: upload via API, EXIF stripped, signed short-lived URLs

**Status:** accepted · 2026-10-28

## Context
No location leaks, private by default, zero egress at scale, and it has to work offline in mock mode.

## Decision
- Client takes the photo (`exif: false`, quality 0.8, max 2048px) and POSTs multipart to `POST /nights/:id/shots`.
- The API validates (JPEG/PNG/HEIC magic bytes, ≤ 12 MB, roll limit, phase = live, membership via RLS),
  **strips metadata** (JPEG: drops APP1 Exif/XMP, APP2–APP15 except ICC APP2, and COM. PNG: drops
  tEXt/zTXt/iTXt/eXIf chunks), then writes to `MediaStore` (`LocalDiskStore` in mock, `R2Store` in prod).
- Reads: the album endpoint returns `url = /media/:shotId?v=<viewer>&exp=<unix>&sig=<hmac>` only
  for shots RLS lets the viewer see. `GET /media/:id` checks the HMAC (with `MEDIA_URL_SECRET`) and
  expiry (10 min). No auth header is needed, so `expo-image` caches it.
- Hard deletes remove the media object. Discarded shots' media is deleted at the unlock.

## Consequences
- Uploads go through the API (bandwidth cost at scale). The prod plan is a presigned PUT to a
  quarantine bucket plus a strip worker.
- HEIC isn't stripped by our parser, so the client always sends JPEG (expo-camera's default).
  HEIC uploads are rejected.
