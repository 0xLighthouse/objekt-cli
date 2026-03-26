import {
  getWallet,
  signTypedData as owsSignTypedData,
} from "@open-wallet-standard/core";
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { wrapFetchWithPayment } from "@x402/fetch";
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
