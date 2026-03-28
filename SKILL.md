---
name: objekt
description: Upload files to IPFS and Arweave, deploy static sites, manage ENS media and contenthash. Pay with USDC via x402. No accounts or API keys — just a local wallet.
---

# objekt

Upload media to permanent storage (Arweave, IPFS) or Cloudflare CDN. Payments are settled on-chain via x402 using USDC on Base.

## Setup

```bash
pnpm add -g @objekt.sh/cli

# Create a wallet (keys encrypted locally, never leave the machine)
objekt wallet create <name>

# Or import an existing key
objekt wallet import <name> --private-key 0x...
```

## Upload a file

```bash
# IPFS pinning (default, $0.10/MB, 12-month guarantee)
objekt put <file> -w <wallet>

# Permanent Arweave storage (~$0.09/MB, one-time payment)
objekt put <file> -w <wallet> --storage arweave

# Free CDN cache (90-day Cloudflare edge)
objekt put <file> -w <wallet> --storage cdn

# Estimate cost before committing
objekt put <file> -w <wallet> --storage arweave --estimate
```

`--key` overrides the storage key (defaults to the filename).

Returns JSON: `{ name, kind, bytes, uri?, permalink, contenthash?, payment? }` — payment includes tx hash and explorer URL.

## Deploy a static site

```bash
# Temporary preview (7 days, free)
objekt deploy <directory> -w <wallet>

# Pin to IPFS (permanent, $0.10/MB USDC via x402)
objekt deploy <directory> -w <wallet> --storage ipfs
```

Returns JSON: `{ url, hash, files, size, expiresIn, uri?, contenthash?, payment? }`

IPFS deploys are paid via x402 (USDC on Base). After a successful IPFS deploy, the CLI prints the command to set the ENS contenthash.

## ENS contenthash

```bash
# Read contenthash
objekt ens contenthash get <ens-name>

# Set contenthash (needs ETH for gas)
objekt ens contenthash set <ens-name> "ipfs://QmCID" -w <wallet>
```

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
objekt wallet import <name> --private-key 0x...
```

## Networks

`--network mainnet` (default) or `--network sepolia`

## Agent discovery

```bash
objekt --llms      # machine-readable command manifest
objekt --schema    # JSON Schema for all commands
```
