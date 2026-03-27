import { signTypedData as owsSignTypedData } from "@open-wallet-standard/core";
import { x402Client } from "@x402/core/client";
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

const NETWORKS = [
  "eip155:8453",  // Base
  "eip155:84532", // Base Sepolia
] as const;

const EXPLORER_URLS: Record<string, string> = {
  "eip155:8453": "https://basescan.org/tx",
  "eip155:84532": "https://sepolia.basescan.org/tx",
  "eip155:1": "https://etherscan.io/tx",
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
      // OWS requires EIP712Domain in types — infer from domain fields
      const domainTypeMap: Record<string, string> = {
        name: "string",
        version: "string",
        chainId: "uint256",
        verifyingContract: "address",
        salt: "bytes32",
      };
      const domainTypes = Object.keys(typedData.domain).map((key) => ({
        name: key,
        type: domainTypeMap[key] ?? (typeof typedData.domain[key] === "bigint" || typeof typedData.domain[key] === "number" ? "uint256" : "string"),
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

export function createPaymentFetch(wallet: string) {
  const signer = createOwsSigner(wallet);
  const client = new x402Client();
  for (const network of NETWORKS) {
    client.register(network, new ExactEvmScheme(signer));
  }
  return wrapFetchWithPayment(fetch, client);
}

export function extractPaymentReceipt(res: Response) {
  const header = res.headers.get("PAYMENT-RESPONSE");
  if (!header) return undefined;
  try {
    const decoded = JSON.parse(
      Buffer.from(header, "base64").toString(),
    ) as Record<string, unknown>;
    const txHash = (decoded.txHash ?? decoded.transactionHash) as string | undefined;
    const network = decoded.network as string | undefined;
    if (txHash && network && EXPLORER_URLS[network]) {
      decoded.explorer = `${EXPLORER_URLS[network]}/${txHash}`;
    }
    return decoded;
  } catch {
    return { raw: header };
  }
}
