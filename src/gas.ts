import {
  type Address,
  type Chain,
  createPublicClient,
  formatEther,
  formatGwei,
  http,
} from "viem";

type Logger = {
  info: (msg: string) => void;
  detail: (msg: string) => void;
  debug: (msg: string) => void;
};

const noopLogger: Logger = {
  info: () => {},
  detail: () => {},
  debug: () => {},
};

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
  log?: Logger;
}): Promise<bigint> {
  const log = options.log ?? noopLogger;
  const client = createPublicClient({
    chain: options.chain,
    transport: http(),
  });

  log.info("Estimating gas...");
  log.debug(`to: ${options.to}`);
  log.debug(`data: ${options.data.slice(0, 10)}...`);

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

  log.detail(`Gas estimate: ${gasEstimate} (+3% buffer → ${gas})`);
  log.detail(`Gas price: ${formatGwei(gasPrice)} gwei`);
  log.detail(`Estimated cost: ${formatEther(cost)} ETH`);
  log.detail(`Wallet balance: ${formatEther(balance)} ETH`);

  if (balance < cost) {
    const need = formatEther(cost);
    const have = formatEther(balance);
    throw new Error(
      `Insufficient ETH for gas. Need ~${need} ETH, have ${have} ETH.`,
    );
  }

  log.debug(`Balance sufficient (${formatEther(balance - cost)} ETH spare)`);
  return gas;
}
