import { Cli } from "incur";

import avatar from "./avatar";
import header from "./header";

const ens = Cli.create("ens", {
  description: "ENS media commands",
});

ens.command(avatar);
ens.command(header);

export default ens;
