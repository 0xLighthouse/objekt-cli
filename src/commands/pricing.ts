import { Cli, z } from "incur";

import { getApiUrl } from "../api";

const pricing = Cli.create("pricing", {
  description: "Show storage tiers, pricing, and limits",
  options: z.object({
    api: z.string().optional().describe("API base URL"),
    network: z
      .enum(["mainnet", "sepolia"])
      .default("mainnet")
      .describe("Network"),
    testnet: z.boolean().default(false).describe("Use testnet"),
  }),
  output: z.object({
    tiers: z.record(z.string(), z.any()),
    mediaTypes: z.record(z.string(), z.any()),
    rateLimits: z.record(z.string(), z.any()),
  }),
  async run(c) {
    const url = `${getApiUrl(c.options)}/pricing`;
    const res = await fetch(url);

    if (!res.ok) {
      const text = await res.text();
      return c.error({ code: "FETCH_FAILED", message: text, exitCode: 1 });
    }

    return res.json();
  },
});

export default pricing;
