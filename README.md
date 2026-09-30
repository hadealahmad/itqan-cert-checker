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

## Two ways in

**Participants** sign in with GitHub. The system checks whether they contributed
and are not a maintainer, then issues their certificate of participation. They
can download the PDF, edit the name printed on it, and edit it again later.

**The single admin** keeps the password login (`ADMIN_PASSWORD`).

### Campaigns

An admin creates a *campaign* (`/admin/programs`): a certificate template, a
date range, and a list of repositories. Someone is eligible when

- they hold neither `admin` nor `maintain` on **any** listed repo, and
- they authored at least one **merged pull request**, dated inside the range, in
  at least one listed repo.

They are then offered the certificate, and one person can hold **one certificate
per template** — an admin-issued certificate blocks a later self-claim, and vice
versa.

### GitHub OAuth setup

GitHub has no API for creating OAuth Apps, so this step is manual:

> github.com/settings/developers → **OAuth Apps** → New OAuth App
> - Homepage URL: `https://<your-domain>`
> - Callback URL: `https://<your-domain>/auth/github/callback`

Then set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in `.env`.

Requested scopes are `read:user user:email` — deliberately minimal. Reading a
caller's permission level on a *public* repo comes back from a plain repo read,
so there is no `repo` scope and no scary consent screen. The access token is
used during the callback and never stored.

### The roster: who is eligible, before anyone logs in

Rather than discovering people one login at a time, a campaign can be scanned.
`تحديث قائمة المؤهلين` reads the merged PRs in the window, works out who
supervises each listed repo, and writes the result to a roster the admin can
read. Each person then claims their own certificate when they sign in, which
ticks their row off, so the list doubles as a progress tracker.

Rows carry one of five states: `مؤهل`, `يحتاج مراجعة`, `مشرف`, `استلم شهادته`,
`مستبعد`. The admin can settle any row by hand — that is what "update one by one"
means — and a re-scan never overwrites a decision a human made, nor unlinks a
claimed certificate.

Two deliberate choices:

- **`يحتاج مراجعة` is a real state, not a failure.** GitHub will not say who
  supervises a repository without push access, and recording "unknown" as
  "eligible" would hand certificates to maintainers. The campaign declares its own
  maintainers, which needs no token at all; anything still undecided waits for a
  decision. See
  [Identifying maintainers](#identifying-maintainers-without-the-owners-token).
- **A capped scan says so.** Search returns 100 results a call and is limited to
  30 calls/minute, so a scan reads at most `ROSTER_MAX_PRS_PER_REPO` merged PRs
  per repo. When that cap bites, the admin is told the list is incomplete rather
  than shown a quietly short one.

#### The two GitHub credentials

They are different things, and confusing them is the easy mistake here:

| | `GITHUB_CLIENT_ID` / `_SECRET` | `GITHUB_SCAN_TOKEN` |
|---|---|---|
| What it is | An OAuth App's id and secret | An access token (e.g. `gh auth token`) |
| Whose | Your app's | Yours — a person, or an app installation |
| Used for | A participant proving who they are | Reading contributions and supervisors |
| Issues a participant's token | Yes — GitHub, in their browser | — |

The client id is **not** a token. Only an OAuth App can issue a token to a
participant, and that token is what stops someone claiming another person's
certificate. The scan token cannot do that job — it is your credential, so
anyone "signing in" with it would be signing in as you.

Why a scan needs push access at all is covered under
[How the check is implemented](#how-the-check-is-implemented); which token to
actually use is in [GitHub tokens and permissions](#github-tokens-and-permissions)
under Environment.

### How the check is implemented

Two things are easy to get wrong, so both are pinned down here:

| Check | How | Why not the obvious way |
|---|---|---|
| Is the user a maintainer? | `GET /repos/{owner}/{repo}` → the caller's own `permissions` | `/collaborators/{user}/permission` needs push access to the repo, so it would always fail for us |
| Did they contribute in the window? | `search/issues?q=is:pr+is:merged+author:…+repo:…+merged:FROM..TO` | `/commits?author=` only walks the default branch, so fork PRs are invisible, and squash merges attribute the commit to the merger |

Both loops short-circuit, so the cost is at most two calls per repository and
usually one. Search is capped at 30 requests/minute, so very long repo lists will
be slow on a cold login.

A failed check means *not eligible*, and the participant sees why. It is
recomputed on every GitHub login; the verdict and its timestamp are stored on the
user row for the admin to see.

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
- Campaigns: <http://localhost:3000/admin/programs>

On first run, `better-sqlite3` may need its native binding built:

```bash
cd node_modules/better-sqlite3 && npx node-gyp rebuild --release
```

### Environment

Everything the tool reads, in one place. Copy `.env.example` to `.env` and fill
in what applies to you; nothing here is read from anywhere else.

```bash
cp .env.example .env
openssl rand -base64 32          # for SESSION_SECRET
```

#### Minimum to run

Just these three. The app starts, the admin area works, and certificates issue
and verify by hand.

```dotenv
ADMIN_PASSWORD=a-long-password-you-choose
SESSION_SECRET=<output of the openssl command above>
NEXT_PUBLIC_BASE_URL=https://certificates.example.com
```

`SESSION_SECRET` and `ADMIN_PASSWORD` are not optional in any real sense. The
code refuses to run without them, and both fail loudly rather than falling back
to a default — a default admin password would be worse than a crash.

#### Full reference

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `ADMIN_PASSWORD` | **yes** | — | Password for `/admin`. Compared in constant time. Not hashed: it never leaves your process, but it does live in the environment |
| `SESSION_SECRET` | **yes** | — | Signs the admin and participant session cookies (HS256). Must be ≥ 16 characters. Rotating it logs everyone out |
| `NEXT_PUBLIC_BASE_URL` | **yes in prod** | `http://localhost:3000` | Public origin. Encoded into every QR code, so getting it wrong means printed certificates point at the wrong address |
| `DATABASE_URL` | no | `file:./data/cert-checker.db` | SQLite file. Also read by `drizzle-kit`, so migrations follow it |
| `CERT_PREFIX` | no | `ITQ` | Printed before the serial: `ITQ` → `ITQ-2026-1234` |
| `CERT_CODE_YEAR` | no | current UTC year | The `2026` in `ITQ-2026-1234`. **Changing it after issuing does not renumber existing certificates** |
| `INTERNAL_BASE_URL` | no | `http://127.0.0.1:$PORT` | Origin the PDF render worker loads the print route from. Only needed when the worker is on another host |
| `PORT` | no | `3000` | Standard Next.js port |
| `SQLITE_VERBOSE` | no | unset | Set to `1` to log every SQL statement. A debugging aid only |
| `GITHUB_CLIENT_ID` | for sign-in | — | OAuth App client id. Empty hides participant sign-in |
| `GITHUB_CLIENT_SECRET` | for sign-in | — | OAuth App client secret |
| `GITHUB_SCAN_TOKEN` | for scans | — | A GitHub *token* for the roster scan. Empty disables the scan button and says why |

#### GitHub tokens and permissions

These get confused constantly, and they are not interchangeable.

**`GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` — participant sign-in.**

These are *not* tokens. They identify your OAuth App, and that app is the only
thing that can issue a token to a participant. This matters for correctness, not
formality: the token issued during sign-in is what stops someone claiming another
person's certificate. It is issued to them, in their browser, and grants only
`read:user user:email`.

GitHub has no API for creating OAuth Apps, so this is manual:

> github.com/settings/developers → **OAuth Apps** → New OAuth App
> - Homepage URL: `https://<your-domain>`
> - Callback URL: `https://<your-domain>/auth/github/callback`

The callback URL must match `NEXT_PUBLIC_BASE_URL` exactly, including scheme and
any path prefix. Leave both empty and participant sign-in simply does not appear;
the admin area keeps working.

**`GITHUB_SCAN_TOKEN` — the roster scan.**

This one *is* a token, e.g. `gh auth token`, or a fine-grained PAT. It is the
app's own credential, used to read contributions and to settle who supervises
each listed repository. It cannot do the job of the OAuth App: anyone signing in
with it would be signing in as you.

It needs no special permission. A plain read-only token counts contributions
correctly, and maintainers come from the campaign's own declared list plus
`CODEOWNERS` — neither of which needs a token. Push access only upgrades the
still-uncertain rows to a confirmed verdict, so you never need to ask a repository
owner for a privileged credential.

Because every campaign repository is public, the two halves behave differently:

| With this token | Counting merged PRs | Settling who supervises |
|---|---|---|
| No token | works — public repos need no scope | declared list and `CODEOWNERS` only |
| Read only | works | declared list and `CODEOWNERS` only |
| Push on the repo | works | plus a direct read, so uncertain rows resolve too |

The declared list is the part that matters: it is what removes the dependency on
anyone else's credentials. Repositories outside your control leave a manual
remainder, settled one row at a time.

#### Identifying maintainers, without the owners' token

Worth reading twice, because the obvious approach does not work and knowing why
is cheaper than rediscovering it.

Someone is disqualified for holding `admin` or `maintain` on a listed repository.
GitHub will not tell you that from outside, and every shortcut was checked against
the live API:

| Approach | Result |
|---|---|
| `GET /repos/{o}/{r}/collaborators/{user}/permission` | 403 — "must have push access to view collaborator permission" |
| `GET /orgs/{org}/members?role=admin` | Empty on most organisations; membership is private unless members opt in |
| `GET /orgs/{org}/teams/{slug}/members` | 403/404 — requires membership of that organisation |
| `merged-by:` in search | Not implemented. Returns 0 silently, even for someone who has merged hundreds of PRs |
| `CODEOWNERS` | Usually absent, and when present usually names *teams*, which then cannot be resolved either |

So supervisors cannot be discovered automatically. What works is **declaring**
them: the organisation knows its own maintainers, and that needs no token, no
scope and no push access. It is also more accurate than inference, because it is
ground truth rather than a guess.

Each campaign therefore carries a **مشرفو الحملة** field — a pasted list of
GitHub usernames, matched case-insensitively, tolerating a leading `@` or a full
profile URL. Those people are excluded on every scan, on any token, including
none at all.

The roster consults every available signal, cheapest first:

1. **Declared** in the campaign — authoritative, needs nothing.
2. **`CODEOWNERS`** in the repository, when it names individuals rather than
   teams. Fetched from `raw.githubusercontent.com`, so it costs no scope.
3. **The token**, when it has push — a direct read, and still the strongest live
   signal where it is available.
4. Otherwise `يحتاج مراجعة` — never `مؤهل` on a guess.

`إعادة الفحص` on a single row uses the same classifier, so a row settled by hand
and the same row settled by a scan can never disagree.

In practice, a campaign spanning both your organisation's repositories and other
people's will always have a manual remainder: repositories outside your control
can never be auto-resolved, whatever token you hold. Those are settled one at a
time with `قرار يدوي`.

#### Which token should I use?

- **Any read access is enough.** `gh auth token` works, and so would a
  fine-grained PAT with read-only repository access. Counting contributions needs
  nothing special on a public repository.
- **You never need an owner's token.** Maintainers come from the campaign's
  declared list and `CODEOWNERS`, neither of which uses a credential at all.
- **Push access is a bonus, not a requirement.** It resolves the rows that
  neither of those can — repositories belonging to other people.
- **Long-term, prefer a GitHub App** over a PAT. Fine-grained tokens expire, and
  a scan that silently starts failing is worse than one that says so. Nothing
  about the code assumes a PAT specifically — any token that works is accepted.

Verify a token before relying on it:

```bash
GITHUB_SCAN_TOKEN=$(gh auth token) npm run check:roster
```

That runs a real scan against a public repository and reports what the token can
and cannot settle.

#### Cookies and TLS

Nothing to configure, but worth knowing what you are deploying:

| | Lifetime | Notes |
|---|---|---|
| Admin session | 12 hours | Re-enter the password after a day |
| Participant session | 30 days | Long, so people are not signing in repeatedly mid-campaign |

Both are `httpOnly` and `sameSite=lax`, and marked `secure` automatically when
`NODE_ENV=production`. Over plain HTTP in production a browser will drop them,
so terminate TLS in front of the app — this follows from `NODE_ENV`, not from a
variable. Rotating `SESSION_SECRET` invalidates every session at once, which is
the intended way to lock everyone out.

#### Only needed to re-sync the design from Figma

Not required to run the app. `npm run figma:sync` pulls the certificate artwork
and geometry back out of the Figma file, and the geometry fixture is already
committed, so this is only for when the design itself changes.

```dotenv
FIGMA_TOKEN=figd_…          # Figma → Settings → Security → Personal access tokens
FIGMA_FILE_KEY=…            # defaults to this project's file
FIGMA_FRAME_ID=…            # defaults to 7:284 (Frame 3)
```

#### Only needed by the test scripts

Not used by the app. Each check documents its own variable in its header.

| Variable | Used by | Purpose |
|---|---|---|
| `GITHUB_TOKEN` | `check:github` | Any token; the API calls need one |
| `GITHUB_SCAN_TOKEN` | `check:roster` | The credential under test |
| `ADMIN_PASSWORD` | `check:e2e` | Set by the harness itself |
| `SMOKE_CONFIRM_WRITES` | `smoke` | Must be `1`; `smoke` writes to the target server's database |
| `E2E_SKIP_BUILD` | `check:e2e` | Reuse the existing build instead of a clean one |

#### A note on `ORG_NAME`

`.env.example` lists `ORG_NAME`, but nothing reads it — the organisation name is
part of the certificate template in `src/lib/cert-template.ts`. It is harmless
but inert; change the template if you need different wording.

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
| `npm run check:github` | Exercise the eligibility check against the real GitHub API (`GITHUB_TOKEN=<PAT>`) |
| `npm run check:e2e` | End-to-end browser test on a throwaway database (see below) |
| `npm run check:roster` | Scan a real public repo and verify the roster is stored correctly |
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
npm run check:e2e
```

This is the one to reach for. It builds, creates a throwaway database in a temp
directory, migrates and seeds it, starts the server against **that** database,
runs the browser test, then deletes the directory. Your real
`data/cert-checker.db` is never opened — verified by checksum in review.

It builds for itself even though `next build` is usually a separate step. An
incremental build over an existing `.next` can emit a broken server chunk if
anything is serving that directory, and the symptom is pages 500-ing with
`a[d] is not a function` — which reads like a broken feature rather than a stale
build. That has happened here twice; building clean removes the whole class. Pass
`E2E_SKIP_BUILD=1` to reuse a build and go faster.

The harness also pins the GitHub credentials to empty, so a token exported in
your shell cannot change what the roster checks are testing. The credentialed
path is covered separately by `check:roster`.

Drives a real browser through login → create user (as أنثى) → bulk add → issue
certificate → download PDF → assert the PDF carries the feminine wording and
`لوجهه الكريم` → download ZIP → create a campaign and assert its repo input is
parsed → assert a second certificate for the same template is refused → assert
the QR is a link annotation pointing at that certificate → verify through the
single page (deep link, manual entry, printed form, unknown code) → logout.
23 checks. Screenshots land in `/tmp/smoke-e2e`.

The PDF wording assertion needs `pdftotext` (poppler-utils); it is skipped with a
notice if unavailable.

To point the test at a server you are already running instead:

```bash
npm run dev
SMOKE_CONFIRM_WRITES=1 npm run smoke
```

`npm run smoke` **writes** to the target server's database and renders PDFs, so
it refuses to start without `SMOKE_CONFIRM_WRITES=1`. That flag is the reason it
can no longer quietly add test users to your real data.

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

## Notes

- `check-github.ts` needs a PAT because the permission probe must see a real
  caller's rights. With a PAT the "no access" branches are still meaningful; it
  just cannot prove the maintainer branch.
- `check-roster.ts` runs a real scan against a public repo and checks what lands
  in the database: bots excluded, logins lowercased, nothing auto-approved
  without push access, and a manual ruling surviving a re-scan. It writes to a
  throwaway database.
- Migrations back one-off: `drizzle/` carries the whole history, and
  `npm run db:migrate` is all a fresh clone needs.

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
