---
name: objekt
description: Upload files to IPFS and Arweave, manage ENS media. Pay with USDC via x402. No accounts or API keys — just a local wallet.
---

# objekt

Upload media to permanent storage (Arweave, IPFS) or Cloudflare CDN. Payments are settled on-chain via x402 using USDC on Base.

## Setup

```bash
pnpm add -g @objekt.sh/cli

# Create a wallet (keys encrypted locally, never leave the machine)
objekt wallet create <name>

# Or import an existing key
objekt wallet import <name> --privateKey 0x...
```

## Upload a file

```bash
# Free CDN cache (default, 90-day Cloudflare edge)
objekt put <file> -w <wallet>

# Permanent Arweave storage (~$0.09/MB, one-time payment)
objekt put <file> -w <wallet> --storage arweave

# IPFS pinning ($0.10/MB, 12-month guarantee)
objekt put <file> -w <wallet> --storage ipfs

# Estimate cost before committing
objekt put <file> -w <wallet> --storage arweave --estimate
```

`--key` overrides the storage key (defaults to the filename).

Returns JSON: `{ url, storage, payment? }` — payment includes tx hash and block explorer link.

## Retrieve a file

```bash
objekt get <key>
objekt get <key> --output ./file.pdf
```

## Check pricing

```bash
objekt pricing
```

## ENS media

```bash
objekt ens avatar upload <ens-name> -f <file> -w <wallet> [--storage arweave|ipfs|cdn]
```

## Wallets

```bash
objekt wallet list
objekt wallet create <name>
objekt wallet import <name> --privateKey 0x...
```

## Networks

`--network mainnet` (default) or `--network sepolia`

## Agent discovery

```bash
objekt --llms      # machine-readable command manifest
objekt --schema    # JSON Schema for all commands
```
