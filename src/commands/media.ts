import { MIME_MAP } from "@objekt/shared";
import {
  ENCRYPTED_MIME,
  generateViewKey,
  isEncrypted,
  Namespace,
  parseViewKey,
} from "@objekt.sh/ecies";
import { Cli, z } from "incur";

import { getApiUrl } from "../api";
import { createLogger, formatSize } from "../log";
import {
  decryptEnvelope,
  deriveAllEncryptionKeypairs,
  deriveEncryptionKeypair,
  encryptForRecipients,
  resolveRecipient,
} from "../crypto";
import { estimateUpload } from "../estimate";
import { getWalletAddress, signUpload } from "../sign";
import { createPaymentFetch, extractPaymentReceipt } from "../x402";

const get = Cli.create("get", {
  description: "Get media by key",
  args: z.object({
    key: z.string().describe("Media key (e.g. proposals/0x.../media/abc)"),
  }),
  options: z.object({
    ows: z
      .string()
      .optional()
      .describe("OWS wallet name (required to decrypt encrypted content)"),
    viewKey: z
      .string()
      .optional()
      .describe("View key to decrypt (objekt_vk_...)"),
    network: z
      .enum(["mainnet", "sepolia"])
      .default("mainnet")
      .describe("Network"),
    testnet: z.boolean().default(false).describe("Use testnet"),
    api: z.string().optional().describe("API base URL"),
    output: z.string().optional().describe("Save to file path"),
  }),
  alias: { ows: "w" },
  output: z.object({
    key: z.string(),
    contentType: z.string(),
    size: z.number().describe("Size in bytes"),
    encrypted: z.boolean().optional().describe("Content was encrypted"),
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

    let contentType = res.headers.get("content-type") || "unknown";
    let buffer = Buffer.from(await res.arrayBuffer());
    let wasEncrypted = false;

    const bytes = new Uint8Array(buffer);
    if (isEncrypted(bytes)) {
      if (!c.options.ows && !c.options.viewKey) {
        return c.error({
          code: "ENCRYPTED",
          message:
            "Content is encrypted. Provide --ows <wallet> or --view-key to decrypt.",
          exitCode: 1,
        });
      }
      const keypairs = c.options.viewKey
        ? [parseViewKey(c.options.viewKey)]
        : deriveAllEncryptionKeypairs(c.options.ows!);
      const { plaintext, mime } = decryptEnvelope(bytes, keypairs);
      buffer = Buffer.from(plaintext);
      if (mime) contentType = mime;
      wasEncrypted = true;
    }

    if (c.options.output) {
      const { writeFile } = await import("node:fs/promises");
      await writeFile(c.options.output, buffer);
    }

    return {
      key: c.args.key,
      contentType,
      size: buffer.byteLength,
      encrypted: wasEncrypted || undefined,
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
      .enum(["cdn", "arweave", "ipfs"], {
        required_error: "--storage is required. Options: cdn, arweave, ipfs",
      })
      .describe("Storage backend (cdn, arweave, or ipfs)"),
    encrypt: z
      .boolean()
      .default(false)
      .describe("Encrypt content (E2E, client-side)"),
    encryptFor: z
      .array(z.string())
      .optional()
      .describe("Recipient public keys or ENS names to encrypt for"),
    viewKey: z
      .boolean()
      .default(false)
      .describe(
        "Generate a shareable view key for decryption without a wallet",
      ),
    estimate: z
      .boolean()
      .optional()
      .describe("Show cost estimate without uploading"),
    v: z
      .number()
      .default(0)
      .meta({ count: true })
      .describe("Verbosity (-v, -vv, -vvv)"),
  }),
  alias: { key: "k", ows: "w", v: "v" },
  output: z.object({
    name: z.string(),
    kind: z.string(),
    bytes: z.number(),
    uri: z.string().optional(),
    permalink: z.string(),
    viewKey: z
      .string()
      .optional()
      .describe("Shareable view key for decryption"),
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
      options: { ows: "my-wallet", storage: "cdn" },
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
    const log = createLogger(c.options.v);
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
    let bytes: Uint8Array = new Uint8Array(buffer);
    const ext = extname(c.args.file).toLowerCase();

    log.info(`Reading ${basename(c.args.file)} (${formatSize(buffer.byteLength)})...`);

    const mime = MIME_MAP[ext];
    if (!mime) {
      return c.error({
        code: "UNSUPPORTED_TYPE",
        message: `Unsupported file extension: ${ext}`,
        exitCode: 1,
      });
    }

    log.detail(`Content-Type: ${mime}`);

    let dataURL = `data:${mime};base64,${buffer.toString("base64")}`;

    // Encrypt if requested
    let viewKeyStr: string | undefined;
    if (
      c.options.encrypt ||
      c.options.encryptFor?.length ||
      c.options.viewKey
    ) {
      const recipients = [];

      const selfKey = deriveEncryptionKeypair(ows, Namespace.EIP155);
      recipients.push({ pubKey: selfKey.publicKey, curve: selfKey.curve });

      if (c.options.encryptFor) {
        for (const r of c.options.encryptFor) {
          log.detail(`Resolving recipient: ${r}`);
          const resolved = await resolveRecipient(r, c.options.network);
          recipients.push(resolved);
        }
      }

      if (c.options.viewKey) {
        const vk = generateViewKey();
        recipients.push(vk.recipient);
        viewKeyStr = vk.viewKey;
        log.detail("Generated view key");
      }

      log.info(`Encrypting for ${recipients.length} recipient(s)...`);
      const encrypted = encryptForRecipients(bytes, recipients, { mime });
      bytes = encrypted;
      dataURL = `data:${ENCRYPTED_MIME};base64,${Buffer.from(encrypted).toString("base64")}`;
      log.detail(`Encrypted size: ${formatSize(bytes.byteLength)}`);
    }

    const { getAddress } = await import("viem");
    const address = getAddress(getWalletAddress(c.options.ows));

    log.info("Signing upload...");
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

    log.info(`Uploading to ${c.options.storage}...`);
    log.detail(`PUT ${url}${tierParam}`);

    let res: Response;
    try {
      res = await doFetch(`${url}${tierParam}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiry, dataURL, sig, unverifiedAddress }),
      });
    } catch (e) {
      return c.error({
        code: "UPLOAD_FAILED",
        message: e instanceof Error ? e.message : String(e),
        exitCode: 1,
      });
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
    log.info("Upload complete");
    log.debug(`Response: ${JSON.stringify(data)}`);
    const payment = extractPaymentReceipt(res);
    return {
      ...data,
      ...(viewKeyStr && { viewKey: viewKeyStr }),
      ...(payment && { payment }),
    };
  },
});

export { get, put };
