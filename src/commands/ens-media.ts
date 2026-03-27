import type { MediaTypeConfig } from "@objekt/shared";
import { Cli, z } from "incur";

import { getEnsApiUrl } from "../api";
import { estimateUpload } from "../estimate";
import { readMediaFile } from "../file";
import { signUpload } from "../sign";
import { createPaymentFetch, extractPaymentReceipt } from "../x402";

export function createEnsMediaCommand({
  name,
  description,
  mediaType,
  pathSuffix,
}: {
  name: string;
  description: string;
  mediaType: MediaTypeConfig;
  pathSuffix: string;
}) {
  const cli = Cli.create(name, { description });

  cli.command("get", {
    description: `Download ${name}`,
    args: z.object({
      name: z.string().describe("ENS name (e.g. nick.eth)"),
    }),
    options: z.object({
      network: z
        .enum(["mainnet", "sepolia"])
        .default("mainnet")
        .describe("Network"),
      ensApi: z.string().optional().describe("ENS API base URL"),
      output: z.string().optional().describe("Save to file path"),
    }),
    output: z.object({
      name: z.string(),
      contentType: z.string(),
      size: z.number().describe("Size in bytes"),
      saved: z.string().optional().describe("File path if saved"),
    }),
    async run(c) {
      const url = `${getEnsApiUrl(c.options)}/${c.args.name}${pathSuffix}`;
      const res = await fetch(url);

      if (!res.ok) {
        const text = await res.text();
        return c.error({ code: "NOT_FOUND", message: text, exitCode: 1 });
      }

      const contentType = res.headers.get("content-type") || "unknown";
      const buffer = Buffer.from(await res.arrayBuffer());

      if (c.options.output) {
        const { writeFile } = await import("node:fs/promises");
        await writeFile(c.options.output, buffer);
      }

      return {
        name: c.args.name,
        contentType,
        size: buffer.byteLength,
        saved: c.options.output,
      };
    },
  });

  cli.command("upload", {
    description: `Upload ${name}`,
    args: z.object({
      name: z.string().describe("ENS name (e.g. nick.eth)"),
    }),
    options: z.object({
      file: z.string().describe("Path to image file"),
      ows: z
        .string()
        .optional()
        .describe("OWS wallet name (required unless --estimate)"),
      network: z
        .enum(["mainnet", "sepolia"])
        .default("mainnet")
        .describe("Network"),
      ensApi: z.string().optional().describe("ENS API base URL"),
      storage: z
        .enum(["cdn", "arweave", "ipfs"])
        .default("cdn")
        .describe(
          "Storage: cached (free), arweave (permanent, paid), ipfs (12mo, paid)",
        ),
      estimate: z
        .boolean()
        .optional()
        .describe("Show cost estimate without uploading. No wallet needed."),
    }),
    alias: { file: "f", ows: "w" },
    async run(c) {
      const { bytes, dataURL } = await readMediaFile(c.options.file, mediaType);

      if (c.options.estimate) {
        return estimateUpload({ ...c.options, bytes: bytes.byteLength });
      }

      if (!c.options.ows) {
        return c.error({
          code: "NO_WALLET",
          message: "Provide --ows <wallet> for signing",
          exitCode: 1,
        });
      }

      const { sig, expiry, unverifiedAddress } = signUpload({
        wallet: c.options.ows,
        name: c.args.name,
        uploadType: mediaType.uploadType,
        bytes,
      });

      const url = `${getEnsApiUrl(c.options)}/${c.args.name}${pathSuffix}`;
      const storageParam =
        c.options.storage !== "cdn" ? `?storage=${c.options.storage}` : "";
      const doFetch =
        c.options.storage !== "cdn"
          ? createPaymentFetch(c.options.ows)
          : fetch;

      const res = await doFetch(`${url}${storageParam}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiry, dataURL, sig, unverifiedAddress }),
      });

      if (!res.ok) {
        const text = await res.text();
        return c.error({
          code: "UPLOAD_FAILED",
          message: `${res.status}: ${text}`,
          exitCode: 1,
        });
      }

      const data = await res.json();
      const payment = extractPaymentReceipt(res);
      return payment ? { ...data, payment } : data;
    },
  });

  return cli;
}
