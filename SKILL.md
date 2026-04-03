---
name: objekt
description: Upload files to IPFS, Arweave, or CDN, deploy static sites, manage ENS media/contenthash, and sell encrypted content via pay-to-reveal. Payments settle on-chain in USDC via x402. Use when the user mentions file uploads, permanent storage, ENS avatars/headers, static site deployment, encryption, view keys, or pay-to-reveal.
---

# Objekt

Decentralised file storage, static site hosting, and pay-to-reveal for ENS names.

## Bootstrap

Ask the user which wallet to use before proceeding.

> Referred to as `<WALLET>` throughout.

If no wallet exists, create one first:

```bash
objekt wallet create <WALLET>
```

To import an existing private key:

```bash
objekt wallet import <WALLET> --private-key 0x...
```

Wallets are encrypted locally via [Open Wallet Standard](https://openwallet.sh) (`~/.ows/`). Private keys never leave the machine.

## Guardrails

- **ALWAYS estimate before paid uploads.** For `arweave` or `ipfs` storage, run with `--estimate` first to show the cost. Wait for explicit confirmation before uploading without `--estimate`.
- **ALWAYS check pricing is current.** Arweave pricing is dynamic (AR/USD rate). Run `objekt pricing` or check `https://api.objekt.sh/pricing` before quoting any cost.
- **Never hardcode prices.** Costs change. Always point the user to `objekt pricing` or the REST endpoint.
- **Never expose private keys.** If the user asks, only acknowledge existence. Use OWS wallet references (`-w <WALLET>`) instead.
- **`--storage` is required for `upload`.** There is no default — the user must choose `cdn`, `ipfs`, or `arweave`.
- **ENS operations require ownership.** The wallet must be the controller of the ENS name. Verify with `objekt ens contenthash get <name>` first if unsure.
- **Contenthash set requires ETH for gas.** This is an on-chain transaction, not an x402 payment.
- **On-chain commands need an RPC.** Public RPCs are unreliable. Set `ETH_RPC_URL` or pass `--rpc <url>` to use a private provider (e.g. [Goldsky Edge](https://goldsky.com/products/edge)).

## Quickstart

Run `objekt --help` or `objekt <command> --help` for full usage.

```
Workflow Progress:
- [ ] Step 1: Set up a wallet
- [ ] Step 2: Upload a file
- [ ] Step 3: Deploy a site (optional)
- [ ] Step 4: Set ENS records (optional)
- [ ] Step 5: Encrypt & sell content (optional)
```

## Workflows

### Step 1: Set up a wallet

```bash
# List existing wallets
objekt wallet list

# Create a new wallet
objekt wallet create <WALLET>

# Import from private key
objekt wallet import <WALLET> --private-key 0x...

# Show encryption public keys (for multi-recipient encryption)
objekt wallet encryption-key <WALLET>
objekt wallet encryption-key <WALLET> --chain eip155
```

### Step 2: Upload a file

```bash
# Estimate cost first (required for paid tiers)
objekt upload <file> -w <WALLET> --storage arweave --estimate

# Upload to Arweave (permanent, paid via x402)
objekt upload <file> -w <WALLET> --storage arweave

# Upload to IPFS (12-month pin, paid via x402)
objekt upload <file> -w <WALLET> --storage ipfs

# Upload to CDN (free, 90-day edge cache)
objekt upload <file> -w <WALLET> --storage cdn
```

**Options:**

| Option | Description |
|--------|-------------|
| `--storage` | `cdn`, `ipfs`, or `arweave` (required) |
| `-k, --key` | Custom storage key (defaults to filename) |
| `--encrypt` | Encrypt for self |
| `--encrypt-for` | Recipient public key or ENS name (repeatable) |
| `--view-key` | Generate a shareable view key |
| `--estimate` | Show cost estimate without uploading |

**Response:**

```json
{
  "name": "whitepaper.pdf",
  "kind": "application/pdf",
  "bytes": 142087,
  "uri": "ar://BzIbGE9Nl6Wqly...",
  "permalink": "https://ar.objekt.sh/BzIbGE9Nl6Wqly...",
  "contenthash": "0xe301...",
  "payment": {
    "txHash": "0xfc88c3...",
    "explorerUrl": "https://basescan.org/tx/0xfc88c3..."
  }
}
```

### Step 3: Deploy a static site

```bash
# Free 7-day preview
objekt deploy <directory> -w <WALLET>
# => https://tmp.objekt.sh/calm-fox-k7m/

# Permanent IPFS hosting (paid via x402)
objekt deploy <directory> -w <WALLET> --storage ipfs

# List previous deployments
objekt deploy list
```

After an IPFS deploy, the CLI prints the command to set the ENS contenthash.

**Response:**

```json
{
  "url": "https://tmp.objekt.sh/calm-fox-k7m/",
  "hash": "QmRootCID...",
  "files": 42,
  "size": 1048576,
  "expiresIn": "7d",
  "uri": "ipfs://QmRootCID...",
  "contenthash": "0xe301...",
  "payment": { "txHash": "0x...", "explorerUrl": "https://basescan.org/tx/0x..." }
}
```

### Step 4: ENS records

#### Avatar & header

```bash
# Upload avatar (JPEG, PNG, WebP — max 512KB)
objekt ens avatar upload <name.eth> -f <file> -w <WALLET> --storage arweave

# Upload header (JPEG, PNG, WebP — max 1MB)
objekt ens header upload <name.eth> -f <file> -w <WALLET> --storage arweave

# Retrieve
objekt ens avatar get <name.eth>
objekt ens header get <name.eth>

# Set on-chain text record to an existing URI
objekt ens avatar set <name.eth> <uri> -w <WALLET>
objekt ens header set <name.eth> <uri> -w <WALLET>
```

#### Contenthash

```bash
# Read
objekt ens contenthash get <name.eth>

# Set (on-chain transaction, requires ETH for gas)
objekt ens contenthash set <name.eth> "ipfs://QmRootCID" -w <WALLET>
# => Site live at https://name.eth.limo
```

#### Full website deploy flow

```bash
# 1. Deploy to IPFS
objekt deploy ./dist -w <WALLET> --storage ipfs
# Returns: uri: ipfs://QmRootCID

# 2. Point ENS name to the CID
objekt ens contenthash set myname.eth "ipfs://QmRootCID" -w <WALLET>

# 3. Visit https://myname.eth.limo
```

#### Metadata (ERC-8004)

```bash
# View agent metadata
objekt ens metadata view <name.eth>
objekt ens metadata view <name.eth> --json

# Generate template
objekt ens metadata template > agent.json

# Validate payload
objekt ens metadata validate agent.json

# Dry run (inspect before broadcasting)
objekt ens metadata set <name.eth> agent.json --private-key 0x...

# Broadcast on-chain
objekt ens metadata set <name.eth> agent.json --private-key 0x... --broadcast
```

### Step 5: Encryption & pay-to-reveal

#### Encrypt uploads

```bash
# Encrypt for self
objekt upload secret.pdf -w <WALLET> --encrypt --storage ipfs

# Encrypt for self with shareable view key
objekt upload secret.pdf -w <WALLET> --encrypt --view-key --storage ipfs
# Returns: { ..., viewKey: "objekt_vk_..." }

# Encrypt for multiple recipients (ENS names or public keys)
objekt upload secret.pdf -w <WALLET> --encrypt \
  --encrypt-for vitalik.eth \
  --encrypt-for 0x02abc...def \
  --storage ipfs
```

#### Decrypt

```bash
# With wallet
objekt get <key> -w <WALLET>

# With view key
objekt get <key> --view-key objekt_vk_a1b2c3d4e5f6...

# Save to file
objekt get <key> -w <WALLET> --output ./decrypted.pdf
```

#### Pay-to-reveal (sell encrypted content)

```bash
# Deposit a view key for sale
objekt reveal deposit <namespace> <key-name> \
  --view-key objekt_vk_abc123... \
  --price 5.00 \
  --content-uri ipfs://Qm... \
  --ttl 7d \
  -w <WALLET>

# List keys available for purchase
objekt reveal list <namespace>

# Buy a view key (pays USDC via x402)
objekt reveal buy <namespace> <key-name> -w <WALLET>

# Remove a listed key
objekt reveal remove <namespace> <key-name> -w <WALLET>
```

## Pricing

Pricing is dynamic. Always check current rates before quoting costs.

```bash
objekt pricing
```

Or query the REST endpoint: `GET https://api.objekt.sh/pricing`

## Networks

`--network mainnet` (default) or `--network sepolia` for testnet. Use `--testnet` for Base Sepolia payments.

Get testnet USDC from the [Circle faucet](https://faucet.circle.com/).

## References

- [Docs](https://docs.objekt.sh) — full documentation
- [REST API](https://api.objekt.sh/pricing) — live pricing endpoint
- [Open Wallet Standard](https://openwallet.sh) — wallet spec
- [x402 Protocol](https://x402.org) — payment protocol
- [ERC-8004](https://best-practices.8004scan.io/docs/01-agent-metadata-standard.html) — agent metadata standard
