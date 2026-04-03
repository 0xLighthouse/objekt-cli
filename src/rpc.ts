import { fallback, http, type Transport } from "viem";

const PUBLIC_RPCS = [
  "https://cloudflare-eth.com",
  "https://eth.llamarpc.com",
  "https://rpc.ankr.com/eth",
  "https://ethereum-rpc.publicnode.com",
];

/**
 * Build a viem transport. If an explicit URL is provided, use it directly.
 * Otherwise fall back through a list of public RPCs.
 */
export function rpcTransport(url?: string): Transport {
  if (url) return http(url);
  return fallback(PUBLIC_RPCS.map((u) => http(u)));
}
