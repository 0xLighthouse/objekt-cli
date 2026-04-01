import { x25519 } from "@noble/curves/ed25519.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import {
  ALL_NAMESPACES,
  CurveId,
  NAMESPACE_OWS_CHAIN,
  type Namespace,
  resolveNamespace,
  X25519_NAMESPACES,
} from "@objekt.sh/ecies";
import { signMessage as owsSignMessage } from "@open-wallet-standard/core";

const DERIVATION_MESSAGE = "objekt.sh encryption key v1";

export interface EncryptionKeypair {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  curve: CurveId;
  /** CAIP-2 namespace (e.g. Namespace.EIP155, Namespace.SOLANA) */
  namespace: Namespace;
}

/**
 * Derive a deterministic encryption keypair from an OWS wallet for a specific chain.
 *
 * Accepts any chain identifier (CAIP-2 namespace, full CAIP-2 ID, or friendly name).
 * Different namespaces produce different keys even from the same mnemonic.
 */
export function deriveEncryptionKeypair(
  wallet: string,
  chain: string,
): EncryptionKeypair {
  const namespace = resolveNamespace(chain);
  const owsChain = NAMESPACE_OWS_CHAIN[namespace];

  const result = owsSignMessage(wallet, owsChain, DERIVATION_MESSAGE);
  const sig = result.signature.startsWith("0x")
    ? result.signature.slice(2)
    : result.signature;
  const seed = sha256(hexToBytes(sig));

  if (X25519_NAMESPACES.includes(namespace)) {
    const publicKey = x25519.getPublicKey(seed);
    return { privateKey: seed, publicKey, curve: CurveId.X25519, namespace };
  }

  const publicKey = secp256k1.getPublicKey(seed, true);
  return { privateKey: seed, publicKey, curve: CurveId.SECP256K1, namespace };
}

/**
 * Derive encryption keypairs across all available CAIP-2 namespaces.
 * Used during decryption to try all possible keys the wallet might have.
 */
export function deriveAllEncryptionKeypairs(
  wallet: string,
): EncryptionKeypair[] {
  const keypairs: EncryptionKeypair[] = [];

  for (const ns of ALL_NAMESPACES) {
    try {
      keypairs.push(deriveEncryptionKeypair(wallet, ns));
    } catch {
      // Wallet may not have an account on this chain
    }
  }

  if (keypairs.length === 0) {
    throw new Error(
      "Could not derive any encryption keypairs — wallet has no supported chain accounts",
    );
  }

  return keypairs;
}

function hexToBytes(hex: string): Uint8Array {
  const len = hex.length / 2;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
