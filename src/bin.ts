import { Cli } from "incur";

import pkg from "../package.json";
import ens from "./commands/ens";
import { get, put } from "./commands/media";
import pricing from "./commands/pricing";
import wallet from "./commands/wallet";

const cli = Cli.create("objekt", {
  version: pkg.version,
  description: [
    "Media storage for ENS names with wallet-based signing and on-chain payments.",
    "",
    "Workflow:",
    "  1. Create or import a wallet:  objekt wallet import <name> --private-key 0x...",
    "  2. Upload media:              objekt ens avatar upload <name> -f <file> -w <wallet>",
    "  3. Choose storage backend:    --storage ipfs (default, 12mo) | arweave (permanent) | cdn (free)",
    "  4. Estimate before uploading:  --estimate",
    "",
    "Signing uses Open Wallet Standard (https://openwallet.sh). Keys are encrypted locally.",
    "Payments use x402 (https://x402.org). No accounts or API keys needed — just a wallet.",
  ].join("\n"),
});

cli.command(wallet);
cli.command(ens);
cli.command(get);
cli.command(put);
cli.command(pricing);

cli.serve();

export default cli;
