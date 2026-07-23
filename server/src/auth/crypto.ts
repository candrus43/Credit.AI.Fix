// ──────────────────────────────────────────────
// CreditBridge — Cryptographic Utilities
// ──────────────────────────────────────────────
//
// Uses Bun's built-in crypto module for all operations.
// Encryption key sourced from ENCRYPTION_KEY env var with a dev fallback.
// Tokens are NEVER logged.
// ──────────────────────────────────────────────

import { createHash, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// ── Encryption Key ──────────────────────────

function getEncryptionKey(): Buffer {
  const envKey = process.env.ENCRYPTION_KEY;
  if (envKey && envKey.length >= 32) {
    return Buffer.from(envKey.slice(0, 32), "utf-8");
  }
  // Dev fallback — clearly logged as warning
  const fallback = "creditbridge-dev-key-00000000000";
  console.warn(
    "[crypto] WARNING: ENCRYPTION_KEY not set or too short. " +
      "Using development fallback key. Do NOT use in production."
  );
  return Buffer.from(fallback.slice(0, 32), "utf-8");
}

// ── Base64URL ────────────────────────────────

function toBase64URL(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64URL(str: string): Buffer {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

// ── PKCE ─────────────────────────────────────

/**
 * Generate a cryptographically random PKCE code verifier.
 * Returns a 64-byte base64url-encoded string (S256-compatible).
 */
export function generatePKCEVerifier(): string {
  const bytes = randomBytes(64);
  return toBase64URL(bytes);
}

/**
 * Generate a PKCE S256 code challenge from a verifier.
 * SHA-256 hash, base64url encoded.
 */
export function generatePKCEChallenge(verifier: string): string {
  const hash = createHash("sha256").update(verifier).digest();
  return toBase64URL(hash);
}

// ── State Parameter ──────────────────────────

/**
 * Generate a cryptographically random state parameter (32-byte hex).
 */
export function generateState(): string {
  return randomBytes(32).toString("hex");
}

// ── Token Encryption (AES-256-GCM) ───────────

/**
 * Encrypt a token string using AES-256-GCM.
 * Returns a base64-encoded string containing IV + auth tag + ciphertext.
 * Format: base64(IV(12) || authTag(16) || ciphertext)
 */
export function encryptToken(token: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(token, "utf-8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString("base64");
}

/**
 * Decrypt a token encrypted with encryptToken.
 */
export function decryptToken(encrypted: string): string {
  const key = getEncryptionKey();
  const combined = Buffer.from(encrypted, "base64");
  const iv = combined.subarray(0, 12);
  const authTag = combined.subarray(12, 28);
  const ciphertext = combined.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString("utf-8");
}
