import { Cli, z } from "incur";

import { getApiUrl } from "../api";
import { estimateUpload } from "../estimate";
import { getWalletAddress, signUpload } from "../sign";

const get = Cli.create("get", {
  description: "Get media by key",
  args: z.object({
    key: z.string().describe("Media key (e.g. proposals/0x.../media/abc)"),
  }),
  options: z.object({
    network: z
      .enum(["mainnet", "sepolia"])
      .default("mainnet")
      .describe("Network"),
    api: z.string().optional().describe("API base URL"),
    output: z.string().optional().describe("Save to file path"),
  }),
  output: z.object({
    key: z.string(),
    contentType: z.string(),
    size: z.number().describe("Size in bytes"),
    saved: z.string().optional().describe("File path if saved"),
  }),
  examples: [
    {
      args: { key: "proposals/0x1234/media/abc123" },
      description: "Get proposal media",
    },
  ],
  async run(c) {
    const url = `${getApiUrl(c.options)}/${c.args.key}`;
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
      key: c.args.key,
      contentType,
      size: buffer.byteLength,
      saved: c.options.output,
    };
  },
});

const put = Cli.create("put", {
  description: "Upload media by key",
  args: z.object({
    key: z.string().describe("Media key"),
  }),
  options: z.object({
    file: z.string().describe("Path to file"),
    ows: z.string().optional().describe("OWS wallet name"),
    network: z
      .enum(["mainnet", "sepolia"])
      .default("mainnet")
      .describe("Network"),
    api: z.string().optional().describe("API base URL"),
    storage: z
      .enum(["cached", "arweave", "ipfs"])
      .default("cached")
      .describe("Storage backend"),
    estimate: z.boolean().optional().describe("Show cost estimate without uploading"),
  }),
  alias: { file: "f", ows: "w" },
  output: z.object({
    message: z.string(),
    id: z.string().optional(),
    url: z.string().optional(),
    storage: z.string(),
    arweave: z.string().optional(),
  }),
  examples: [
    {
      args: { key: "proposals/media" },
      options: { file: "./image.png", ows: "my-wallet" },
      description: "Upload proposal media",
    },
  ],
  async run(c) {
    const { readFile } = await import("node:fs/promises");
    const { extname } = await import("node:path");
    const { stat } = await import("node:fs/promises");

    if (c.options.estimate) {
      const fileInfo = await stat(c.options.file);
      return estimateUpload({ ...c.options, bytes: fileInfo.size });
    }

    if (!c.options.ows) {
      return c.error({ code: "NO_WALLET", message: "Provide --ows <wallet> for signing", exitCode: 1 });
    }

    const buffer = await readFile(c.options.file);
    const bytes = new Uint8Array(buffer);
    const ext = extname(c.options.file).toLowerCase();

    const mimeMap: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
      ".gif": "image/gif",
      ".svg": "image/svg+xml",
      ".pdf": "application/pdf",
    };
    const mime = mimeMap[ext];
    if (!mime) {
      return c.error({
        code: "UNSUPPORTED_TYPE",
        message: `Unsupported file extension: ${ext}`,
        exitCode: 1,
      });
    }

    const dataURL = `data:${mime};base64,${buffer.toString("base64")}`;

    const { getAddress } = await import("viem");
    const address = getAddress(getWalletAddress(c.options.ows));

    const { sig, expiry, unverifiedAddress } = signUpload({
      wallet: c.options.ows,
      name: address,
      uploadType: c.args.key,
      bytes,
    });

    const url = `${getApiUrl(c.options)}/${c.args.key}`;
    const tierParam = c.options.storage !== "cached" ? `?tier=${c.options.storage}` : "";

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

export { get, put };
