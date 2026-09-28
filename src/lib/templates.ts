/**
 * Certificate template registry.
 *
 * `cert-template.ts` describes the Figma geometry for one design. This module
 * turns that into a registry keyed by slug, so the rest of the system (print
 * route, download route, verification) can ask for "the code-quran template"
 * without importing a specific layout.
 *
 * There is exactly one design today — «كود يخدم القرآن» — so the registry holds
 * one entry. Adding a second *design* means a new geometry file and a new entry;
 * everything else already resolves by slug.
 */

import { DEFAULT_TEMPLATE_SLUG, type TemplateDef } from "./cert-template";
import { codeQuran } from "./code-quran";

const REGISTRY: Record<string, TemplateDef> = {
  [codeQuran.slug]: codeQuran,
};

/** Slugs the renderer can actually produce. Mirrors the `templates` table. */
export const REGISTERED_SLUGS = Object.keys(REGISTRY);

export function getTemplate(slug: string): TemplateDef | undefined {
  return REGISTRY[slug];
}

export function requireTemplate(slug: string): TemplateDef {
  const template = REGISTRY[slug];
  if (!template) {
    throw new Error(
      `No renderer registered for template "${slug}". Registered: ${REGISTERED_SLUGS.join(", ") || "(none)"}`,
    );
  }
  return template;
}

export { DEFAULT_TEMPLATE_SLUG };
