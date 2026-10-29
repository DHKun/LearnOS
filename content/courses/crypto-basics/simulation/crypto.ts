/**
 * Teaching-sized cryptography. Every primitive here is a deliberately tiny
 * toy that shows the idea and nothing more: a 64-bit fingerprint function
 * standing in for SHA-256, and RSA with four-digit moduli standing in for
 * 2048-bit keys. None of it is fit for protecting anything real.
 */

// ---------------------------------------------------------------------------
// Fingerprints (a toy hash)
// ---------------------------------------------------------------------------

function fmix(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** 16 hex digits. Same input → same output; change one character and most digits change. */
export function fingerprint(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x9747b28c;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    a = Math.imul(a ^ code, 0x01000193) >>> 0;
    b = Math.imul(b ^ code, 0x5bd1e995) >>> 0;
    b ^= b >>> 15;
  }
  a = fmix(a ^ text.length);
  b = fmix(b ^ a);
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

export function groupHex(hex: string): string {
  return hex.match(/.{1,4}/g)!.join(" ");
}

/** The fingerprint as a number below `modulus`, for toy signatures. */
export function digest(text: string, modulus: number): number {
  return (parseInt(fingerprint(text).slice(0, 8), 16) % (modulus - 2)) + 2;
}

// ---------------------------------------------------------------------------
// Toy RSA
// ---------------------------------------------------------------------------

export type KeyPair = { owner: string; n: number; e: number; d: number };

function modpow(base: number, exponent: number, modulus: number): number {
  let result = 1;
  let b = base % modulus;
  let e = exponent;
  while (e > 0) {
    if (e & 1) result = Number((BigInt(result) * BigInt(b)) % BigInt(modulus));
    b = Number((BigInt(b) * BigInt(b)) % BigInt(modulus));
    e = Math.floor(e / 2);
  }
  return result;
}

function inverse(a: number, m: number): number {
  let [oldR, r] = [a, m];
  let [oldS, s] = [1, 0];
  while (r !== 0) {
    const q = Math.floor(oldR / r);
    [oldR, r] = [r, oldR - q * r];
    [oldS, s] = [s, oldS - q * s];
  }
  return ((oldS % m) + m) % m;
}

function keyPair(owner: string, p: number, q: number, e = 17): KeyPair {
  return { owner, n: p * q, e, d: inverse(e, (p - 1) * (q - 1)) };
}

export const KEYS = {
  director: keyPair("周馆长", 61, 53),
  you: keyPair("你", 67, 71),
  library: keyPair("图书馆", 73, 79),
  impostor: keyPair("library-test.example", 59, 67),
} as const;
export type KeyId = keyof typeof KEYS;

/** Raise to the public exponent: encrypt for the owner, or check their signature. */
export function withPublic(key: KeyPair, value: number): number {
  return modpow(value, key.e, key.n);
}

/** Raise to the private exponent: decrypt, or sign. Only the owner can do this. */
export function withPrivate(key: KeyPair, value: number): number {
  return modpow(value, key.d, key.n);
}

export function sign(key: KeyPair, text: string): number {
  return withPrivate(key, digest(text, key.n));
}

export function verify(key: KeyPair, text: string, signature: number): boolean {
  return Number.isInteger(signature) && signature > 0 && signature < key.n && withPublic(key, signature) === digest(text, key.n);
}

/** A short, human-checkable label for a public key. */
export function keyFingerprint(key: KeyPair): string {
  return groupHex(fingerprint(`${key.n}:${key.e}`).slice(0, 8));
}
