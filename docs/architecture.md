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

Six, all `onRequest`. Five are read-only and wrapped by `publicEndpoint` in `index.js` (CORS + method check + rate limit + `maxInstances: 10` + error handling).

The sixth takes a write, and has its own wrapper: `authenticatedEndpoint` adds `POST`-only, an ID-token check, `Cache-Control: no-store`, and CORS limited to the site's own origins instead of `*`. The two wrappers are separate on purpose — a read endpoint must never quietly acquire a write path.

| Function | Serves |
|---|---|
| `meetstandaard` | published standaarden (registry-driven) |
| `monetarisering` | monetarisering onderbouwing |
| `arbeidsparticipatie` | participatieladder parameters |
| `database` | panel data as one tree (origin-allowlisted CORS) |
| `benchmark` | dataset benchmarks |
| `gebruikers` | **write** — name and organisation for the signed-in account |

`versionedResource.js` is shared by the first three: version listing, resolution, pinning, ETag, validation. It is deliberately small — see `docs/decisions.md#adr-002`.

Functions authenticate with a service account and use the **Admin SDK, which bypasses Firestore rules entirely**. Locking down rules never affects the public API.

## Frontend

Vite + React, one build, two front-ends that share nothing but the registry:

| Route | What | Reads from |
|---|---|---|
| `/` | The public site — every standaard, no login | The HTTP API |
| `/beheer` | The panel — five tabs | Firestore, over the SDK, as an admin |

They read differently because they must. The Firestore rules give an anonymous
visitor nothing, so the public site can only go over HTTP — which also means it
shows exactly what any other consumer of the API gets, and says so per standaard
by printing the URL that produced the page.

```
src/
  standaarden.js                    registry: label, api route, collection
  api/client.js                     the public site's reads, plus the token-authenticated writes
  public/
    public.css                      the meetstandaard.nl design as tokens
    PubliekeLayout.jsx              header, nav, footer, account slot
    useAuth.js                      signed-in user + admin claim, read from the ID token
    useApiStandaard.js              versions + the pinned document
    ControleBlok.jsx                what a version reports about its own gaps
    renderers/                      EffectenPubliek, InterventiesPubliek, ParametersPubliek
  pages/publiek/                    Overzicht, StandaardDetail, Over, Inloggen, Registreren
  pages/Home.jsx                    the panel: tabs + version dropdown
  components/standaard/             the panel's renderers + SharedStyles
  components/auth/AdminRoute.jsx    claim check on /beheer
  firebase/useVersionedStandaard.js the panel's version list + selected document
```

Renderers on both sides are presentational and take `doc`. Which renderer a
document gets is decided by `meta.kind`, not by the registry — the registry only
supplies the fallback for the participatieladder parameters, which predate that
field.

## Security model

| Layer | Rule |
|---|---|
| Public read API | No auth, CORS `*`, read-only, 60 req/min per client, `maxInstances: 10` |
| Write endpoints | `POST` only, Firebase ID token required, CORS limited to the site's own origins, same rate limit |
| Firestore rules | Reads require the `admin` claim; **no client may write anything at all** |
| Cloud Functions | Admin SDK, bypasses rules |
| Panel | `AdminRoute` checks the `admin` claim — UI gating only, never the enforcement point |
| Public site | No auth; reads everything over HTTP, because the rules give an anonymous visitor nothing |

Published versions are writable **only** by the seed scripts, and those refuse to
overwrite an existing version without `--force`. That is what makes immutability
real rather than aspirational — see `docs/pitfalls.md#versioning-reseeding-strands-cached-clients`
for the field that was nearly lost proving it.
