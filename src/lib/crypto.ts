import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

// Symmetric encryption for secrets at rest (currently the Jobber OAuth
// tokens). AES-256-GCM with a random per-value IV and an auth tag.
//
// The key is derived from AUTH_SECRET (already required for NextAuth), so
// there's no extra env var to set. A dedicated TOKEN_ENCRYPTION_KEY can be
// provided later to decouple the two without code changes. Rotating either
// secret invalidates existing ciphertext — for the Jobber tokens that just
// means reconnecting on the Jobber page (and rotating AUTH_SECRET already
// invalidates sessions anyway).

const PREFIX = "enc:v1:";

function getKey(): Buffer {
  const secret = process.env.TOKEN_ENCRYPTION_KEY || process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "Missing AUTH_SECRET (or TOKEN_ENCRYPTION_KEY) — required to encrypt secrets.",
    );
  }
  return createHash("sha256").update(secret).digest(); // 32 bytes for AES-256
}

/** Encrypt a string. Output: `enc:v1:<iv>:<tag>:<ciphertext>` (all base64). */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12); // 96-bit nonce, standard for GCM
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ct = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return (
    PREFIX +
    [iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(
      ":",
    )
  );
}

/**
 * Decrypt a value produced by encryptSecret. Values without the prefix are
 * returned unchanged — this is how legacy plain-text tokens keep working
 * until they're re-encrypted on the next write.
 */
export function decryptSecret(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored; // legacy plain text

  const parts = stored.slice(PREFIX.length).split(":");
  if (parts.length !== 3) return stored; // unrecognized — leave as-is
  const [ivB64, tagB64, ctB64] = parts;

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      getKey(),
      Buffer.from(ivB64, "base64"),
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(ctB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error(
      "Failed to decrypt a stored secret. If AUTH_SECRET changed, reconnect Jobber.",
    );
  }
}
