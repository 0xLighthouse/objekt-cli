import {
  revealDepositTypedDataParameters,
  revealRemoveTypedDataParameters,
  typedDataParameters,
} from "@objekt/shared";
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

export function signRevealDeposit({
  wallet,
  ensName,
  keyName,
  commitment,
  price,
}: {
  wallet: string;
  ensName: string;
  keyName: string;
  commitment: string;
  price: string;
}): {
  sig: Hex;
  expiry: string;
  unverifiedAddress: Address;
} {
  const expiry = String(Date.now() + 60_000);
  const address = getWalletAddress(wallet);

  const typedData = {
    ...revealDepositTypedDataParameters,
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
      ],
      ...revealDepositTypedDataParameters.types,
    },
    message: { action: "deposit", ensName, keyName, commitment, price, expiry },
  };

  const result = owsSignTypedData(wallet, "evm", JSON.stringify(typedData));
  const sig = result.signature.startsWith("0x")
    ? (result.signature as Hex)
    : (`0x${result.signature}` as Hex);

  return { sig, expiry, unverifiedAddress: address };
}

export function signRevealRemove({
  wallet,
  ensName,
  keyName,
}: {
  wallet: string;
  ensName: string;
  keyName: string;
}): {
  sig: Hex;
  expiry: string;
  unverifiedAddress: Address;
} {
  const expiry = String(Date.now() + 60_000);
  const address = getWalletAddress(wallet);

  const typedData = {
    ...revealRemoveTypedDataParameters,
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
      ],
      ...revealRemoveTypedDataParameters.types,
    },
    message: { action: "remove", ensName, keyName, expiry },
  };

  const result = owsSignTypedData(wallet, "evm", JSON.stringify(typedData));
  const sig = result.signature.startsWith("0x")
    ? (result.signature as Hex)
    : (`0x${result.signature}` as Hex);

  return { sig, expiry, unverifiedAddress: address };
}
