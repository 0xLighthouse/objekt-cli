import { MEDIA_TYPES } from "@objekt/shared";
import { Cli, z } from "incur";

import { getEnsApiUrl } from "../api";
import { estimateUpload } from "../estimate";
import { readMediaFile } from "../file";
import { signUpload } from "../sign";
import { createPaymentFetch } from "../x402";

const mediaType = MEDIA_TYPES.cover;

const header = Cli.create("header", {
  description: "Manage ENS header/cover images",
});

header.command("get", {
  description: "Download a header image",
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
  examples: [
    { args: { name: "nick.eth" }, description: "Get header for nick.eth" },
  ],
  async run(c) {
    const url = `${getEnsApiUrl(c.options)}/${c.args.name}/h`;
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

header.command("upload", {
  description: "Upload a header/cover image",
  args: z.object({
    name: z.string().describe("ENS name (e.g. nick.eth)"),
  }),
  options: z.object({
    file: z.string().describe("Path to image file"),
    ows: z.string().optional().describe("OWS wallet name"),
    network: z
      .enum(["mainnet", "sepolia"])
      .default("mainnet")
      .describe("Network"),
    ensApi: z.string().optional().describe("ENS API base URL"),
    storage: z
      .enum(["cached", "arweave", "ipfs"])
      .default("cached")
      .describe("Storage backend"),
    estimate: z.boolean().optional().describe("Show cost estimate without uploading"),
  }),
  alias: { file: "f", ows: "w" },
  examples: [
    {
      args: { name: "nick.eth" },
      options: { file: "./header.jpg", ows: "my-wallet" },
      description: "Upload header image",
    },
  ],
  async run(c) {
    const { bytes } = await readMediaFile(c.options.file, mediaType);

    if (c.options.estimate) {
      return estimateUpload({ ...c.options, bytes: bytes.byteLength });
    }

    if (!c.options.ows) {
      return c.error({ code: "NO_WALLET", message: "Provide --ows <wallet> for signing", exitCode: 1 });
    }

    const { dataURL } = await readMediaFile(c.options.file, mediaType);

    const { sig, expiry, unverifiedAddress } = signUpload({
      wallet: c.options.ows,
      name: c.args.name,
      uploadType: mediaType.uploadType,
      bytes,
    });

    const url = `${getEnsApiUrl(c.options)}/${c.args.name}/h`;
    const tierParam = c.options.storage !== "cached" ? `?tier=${c.options.storage}` : "";
    const doFetch = c.options.storage !== "cached" ? createPaymentFetch(c.options.ows) : fetch;

    const res = await doFetch(`${url}${tierParam}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expiry, dataURL, sig, unverifiedAddress }),
    });

    if (!res.ok) {
      const text = await res.text();
      return c.error({ code: "UPLOAD_FAILED", message: text, exitCode: 1 });
    }

    return res.json();
  },
});

export default header;
