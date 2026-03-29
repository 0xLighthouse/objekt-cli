// Re-export from @objekt.sh/ecies
export {
	eciesEncrypt,
	eciesDecrypt,
	eciesEncryptSecp256k1,
	eciesDecryptSecp256k1,
	eciesEncryptX25519,
	eciesDecryptX25519,
	encryptForRecipients,
	decryptEnvelope,
	type Recipient,
	type Keypair,
} from "@objekt.sh/ecies";

// CLI-specific (OWS key derivation)
export {
	deriveEncryptionKeypair,
	deriveAllEncryptionKeypairs,
	type EncryptionKeypair,
} from "./derive-encryption-key";

export { resolveRecipient } from "./resolve-recipient";
