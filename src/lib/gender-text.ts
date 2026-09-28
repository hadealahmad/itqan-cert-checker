/**
 * Gender-aware certificate copy.
 *
 * Arabic marks gender on the verb and on possessive suffixes, so four phrases in
 * the paragraph change with the recipient:
 *
 *   قد ساهم  →  قد ساهمت
 *   لجهوده   →  لجهودها     ومساهمته  →  ومساهمتها
 *   في أثره  →  في أثرها    عمله       →  عملها
 *
 * Everything else is deliberately left alone:
 *
 *   • «لوجهه الكريم» stays MASCULINE for every recipient. In
 *     «…وأن يجعل عمله خالصًا لوجهه الكريم» the pronoun returns to الله from
 *     «سائلين الله أن يبارك», not to the recipient — it is Allah's blessed Face,
 *     and لفظ الجلالة is always masculine. Do not "fix" this one.
 *   • «أن يبارك» and «أن يجعل» are verbs of الله, so the ي stays masculine.
 *   • «سائلين» is a plural participle and does not inflect for gender.
 *   • «تقديرًا» is accusative of a masdar, so it is gender-invariant.
 *   • «يشهد مجتمع إتقان…» and «المدير التنفيذي - مجتمع إتقان» refer to the
 *     organisation, not the recipient.
 *
 * Keep both strings byte-for-byte parallel so a future edit to one is easy to
 * mirror in the other.
 */

export const GENDERS = ["male", "female"] as const;
export type Gender = (typeof GENDERS)[number];

export const GENDER_LABELS: Record<Gender, string> = {
  male: "ذكر",
  female: "أنثى",
};

export function isGender(value: unknown): value is Gender {
  return typeof value === "string" && (GENDERS as readonly string[]).includes(value);
}

export interface CertificateCopy {
  /** The campaign line, with the Code mark supplied separately as artwork. */
  contributed: string;
  /** The body paragraph. */
  description: string;
}

const MALE: CertificateCopy = {
  contributed: "قد ساهم في حملة",
  description:
    "تقديرًا لجهوده ومساهمته في تطوير مشاريع التقنيات القرآنية مفتوحة المصدر، سائلين الله أن يبارك في أثره، وأن يجعل عمله خالصًا لوجهه الكريم.",
};

const FEMALE: CertificateCopy = {
  contributed: "قد ساهمت في حملة",
  description:
    "تقديرًا لجهودها ومساهمتها في تطوير مشاريع التقنيات القرآنية مفتوحة المصدر، سائلين الله أن يبارك في أثرها، وأن يجعل عملها خالصًا لوجهه الكريم.",
};

const BY_GENDER: Record<Gender, CertificateCopy> = { male: MALE, female: FEMALE };

/** Defaulting to masculine keeps pre-existing rows rendering instead of throwing. */
export function copyFor(gender: Gender | null | undefined): CertificateCopy {
  return BY_GENDER[gender ?? "male"] ?? MALE;
}
