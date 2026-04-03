import {
  addEnsContracts,
  ensPublicActions,
  ensWalletActions,
} from "@ensdomains/ensjs";
import { setContentHashRecord } from "@ensdomains/ensjs/wallet";
import { Cli, z } from "incur";
import { createClient, createWalletClient, http } from "viem";
import { mainnet, sepolia } from "viem/chains";

import { estimateGasWithBuffer } from "../gas";
import { createLogger } from "../log";
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
    v: z
      .number()
      .default(0)
      .meta({ count: true })
      .describe("Verbosity (-v, -vv, -vvv)"),
  }),
  alias: { ows: "w", v: "v" },
  output: z.object({
    name: z.string(),
    uri: z.string(),
    txHash: z.string(),
    etherscan: z.string(),
    website: z.string(),
  }),
  async run(c) {
    const chain = CHAINS[c.options.network];
    const log = createLogger(c.options.v);
    const account = createOwsAccount(c.options.ows);

    log.info(`Setting contenthash for ${c.args.name}`);
    log.detail(`URI: ${c.args.uri}`);
    log.debug(`Network: ${c.options.network}`);
    log.debug(`Account: ${account.address}`);

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
    log.detail(`Resolver: ${resolver}`);

    // Wallet client for writing
    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(),
    }).extend(ensWalletActions);

    // Estimate gas + verify balance before sending
    const txData = setContentHashRecord.makeFunctionData(walletClient, {
      name: c.args.name,
      contentHash: c.args.uri,
      resolverAddress: resolver,
    });
    const gas = await estimateGasWithBuffer({
      chain,
      account: account.address,
      to: txData.to,
      data: txData.data,
      log,
    });

    log.info("Sending transaction...");
    const txHash = await walletClient.setContentHashRecord({
      name: c.args.name,
      contentHash: c.args.uri,
      resolverAddress: resolver,
      gas,
    });
    log.info("Transaction sent");
    log.debug(`txHash: ${txHash}`);

    const etherscan =
      c.options.network === "mainnet"
        ? `https://etherscan.io/tx/${txHash}`
        : `https://sepolia.etherscan.io/tx/${txHash}`;
    const website = `https://${c.args.name}.limo`;

    return {
      name: c.args.name,
      uri: c.args.uri,
      txHash,
      etherscan,
      website,
    };
  },
});

export default contenthash;
