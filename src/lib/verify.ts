import { formatCode, normalizeCodeInput } from "./code-format";
import { getCertificateByCode } from "./certs";

export type VerifyOutcome = "valid" | "revoked" | "not_found";

export interface VerifyResult {
  outcome: VerifyOutcome;
  /** Present only for `valid` / `revoked`. */
  certificate?: {
    code: string;
    display: string;
    recipientName: string;
    issuedOn: string;
    status: "issued" | "revoked";
    revokeReason: string | null;
    printToken: string;
  };
  message: string;
}

const MESSAGES = {
  valid: "هذه شهادة صالحة",
  revoked: "تم إلغاء هذه الشهادة",
  not_found: "لا توجد شهادة مطابقة لهذا الرقم",
} as const;

function currentCodeYear(): number {
  const y = Number(process.env.CERT_CODE_YEAR ?? new Date().getUTCFullYear());
  return Number.isFinite(y) ? y : new Date().getUTCFullYear();
}

/**
 * Look up a certificate by code.
 *
 * Accepts the printed form (ITQ-2026-1234), the bare 8-digit code, or just the
 * serial. A miss reveals nothing beyond "not found".
 *
 * Deliberately does no logging and carries no rate limiter: attempts are not
 * recorded anywhere.
 */
export function verify(rawInput: string): VerifyResult {
  const code = normalizeCodeInput(rawInput, currentCodeYear());
  if (!code) {
    return { outcome: "not_found", message: MESSAGES.not_found };
  }

  const cert = getCertificateByCode(code);
  if (!cert) {
    return { outcome: "not_found", message: MESSAGES.not_found };
  }

  return {
    outcome: cert.status === "revoked" ? "revoked" : "valid",
    message: cert.status === "revoked" ? MESSAGES.revoked : MESSAGES.valid,
    certificate: {
      code: cert.code,
      display: formatCode(cert.code),
      recipientName: cert.recipientName,
      issuedOn: cert.issuedOn,
      status: cert.status,
      revokeReason: cert.revokeReason,
      printToken: cert.printToken,
    },
  };
}
