import type { MediaTypeConfig } from "@objekt/shared";
import { isEncrypted, Namespace, ENCRYPTED_MIME, generateViewKey, parseViewKey } from "@objekt.sh/ecies";
import { Cli, z } from "incur";

import { getEnsApiUrl } from "../api";
import {
  deriveEncryptionKeypair,
  deriveAllEncryptionKeypairs,
  encryptForRecipients,
  decryptEnvelope,
  resolveRecipient,
} from "../crypto";
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
      name: z.string().describe("ENS name (e.g. 1a35e1.eth)"),
    }),
    options: z.object({
      ows: z.string().optional().describe("OWS wallet name (required to decrypt encrypted content)"),
      viewKey: z.string().optional().describe("View key to decrypt (objekt_vk_...)"),
      network: z
        .enum(["mainnet", "sepolia"])
        .default("mainnet")
        .describe("Network"),
      testnet: z.boolean().default(false).describe("Use testnet"),
      ensApi: z.string().optional().describe("ENS API base URL"),
      output: z.string().optional().describe("Save to file path"),
    }),
    alias: { ows: "w" },
    output: z.object({
      name: z.string(),
      contentType: z.string(),
      size: z.number().describe("Size in bytes"),
      encrypted: z.boolean().optional().describe("Content was encrypted"),
      saved: z.string().optional().describe("File path if saved"),
    }),
    async run(c) {
      const url = `${getEnsApiUrl(c.options)}/${c.args.name}${pathSuffix}`;
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
            message: "Content is encrypted. Provide --ows <wallet> or --view-key to decrypt.",
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
        name: c.args.name,
        contentType,
        size: buffer.byteLength,
        encrypted: wasEncrypted || undefined,
        saved: c.options.output,
      };
    },
  });

  cli.command("upload", {
    description: `Upload ${name}`,
    args: z.object({
      name: z.string().describe("ENS name (e.g. 1a35e1.eth)"),
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
      testnet: z.boolean().default(false).describe("Use testnet"),
      ensApi: z.string().optional().describe("ENS API base URL"),
      storage: z
        .enum(["cdn", "arweave", "ipfs"])
        .default("ipfs")
        .describe(
          "Storage: cached (free), arweave (permanent, paid), ipfs (12mo, paid)",
        ),
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
        .describe("Generate a shareable view key for decryption without a wallet"),
      estimate: z
        .boolean()
        .optional()
        .describe("Show cost estimate without uploading. No wallet needed."),
    }),
    alias: { file: "f", ows: "w" },
    async run(c) {
      let { bytes, dataURL, mime } = await readMediaFile(c.options.file, mediaType);

      if (c.options.estimate) {
        return estimateUpload({ ...c.options, bytes: bytes.byteLength });
      }

      if (!c.options.ows) {
        return c.error({
          code: "NO_WALLET",
          message:
            "Provide --ows <wallet> — uploads are signed with your wallet to prove ownership",
          exitCode: 1,
        });
      }

      // Encrypt if requested
      let viewKeyStr: string | undefined;
      if (c.options.encrypt || c.options.encryptFor?.length || c.options.viewKey) {
        const recipients = [];

        // Always include self
        const selfKey = deriveEncryptionKeypair(c.options.ows, Namespace.EIP155);
        recipients.push({ pubKey: selfKey.publicKey, curve: selfKey.curve });

        // Add explicit recipients
        if (c.options.encryptFor) {
          for (const r of c.options.encryptFor) {
            const resolved = await resolveRecipient(r, c.options.network);
            recipients.push(resolved);
          }
        }

        if (c.options.viewKey) {
          const vk = generateViewKey();
          recipients.push(vk.recipient);
          viewKeyStr = vk.viewKey;
        }

        const encrypted = encryptForRecipients(bytes, recipients, { mime });
        bytes = encrypted;
        dataURL = `data:${ENCRYPTED_MIME};base64,${Buffer.from(encrypted).toString("base64")}`;
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
          ? createPaymentFetch(c.options.ows, c.options.testnet)
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
      return { ...data, ...(viewKeyStr && { viewKey: viewKeyStr }), ...(payment && { payment }) };
    },
  });

  return cli;
}
