import {
  signMessage as owsSignMessage,
  signTransaction as owsSignTransaction,
  signTypedData as owsSignTypedData,
} from "@open-wallet-standard/core";
import {
  type Hex,
  hexToNumber,
  type LocalAccount,
  type Signature,
  serializeTransaction,
} from "viem";
import { toAccount } from "viem/accounts";

import { getWalletAddress } from "./sign";

/**
 * Create a viem LocalAccount backed by an OWS wallet.
 * Supports signMessage, signTransaction, and signTypedData.
 */
export function createOwsAccount(wallet: string): LocalAccount {
  const address = getWalletAddress(wallet);

  return toAccount({
    address,

    async signMessage({ message }) {
      const msg =
        typeof message === "string"
          ? message
          : typeof message === "object" && "raw" in message
            ? typeof message.raw === "string"
              ? message.raw
              : Buffer.from(message.raw).toString("hex")
            : String(message);
      const result = owsSignMessage(wallet, "ethereum", msg);
      return (
        result.signature.startsWith("0x")
          ? result.signature
          : `0x${result.signature}`
      ) as Hex;
    },

    async signTransaction(transaction, options) {
      const serializer = options?.serializer ?? serializeTransaction;
      const serialized = serializer(transaction);
      const result = owsSignTransaction(wallet, "ethereum", serialized);
      const sig = result.signature.startsWith("0x")
        ? result.signature
        : `0x${result.signature}`;

      // OWS returns raw signature (r + s + v, 65 bytes).
      // Re-serialize the transaction with the signature included.
      const r = `0x${sig.slice(2, 66)}` as Hex;
      const s = `0x${sig.slice(66, 130)}` as Hex;
      const v = hexToNumber(`0x${sig.slice(130, 132)}`);
      const yParity = v >= 27 ? v - 27 : v;

      const signature: Signature = {
        r,
        s,
        v: BigInt(v),
        yParity,
      };

      return serializer(transaction, signature);
    },

    async signTypedData(typedData) {
      const domainTypeMap: Record<string, string> = {
        name: "string",
        version: "string",
        chainId: "uint256",
        verifyingContract: "address",
        salt: "bytes32",
      };
      const domain = (typedData.domain ?? {}) as Record<string, unknown>;
      const domainTypes = Object.keys(domain).map((key) => ({
        name: key,
        type:
          domainTypeMap[key] ??
          (typeof domain[key] === "bigint" || typeof domain[key] === "number"
            ? "uint256"
            : "string"),
      }));
      const withDomain = {
        ...typedData,
        types: { EIP712Domain: domainTypes, ...typedData.types },
      };
      const result = owsSignTypedData(
        wallet,
        "ethereum",
        JSON.stringify(withDomain, (_key, value) =>
          typeof value === "bigint" ? value.toString() : value,
        ),
      );
      return (
        result.signature.startsWith("0x")
          ? result.signature
          : `0x${result.signature}`
      ) as Hex;
    },
  });
}
