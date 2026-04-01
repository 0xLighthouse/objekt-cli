import { addEnsContracts, ensPublicActions } from "@ensdomains/ensjs";
import { CurveId } from "@objekt.sh/ecies";
import { createClient, http } from "viem";
import { mainnet, sepolia } from "viem/chains";

const CHAINS = {
  mainnet: addEnsContracts(mainnet),
  sepolia: addEnsContracts(sepolia),
} as const;

const ENS_TEXT_KEY = "sh.objekt.encpubkey";

interface ResolvedRecipient {
  pubKey: Uint8Array;
  curve: CurveId;
}

/**
 * Resolve an --encrypt-for argument to a public key + curve.
 *
 * Accepts:
 *   - Hex compressed secp256k1 pubkey: "0x02..." or "0x03..." (66 hex chars)
 *   - Hex X25519 pubkey: "0x" + 64 hex chars (32 bytes)
 *   - ENS name (*.eth): resolves text record "sh.objekt.encpubkey"
 *     Record format: "secp256k1:0x02..." or "x25519:0x..."
 */
export async function resolveRecipient(
  recipient: string,
  network: "mainnet" | "sepolia" = "mainnet",
): Promise<ResolvedRecipient> {
  // Hex public key
  if (recipient.startsWith("0x")) {
    const bytes = hexToBytes(recipient.slice(2));

    if (bytes.length === 33 && (bytes[0] === 0x02 || bytes[0] === 0x03)) {
      return { pubKey: bytes, curve: CurveId.SECP256K1 };
    }

    if (bytes.length === 32) {
      return { pubKey: bytes, curve: CurveId.X25519 };
    }

    throw new Error(
      `Invalid public key: expected 33 bytes (secp256k1) or 32 bytes (x25519), got ${bytes.length}`,
    );
  }

  // ENS name
  if (recipient.endsWith(".eth")) {
    return resolveEnsEncryptionKey(recipient, network);
  }

  throw new Error(
    `Cannot resolve recipient "${recipient}". Provide a hex public key (0x...) or ENS name (*.eth).`,
  );
}

async function resolveEnsEncryptionKey(
  ensName: string,
  network: "mainnet" | "sepolia",
): Promise<ResolvedRecipient> {
  const chain = CHAINS[network];
  const client = createClient({ chain, transport: http() }).extend(
    ensPublicActions,
  );

  const record = await client.getTextRecord({
    name: ensName,
    key: ENS_TEXT_KEY,
  });

  if (!record) {
    throw new Error(
      `No encryption key found for ${ensName}. ` +
        `They need to publish one with: objekt ens encryption-key set ${ensName}`,
    );
  }

  // Format: "secp256k1:0x02abc..." or "x25519:0xabc..."
  const colonIdx = record.indexOf(":");
  if (colonIdx === -1) {
    throw new Error(
      `Malformed encryption key record for ${ensName}: ${record}`,
    );
  }

  const curveStr = record.slice(0, colonIdx);
  const hexKey = record.slice(colonIdx + 1);

  if (curveStr === "secp256k1") {
    return {
      pubKey: hexToBytes(hexKey.replace("0x", "")),
      curve: CurveId.SECP256K1,
    };
  }
  if (curveStr === "x25519") {
    return {
      pubKey: hexToBytes(hexKey.replace("0x", "")),
      curve: CurveId.X25519,
    };
  }

  throw new Error(
    `Unknown curve "${curveStr}" in encryption key record for ${ensName}`,
  );
}

function hexToBytes(hex: string): Uint8Array {
  const len = hex.length / 2;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
