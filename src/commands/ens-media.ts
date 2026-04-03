import {
  addEnsContracts,
  ensPublicActions,
  ensWalletActions,
} from "@ensdomains/ensjs";
import type { MediaTypeConfig } from "@objekt/shared";
import {
  ENCRYPTED_MIME,
  generateViewKey,
  isEncrypted,
  Namespace,
  parseViewKey,
} from "@objekt.sh/ecies";
import { Cli, z } from "incur";
import { createClient, createWalletClient } from "viem";
import { mainnet, sepolia } from "viem/chains";

import { getEnsApiUrl } from "../api";
import {
  decryptEnvelope,
  deriveAllEncryptionKeypairs,
  deriveEncryptionKeypair,
  encryptForRecipients,
  resolveRecipient,
} from "../crypto";
import { estimateUpload } from "../estimate";
import { readMediaFile } from "../file";
import { createLogger, formatSize } from "../log";
import { createOwsAccount } from "../ows-account";
import { rpcTransport } from "../rpc";
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
        .describe(
          "Generate a shareable view key for decryption without a wallet",
        ),
      estimate: z
        .boolean()
        .optional()
        .describe("Show cost estimate without uploading. No wallet needed."),
      v: z
        .number()
        .default(0)
        .meta({ count: true })
        .describe("Verbosity (-v, -vv, -vvv)"),
    }),
    alias: { file: "f", ows: "w", v: "v" },
    async run(c) {
      const log = createLogger(c.options.v);

      log.info(`Reading ${c.options.file}...`);
      let { bytes, mime } = await readMediaFile(c.options.file, mediaType);
      log.info(`Read ${c.options.file} (${formatSize(bytes.byteLength)})`);
      log.detail(`Content-Type: ${mime}`);

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

      let uploadMime = mime;

      // Encrypt if requested
      let viewKeyStr: string | undefined;
      if (
        c.options.encrypt ||
        c.options.encryptFor?.length ||
        c.options.viewKey
      ) {
        const recipients = [];

        // Always include self
        const selfKey = deriveEncryptionKeypair(
          c.options.ows,
          Namespace.EIP155,
        );
        recipients.push({ pubKey: selfKey.publicKey, curve: selfKey.curve });

        // Add explicit recipients
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
        uploadMime = ENCRYPTED_MIME;
        log.detail(`Encrypted size: ${formatSize(bytes.byteLength)}`);
      }

      log.info("Signing upload...");
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

      log.info(`Uploading ${name} to ${c.options.storage}...`);
      log.detail(`PUT ${url}${storageParam}`);

      const form = new FormData();
      form.append(
        "file",
        new Blob([bytes], { type: uploadMime }),
        c.options.file,
      );
      form.append("sig", sig);
      form.append("expiry", expiry);
      form.append("unverifiedAddress", unverifiedAddress);

      const res = await doFetch(`${url}${storageParam}`, {
        method: "PUT",
        body: form,
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

  const CHAINS = {
    mainnet: addEnsContracts(mainnet),
    sepolia: addEnsContracts(sepolia),
  } as const;

  cli.command("set", {
    description: `Set the ENS ${name} text record on-chain`,
    args: z.object({
      name: z.string().describe("ENS name (e.g. 1a35e1.eth)"),
      uri: z
        .string()
        .describe("URI to set (e.g. https://ens.objekt.sh/1a35e1.eth/avatar)"),
    }),
    options: z.object({
      ows: z.string().describe("OWS wallet name"),
      rpc: z.string().optional().describe("Custom RPC URL"),
      network: z
        .enum(["mainnet", "sepolia"])
        .default("mainnet")
        .describe("Network"),
      v: z
        .number()
        .default(0)
        .meta({ count: true })
        .describe("Verbosity (-v, -vv, -vvv)"),
    }),
    alias: { ows: "w", v: "v" },
    output: z.object({
      name: z.string(),
      key: z.string(),
      value: z.string(),
      txHash: z.string(),
      etherscan: z.string(),
    }),
    async run(c) {
      const chain = CHAINS[c.options.network];
      const log = createLogger(c.options.v);
      const rpcUrl = c.options.rpc ?? process.env.RPC_URL_1;
      const account = createOwsAccount(c.options.ows);

      log.info(`Setting ${name} text record for ${c.args.name}`);
      log.detail(`Value: ${c.args.uri}`);
      log.debug(`Network: ${c.options.network}`);
      log.debug(`RPC: ${rpcUrl ?? "default public"}`);
      log.debug(`Account: ${account.address}`);

      const publicClient = createClient({
        chain,
        transport: rpcTransport(rpcUrl),
      }).extend(ensPublicActions);

      const resolver = await publicClient.getResolver({ name: c.args.name });
      if (!resolver) {
        return c.error({
          code: "NO_RESOLVER",
          message: `No resolver found for ${c.args.name}`,
          exitCode: 1,
        });
      }
      log.detail(`Resolver: ${resolver}`);

      const walletClient = createWalletClient({
        account,
        chain,
        transport: rpcTransport(rpcUrl),
      }).extend(ensWalletActions);

      log.info("Sending transaction...");
      const txHash = await walletClient.setTextRecord({
        name: c.args.name,
        key: name,
        value: c.args.uri,
        resolverAddress: resolver,
      });
      log.info("Transaction sent");
      log.debug(`txHash: ${txHash}`);

      const etherscan =
        c.options.network === "mainnet"
          ? `https://etherscan.io/tx/${txHash}`
          : `https://sepolia.etherscan.io/tx/${txHash}`;

      return {
        name: c.args.name,
        key: name,
        value: c.args.uri,
        txHash,
        etherscan,
      };
    },
  });

  return cli;
}
