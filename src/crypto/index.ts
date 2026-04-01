// Re-export from @objekt.sh/ecies
export {
  decryptEnvelope,
  eciesDecrypt,
  eciesDecryptSecp256k1,
  eciesDecryptX25519,
  eciesEncrypt,
  eciesEncryptSecp256k1,
  eciesEncryptX25519,
  encryptForRecipients,
  type Keypair,
  type Recipient,
} from "@objekt.sh/ecies";

// CLI-specific (OWS key derivation)
export {
  deriveAllEncryptionKeypairs,
  deriveEncryptionKeypair,
  type EncryptionKeypair,
} from "./derive-encryption-key";
export { resolveRecipient } from "./resolve-recipient";
