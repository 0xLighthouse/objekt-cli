import { MEDIA_TYPES } from "@objekt/shared";
import { Cli, z } from "incur";

import { getEnsApiUrl } from "../api";
import { readMediaFile } from "../file";
import { signUpload } from "../sign";

const mediaType = MEDIA_TYPES.attachment;

const attachment = Cli.create("attachment", {
  description: "Manage ENS name attachments",
});

attachment.command("get", {
  description: "Download an attachment",
  args: z.object({
    name: z.string().describe("ENS name (e.g. nick.eth)"),
    id: z.string().describe("Attachment ID"),
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
    id: z.string(),
    contentType: z.string(),
    size: z.number().describe("Size in bytes"),
    saved: z.string().optional().describe("File path if saved"),
  }),
  examples: [
    {
      args: { name: "nick.eth", id: "abc123" },
      description: "Get attachment",
    },
  ],
  async run(c) {
    const url = `${getEnsApiUrl(c.options)}/${c.args.name}/attachments/${c.args.id}`;
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
      id: c.args.id,
      contentType,
      size: buffer.byteLength,
      saved: c.options.output,
    };
  },
});

attachment.command("upload", {
  description: "Upload an attachment",
  args: z.object({
    name: z.string().describe("ENS name (e.g. nick.eth)"),
  }),
  options: z.object({
    file: z.string().describe("Path to file"),
    ows: z.string().describe("OWS wallet name"),
    network: z
      .enum(["mainnet", "sepolia"])
      .default("mainnet")
      .describe("Network"),
    ensApi: z.string().optional().describe("ENS API base URL"),
    tier: z
      .enum(["cached", "permanent"])
      .default("cached")
      .describe("Storage tier"),
  }),
  alias: { file: "f", ows: "w" },
  output: z.object({
    message: z.string(),
    id: z.string().describe("Attachment content hash ID"),
    storage: z.string(),
    arweave: z.string().optional(),
  }),
  examples: [
    {
      args: { name: "nick.eth" },
      options: { file: "./doc.pdf", ows: "my-wallet" },
      description: "Upload an attachment",
    },
  ],
  async run(c) {
    const { dataURL, bytes } = await readMediaFile(c.options.file, mediaType);

    const { sig, expiry, unverifiedAddress } = signUpload({
      wallet: c.options.ows,
      name: c.args.name,
      uploadType: mediaType.uploadType,
      bytes,
    });

    const url = `${getEnsApiUrl(c.options)}/${c.args.name}/attachments`;
    const tierParam = c.options.tier === "permanent" ? "?tier=permanent" : "";

    const res = await fetch(`${url}${tierParam}`, {
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

export default attachment;
