import { randomInt } from "node:crypto";

import { CODE_LENGTH, SERIAL_LENGTH } from "./code-format";

/**
 * Certificate code generation (server-only — uses node:crypto).
 *
 * A code is 8 digits: the 4-digit issue year followed by a 4-digit serial.
 *
 *     2026 1234   ->  printed as  ITQ-2026-1234
 *
 * The serial is drawn from a CSPRNG, so the printed order carries no
 * information about issue order. Obvious serials (repdigits, ascending or
 * descending runs) are rejected because they look hand-written and are the
 * first thing someone would try when guessing a code.
 */

const SERIAL_SPACE = 10 ** SERIAL_LENGTH; // 10_000

/** Serial values we refuse to hand out. */
const isUninteresting = (serial: string): boolean => {
  // 0000, 1111, 2222 … 9999
  if (/^(\d)\1{3}$/.test(serial)) return true;
  const digits = [...serial].map(Number);
  // 0123, 1234 … 6789 and their mirrors 9876, 8765 …
  const ascending = digits.every((d, i) => i === 0 || d === digits[i - 1]! + 1);
  const descending = digits.every((d, i) => i === 0 || d === digits[i - 1]! - 1);
  return ascending || descending;
};

/** 4-digit serial, zero-padded, excluding uninteresting patterns. */
export function generateSerial(isTaken: (serial: string) => boolean = () => false): string {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const serial = String(randomInt(0, SERIAL_SPACE)).padStart(SERIAL_LENGTH, "0");
    if (isUninteresting(serial)) continue;
    if (isTaken(serial)) continue;
    return serial;
  }
  throw new Error("Could not find an unused certificate serial");
}

export { CODE_LENGTH, SERIAL_LENGTH };
export {
  buildCode,
  formatCode,
  isValidCode,
  normalizeCodeInput,
  splitCode,
} from "./code-format";
