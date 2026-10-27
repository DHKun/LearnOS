/**
 * The course's "byte machine": pure, deterministic helpers that turn bytes
 * into meaning and back. Shared by browser components and server validators.
 * No I/O, no DOM, no platform text codecs (their GBK support varies), so the
 * same input always reads the same way everywhere.
 */

export type Bytes = number[];

export const MAX_BYTES = 256;

// ---------------------------------------------------------------------------
// Hex text
// ---------------------------------------------------------------------------

/** "89 50 4e 47" / "89504E47" / "0x89 0x50" → bytes; null on anything else. */
export function parseHex(text: string, max = MAX_BYTES): Bytes | null {
  const cleaned = text.replace(/0x/gi, "").replace(/[\s,]+/g, "");
  if (cleaned.length === 0) return [];
  if (!/^[0-9a-f]+$/i.test(cleaned) || cleaned.length % 2 !== 0) return null;
  const bytes: Bytes = [];
  for (let i = 0; i < cleaned.length; i += 2) bytes.push(Number.parseInt(cleaned.slice(i, i + 2), 16));
  return bytes.length <= max ? bytes : null;
}

export function toHex(bytes: Bytes): string {
  return bytes.map((byte) => byte.toString(16).toUpperCase().padStart(2, "0")).join(" ");
}

export function isByteArray(value: unknown, max = MAX_BYTES): value is Bytes {
  return (
    Array.isArray(value) &&
    value.length <= max &&
    value.every((item) => Number.isInteger(item) && item >= 0 && item <= 255)
  );
}

export function toBits(byte: number): string {
  return byte.toString(2).padStart(8, "0");
}

// ---------------------------------------------------------------------------
// Integers
// ---------------------------------------------------------------------------

export type IntType = "int8" | "uint8" | "int16" | "uint16" | "int32" | "uint32";

export const INT_TYPES: { id: IntType; bytes: number; signed: boolean }[] = [
  { id: "int8", bytes: 1, signed: true },
  { id: "uint8", bytes: 1, signed: false },
  { id: "int16", bytes: 2, signed: true },
  { id: "uint16", bytes: 2, signed: false },
  { id: "int32", bytes: 4, signed: true },
  { id: "uint32", bytes: 4, signed: false },
];

export function intRange(type: IntType): { min: number; max: number } {
  const info = INT_TYPES.find((item) => item.id === type)!;
  const span = 2 ** (8 * info.bytes);
  return info.signed ? { min: -span / 2, max: span / 2 - 1 } : { min: 0, max: span - 1 };
}

/** What a fixed-width register actually holds after storing `value` (wraps). */
export function wrap(value: number, type: IntType): number {
  const info = INT_TYPES.find((item) => item.id === type)!;
  const span = 2 ** (8 * info.bytes);
  const unsigned = ((value % span) + span) % span;
  return info.signed && unsigned >= span / 2 ? unsigned - span : unsigned;
}

export function readUint(bytes: Bytes, offset: number, size: 1 | 2 | 4, order: "be" | "le"): number | null {
  if (offset < 0 || offset + size > bytes.length) return null;
  let value = 0;
  for (let i = 0; i < size; i += 1) {
    const byte = bytes[order === "be" ? offset + i : offset + size - 1 - i];
    value = value * 256 + byte;
  }
  return value;
}

export function writeUint(value: number, size: 1 | 2 | 4, order: "be" | "le"): Bytes {
  const out: Bytes = [];
  let rest = ((value % 2 ** (8 * size)) + 2 ** (8 * size)) % 2 ** (8 * size);
  for (let i = 0; i < size; i += 1) {
    out.unshift(rest % 256);
    rest = Math.floor(rest / 256);
  }
  return order === "be" ? out : out.reverse();
}

// ---------------------------------------------------------------------------
// Text codebooks
// ---------------------------------------------------------------------------

export const REPLACEMENT = "�";

export function utf8Encode(text: string): Bytes {
  const out: Bytes = [];
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (code < 0x80) out.push(code);
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000) out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    else
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
  }
  return out;
}

/** How many bytes a UTF-8 sequence starting with this byte claims (0 = not a lead byte). */
export function utf8SequenceLength(lead: number): number {
  if (lead < 0x80) return 1;
  if (lead >= 0xc2 && lead <= 0xdf) return 2;
  if (lead >= 0xe0 && lead <= 0xef) return 3;
  if (lead >= 0xf0 && lead <= 0xf4) return 4;
  return 0;
}

/** UTF-8 decoding; each broken sequence becomes one U+FFFD and decoding resumes at the offending byte. */
export function utf8Decode(bytes: Bytes): string {
  let out = "";
  let i = 0;
  while (i < bytes.length) {
    const lead = bytes[i];
    const size = utf8SequenceLength(lead);
    if (size === 0) {
      out += REPLACEMENT;
      i += 1;
      continue;
    }
    if (size === 1) {
      out += String.fromCharCode(lead);
      i += 1;
      continue;
    }
    let code = lead & (size === 2 ? 0x1f : size === 3 ? 0x0f : 0x07);
    let j = 1;
    for (; j < size; j += 1) {
      const next = bytes[i + j];
      if (next === undefined || (next & 0xc0) !== 0x80) break;
      code = (code << 6) | (next & 0x3f);
    }
    if (j < size) {
      out += REPLACEMENT;
      i += j;
      continue;
    }
    out += String.fromCodePoint(code);
    i += size;
  }
  return out;
}

/** ISO-8859-1: every byte is the code point of the same value. */
export function latin1Decode(bytes: Bytes): string {
  return bytes.map((byte) => String.fromCharCode(byte)).join("");
}

/**
 * The slice of GBK this course needs. A real GBK table has ~22,000 entries;
 * the labs only ever show these, so a lookup keeps decoding deterministic.
 */
const GBK_PAIRS: Record<string, string> = {
  C1D6: "林", D0A1: "小", C2FA: "满", C4E3: "你", BAC3: "好", D6D0: "中", CEC4: "文",
  D5C5: "张", C8FD: "三", B1A8: "报", B8E6: "告",
  // What UTF-8 bytes turn into when misread as GBK:
  E4BD: "浣", A0E5: "犲", A5BD: "ソ", EFBF: "锟", BDEF: "斤", BFBD: "拷",
};
const GBK_ENCODE: Record<string, Bytes> = Object.fromEntries(
  Object.entries(GBK_PAIRS)
    .filter(([pair]) => !["E4BD", "A0E5", "A5BD", "EFBF", "BDEF", "BFBD"].includes(pair))
    .map(([pair, char]) => [char, [Number.parseInt(pair.slice(0, 2), 16), Number.parseInt(pair.slice(2), 16)]]),
);

export function gbkDecode(bytes: Bytes): string {
  let out = "";
  let i = 0;
  while (i < bytes.length) {
    const byte = bytes[i];
    if (byte < 0x80) {
      out += String.fromCharCode(byte);
      i += 1;
      continue;
    }
    if (i + 1 >= bytes.length) {
      out += REPLACEMENT;
      i += 1;
      continue;
    }
    const pair = `${byte.toString(16).toUpperCase().padStart(2, "0")}${bytes[i + 1].toString(16).toUpperCase().padStart(2, "0")}`;
    out += GBK_PAIRS[pair] ?? REPLACEMENT;
    i += 2;
  }
  return out;
}

/** Returns null when a character is outside the course's GBK slice. */
export function gbkEncode(text: string): Bytes | null {
  const out: Bytes = [];
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (code < 0x80) out.push(code);
    else if (GBK_ENCODE[char]) out.push(...GBK_ENCODE[char]);
    else return null;
  }
  return out;
}

export type Codebook = "utf-8" | "gbk" | "latin-1";
export const CODEBOOKS: { id: Codebook; label: string }[] = [
  { id: "utf-8", label: "UTF-8" },
  { id: "gbk", label: "GBK" },
  { id: "latin-1", label: "Latin-1" },
];

export function decode(bytes: Bytes, codebook: Codebook): string {
  if (codebook === "utf-8") return utf8Decode(bytes);
  if (codebook === "gbk") return gbkDecode(bytes);
  return latin1Decode(bytes);
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

export function sumMod256(bytes: Bytes): number {
  return bytes.reduce((sum, byte) => (sum + byte) % 256, 0);
}

export function parity(bits: number[]): 0 | 1 {
  return (bits.reduce((sum, bit) => sum + bit, 0) % 2) as 0 | 1;
}

// ---------------------------------------------------------------------------
// Color
// ---------------------------------------------------------------------------

export function parseColor(text: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(text.trim());
  if (!match) return null;
  const hex = match[1];
  return [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

/** WCAG 2 relative luminance. */
export function luminance([r, g, b]: [number, number, number]): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Hue in degrees, saturation and lightness in 0–1 (HSL). */
export function hsl([r, g, b]: [number, number, number]): { h: number; s: number; l: number } {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h * 60, s, l };
}
