# Third-party assets and licences

## Fonts

`src/fonts/IBMPlexSansArabic-{Light,Regular,SemiBold}.woff2`

IBM Plex Sans Arabic — SIL Open Font License 1.1. Full text in `src/fonts/OFL.txt`.
Obtainable from https://www.npmjs.com/package/@ibm/plex-sans-arabic

This is the only font the application loads at runtime.

## Fonts used only inside exported artwork

The SVG files in `public/cert/` were exported from the Figma design and contain
these fonts **converted to vector outlines**. They are not distributed as fonts
and are not needed at runtime:

- Bahij TheSansArabic (title lockup, "يخدم القرآن") — a commercial typeface.
  Because it is embedded as outlines in artwork the organisation already
  produced and owns, no font file is redistributed here. Confirm the organisation
  holds a licence for its own use of the design.
- Barlow Semi Condensed (the "Code" wordmark) — SIL Open Font License.
- Font Awesome 6 Pro (the certificate / calendar / link icons) — the three icons
  in `public/cert/icon-*.svg` were exported from the design as outlines. No
  Font Awesome font or package is installed or redistributed. If you intend to
  add more icons, either use an open icon set (the app already ships
  `lucide-react` for the UI) or a Font Awesome licence that covers web use.

## Signature

`public/cert/signature.png` is the signature image embedded in the original
design file.
