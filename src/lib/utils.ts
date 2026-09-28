import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Strip Arabic diacritics, tatweel and normalise whitespace/letterforms. */
export function normalizeArabicName(input: string): string {
  return input
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Collapse a name to its "first + last" tokens for duplicate detection. */
export function nameKey(input: string): string {
  const parts = normalizeArabicName(input).split(" ").filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0]!;
  return `${parts[0]!} ${parts[parts.length - 1]!}`;
}
