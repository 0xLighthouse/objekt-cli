import { Cli, z } from "incur";
import { sha256 } from "viem";

import { getRevealApiUrl } from "../api";
import { signRevealDeposit, signRevealRemove } from "../sign";
import { createPaymentFetch, extractPaymentReceipt } from "../x402";

const deposit = Cli.create("deposit", {
  description: "Deposit a view key for pay-to-reveal",
  args: z.object({
    name: z
      .string()
      .describe("ENS name (1a35e1.eth) or wallet address (0x...)"),
    keyName: z.string().describe("Key name (e.g. phone, email, telegram)"),
  }),
  options: z.object({
    ows: z.string().describe("OWS wallet name"),
    viewKey: z.string().describe("View key to deposit (objekt_vk_...)"),
    price: z.string().describe("Price in USD (e.g. 5.00)"),
    contentUri: z
      .string()
      .describe("Content URI (ar://..., ipfs://..., or CDN URL)"),
    ttl: z
      .string()
      .default("1d")
      .describe("Time to live (e.g. 30m, 2h, 1d, 1w)"),
    network: z
      .enum(["mainnet", "sepolia"])
      .default("mainnet")
      .describe("Network"),
    testnet: z.boolean().default(false).describe("Use testnet"),
    revealApi: z.string().optional().describe("Reveal API base URL"),
  }),
  alias: { ows: "w" },
  output: z.object({
    namespace: z.string(),
    keyName: z.string(),
    commitment: z.string(),
    price: z.string(),
    expiresAt: z.number(),
  }),
  async run(c) {
    const commitment = sha256(new TextEncoder().encode(c.options.viewKey));

    const { sig, expiry, unverifiedAddress } = signRevealDeposit({
      wallet: c.options.ows,
      ensName: c.args.name,
      keyName: c.args.keyName,
      commitment,
      price: c.options.price,
    });

    const url = `${getRevealApiUrl(c.options)}/${c.args.name}/${c.args.keyName}`;
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        viewKey: c.options.viewKey,
        price: c.options.price,
        contentUri: c.options.contentUri,
        ttl: c.options.ttl,
        sig,
        expiry,
        unverifiedAddress,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return c.error({ code: "DEPOSIT_FAILED", message: text, exitCode: 1 });
    }

    return res.json();
  },
});

const buy = Cli.create("buy", {
  description: "Purchase a view key",
  args: z.object({
    name: z.string().describe("ENS name or wallet address"),
    keyName: z.string().describe("Key name (e.g. phone, email)"),
  }),
  options: z.object({
    ows: z.string().describe("OWS wallet name (for x402 payment)"),
    network: z
      .enum(["mainnet", "sepolia"])
      .default("mainnet")
      .describe("Network"),
    testnet: z.boolean().default(false).describe("Use testnet"),
    revealApi: z.string().optional().describe("Reveal API base URL"),
  }),
  alias: { ows: "w" },
  output: z.object({
    viewKey: z.string(),
    contentUri: z.string(),
    commitment: z.string(),
    payment: z
      .object({
        txHash: z.string(),
        explorerUrl: z.string(),
      })
      .optional(),
  }),
  async run(c) {
    const url = `${getRevealApiUrl(c.options)}/${c.args.name}/${c.args.keyName}`;
    const doFetch = createPaymentFetch(c.options.ows, c.options.testnet);

    const res = await doFetch(url);

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
      return c.error({ code: "PURCHASE_FAILED", message, exitCode: 1 });
    }

    const data = await res.json();
    const payment = extractPaymentReceipt(res);
    return { ...data, ...(payment && { payment }) };
  },
});

const list = Cli.create("list", {
  description: "List available reveal keys",
  args: z.object({
    name: z.string().describe("ENS name or wallet address"),
  }),
  options: z.object({
    network: z
      .enum(["mainnet", "sepolia"])
      .default("mainnet")
      .describe("Network"),
    testnet: z.boolean().default(false).describe("Use testnet"),
    revealApi: z.string().optional().describe("Reveal API base URL"),
  }),
  output: z.object({
    namespace: z.string(),
    keys: z.array(
      z.object({
        keyName: z.string(),
        price: z.string(),
        contentUri: z.string(),
        commitment: z.string(),
      }),
    ),
  }),
  async run(c) {
    const url = `${getRevealApiUrl(c.options)}/${c.args.name}`;
    const res = await fetch(url);

    if (!res.ok) {
      const text = await res.text();
      return c.error({ code: "LIST_FAILED", message: text, exitCode: 1 });
    }

    return res.json();
  },
});

const remove = Cli.create("remove", {
  description: "Remove a deposited reveal key",
  args: z.object({
    name: z.string().describe("ENS name or wallet address"),
    keyName: z.string().describe("Key name to remove"),
  }),
  options: z.object({
    ows: z.string().describe("OWS wallet name"),
    network: z
      .enum(["mainnet", "sepolia"])
      .default("mainnet")
      .describe("Network"),
    testnet: z.boolean().default(false).describe("Use testnet"),
    revealApi: z.string().optional().describe("Reveal API base URL"),
  }),
  alias: { ows: "w" },
  output: z.object({
    removed: z.boolean(),
  }),
  async run(c) {
    const { sig, expiry, unverifiedAddress } = signRevealRemove({
      wallet: c.options.ows,
      ensName: c.args.name,
      keyName: c.args.keyName,
    });

    const url = `${getRevealApiUrl(c.options)}/${c.args.name}/${c.args.keyName}`;
    const res = await fetch(url, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sig, expiry, unverifiedAddress }),
    });

    if (!res.ok) {
      const text = await res.text();
      return c.error({ code: "REMOVE_FAILED", message: text, exitCode: 1 });
    }

    return res.json();
  },
});

const reveal = Cli.create("reveal", {
  description:
    "Pay-to-reveal key escrow. Deposit encrypted view keys and let buyers purchase access.",
});

reveal.command(deposit);
reveal.command(buy);
reveal.command(list);
reveal.command(remove);

export default reveal;
