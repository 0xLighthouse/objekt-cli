import {
  createWallet,
  importWalletPrivateKey,
  listWallets,
} from "@open-wallet-standard/core";
import { Cli, z } from "incur";

const wallet = Cli.create("wallet", {
  description: "Manage signing wallets (OWS)",
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
  examples: [
    { args: { name: "my-wallet" }, description: "Create a wallet" },
  ],
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
  description: "Import a wallet from a private key",
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

export default wallet;
