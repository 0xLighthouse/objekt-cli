import { MIME_MAP } from "@objekt/shared";
import { Cli, z } from "incur";

import { getApiUrl } from "../api";
import { estimateUpload } from "../estimate";
import { getWalletAddress, signUpload } from "../sign";
import { createPaymentFetch, extractPaymentReceipt } from "../x402";

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
    testnet: z.boolean().default(false).describe("Use testnet"),
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
  description: "Upload a file",
  args: z.object({
    file: z.string().describe("Path to file"),
  }),
  options: z.object({
    key: z.string().optional().describe("Storage key (defaults to filename)"),
    ows: z.string().optional().describe("OWS wallet name"),
    network: z
      .enum(["mainnet", "sepolia"])
      .default("mainnet")
      .describe("Network"),
    testnet: z.boolean().default(false).describe("Use testnet"),
    api: z.string().optional().describe("API base URL"),
    storage: z
      .enum(["cdn", "arweave", "ipfs"])
      .default("ipfs")
      .describe("Storage backend"),
    estimate: z
      .boolean()
      .optional()
      .describe("Show cost estimate without uploading"),
  }),
  alias: { key: "k", ows: "w" },
  output: z.object({
    name: z.string(),
    kind: z.string(),
    bytes: z.number(),
    uri: z.string().optional(),
    permalink: z.string(),
    payment: z
      .object({
        txHash: z.string(),
        explorerUrl: z.string(),
      })
      .optional(),
  }),
  examples: [
    {
      args: { file: "./image.png" },
      options: { ows: "my-wallet" },
      description: "Upload to CDN (free, 90-day cache)",
    },
    {
      args: { file: "./image.png" },
      options: { ows: "my-wallet", storage: "ipfs" },
      description: "Pin to IPFS (paid, 12-month guarantee)",
    },
    {
      args: { file: "./image.png" },
      options: { ows: "my-wallet", storage: "arweave" },
      description: "Upload to Arweave (paid, permanent)",
    },
    {
      args: { file: "./image.png" },
      options: { ows: "my-wallet", storage: "ipfs", testnet: true },
      description: "Test upload on Base Sepolia (USDC testnet)",
    },
  ],
  async run(c) {
    const { readFile } = await import("node:fs/promises");
    const { basename, extname } = await import("node:path");
    const { stat } = await import("node:fs/promises");

    const resolvedKey = c.options.key ?? basename(c.args.file);

    if (c.options.estimate) {
      const fileInfo = await stat(c.args.file);
      return estimateUpload({
        ...c.options,
        file: c.args.file,
        bytes: fileInfo.size,
      });
    }

    if (!c.options.ows) {
      return c.error({
        code: "NO_WALLET",
        message:
          "Provide --ows <wallet> — uploads are signed with your wallet to prove ownership",
        exitCode: 1,
      });
    }

    const { ows } = c.options;
    const buffer = await readFile(c.args.file);
    const bytes = new Uint8Array(buffer);
    const ext = extname(c.args.file).toLowerCase();

    const mime = MIME_MAP[ext];
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
      uploadType: resolvedKey,
      bytes,
    });

    const url = `${getApiUrl(c.options)}/${resolvedKey}`;
    const tierParam =
      c.options.storage !== "cdn" ? `?storage=${c.options.storage}` : "";
    const doFetch =
      c.options.storage !== "cdn"
        ? createPaymentFetch(ows, c.options.testnet)
        : fetch;

    let res: Response;
    try {
      res = await doFetch(`${url}${tierParam}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiry, dataURL, sig, unverifiedAddress }),
      });
    } catch (e) {
      return c.error({ code: "UPLOAD_FAILED", message: e instanceof Error ? e.message : String(e), exitCode: 1 });
    }

    if (!res.ok) {
      let message = await res.text();
      if (res.status === 402) {
        const encoded = res.headers.get("payment-required");
        if (encoded) {
          try {
            const decoded = JSON.parse(atob(encoded));
            message = decoded.error ?? message;
          } catch {}
        }
      }
      return c.error({ code: "UPLOAD_FAILED", message, exitCode: 1 });
    }

    const data = await res.json();
    const payment = extractPaymentReceipt(res);
    return payment ? { ...data, payment } : data;
  },
});

export { get, put };
