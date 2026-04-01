import { Cli } from "incur";

import avatar from "./avatar";
import contenthash from "./contenthash";
import header from "./header";
import metadata from "./metadata";

const ens = Cli.create("ens", {
  description:
    "Upload and retrieve avatars and headers for ENS names. Requires wallet (-w) and ENS name ownership for uploads.",
});

ens.command(avatar);
ens.command(header);
ens.command(contenthash);
ens.command(metadata);

export default ens;
