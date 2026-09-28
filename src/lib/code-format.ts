/**
 * Pure certificate-code formatting and parsing.
 *
 * Deliberately free of Node built-ins so it can be imported from client
 * components. The generator (which needs node:crypto) lives in ./codes.
 */

export const SERIAL_LENGTH = 4;
export const CODE_LENGTH = 8;

/** 8-digit code for a serial within a year. */
export function buildCode(year: number, serial: string): string {
  return `${String(year).padStart(4, "0")}${serial}`;
}

export function splitCode(code: string): { year: number; serial: string } {
  return { year: Number(code.slice(0, 4)), serial: code.slice(4) };
}

/** `20261234` -> `ITQ-2026-1234` */
export function formatCode(code: string, prefix = "ITQ"): string {
  const { year, serial } = splitCode(code);
  return `${prefix}-${year}-${serial}`;
}

export function isValidCode(code: string): boolean {
  return new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code);
}

/**
 * Accept whatever a certificate holder might type or scan:
 *
 *   `20261234`        bare code
 *   `ITQ-2026-1234`   as printed on the certificate
 *   `itqan-2026-1234`, `2026-1234`, `1234` (serial within `currentYear`)
 *
 * Returns the bare 8-digit code, or null if the input cannot be understood.
 */
export function normalizeCodeInput(input: string, currentYear?: number): string | null {
  const raw = input.trim();
  if (!raw) return null;

  // Strip a leading organisation prefix such as ITQ- / ITQAN-
  const withoutPrefix = raw.replace(/^[A-Za-z]{2,10}-(?=\d)/, "");
  const compact = withoutPrefix.replace(/[\s‐-―_]/g, "");

  if (isValidCode(compact)) return compact;

  // PREFIX-YYYY-SSSS or YYYY-SSSS
  const yearSerial = /^(\d{4})-?(\d{1,4})$/.exec(compact);
  if (yearSerial) {
    const serial = yearSerial[2]!.padStart(SERIAL_LENGTH, "0");
    if (serial.length === SERIAL_LENGTH) return `${yearSerial[1]}${serial}`;
  }

  // Bare serial, resolved against the current year.
  if (currentYear && new RegExp(`^\\d{1,${SERIAL_LENGTH}}$`).test(compact)) {
    return `${String(currentYear).padStart(4, "0")}${compact.padStart(SERIAL_LENGTH, "0")}`;
  }

  return null;
}
