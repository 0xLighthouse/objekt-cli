import { signTypedData as owsSignTypedData } from "@open-wallet-standard/core";
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import {
  decodePaymentResponseHeader,
  wrapFetchWithPayment,
} from "@x402/fetch";
import type { Hex } from "viem";

import { getWalletAddress } from "./sign";

function createOwsSigner(wallet: string) {
  const address = getWalletAddress(wallet);

  return {
    address,
    async signTypedData(message: {
      domain: Record<string, unknown>;
      types: Record<string, unknown>;
      primaryType: string;
      message: Record<string, unknown>;
    }): Promise<Hex> {
      const result = owsSignTypedData(
        wallet,
        "evm",
        JSON.stringify(message),
      );
      return result.signature.startsWith("0x")
        ? (result.signature as Hex)
        : (`0x${result.signature}` as Hex);
    },
  };
}

export function createPaymentFetch(wallet: string) {
  const signer = createOwsSigner(wallet);
  const client = new x402Client().register(
    "eip155:8453",
    new ExactEvmScheme(signer),
  );
  return wrapFetchWithPayment(fetch, client);
}

const EXPLORER_URLS: Record<string, string> = {
  "eip155:8453": "https://basescan.org/tx",
  "eip155:84532": "https://sepolia.basescan.org/tx",
  "eip155:1": "https://etherscan.io/tx",
};

export function extractPaymentReceipt(res: Response) {
  const header = res.headers.get("PAYMENT-RESPONSE");
  if (!header) return undefined;
  try {
    const decoded = decodePaymentResponseHeader(header) as Record<string, unknown>;
    const txHash = decoded.txHash as string | undefined;
    const network = decoded.network as string | undefined;
    if (txHash && network && EXPLORER_URLS[network]) {
      decoded.explorer = `${EXPLORER_URLS[network]}/${txHash}`;
    }
    return decoded;
  } catch {
    return { raw: header };
  }
}
