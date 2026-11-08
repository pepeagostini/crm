/**
 * Secret encryption for the messaging settings.
 *
 * SMTP passwords and WhatsApp tokens are stored encrypted so they never sit in
 * clear text inside db.json or the configured database. The key is derived from
 * JWT_SECRET, which already has to be present and at least 32 characters.
 *
 * Format: "enc:v1:<iv-base64>:<tag-base64>:<ciphertext-base64>"
 * AES-256-GCM is authenticated, so a tampered value fails to decrypt instead of
 * silently returning garbage.
 */

const crypto = require("crypto");

const ALGO = "aes-256-gcm";
const PREFIX = "enc:v1:";
const IV_BYTES = 12;

let cachedKey = null;

/** Derives a 32-byte key from JWT_SECRET (or a dev fallback). */
function key() {
  if (cachedKey) return cachedKey;
  const secret = process.env.JWT_SECRET || "crm-development-secret-change-me-please";
  cachedKey = crypto.createHash("sha256").update(`crm:messaging:${secret}`).digest();
  return cachedKey;
}

/** True when the value is already encrypted (never double-encrypt). */
function isEncrypted(value) {
  return typeof value === "string" && value.startsWith(PREFIX);
}

/** Encrypts a plaintext secret. Already-encrypted values pass through. */
function encrypt(plaintext) {
  if (plaintext === undefined || plaintext === null || plaintext === "") return "";
  if (isEncrypted(plaintext)) return plaintext;
  const iv = crypto.randomBytes(IV_BYTES);
  // createCipheriv (not createCipher) so the key length is explicit and Node
  // cannot pick a weaker cipher.
  const cipher = crypto.createCipheriv(ALGO, key(), iv);
  cipher.setAAD(Buffer.from("crm:messaging"));
  const encrypted = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv, tag, encrypted].map((b) => b.toString("base64")).join(":");
}

/**
 * Decrypts a secret. Values that were never encrypted are returned as-is, which
 * keeps configs written before this feature working.
 */
function decrypt(value) {
  if (!isEncrypted(value)) return value || "";
  try {
    const [, , ivB64, tagB64, dataB64] = value.split(":");
    const decipher = crypto.createDecipheriv(ALGO, key(), Buffer.from(ivB64, "base64"));
    decipher.setAAD(Buffer.from("crm:messaging"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString(
      "utf8"
    );
  } catch {
    // Most likely cause: JWT_SECRET was regenerated. Returning an empty string
    // makes the UI ask for the credential again instead of sending garbage.
    return "";
  }
}

/** Masks a secret for display: keeps the last 2 characters. */
function mask(value) {
  const plain = decrypt(value);
  if (!plain) return "";
  if (plain.length <= 4) return "•".repeat(plain.length);
  return `${"•".repeat(Math.min(12, plain.length - 2))}${plain.slice(-2)}`;
}

module.exports = { encrypt, decrypt, mask, isEncrypted };