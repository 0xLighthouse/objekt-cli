import { signTypedData as owsSignTypedData } from "@open-wallet-standard/core";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import type { Hex } from "viem";

import { getWalletAddress } from "./sign";

// Patch BigInt serialization for x402 compatibility
if (!(BigInt.prototype as unknown as { toJSON?: () => string }).toJSON) {
  (BigInt.prototype as unknown as { toJSON: () => string }).toJSON =
    function () {
      return this.toString();
    };
}

const BASE_MAINNET = "eip155:8453";
const BASE_SEPOLIA = "eip155:84532";

const EXPLORER_URLS: Record<string, string> = {
  [BASE_MAINNET]: "https://basescan.org/tx",
  [BASE_SEPOLIA]: "https://sepolia.basescan.org/tx",
  "eip155:1": "https://etherscan.io/tx",
  base: "https://basescan.org/tx",
  "base-sepolia": "https://sepolia.basescan.org/tx",
};

function createOwsSigner(wallet: string) {
  const address = getWalletAddress(wallet);

  return {
    address,
    async signTypedData(typedData: {
      domain: Record<string, unknown>;
      types: Record<string, unknown>;
      primaryType: string;
      message: Record<string, unknown>;
    }): Promise<Hex> {
      const domainTypeMap: Record<string, string> = {
        name: "string",
        version: "string",
        chainId: "uint256",
        verifyingContract: "address",
        salt: "bytes32",
      };
      const domainTypes = Object.keys(typedData.domain).map((key) => ({
        name: key,
        type:
          domainTypeMap[key] ??
          (typeof typedData.domain[key] === "bigint" ||
          typeof typedData.domain[key] === "number"
            ? "uint256"
            : "string"),
      }));
      const withDomain = {
        ...typedData,
        types: { EIP712Domain: domainTypes, ...typedData.types },
      };
      const result = owsSignTypedData(
        wallet,
        "evm",
        JSON.stringify(withDomain),
      );
      return result.signature.startsWith("0x")
        ? (result.signature as Hex)
        : (`0x${result.signature}` as Hex);
    },
  };
}

let httpClient: x402HTTPClient | null = null;

export function createPaymentFetch(wallet: string, testnet = false) {
  const signer = createOwsSigner(wallet);
  const client = new x402Client();
  const network = testnet ? BASE_SEPOLIA : BASE_MAINNET;
  client.register(network, new ExactEvmScheme(signer));
  httpClient = new x402HTTPClient(client);
  return wrapFetchWithPayment(fetch, client);
}

export function extractPaymentReceipt(
  res: Response,
): { txHash: string; explorerUrl: string } | undefined {
  if (!httpClient) return undefined;
  try {
    const settlement = httpClient.getPaymentSettleResponse((name: string) =>
      res.headers.get(name),
    );
    if (!settlement) return undefined;

    const result = settlement as Record<string, unknown>;
    const txHash = (result.transaction ??
      result.txHash ??
      result.transactionHash) as string | undefined;
    const network = result.network as string | undefined;
    if (!txHash || !network || !EXPLORER_URLS[network]) return undefined;

    return {
      txHash,
      explorerUrl: `${EXPLORER_URLS[network]}/${txHash}`,
    };
  } catch {
    return undefined;
  }
}
