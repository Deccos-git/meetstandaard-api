# Architecture

Two pipelines that barely touch: **published standaarden** (workbook → API) and **panel data** (Firestore → panel). Knowing which one you are in answers most questions about where code belongs.

## Pipeline A — published standaarden

```
meetstandaard.xlsx              authoring format, lives outside this repo
  │  tools/build-*.py           the only bridge; generated output is reproducible
  ▼
functions/data/*.json           committed, reviewable as a diff
  │  functions/seedMeetstandaard.js   (Admin SDK, bypasses rules)
  ▼
Firestore  Meetstandaard*/{version}
  │  functions/meetstandaard.js + versionedResource.js
  ▼
GET /api/v1/meetstandaard/{sector}[/{version}]
```

Publishing a new version needs **no deploy** — versions are resolved from Firestore per request. A deploy is only needed when code changes, including the `STANDAARDEN` registry.

### The registry

`functions/meetstandaard.js` exports `STANDAARDEN`: one entry per published standaard, mapping a url segment to a Firestore collection and its committed documents. `src/standaarden.js` is the panel's equivalent. **A new standaard is two registry entries and a generated document — nothing else.**

### Two document kinds on one endpoint

`meta.kind` distinguishes them; routing, versioning and caching are identical.

| `meta.kind` | Shape | Standaard |
|---|---|---|
| `meetstandaard` (or absent) | `effecten[]` → stellingen, situatieschetsen, monetarisering per niveau, proxies | Energiearmoede, arbeidsparticipatie, gelijke kansen |
| `interventiebibliotheek` | `interventies[]` → kengetal per eenheid, three layers | Milieu & circulariteit |

Consumers must switch on `meta.kind` before parsing. **One kind means one shape**: the snapshotted standaarden fill the same field names as a workbook-generated one, leaving `null` and an empty `proxies[]` where the data does not exist, rather than inventing a third shape under the same kind.

### Generators

| Script | Produces |
|---|---|
| `tools/build-meetstandaard.py` | effect-based meetstandaard |
| `tools/build-interventiebibliotheek.py` | interventiebibliotheek |
| `functions/exportEffectenStandaard.js` | a snapshot of pipeline B as a versioned document (no workbook involved) |
| `tools/xlsx_common.py` | shared cell parsing — Dutch numbers, sign normalisation, strict `to_number` |

Both emit a `controle` block: what could not be parsed, and what the source contradicts. That block is part of the contract, not debug output.

## Pipeline B — panel data

`categories` (6) → `effects` (32) → `questions` (147), plus `scores[]` on an effect.

This is the older shape and holds **two standaarden distinguished only by the `sectors` tag on each effect**: `arbeidsparticipatie` (21 effects) and `gelijke-kansen` (10). Categories are shared — "Gezondheid en Welzijn" holds effects from both — so **split on `effect.sectors`, never on category**.

Nothing here is versioned, and the `/database` endpoint still serves it to the dashboard.

Both standaarden are now **also** published on pipeline A, snapshotted by `functions/exportEffectenStandaard.js` — arbeidsparticipatie 0.9 and gelijke kansen 1.0 — so their version comes from the API instead of a constant in the frontend. The snapshots carry `effectId`, the record's own Firestore id, which is the mapping a consumer needs to move off `/database`.

That is not the migration: `docs/migratie-standaarden.md` routes them through a workbook so they can be **edited** again, and adds the fields this data has never had. Until then a snapshot is a photograph of a mutable collection — regenerate it and a dashboard edit rides along, which is why the counts are pinned by a test.

## Cloud Functions

Nine, all `onRequest`, and three wrappers in `index.js` that differ only in who may call them. The split is the point: a read endpoint must never quietly acquire a write path, and an open write must never sit one `if` away from an admin-only one.

| Wrapper | Adds |
|---|---|
| `publicEndpoint` | CORS + `GET`-only + read rate limit + `maxInstances: 10` + error handling |
| `publicWriteEndpoint` | `POST`-only, the much smaller `schrijven` rate limit, `no-store`, CORS limited to the site's own origins |
| `authenticatedEndpoint` | an ID-token check on top of that, and a method it is told (`POST` to decide, `GET` to moderate) |

| Function | Serves |
|---|---|
| `meetstandaard` | published standaarden (registry-driven) |
| `monetarisering` | monetarisering onderbouwing |
| `arbeidsparticipatie` | participatieladder parameters |
| `database` | panel data as one tree (origin-allowlisted CORS) |
| `benchmark` | dataset benchmarks |
| `feedback` | reviewed feedback on a standaard, public and unauthenticated |
| `changelog` | what changed between versions — **not versioned**, see below |
| `feedbackIndienen` | **write, open** — submitting feedback without an account |
| `feedbackSchrijven` | **write, admin** — status and reasoning on one reaction |
| `feedbackBeheer` | **read, admin** — the moderation queue, incl. the submitter's email |

`versionedResource.js` is shared by the first three: version listing, resolution, pinning, ETag, validation. It is deliberately small — see `docs/decisions.md#adr-002`.

### The one thing that is deliberately not versioned

`changelog` is the exception, and it has to be. A published version is immutable, so it can never contain its own history: the entry that records a correction needs somewhere the correction can be *added*. So the changelog grows and the documents it describes stay frozen.

It is maintained by hand in `functions/data/changelog.json`, because only a person knows why a value changed. Every entry names the commit it landed in, which is what keeps it a record rather than a claim, and a test asserts that every version it mentions was actually published.

Two soorten are told apart: `publicatie` and `correctie-in-plaats`. The second is a deviation from ADR-001 — an already-published version changed where it stood — and is recorded as such rather than smoothed over.

### The feedback loop

`feedback` → `besluit` → changelog entry. Reading feedback is public and unauthenticated: someone deciding whether to adopt a standaard should see what others found wrong with it and what was done about it.

Submitting is public too. An account was a threshold in front of the one thing this project asks of an outsider, so the form is open — name, organisation (optional), email, reaction. What replaces the account is **moderation, not a lower bar**: a submission lands on status `nieuw`, and `nieuw` is not in `PUBLIEKE_STATUSSEN`. Nothing an anonymous visitor writes reaches the public page until a beheerder gives it a status and a reason.

`spam` exists for the case `afgewezen` cannot cover. A rejection is public on purpose — someone wrote in and is owed a visible answer — which is exactly the wrong response to a bot, so `spam` ends the matter without repeating it. Nothing is deleted; it just stops being published.

The submitter's email is stored and never projected into the public list. Firestore rules cannot filter fields, so the list is served by a function whose projection decides what is public — and the panel gets its own, wider projection through `feedbackBeheer`, because moderating a queue you cannot see is not moderation.

Each reaction shows the changelog entry that names it, when there is one — that last step is what makes `verwerkt` a fact rather than a word.

`verwijderd` is a soft delete alongside `spam`: the document stays and the status can be set back, because a feedback record that can be silently erased is not a record.

Functions authenticate with a service account and use the **Admin SDK, which bypasses Firestore rules entirely**. Locking down rules never affects the public API.

## Frontend

Vite + React, one build, two front-ends that share nothing but the registry:

| Route | What | Reads from |
|---|---|---|
| `/` | The public site — every standaard, no login, feedback included | The HTTP API |
| `/beheer` | The feedback queue, nothing else | The HTTP API, as an admin |

Both read over HTTP. The Firestore rules give an anonymous visitor nothing, so
the public site has no other way in — which also means it shows exactly what any
other consumer of the API gets, and says so per standaard by printing the URL
that produced the page. The panel followed: it used to render the standaarden
from Firestore behind a login, a second view of the same document that could
drift from the first. It now shows only what exists nowhere else — the feedback
queue — and reads that over HTTP too, with a token.

```
src/
  standaarden.js                    registry: label, api route, collection
  index.css                         reset only; the design lives in public/public.css
  api/client.js                     the public site's reads, the open feedback write, the admin writes
  firebase/config.js                the Firebase app the admin login runs on
  public/
    public.css                      the meetstandaard.nl design as tokens
    PubliekeLayout.jsx              header, nav, footer, account slot
    useAuth.js                      signed-in user + admin claim, read from the ID token
    useApiStandaard.js              versions + the pinned document
    useChangelog.js                 the changelog of a standaard, shared by history and feedback
    Feedback.jsx                    the open feedback form and list under a standaard
    feedbackDoelen.js               what a reaction can be about, read off the pinned document
    renderers/                      EffectenPubliek, InterventiesPubliek, ParametersPubliek, BronnenPubliek
  pages/publiek/                    Overzicht, StandaardDetail, Inloggen (beheerders)
  pages/Beheer.jsx                  the panel: the feedback queue and nothing else
  components/beheer/FeedbackBeheer  moderating one standaard or all of them at once
  components/auth/AdminRoute.jsx    claim check on /beheer
```

Renderers on both sides are presentational and take `doc`. Which renderer a
document gets is decided by `meta.kind`, not by the registry — the registry only
supplies the fallback for the participatieladder parameters, which predate that
field.

## Security model

| Layer | Rule |
|---|---|
| Public read API | No auth, CORS `*`, read-only, 60 req/min per client, `maxInstances: 10` |
| Feedback submission | `POST` only, no auth, 5 per 10 min per client, CORS limited to the site's own origins, published only after review |
| Admin endpoints | Firebase ID token + `admin` claim, CORS limited to the site's own origins |
| Firestore rules | Reads require the `admin` claim; **no client may write anything at all** |
| Cloud Functions | Admin SDK, bypasses rules |
| Panel | `AdminRoute` checks the `admin` claim — UI gating only, never the enforcement point |
| Public site | No auth; reads everything over HTTP, because the rules give an anonymous visitor nothing |

Published versions are writable **only** by the seed scripts, and those refuse to
overwrite an existing version without `--force`. That is what makes immutability
real rather than aspirational — see `docs/pitfalls.md#versioning-reseeding-strands-cached-clients`
for the field that was nearly lost proving it.
