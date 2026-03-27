import { readFile } from "node:fs/promises";
import { extname } from "node:path";

import { MIME_MAP, type MediaTypeConfig } from "@objekt/shared";

export async function readMediaFile(
  filePath: string,
  mediaType: MediaTypeConfig,
): Promise<{ dataURL: string; bytes: Uint8Array; mime: string }> {
  const ext = extname(filePath).toLowerCase();
  const mime = MIME_MAP[ext];

  if (!mime) {
    throw new Error(
      `Unsupported file extension: ${ext}. Supported: ${Object.keys(MIME_MAP).join(", ")}`,
    );
  }

  if (!mediaType.allowedMimeTypes.includes(mime)) {
    throw new Error(
      `${ext} files are not allowed for ${mediaType.key}. Allowed: ${mediaType.allowedMimeTypes.join(", ")}`,
    );
  }

  const buffer = await readFile(filePath);
  const bytes = new Uint8Array(buffer);

  if (bytes.byteLength > mediaType.maxSize) {
    const maxKB = Math.round(mediaType.maxSize / 1024);
    const fileKB = Math.round(bytes.byteLength / 1024);
    throw new Error(
      `File is ${fileKB}KB, exceeds ${maxKB}KB limit for ${mediaType.key}`,
    );
  }

  const base64 = buffer.toString("base64");
  const dataURL = `data:${mime};base64,${base64}`;

  return { dataURL, bytes, mime };
}
