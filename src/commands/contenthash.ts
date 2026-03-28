import { addEnsContracts, ensPublicActions, ensWalletActions } from "@ensdomains/ensjs";
import { Cli, z } from "incur";
import { createClient, createWalletClient, http } from "viem";
import { mainnet, sepolia } from "viem/chains";

import { createOwsAccount } from "../ows-account";

const CHAINS = {
  mainnet: addEnsContracts(mainnet),
  sepolia: addEnsContracts(sepolia),
} as const;

const contenthash = Cli.create("contenthash", {
  description: "Get or set ENS contenthash records",
});

contenthash.command("get", {
  description: "Read the contenthash for an ENS name",
  args: z.object({
    name: z.string().describe("ENS name (e.g. vitalik.eth)"),
  }),
  options: z.object({
    network: z
      .enum(["mainnet", "sepolia"])
      .default("mainnet")
      .describe("Network"),
  }),
  output: z.object({
    name: z.string(),
    protocolType: z.string().nullable(),
    decoded: z.string().nullable(),
  }),
  async run(c) {
    const chain = CHAINS[c.options.network];
    const client = createClient({
      chain,
      transport: http(),
    }).extend(ensPublicActions);

    const result = await client.getContentHashRecord({
      name: c.args.name,
    });

    return {
      name: c.args.name,
      protocolType: result?.protocolType ?? null,
      decoded: result?.decoded ?? null,
    };
  },
});

contenthash.command("set", {
  description: "Set the contenthash for an ENS name",
  args: z.object({
    name: z.string().describe("ENS name (e.g. vitalik.eth)"),
    uri: z.string().describe("Content URI (e.g. ipfs://Qm...)"),
  }),
  options: z.object({
    ows: z.string().describe("OWS wallet name"),
    network: z
      .enum(["mainnet", "sepolia"])
      .default("mainnet")
      .describe("Network"),
  }),
  alias: { ows: "w" },
  output: z.object({
    name: z.string(),
    uri: z.string(),
    txHash: z.string(),
  }),
  async run(c) {
    const chain = CHAINS[c.options.network];
    const account = createOwsAccount(c.options.ows);

    // Public client for reading resolver address
    const publicClient = createClient({
      chain,
      transport: http(),
    }).extend(ensPublicActions);

    // Get resolver address
    const resolver = await publicClient.getResolver({ name: c.args.name });
    if (!resolver) {
      return c.error({
        code: "NO_RESOLVER",
        message: `No resolver found for ${c.args.name}`,
        exitCode: 1,
      });
    }

    // Wallet client for writing
    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(),
    }).extend(ensWalletActions);

    const txHash = await walletClient.setContentHashRecord({
      name: c.args.name,
      contentHash: c.args.uri,
      resolverAddress: resolver,
    });

    return {
      name: c.args.name,
      uri: c.args.uri,
      txHash,
    };
  },
});

export default contenthash;
