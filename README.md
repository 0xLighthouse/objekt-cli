# objekt

Upload media to IPFS and Arweave. Pay with USDC. No accounts, no API keys — just a wallet.

```bash
pnpm add -g @objekt.sh/cli
```

---

## Agent-ready

All commands return structured JSON. The CLI is discoverable by AI agents out of the box:

```bash
objekt --llms       # machine-readable command manifest
objekt --schema     # JSON Schema for every command
```

Agents can upload files, check pricing, and manage wallets without human intervention.

---

## How it works

Two primitives power everything:

**[Open Wallet Standard (OWS)](https://openwallet.sh)** handles signing. Your private key is encrypted locally and never touches the network. Each upload is signed with an EIP-712 signature — the server verifies ownership without ever seeing your key.

**[x402](https://www.x402.org)** handles payments. It's an open protocol for machine-native payments over HTTP. When you upload to a paid storage tier, the CLI constructs a USDC payment on Base, the server settles it on-chain, and you get a transaction receipt. No intermediary holds your funds between request and settlement.

---

## Quickstart

```bash
# Create a wallet
objekt wallet create my-wallet

# Check current pricing
objekt pricing

# Upload a file to IPFS
objekt put proposals/media -f ./doc.pdf -w my-wallet --storage ipfs

# Upload permanently to Arweave
objekt put proposals/media -f ./doc.pdf -w my-wallet --storage arweave

# Free CDN cache (default)
objekt put proposals/media -f ./doc.pdf -w my-wallet
```

---

## Wallets

Wallets are stored locally, encrypted at rest.

```bash
objekt wallet create <name>
objekt wallet import <name> --privateKey 0x...
objekt wallet list
```

The wallet address is a standard EVM address — the same key you use anywhere else on-chain.

---

## Uploading

```bash
objekt put <key> -f <file> -w <wallet> [--storage cdn|arweave|ipfs]
```

`key` is the path used to address the file (e.g. `proposals/0xabc/cover`).

**Storage tiers:**

| Tier | Cost | Durability |
|------|------|-----------|
| `cdn` | Free | 90-day Cloudflare edge cache |
| `arweave` | ~$0.09/MB | Permanent — one payment, stored forever |
| `ipfs` | $0.10/MB | 12-month pinning guarantee |

Arweave pricing is dynamic — computed from the live AR/USD rate. Check current rates:

```bash
objekt pricing
```

**Estimate before committing:**

```bash
objekt put proposals/media -f ./doc.pdf -w my-wallet --storage arweave --estimate
```

---

## Payment receipts

Paid uploads return a JSON receipt with the on-chain transaction:

```json
{
  "url": "https://...",
  "storage": "arweave",
  "payment": {
    "success": true,
    "transaction": "0xfc88c3...",
    "explorer": "https://basescan.org/tx/0xfc88c3..."
  }
}
```

The transaction is final. If the upload fails after payment, the receipt is your proof.

---

## Retrieving

```bash
objekt get <key>
objekt get <key> --output ./file.pdf
```

---

## ENS media

Upload avatars and header images for ENS names:

```bash
objekt ens avatar upload nick.eth -f ./avatar.png -w my-wallet --storage arweave
```

---

## Networks

`--network mainnet` (default) or `--network sepolia` for testnet.

---

## License

[AGPL-3.0](./LICENSE)
