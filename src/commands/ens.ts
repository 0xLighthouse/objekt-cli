import { Cli } from "incur";

import attachment from "./attachment";
import avatar from "./avatar";
import header from "./header";

const ens = Cli.create("ens", {
  description: "ENS media commands",
});

ens.command(avatar);
ens.command(header);
ens.command(attachment);

export default ens;
