/**
 * The «كود يخدم القرآن» certificate design.
 *
 * Every coordinate here was read out of the Figma file
 * (https://www.figma.com/design/uwzIOEMK4EQ3sGfvSlzJu0, node 7:284 "Frame 3")
 * and converted from Figma's absolute canvas coordinates to frame-relative
 * ones. `npm run check:assets` verifies the asset boxes against
 * assets/figma-geometry.json, and `npm run check:copy` guards the wording.
 *
 * The artwork (border, corner ornaments, both logos, the «شهادة تقدير»
 * calligraphy, the divider, the Code mark, the three icons) is exported from
 * Figma as pure-vector SVG. Only the *text* is re-typeset in HTML so it stays
 * selectable in the exported PDF and can change per recipient.
 *
 * This layout is shared by every campaign that uses the code-quran template.
 */

export const FRAME = {
  width: 1920,
  height: 1358,
} as const;

/**
 * The design's typeface. Resolved through the CSS variable that `next/font`
 * emits on <html>, because that is the generated family name Chromium actually
 * has. The literal name stays as a fallback for tooling that reads this file
 * outside the Next.js tree.
 */
export const FONT_FAMILY =
  'var(--font-ibm-plex-arabic), "IBM Plex Sans Arabic", sans-serif';

/** Converted to the `font-weight` axis. 300=Light, 400=Regular, 600=SemiBold. */
export type Weight = 300 | 400 | 600;

export type Slot =
  | "recipientName"
  | "certNumber"
  | "gregorianDate"
  | "hijriDate"
  | "contributed"
  | "description";

export interface VectorAsset {
  /** File name inside /public/cert */
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextSlot {
  x: number;
  y: number;
  width: number;
  /**
   * When set, the run is centred on this horizontal position instead of being
   * locked into the Figma box. Used for auto-width single lines so a long
   * recipient name stays optically centred, and for the campaign line, which is
   * centred on its own box rather than on the frame.
   */
  center?: number;
  maxWidth?: number;
  weight: Weight;
  fontSize: number;
  lineHeight: number;
  align: "left" | "right" | "center";
  color: string;
}

/* ------------------------------------------------------------------ *
 * Artwork exported from Figma as SVG (vector, no fonts required).
 * ------------------------------------------------------------------ */
export const ASSETS = {
  /** Outer border + 4 corner ornaments */
  border: { src: "/cert/border.svg", x: 47, y: 38, width: 1826, height: 1282 },
  /** Code logo (top-left) + Itqan logo (top-right) */
  logosTop: { src: "/cert/logos-top.svg", x: 125, y: 103, width: 1671, height: 130 },
  /** "شهادة تقدير" calligraphy — already outlined in Figma, contains no text */
  title: { src: "/cert/title.svg", x: 576, y: 200, width: 768, height: 205 },
  /** Ornamental rule beneath the recipient name */
  dividerName: { src: "/cert/divider-name.svg", x: 626, y: 638, width: 669, height: 69 },
  /**
   * The Code mark beside the campaign line — layered diamond, "Code" wordmark
   * and "يخدم القرآن", all outlined in Figma. Fixed copy, so it stays SVG.
   * The sentence next to it is gender-dependent and is typeset separately
   * (see DYNAMIC_TEXT.contributed), which is why this is only part of the
   * original Figma group 8:742.
   */
  campaignLogo: { src: "/cert/campaign-logo.svg", x: 610, y: 715.4, width: 258.4, height: 107.8 },
  /** Handwritten signature (raster, has alpha) */
  signature: { src: "/cert/signature.png", x: 812, y: 1003, width: 294, height: 93 },
  /** Font Awesome 6 Pro icons, exported as outlines so no icon font is needed */
  iconFile: { src: "/cert/icon-file.svg", x: 311, y: 1044, width: 45, height: 45 },
  iconCalendar: { src: "/cert/icon-calendar.svg", x: 1778, y: 1044, width: 40, height: 45 },
} satisfies Record<string, VectorAsset>;

/* ------------------------------------------------------------------ *
 * Text layers.
 * ------------------------------------------------------------------ */

/** Copy that never changes. */
export const STATIC_TEXT = {
  witness: {
    value: "يشهد مجتمع إتقان للتقنيات القرآنية بأن",
    x: 599,
    y: 442,
    width: 721,
    center: 960,
    weight: 400,
    fontSize: 50,
    lineHeight: 75,
    align: "center",
    color: "#000000",
  },
  labelDate: {
    value: "تاريخ الإصدار:",
    x: 1567,
    y: 1036,
    width: 197,
    weight: 400,
    fontSize: 40,
    lineHeight: 60,
    align: "right",
    color: "#000000",
  },
  labelCert: {
    value: "رقم الشهادة:",
    x: 102,
    y: 1036,
    width: 195,
    weight: 400,
    fontSize: 40,
    lineHeight: 60,
    align: "right",
    color: "#000000",
  },
  signerName: {
    value: "خالد الصيعري",
    x: 838,
    y: 1095,
    width: 245,
    center: 960,
    weight: 600,
    fontSize: 45,
    lineHeight: 67.5,
    align: "center",
    color: "#000000",
  },
  signerRole: {
    value: "المدير التنفيذي - مجتمع إتقان",
    x: 740,
    y: 1156,
    width: 440,
    center: 960,
    weight: 400,
    fontSize: 40,
    lineHeight: 60,
    align: "center",
    color: "#000000",
  },
} satisfies Record<string, TextSlot & { value: string }>;

/** Per-recipient values. */
export const DYNAMIC_TEXT = {
  recipientName: {
    x: 730,
    y: 533,
    width: 459,
    center: 960,
    maxWidth: 1100,
    weight: 600,
    fontSize: 60,
    lineHeight: 90,
    align: "center",
    color: "#255C48",
  },
  /**
   * Figma node 7:287 — the campaign sentence, "قد ساهم" for a male recipient
   * and "قد ساهمت" for a female one. See lib/gender-text.ts.
   *
   * Centred on x=1105.2, the middle of its own 409px Figma box, which sits to
   * the right of the Code mark. Together the two are centred on the frame.
   */
  contributed: {
    x: 900.7,
    y: 730.8,
    width: 409,
    center: 1105.2,
    weight: 400,
    fontSize: 61.361000061035156,
    lineHeight: 92.04150390625,
    align: "center",
    color: "#000000",
  },
  /**
   * Figma node 37:288 — the body paragraph, 2 lines. Gender-dependent.
   *
   * Figma's box is 1023px, which fits the masculine wording on two lines but
   * pushes the feminine wording (four extra ا characters) onto a third, where it
   * would collide with the signature at y=1003.
   *
   * 1120px is the narrowest width where both variants break at the *same* point
   * as the Figma masculine line, and it leaves ~86px of headroom. Verified with
   * `npm run check:copy`. Centre stays at 960, so the left edge is 400.
   */
  description: {
    x: 400,
    y: 848,
    width: 1120,
    weight: 400,
    fontSize: 37.09508514404297,
    lineHeight: 57.11158752441406,
    align: "center",
    color: "#000000",
  },
  /** Figma node 37:27 — fixed 409px box, left-aligned. */
  certNumber: {
    x: 102,
    y: 1104,
    width: 409,
    weight: 300,
    fontSize: 37,
    lineHeight: 55.5,
    align: "left",
    color: "#000000",
  },
  /** Figma node 37:22 — fixed 409px box, right-aligned. */
  gregorianDate: {
    x: 1409,
    y: 1104,
    width: 409,
    weight: 300,
    fontSize: 37,
    lineHeight: 54.94,
    align: "right",
    color: "#000000",
  },
  /** Figma node 37:23 — fixed 409px box, right-aligned. */
  hijriDate: {
    x: 1409,
    y: 1161,
    width: 409,
    weight: 300,
    fontSize: 37,
    lineHeight: 54.94,
    align: "right",
    color: "#000000",
  },
} satisfies Record<Slot, TextSlot>;

/**
 * QR code placement.
 *
 * The Figma template has no QR layer, so this position is ours. It sits in the
 * bottom-left column, directly beneath the certificate number, filling the gap
 * left behind by the removed verify-URL row. Left edge is centred against the
 * "رقم الشهادة:" label + icon group (x 102..356 -> centre 229).
 *
 * Kept below y=1168 to clear the bottom-left corner ornament (x 47..131).
 */
export const QR = {
  x: 158,
  y: 1168,
  size: 145,
  /** Quiet-zone + error correction tuned for crisp modules at this size. */
  margin: 2,
  errorCorrectionLevel: "L" as const,
} as const;

/**
 * Background gradient.
 *
 * This lives on the *frame* in Figma (node 7:284 `fills[0]`), not on any child
 * layer, so walking the node tree misses it entirely. Figma reported:
 *
 *   GRADIENT_LINEAR, handles (0.5, 0) -> (0.5, 1)   i.e. top to bottom
 *   stop 0.00  #FFFFFF
 *   stop 1.00  #F1FFF9
 */
export const BACKGROUND_GRADIENT = "linear-gradient(to bottom, #FFFFFF 0%, #F1FFF9 100%)";

/** Append the Arabic era marker to the Hijri year, e.g. "١٤٤٨ هـ". */
export const HIJRI_ERA = "هـ";

/** The template used when nothing more specific is requested. */
export const DEFAULT_TEMPLATE_SLUG = "code-quran";

/**
 * A complete certificate design: geometry plus the slug the `templates` table
 * refers to. One entry per supported layout.
 */
export interface TemplateDef {
  slug: string;
  nameAr: string;
  frame: typeof FRAME;
  fontFamily: string;
  background: string;
  qr: typeof QR;
  assets: Record<string, VectorAsset>;
  staticText: typeof STATIC_TEXT;
  dynamicText: Record<Slot, TextSlot>;
}
