import { Cli, z } from "incur";

import { getEnsApiUrl } from "../api";

const pricing = Cli.create("pricing", {
  description: "Show storage tiers, pricing, and limits",
  options: z.object({
    ensApi: z.string().optional().describe("ENS API base URL"),
    network: z
      .enum(["mainnet", "sepolia"])
      .default("mainnet")
      .describe("Network"),
  }),
  output: z.object({
    tiers: z.record(z.any()),
    mediaTypes: z.record(z.any()),
    rateLimits: z.record(z.any()),
  }),
  async run(c) {
    const url = `${getEnsApiUrl(c.options)}/pricing`;
    const res = await fetch(url);

    if (!res.ok) {
      const text = await res.text();
      return c.error({ code: "FETCH_FAILED", message: text, exitCode: 1 });
    }

    return res.json();
  },
});

export default pricing;
