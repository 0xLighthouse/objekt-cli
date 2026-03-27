import { Cli } from "incur";

import ens from "./commands/ens";
import { get, put } from "./commands/media";
import pricing from "./commands/pricing";
import wallet from "./commands/wallet";

const cli = Cli.create("objekt", {
  version: "0.1.0",
  description: [
    "Media storage for ENS names with wallet-based signing and on-chain payments.",
    "",
    "Workflow:",
    "  1. Create or import a wallet:  objekt wallet import <name> --privateKey 0x...",
    "  2. Upload media:              objekt ens avatar upload <name> -f <file> -w <wallet>",
    "  3. Choose storage backend:    --storage cached (free) | arweave (permanent) | ipfs (12mo)",
    "  4. Paid tiers auto-settle via x402 (USDC on Base) and return a tx receipt.",
    "  5. Check pricing:             objekt pricing",
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
