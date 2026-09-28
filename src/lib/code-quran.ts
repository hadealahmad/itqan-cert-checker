/**
 * The «كود يخدم القرآن» design, assembled from the Figma geometry in
 * cert-template.ts. Split out so the registry (src/lib/templates.ts) can hold
 * several designs without every consumer importing the whole geometry module.
 */

import {
  ASSETS,
  BACKGROUND_GRADIENT,
  DEFAULT_TEMPLATE_SLUG,
  DYNAMIC_TEXT,
  FONT_FAMILY,
  FRAME,
  QR,
  STATIC_TEXT,
  type TemplateDef,
} from "./cert-template";

export const codeQuran: TemplateDef = {
  slug: DEFAULT_TEMPLATE_SLUG,
  nameAr: "كود يخدم القرآن",
  frame: FRAME,
  fontFamily: FONT_FAMILY,
  background: BACKGROUND_GRADIENT,
  qr: QR,
  assets: ASSETS,
  staticText: STATIC_TEXT,
  dynamicText: DYNAMIC_TEXT,
};
