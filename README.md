# نظام الشهادات — Itqan Certificate System

Issues Arabic certificates of appreciation from the Figma design, gives each one a
unique verification code with a scannable QR code, and lets anyone check a
certificate online.

RTL-only Arabic UI throughout, built with shadcn/ui. The certificate wording is
gender-aware: recipients are stored as ذكر or أنثى, and the text is written to
match.

---

## How it works

```
Figma design  ──(build-time, once)──►  public/cert/*.svg   vector artwork
                                          │
/admin/users  ──►  /admin/certs      ──►  8-digit code
                                               │
                                               ▼
                          /p/<token>/download ──► Playwright ──► PDF + PNG
                                               ▲  (only on click)
                                               │
QR code  ─────────────────────────────────────┘
   │  clickable: a real PDF link annotation
   └──►  https://<domain>/?code=20261234  ──►  single verification page
                                               code box · result · PDF button
```

The Figma REST API **cannot** change text, so the design is split in two:

| Part | How it is produced | Why |
|---|---|---|
| Border, corner ornaments, both logos, the «شهادة تقدير» calligraphy, the divider, the Code mark beside the campaign line, the three icons | Exported from Figma as **pure-vector SVG** (`npm run figma:sync`) | Pixel-perfect at any size, and no font or icon-font dependency at runtime |
| All certificate text | Re-typeset in HTML at the exact Figma coordinates | Stays live and **selectable in the PDF**, and changes per recipient |

The campaign line is the one place the split matters: Figma has «قد ساهم في حملة»
and the Code mark in a single group, and the exported SVG outlines the text. The
group is therefore split — the fixed mark stays SVG (`campaign-logo.svg`) and the
sentence is typeset as HTML so it can be conjugated.

The frame's own **background gradient** is applied in CSS
(`BACKGROUND_GRADIENT` in `cert-template.ts`). It is easy to miss because Figma
stores it on the *frame*'s fill, not on any child layer — walking the node tree
does not see it. It is a vertical `GRADIENT_LINEAR` from `#FFFFFF` to `#F1FFF9`,
and the certificate sets `print-color-adjust: exact` so it survives into the PDF.

The only typeface the browser needs is **IBM Plex Sans Arabic** (SIL OFL, free,
self-hosted in `src/fonts`). Bahij TheSansArabic, Barlow Semi Condensed and
Font Awesome 6 Pro appear *only* inside the exported SVGs, so none of them need
to be installed or licensed.

---

## Getting started

```bash
npm install
cp .env.example .env          # then edit ADMIN_PASSWORD and SESSION_SECRET
npm run db:migrate            # create data/cert-checker.db
npm run db:seed               # optional: three sample people + certificates
npm run dev
```

- Public verification: <http://localhost:3000>
- Admin: <http://localhost:3000/admin>

On first run, `better-sqlite3` may need its native binding built:

```bash
cd node_modules/better-sqlite3 && npx node-gyp rebuild --release
```

### Environment

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | SQLite file. Default `file:./data/cert-checker.db` |
| `ADMIN_PASSWORD` | Password for `/admin` — **change this** |
| `SESSION_SECRET` | Signs the session cookie. `openssl rand -base64 32` |
| `NEXT_PUBLIC_BASE_URL` | Public origin, encoded into the QR code. No trailing slash |
| `INTERNAL_BASE_URL` | Optional. Origin the render worker loads the print route from. Defaults to `http://127.0.0.1:$PORT` |
| `CERT_PREFIX` | Printed before the serial, e.g. `ITQ` → `ITQ-2026-1234` |
| `CERT_CODE_YEAR` | First four digits of every code. Default `2026` |

Gender is per-user, not an environment setting — it lives on the user record and
is editable from `/admin/users`.

---

## Gender-aware wording

Arabic marks gender on the verb and on possessive suffixes. Each user carries a
`gender` of `male` or `أنثى`/`ذكر`, and two strings in the certificate change:

| | ذكر | أنثى |
|---|---|---|
| Campaign line | قد سا**هم** في حملة | قد سا**همت** في حملة |
| Body paragraph | لجو**ده** · ومساهم**ته** · أث**ره** · عم**له** | لجو**دها** · ومساهم**تها** · أث**رها** · عم**لها** |

«خالصًا **لوجهه الكريم**» is **identical in both** and always masculine: the
pronoun there returns to الله from «سائلين الله أن يبارك», not to the recipient.
`npm run check:copy` asserts this so it does not get "corrected" by mistake.

Both variants live side by side in [`src/lib/gender-text.ts`](src/lib/gender-text.ts)
so an edit to one is easy to mirror in the other. Deliberately **not** varied:

- «لوجهه الكريم» — refers to الله, so always masculine (see above)
- «أن يبارك» and «أن يجعل» — verbs of الله, so the ي stays masculine
- «سائلين» — a plural participle, gender-invariant
- «تقديرًا» — accusative of a masdar, so gender-invariant
- «يشهد مجتمع إتقان…» and «المدير التنفيذي - مجتمع إتقان» — refer to the
  organisation, not the recipient

Two consequences worth knowing:

- **The paragraph box is 1120px, not Figma's 1023px.** The feminine wording is
  four ا characters longer, which at 1023px pushes it onto a third line where it
  would collide with the signature. 1120px is the narrowest width where *both*
  variants break at the same point as Figma's masculine line, with ~86px of
  headroom. `npm run check:copy` guards this, along with the wording itself.
- **Editing a name or gender invalidates the rendered files.** PDFs and PNGs bake
  in the wording, so changing either deletes them and marks the rows
  `pending`; the admin table then shows «بانتظار التوليد» and can regenerate.
  Fixing a mis-recorded gender and re-rendering is the intended workflow.

---

## Certificate codes

A code is 8 digits: the issue year plus a 4-digit serial.

```
2026 1234   →   printed as   ITQ-2026-1234
```

- The serial comes from a CSPRNG, so the printed order reveals nothing about issue order.
- Obvious serials are refused: repdigits (`1111`, `7777`) and runs (`1234`, `9876`).
- Uniqueness is enforced by a database index and retried on collision, so a code is
  **never reused** — not even after a certificate is revoked.
- Verification accepts `20261234`, `ITQ-2026-1234`, `itqan-2026-1234` or just `1234`.

Codes are only 8 digits — 10,000 per year — so they are enumerable by anyone who
wants to try them. Verification is not logged and not rate-limited; see
[Verification](#verification) for what that means in practice.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build and server |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Sample data |
| `npm run render` | Render every certificate that is not ready yet (`-- --force` to redo all) |
| `npm run svg:normalize` | Crop exported SVGs to their Figma node bounds |
| `npm run compare` | Screenshot the print route and report the laid-out geometry |
| `npm run check:copy` | Assert both gender variants still fit the certificate layout |
| `npm run check:assets` | Assert every asset box matches the Figma node it came from |
| `npm run smoke` | End-to-end browser test (see below) |
| `npm run figma:sync` | Re-extract artwork and text geometry from Figma |
| `npm run typecheck` | `tsc --noEmit` |

### Checking the template against the design

```bash
npm run dev            # terminal 1
npm run compare        # terminal 2
```

Writes `render.png` plus a table of where Chromium actually placed each text run,
and `assets/_figma-raw/frame3.png` is Figma's own render of the same frame for
side-by-side comparison. `scripts/compare_ink.py` diffs the ink bands of the two
images:

```bash
python3 scripts/compare_ink.py assets/_figma-raw/frame3.png /tmp/cmp/render.png
```

Current state: every layer lands within 1px of Figma (the residual is Figma's own
rasterisation noise).

### End-to-end test

```bash
npm run dev
npm run smoke
```

Drives a real browser through login → create user (as أنثى) → bulk add → issue
certificate → download PDF → assert the PDF carries the feminine wording and
`لوجهه الكريم` → assert the QR is a link annotation pointing at that certificate
→ download ZIP → verify through the single page (deep link, manual entry, printed
form, unknown code) → logout. 20 checks. Screenshots land in `/tmp/smoke`.

The PDF wording assertion needs `pdftotext` (poppler-utils); it is skipped with a
notice if unavailable.

### Re-syncing after a design change

```bash
FIGMA_TOKEN=figd_… npm run figma:sync
```

Redownloads the artwork into `public/cert/`, refreshes
`assets/figma-geometry.json` and `assets/_figma-raw/text-geometry.json`, and prints
the current text-layer coordinates. Diff them against
`src/lib/cert-template.ts` and update anything that moved.

Then normalise the SVGs so each one maps 1:1 onto its Figma node:

```bash
npm run svg:normalize
```

Figma exports a region larger than the node so layer effects are not clipped, and
the padding is **asymmetric** — it grows only where an effect reaches. Placing
the file at the node's size therefore squashes or clips the artwork.
`normalize-svg.mjs` rasterises each SVG, finds the top-left of the actual ink, and
crops the viewBox to the node. It writes a marker comment, so re-running is a
no-op rather than a second crop.

The token is only needed here. **Revoke it once the assets are committed** — nothing
at runtime talks to Figma. Scoping it to a single file with only `file_content:read`
is enough.

---

## The certificate template

All coordinates live in `src/lib/cert-template.ts` and come from Figma node
`7:284` ("Frame 3"), 1920 × 1358.

Changing the certificate means editing that one file. `npm run check:assets`
verifies every asset box against `assets/figma-geometry.json` — a small committed
fixture of the artwork's Figma geometry, so no token is needed. It exists because of a
real bug: `campaignLogo`'s height had been copied from a *child* node (92) instead
of the group itself (107.8), which cropped the bottom off «يخدم القرآن». It also
checks each SVG's `viewBox` against the box it is placed at. The QR block sits in the
gap left by the removed verify-URL row:

```ts
export const QR = { x: 158, y: 1168, size: 145, margin: 2, errorCorrectionLevel: "L" };
```

It is deliberately sized and tuned for crisp modules: a 145px box with 2-module
quiet zone and error-correction `L` gives ~5px per module, which scans reliably
both on screen and in print at A4 landscape.

Long recipient names stay optically centred because single-line runs are anchored
to the frame centre rather than locked into Figma's fixed text box.

---

## Output

| Format | Size | Notes |
|---|---|---|
| PDF | ~165 KB | Vector. Text is selectable and searchable; three subset-embedded IBM Plex faces. The QR is a real clickable link annotation |
| PNG | ~540 KB | 3840 × 2716 (2×) |

Certificates are cached on disk under `storage/certs/<code>.{pdf,png}` and are
**only ever generated when someone clicks download** — nothing renders on issue,
on the verification page, or on the admin list. The filesystem is the only record
of what exists; there is no render-status column. `npm run render` is an optional
pre-warm that moves the work earlier if you would rather batch it.

---

## Deployment

Playwright needs a long-lived Node host with Chromium — **not** a serverless
function. Use the included Dockerfile, or any VPS/Fly/Docker platform.

```bash
docker build -t itqan-certs .
docker run -p 3000:3000 --env-file .env -v cert-data:/app/data -v cert-storage:/app/storage itqan-certs
```

Run Chromium with `--no-sandbox --disable-dev-shm-usage` (already set in
`src/lib/render.ts`). Give the container at least 1 GB of memory; renders are
serialised in-process, so a single Chromium instance is reused rather than
spawned per certificate.

**Back up `data/cert-checker.db` only.** `storage/` holds generated files that
recreate themselves on demand, so losing it costs nothing.

### Scaling past SQLite

The schema is plain Drizzle. To move to Postgres, change the dialect in
`drizzle.config.ts` and the import in `src/lib/db/index.ts` to
`drizzle-orm/node-postgres`; nothing else touches SQL directly.

---

## Verification

The public verifier is a single page. It posts the entered code to
`POST /api/verify` and renders the result in place — no navigation, and nothing
is generated or written while checking. A miss returns only "not found", so it
does not disclose whether a code exists.

**No verification logging.** Attempts are not recorded, and there is no
rate limiter. Certificate downloads are not exposed this way either: the public
download route is gated on a 16-byte random `printToken` rather than the 8-digit
code, so a certificate cannot be fetched without scanning it off the document.

Be aware of the consequence: a code is 8 digits (10,000 per year), so codes are
enumerable by anyone who wants to try them. That is fine if the certificate
number is not treated as a secret. If it should be, the place to add a control is
`src/lib/verify.ts`.
