/**
 * Date formatting for the certificate.
 *
 * Both formats come from ICU via `Intl`, so the Arabic month names
 * (سبتمبر، أكتوبر، نوفمبر …) and the Umm al-Qura Hijri calendar are produced by
 * the platform rather than hand-rolled tables.
 *
 * Node ships with full-icu, and so does the Playwright Chromium we render in.
 */

const GREGORIAN = new Intl.DateTimeFormat("ar-EG-u-nu-latn-ca-gregory", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const HIJRI = new Intl.DateTimeFormat("ar-SA-u-nu-arab-ca-islamic-umalqura", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export type DateInput = Date | string | number;

/** Normalise any input to a Date anchored at midday UTC (avoids DST edges). */
export function toDate(input: DateInput): Date {
  if (input instanceof Date) return input;
  if (typeof input === "number") return new Date(input);
  // Treat bare "YYYY-MM-DD" as a calendar date, not a local-midnight instant.
  const bare = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim());
  if (bare) {
    return new Date(Date.UTC(Number(bare[1]), Number(bare[2]) - 1, Number(bare[3]), 12));
  }
  return new Date(input);
}

/** "10 أكتوبر 2026" — Latin digits, Arabic month name. */
export function formatGregorianArabic(input: DateInput): string {
  return GREGORIAN.format(toDate(input));
}

/**
 * "٢٩ ربيع الآخر ١٤٤٨ هـ" — Arabic-Indic digits, Umm al-Qura calendar.
 *
 * ICU's ar-SA locale already appends the era marker (هـ), so it is stripped and
 * re-added only when an explicit `era` is requested. Passing `era: ""` omits it.
 */
export function formatHijriArabic(input: DateInput, era = "هـ"): string {
  const parts = HIJRI.formatToParts(toDate(input));
  const body = parts
    .filter((p) => p.type !== "era")
    .map((p) => p.value)
    .join("")
    .trim();
  return era ? `${body} ${era}` : body;
}

/** "2026-10-10" for <input type="date"> and DB storage. */
export function toISODate(input: DateInput): string {
  return toDate(input).toISOString().slice(0, 10);
}

/** Gregorian year of a date, used for the certificate code prefix. */
export function gregorianYear(input: DateInput): number {
  return toDate(input).getUTCFullYear();
}

/** Long Arabic month name for a 1-based month number. */
export function arabicMonthName(month: number): string {
  return new Intl.DateTimeFormat("ar-EG-u-nu-latn-ca-gregory", {
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2021, month - 1, 15)));
}
