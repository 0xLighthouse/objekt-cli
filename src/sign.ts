import { typedDataParameters } from "@objekt/shared";
import {
  getWallet,
  signTypedData as owsSignTypedData,
} from "@open-wallet-standard/core";
import { type Address, type Hex, sha256 } from "viem";

export function getWalletAddress(wallet: string): Address {
  const info = getWallet(wallet);
  const evmAccount = info.accounts.find(
    (a) => a.chainId === "evm" || a.chainId.startsWith("eip155"),
  );
  if (!evmAccount) {
    throw new Error(`No EVM account found in wallet "${wallet}"`);
  }
  return evmAccount.address as Address;
}

export function signUpload({
  wallet,
  name,
  uploadType,
  bytes,
}: {
  wallet: string;
  name: string;
  uploadType: string;
  bytes: Uint8Array;
}): {
  sig: Hex;
  expiry: string;
  unverifiedAddress: Address;
  hash: Hex;
} {
  const hash = sha256(bytes);
  const expiry = String(Date.now() + 60_000);
  const address = getWalletAddress(wallet);

  const typedData = {
    ...typedDataParameters,
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
      ],
      ...typedDataParameters.types,
    },
    message: { upload: uploadType, expiry, name, hash },
  };

  const result = owsSignTypedData(wallet, "evm", JSON.stringify(typedData));
  const sig = result.signature.startsWith("0x")
    ? (result.signature as Hex)
    : (`0x${result.signature}` as Hex);

  return { sig, expiry, unverifiedAddress: address, hash };
}
