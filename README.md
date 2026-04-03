# [objekt.sh](https://objekt.sh)

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

# Upload a file to IPFS (default)
objekt put ./doc.pdf -w my-wallet

# Upload permanently to Arweave
objekt put ./doc.pdf -w my-wallet --storage arweave

# Free CDN cache
objekt put ./doc.pdf -w my-wallet --storage cdn
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
objekt put <file> -w <wallet> [-k <key>] [--storage cdn|arweave|ipfs]
```

`file` is the path to upload. `--key` overrides the storage key (defaults to the filename).

**Storage tiers:**

| Tier | Cost | Durability |
|------|------|-----------|
| `cdn` | Free | 90-day Cloudflare edge cache |
| `arweave` | Dynamic | Permanent — one payment, stored forever |
| `ipfs` | Dynamic | 12-month pinning guarantee |

Pricing is dynamic — Arweave tracks the live AR/USD rate. Check current rates:

```bash
objekt pricing
```

**Estimate before committing:**

```bash
objekt put ./doc.pdf -w my-wallet --storage arweave --estimate
```

---

## Response

Every upload returns a consistent shape:

```json
{
  "name": "doc.pdf",
  "kind": "application/pdf",
  "bytes": 142087,
  "uri": "ar://BzIbGE9Nl6WqlyFo6wkCWAu9f0PnmuD3Sqk_2EWatu0",
  "permalink": "https://ar.objekt.sh/BzIbGE9Nl6WqlyFo6wkCWAu9f0PnmuD3Sqk_2EWatu0",
  "contenthash": "0xe301...",
  "payment": {
    "txHash": "0xfc88c3...",
    "explorerUrl": "https://basescan.org/tx/0xfc88c3..."
  }
}
```

| Field | Description |
|-------|-------------|
| `uri` | Protocol URI (`ar://`, `ipfs://`) — omitted for CDN |
| `permalink` | Gateway URL to access the content |
| `contenthash` | ENSIP-7 hex-encoded contenthash — set this on your ENS name |
| `payment` | On-chain USDC receipt — omitted for free CDN tier |

Permalinks resolve to your content via objekt.sh gateways:
- `ar.objekt.sh/:txId` — Arweave content
- `ipfs.objekt.sh/:cid` — IPFS content
- `api.objekt.sh/:key` — CDN cache

---

## Retrieving

```bash
objekt get <key>
objekt get <key> --output ./file.pdf
```

---

## Deploy static sites

Deploy a directory as a temporary preview site or pin to IPFS for permanent hosting.

```bash
# Temporary preview (7 days, free)
objekt deploy ./dist -w my-wallet

# Pin to IPFS (permanent, paid via x402)
objekt deploy ./dist -w my-wallet --storage ipfs
```

| Storage | Cost | Durability |
|---------|------|-----------|
| `tmp` (default) | Free | 7-day preview on Cloudflare edge |
| `ipfs` | Dynamic | Permanent IPFS pin via x402 payment |

Temporary deploys get a cute URL like `https://tmp.objekt.sh/calm-fox-k7m/`. IPFS deploys also return a `contenthash` you can set on your ENS name — the CLI will show you the exact command.

---

## ENS

Upload avatars and header images for ENS names:

```bash
objekt ens avatar upload 1a35e1.eth -f ./avatar.png -w my-wallet --storage arweave
```

### Contenthash

Read or set the ENSIP-7 contenthash on any ENS name. Use this to point your ENS name to a website on IPFS.

```bash
# Read
objekt ens contenthash get vitalik.eth

# Set (requires ENS name ownership + ETH for gas)
objekt ens contenthash set myname.eth "ipfs://QmRootCID" -w my-wallet
```

### Full website deploy flow

```bash
# 1. Deploy site to IPFS
objekt deploy ./dist -w my-wallet --storage ipfs
# Returns: uri: ipfs://QmRootCID, contenthash: 0xe301...

# 2. Set contenthash on your ENS name
objekt ens contenthash set myname.eth "ipfs://QmRootCID" -w my-wallet

# 3. Visit myname.eth.limo
```

---

## Testing

Use `--testnet` to test against the staging environment. Payments settle in USDC on Base Sepolia.

Get testnet USDC from the [Circle faucet](https://faucet.circle.com/).

```bash
objekt put ./doc.pdf -w my-wallet --storage ipfs --testnet
```

## Networks

`--network mainnet` (default) or `--network sepolia` for ENS on testnet.

---

## License

[AGPL-3.0](./LICENSE)
