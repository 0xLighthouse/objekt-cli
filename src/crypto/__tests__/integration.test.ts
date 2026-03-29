import { describe, it, expect, beforeAll } from "vitest";
import { createWallet, listWallets } from "@open-wallet-standard/core";
import { CurveId, Namespace, ChainId, resolveNamespace } from "@objekt.sh/ecies";
import {
	deriveEncryptionKeypair,
	deriveAllEncryptionKeypairs,
} from "../derive-encryption-key";
import { encryptForRecipients, decryptEnvelope } from "@objekt.sh/ecies";

/**
 * Integration test: Alice (ETH) encrypts a message for:
 *   - Bob (Solana) — x25519
 *   - Bob (ETH)    — secp256k1, different wallet
 *   - Charlie (BTC) — secp256k1, bitcoin chain (bip122)
 *
 * Each recipient should be able to decrypt independently.
 * All chain identifiers use CAIP-2 Namespace enums.
 */

const WALLETS = {
	alice: "test-alice-eth",
	bobSol: "test-bob-sol",
	bobEth: "test-bob-eth",
	charlieBtc: "test-charlie-btc",
} as const;

const PLAINTEXT = new TextEncoder().encode(
	"Cross-chain encryption works!",
);
const MIME = "text/plain";

function ensureWallet(name: string) {
	const existing = listWallets().find((w) => w.name === name);
	if (!existing) createWallet(name);
}

describe("CAIP-2 namespace resolution", () => {
	it("resolves full CAIP-2 IDs", () => {
		expect(resolveNamespace(ChainId.ETHEREUM)).toBe(Namespace.EIP155);
		expect(resolveNamespace(ChainId.BASE)).toBe(Namespace.EIP155);
		expect(resolveNamespace(ChainId.BITCOIN)).toBe(Namespace.BIP122);
		expect(resolveNamespace(ChainId.SOLANA)).toBe(Namespace.SOLANA);
	});

	it("resolves bare namespaces", () => {
		expect(resolveNamespace(Namespace.EIP155)).toBe(Namespace.EIP155);
		expect(resolveNamespace(Namespace.BIP122)).toBe(Namespace.BIP122);
		expect(resolveNamespace(Namespace.SOLANA)).toBe(Namespace.SOLANA);
		expect(resolveNamespace(Namespace.COSMOS)).toBe(Namespace.COSMOS);
		expect(resolveNamespace(Namespace.TON)).toBe(Namespace.TON);
		expect(resolveNamespace(Namespace.SUI)).toBe(Namespace.SUI);
	});

	it("resolves friendly names", () => {
		expect(resolveNamespace("ethereum")).toBe(Namespace.EIP155);
		expect(resolveNamespace("base")).toBe(Namespace.EIP155);
		expect(resolveNamespace("bitcoin")).toBe(Namespace.BIP122);
		expect(resolveNamespace("polygon")).toBe(Namespace.EIP155);
	});

	it("resolves legacy OWS names", () => {
		expect(resolveNamespace("evm")).toBe(Namespace.EIP155);
	});

	it("rejects unknown chains", () => {
		expect(() => resolveNamespace("fakecoin")).toThrow("Unknown chain");
	});

	it("all EVM chains resolve to same namespace", () => {
		const evmChains = ["ethereum", "base", "polygon", "arbitrum", "optimism", "bsc", "avalanche", "plasma"];
		for (const chain of evmChains) {
			expect(resolveNamespace(chain)).toBe(Namespace.EIP155);
		}
	});
});

describe("CAIP-2 chain constants", () => {
	it("has all expected chains", () => {
		expect(ChainId.ETHEREUM).toBe("eip155:1");
		expect(ChainId.BASE).toBe("eip155:8453");
		expect(ChainId.BITCOIN).toBe("bip122:000000000019d6689c085ae165831e93");
		expect(ChainId.SOLANA).toBe("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
		expect(ChainId.COSMOS).toBe("cosmos:cosmoshub-4");
	});
});

describe("cross-chain integration: alice (eip155) → bob (solana), bob (eip155), charlie (bip122)", () => {
	let envelope: Uint8Array;

	let bobSolKp: ReturnType<typeof deriveEncryptionKeypair>;
	let bobEthKp: ReturnType<typeof deriveEncryptionKeypair>;
	let charlieBtcKp: ReturnType<typeof deriveEncryptionKeypair>;

	beforeAll(() => {
		for (const name of Object.values(WALLETS)) {
			ensureWallet(name);
		}

		bobSolKp = deriveEncryptionKeypair(WALLETS.bobSol, Namespace.SOLANA);
		bobEthKp = deriveEncryptionKeypair(WALLETS.bobEth, Namespace.EIP155);
		charlieBtcKp = deriveEncryptionKeypair(WALLETS.charlieBtc, Namespace.BIP122);

		const aliceKp = deriveEncryptionKeypair(WALLETS.alice, Namespace.EIP155);

		envelope = encryptForRecipients(
			PLAINTEXT,
			[
				{ pubKey: aliceKp.publicKey, curve: aliceKp.curve },
				{ pubKey: bobSolKp.publicKey, curve: bobSolKp.curve },
				{ pubKey: bobEthKp.publicKey, curve: bobEthKp.curve },
				{ pubKey: charlieBtcKp.publicKey, curve: charlieBtcKp.curve },
			],
			MIME,
		);
	});

	it("alice (eip155) can decrypt her own message", () => {
		const keypairs = deriveAllEncryptionKeypairs(WALLETS.alice);
		const { plaintext, mime } = decryptEnvelope(envelope, keypairs);
		expect(plaintext).toEqual(PLAINTEXT);
		expect(mime).toBe(MIME);
	});

	it("bob (solana / x25519) can decrypt", () => {
		expect(bobSolKp.curve).toBe(CurveId.X25519);
		expect(bobSolKp.namespace).toBe(Namespace.SOLANA);
		const { plaintext, mime } = decryptEnvelope(envelope, [bobSolKp]);
		expect(plaintext).toEqual(PLAINTEXT);
		expect(mime).toBe(MIME);
	});

	it("bob (eip155 / secp256k1) can decrypt", () => {
		expect(bobEthKp.curve).toBe(CurveId.SECP256K1);
		expect(bobEthKp.namespace).toBe(Namespace.EIP155);
		const { plaintext, mime } = decryptEnvelope(envelope, [bobEthKp]);
		expect(plaintext).toEqual(PLAINTEXT);
		expect(mime).toBe(MIME);
	});

	it("charlie (bip122 / secp256k1) can decrypt", () => {
		expect(charlieBtcKp.curve).toBe(CurveId.SECP256K1);
		expect(charlieBtcKp.namespace).toBe(Namespace.BIP122);
		const { plaintext, mime } = decryptEnvelope(envelope, [charlieBtcKp]);
		expect(plaintext).toEqual(PLAINTEXT);
		expect(mime).toBe(MIME);
	});

	it("bip122 key ≠ eip155 key (different namespaces, different keys)", () => {
		expect(charlieBtcKp.publicKey).not.toEqual(bobEthKp.publicKey);
	});

	it("deriving with friendly name gives same key as namespace", () => {
		const fromNamespace = deriveEncryptionKeypair(WALLETS.charlieBtc, Namespace.BIP122);
		const fromFriendly = deriveEncryptionKeypair(WALLETS.charlieBtc, "bitcoin");
		expect(fromNamespace.publicKey).toEqual(fromFriendly.publicKey);
		expect(fromNamespace.namespace).toBe(fromFriendly.namespace);
	});

	it("deriving with full CAIP-2 gives same key as namespace", () => {
		const fromNamespace = deriveEncryptionKeypair(WALLETS.alice, Namespace.EIP155);
		const fromCaip2 = deriveEncryptionKeypair(WALLETS.alice, ChainId.ETHEREUM);
		const fromBase = deriveEncryptionKeypair(WALLETS.alice, ChainId.BASE);
		expect(fromNamespace.publicKey).toEqual(fromCaip2.publicKey);
		expect(fromNamespace.publicKey).toEqual(fromBase.publicKey);
	});

	it("deriveAllEncryptionKeypairs uses CAIP-2 namespaces", () => {
		const all = deriveAllEncryptionKeypairs(WALLETS.alice);
		expect(all.length).toBeGreaterThanOrEqual(3);
		const namespaces = all.map((kp) => kp.namespace);
		expect(namespaces).toContain(Namespace.EIP155);
		expect(namespaces).toContain(Namespace.BIP122);
		expect(namespaces).toContain(Namespace.SOLANA);
	});

	it("random wallet cannot decrypt", () => {
		ensureWallet("test-random-outsider");
		const outsiderKps = deriveAllEncryptionKeypairs("test-random-outsider");
		expect(() => decryptEnvelope(envelope, outsiderKps)).toThrow(
			"None of the provided keys match",
		);
	});
});
