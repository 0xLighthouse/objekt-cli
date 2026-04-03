import {
  type Address,
  type Chain,
  createPublicClient,
  formatEther,
  http,
} from "viem";

/**
 * Estimate gas for a transaction with a 3% buffer, and verify the
 * account has enough ETH to cover it. Returns the buffered gas limit
 * or throws with a human-readable insufficient-funds message.
 */
export async function estimateGasWithBuffer(options: {
  chain: Chain;
  account: Address;
  to: Address;
  data: `0x${string}`;
}): Promise<bigint> {
  const client = createPublicClient({
    chain: options.chain,
    transport: http(),
  });

  const [gasEstimate, gasPrice, balance] = await Promise.all([
    client.estimateGas({
      account: options.account,
      to: options.to,
      data: options.data,
    }),
    client.getGasPrice(),
    client.getBalance({ address: options.account }),
  ]);

  const gas = (gasEstimate * 103n) / 100n;
  const cost = gas * gasPrice;

  if (balance < cost) {
    const need = formatEther(cost);
    const have = formatEther(balance);
    throw new Error(
      `Insufficient ETH for gas. Need ~${need} ETH, have ${have} ETH.`,
    );
  }

  return gas;
}
