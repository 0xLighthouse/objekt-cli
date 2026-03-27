import { Cli } from "incur";

import avatar from "./avatar";
import header from "./header";

const ens = Cli.create("ens", {
  description:
    "Upload and retrieve avatars and headers for ENS names. Requires wallet (-w) and ENS name ownership for uploads.",
});

ens.command(avatar);
ens.command(header);

export default ens;
