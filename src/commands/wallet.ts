import {
  createWallet,
  importWalletPrivateKey,
  listWallets,
} from "@open-wallet-standard/core";
import { Cli, z } from "incur";
import { ALL_NAMESPACES } from "@objekt.sh/ecies";
import { deriveEncryptionKeypair } from "../crypto";

const wallet = Cli.create("wallet", {
  description:
    "Manage signing wallets. Required before uploading. Keys are encrypted locally via OWS (https://openwallet.sh).",
});

wallet.command("create", {
  description: "Create a new wallet",
  args: z.object({
    name: z.string().describe("Wallet name"),
  }),
  output: z.object({
    id: z.string(),
    name: z.string(),
    address: z.string().describe("EVM address"),
  }),
  examples: [{ args: { name: "my-wallet" }, description: "Create a wallet" }],
  run(c) {
    const info = createWallet(c.args.name);
    const evmAccount = info.accounts.find(
      (a) => a.chainId === "evm" || a.chainId.startsWith("eip155"),
    );
    return {
      id: info.id,
      name: info.name,
      address: evmAccount?.address ?? "unknown",
    };
  },
});

wallet.command("import", {
  description:
    "Import an existing private key into a named wallet. The EVM address is preserved.",
  args: z.object({
    name: z.string().describe("Wallet name"),
  }),
  options: z.object({
    privateKey: z.string().describe("Hex-encoded private key (0x...)"),
  }),
  output: z.object({
    id: z.string(),
    name: z.string(),
    address: z.string().describe("EVM address"),
  }),
  examples: [
    {
      args: { name: "my-wallet" },
      options: { privateKey: "0x..." },
      description: "Import from private key",
    },
  ],
  run(c) {
    const key = c.options.privateKey.startsWith("0x")
      ? c.options.privateKey.slice(2)
      : c.options.privateKey;
    const info = importWalletPrivateKey(c.args.name, key);
    const evmAccount = info.accounts.find(
      (a) => a.chainId === "evm" || a.chainId.startsWith("eip155"),
    );
    return {
      id: info.id,
      name: info.name,
      address: evmAccount?.address ?? "unknown",
    };
  },
});

wallet.command("list", {
  description: "List all wallets",
  output: z.object({
    wallets: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        address: z.string().describe("EVM address"),
      }),
    ),
  }),
  run() {
    const all = listWallets();
    return {
      wallets: all.map((w) => {
        const evmAccount = w.accounts.find(
          (a) => a.chainId === "evm" || a.chainId.startsWith("eip155"),
        );
        return {
          id: w.id,
          name: w.name,
          address: evmAccount?.address ?? "unknown",
        };
      }),
    };
  },
});

wallet.command("encryption-key", {
  description:
    "Derive and display your encryption public keys per chain. Share these with others so they can encrypt content for you.",
  args: z.object({
    name: z.string().describe("Wallet name"),
  }),
  options: z.object({
    chain: z
      .string()
      .optional()
      .describe("CAIP-2 namespace or name (eip155, bip122, solana, ethereum, bitcoin, ...). Shows all if omitted."),
  }),
  output: z.object({
    keys: z.array(
      z.object({
        namespace: z.string().describe("CAIP-2 namespace"),
        curve: z.string(),
        publicKey: z.string(),
      }),
    ),
  }),
  examples: [
    {
      args: { name: "my-wallet" },
      description: "Show all encryption keys",
    },
    {
      args: { name: "my-wallet" },
      options: { chain: "bip122" },
      description: "Show Bitcoin encryption key only",
    },
  ],
  run(c) {
    const chains = c.options.chain
      ? [c.options.chain]
      : [...ALL_NAMESPACES];

    const keys: { namespace: string; curve: string; publicKey: string }[] = [];

    for (const chain of chains) {
      try {
        const kp = deriveEncryptionKeypair(c.args.name, chain);
        keys.push({
          namespace: kp.namespace,
          curve: kp.curve === 0x01 ? "secp256k1" : "x25519",
          publicKey: `0x${Buffer.from(kp.publicKey).toString("hex")}`,
        });
      } catch {
        // Wallet may not have an account on this chain
      }
    }

    if (keys.length === 0) {
      return c.error({
        code: "NO_KEYS",
        message: "Could not derive encryption keys — wallet has no supported chain accounts",
        exitCode: 1,
      });
    }

    return { keys };
  },
});

export default wallet;
