import { Cli } from "incur";

import ens from "./commands/ens";
import { get, put } from "./commands/media";
import pricing from "./commands/pricing";
import wallet from "./commands/wallet";

const cli = Cli.create("objekt", {
  version: "0.1.0",
  description: "CLI for media storage",
});

cli.command(wallet);
cli.command(ens);
cli.command(get);
cli.command(put);
cli.command(pricing);

cli.serve();

export default cli;
