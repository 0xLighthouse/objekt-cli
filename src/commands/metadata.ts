import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { Cli, z } from "incur";

const require = createRequire(import.meta.url);
const cliEntrypoint = join(
  dirname(require.resolve("@ensmetadata/cli/package.json")),
  "dist",
  "cli.js",
);

function passthrough(subcommand: string, args: string[]) {
  try {
    execFileSync("node", [cliEntrypoint, subcommand, ...args], {
      stdio: "inherit",
    });
  } catch (e) {
    const code = (e as { status?: number }).status ?? 1;
    process.exit(code);
  }
}

const metadata = Cli.create("metadata", {
  description:
    "Manage ENS agent metadata (ERC-8004). View, set, validate, and template metadata records.",
});

// ─── metadata view ───────────────────────────────────────────────────────────

metadata.command("view", {
  description: "View ENS node metadata text records",
  args: z.object({
    name: z.string().describe("ENS name (e.g. myagent.eth)"),
  }),
  options: z.object({
    json: z.boolean().default(false).describe("Output as JSON"),
  }),
  output: z.object({}),
  examples: [
    {
      args: { name: "1a35e1.eth" },
      options: {},
      description: "View metadata for 1a35e1.eth",
    },
  ],
  run(c) {
    const flags = c.options.json ? ["--json"] : [];
    passthrough("metadata", ["view", c.args.name, ...flags]);
    return {};
  },
});

// ─── metadata set ────────────────────────────────────────────────────────────

metadata.command("set", {
  description:
    "Set ENS metadata text records from a payload file (dry run by default)",
  args: z.object({
    name: z.string().describe("ENS name (e.g. myagent.eth)"),
    payload: z.string().describe("Path to payload.json"),
  }),
  options: z.object({
    privateKey: z
      .string()
      .describe("Private key for signing (hex, prefixed with 0x)"),
    broadcast: z
      .boolean()
      .default(false)
      .describe("Broadcast the transaction on-chain (default: dry run)"),
  }),
  output: z.object({}),
  examples: [
    {
      args: { name: "1a35e1.eth", payload: "agent.json" },
      options: { privateKey: "0x...", broadcast: false },
      description: "Dry run setting metadata for 1a35e1.eth",
    },
  ],
  run(c) {
    const flags = [
      "--private-key",
      c.options.privateKey,
      ...(c.options.broadcast ? ["--broadcast"] : []),
    ];
    passthrough("metadata", ["set", c.args.name, c.args.payload, ...flags]);
    return {};
  },
});

// ─── metadata validate ───────────────────────────────────────────────────────

metadata.command("validate", {
  description: "Validate an ENS metadata payload file against the agent schema",
  args: z.object({
    payload: z.string().describe("Path to payload.json"),
  }),
  output: z.object({}),
  examples: [
    {
      args: { payload: "agent.json" },
      options: {},
      description: "Validate agent.json against the ERC-8004 schema",
    },
  ],
  run(c) {
    passthrough("metadata", ["validate", c.args.payload]);
    return {};
  },
});

// ─── metadata template ──────────────────────────────────────────────────────

metadata.command("template", {
  description: "Generate a starter ENS metadata payload template",
  output: z.object({}),
  run() {
    passthrough("metadata", ["template"]);
    return {};
  },
});

export default metadata;
