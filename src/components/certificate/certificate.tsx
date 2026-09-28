import type { CSSProperties } from "react";

import type { TemplateDef, TextSlot, VectorAsset } from "@/lib/cert-template";

export interface CertificateValues {
  recipientName: string;
  /** Already formatted, e.g. "ITQ-2026-1234" */
  certNumber: string;
  /** e.g. "10 أكتوبر 2026" */
  gregorianDate: string;
  /** e.g. "٢٩ ربيع الآخر ١٤٤٨ هـ" */
  hijriDate: string;
  /** Gender-dependent. "قد ساهم" / "قد ساهمت" — see lib/gender-text.ts */
  contributed: string;
  /** Gender-dependent body paragraph. */
  description: string;
  /** Inline SVG markup from lib/qr.ts */
  qrSvg: string;
  /**
   * Public verification URL. The QR is wrapped in an anchor pointing here, which
   * Chromium turns into a real PDF link annotation, so the code is clickable in
   * the exported PDF as well as in the browser.
   */
  verifyUrl: string;
  showQr?: boolean;
}

/** Position a run either inside its Figma box or centred on the frame. */
function slotStyle(slot: TextSlot, fontFamily: string): CSSProperties {
  const base: CSSProperties = {
    position: "absolute",
    top: slot.y,
    color: slot.color,
    fontFamily,
    fontSize: `${slot.fontSize}px`,
    fontWeight: slot.weight,
    lineHeight: `${slot.lineHeight}px`,
    textAlign: slot.align,
    // Chromium applies no letterspacing by default, matching Figma's ls=0.
    letterSpacing: "0",
    margin: 0,
    // Never hyphenate or break inside an Arabic name.
    wordBreak: "keep-all",
    overflowWrap: "normal",
  };

  if (slot.center !== undefined) {
    // A box of width 2 * center, pinned to x=0, has its midpoint exactly on
    // `center`. The root clips anything past the frame edge, so an off-centre
    // run simply overflows into the margin rather than the page.
    return {
      ...base,
      left: 0,
      width: slot.center * 2,
      textAlign: "center",
      padding: slot.maxWidth ? `0 ${slot.maxWidth / 2}px` : undefined,
      boxSizing: "border-box",
    };
  }

  return { ...base, left: slot.x, width: slot.width };
}

function Asset({ asset }: { asset: VectorAsset }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={asset.src}
      alt=""
      aria-hidden
      draggable={false}
      style={{
        position: "absolute",
        left: asset.x,
        top: asset.y,
        width: asset.width,
        height: asset.height,
      }}
    />
  );
}

function Run({
  slot,
  fontFamily,
  children,
}: {
  slot: TextSlot & { value?: string };
  fontFamily: string;
  children?: React.ReactNode;
}) {
  return <div style={slotStyle(slot, fontFamily)}>{children ?? slot.value}</div>;
}

/**
 * The certificate, typeset at the template's exact pixel size.
 *
 * Rendered by the browser at the frame dimensions and captured by Playwright as
 * PDF/PNG. Nothing here is responsive — this is a fixed-geometry print document.
 */
export function Certificate({
  template,
  values,
}: {
  template: TemplateDef;
  values: CertificateValues;
}) {
  const { frame, assets, staticText, dynamicText, fontFamily, background, qr } = template;

  return (
    <div
      dir="rtl"
      lang="ar"
      style={{
        position: "relative",
        width: frame.width,
        height: frame.height,
        background,
        overflow: "hidden",
        // Never let the renderer sub-pixel-shift the artwork.
        WebkitFontSmoothing: "antialiased",
        textRendering: "geometricPrecision",
        // Keeps the background gradient (and all artwork colour) in the PDF
        // rather than being optimised away as "background" content.
        printColorAdjust: "exact",
        WebkitPrintColorAdjust: "exact",
      }}
      data-template={template.slug}
    >
      {Object.values(assets).map((asset) => (
        <Asset key={asset.src} asset={asset} />
      ))}

      <Run slot={staticText.witness} fontFamily={fontFamily} />
      <Run slot={dynamicText.recipientName} fontFamily={fontFamily}>
        {values.recipientName}
      </Run>
      <Run slot={dynamicText.contributed} fontFamily={fontFamily}>
        {values.contributed}
      </Run>
      <Run slot={dynamicText.description} fontFamily={fontFamily}>
        {values.description}
      </Run>

      <Run slot={staticText.signerName} fontFamily={fontFamily} />
      <Run slot={staticText.signerRole} fontFamily={fontFamily} />

      <Run slot={staticText.labelCert} fontFamily={fontFamily} />
      <Run slot={dynamicText.certNumber} fontFamily={fontFamily}>
        {values.certNumber}
      </Run>

      <Run slot={staticText.labelDate} fontFamily={fontFamily} />
      <Run slot={dynamicText.gregorianDate} fontFamily={fontFamily}>
        {values.gregorianDate}
      </Run>
      <Run slot={dynamicText.hijriDate} fontFamily={fontFamily}>
        {values.hijriDate}
      </Run>

      {values.showQr !== false && (
        <a
          href={values.verifyUrl}
          // Anchors get an underline and link colour by default; this is artwork.
          style={{
            position: "absolute",
            left: qr.x,
            top: qr.y,
            width: qr.size,
            height: qr.size,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textDecoration: "none",
            color: "inherit",
            cursor: "pointer",
          }}
          role="img"
          aria-label="رمز الاستجابة السريعة للتحقق من الشهادة"
          dangerouslySetInnerHTML={{ __html: values.qrSvg }}
        />
      )}
    </div>
  );
}
