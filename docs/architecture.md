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
| `meetstandaard` (or absent) | `effecten[]` → stellingen, situatieschetsen, monetarisering per niveau, proxies | Energiearmoede |
| `interventiebibliotheek` | `interventies[]` → kengetal per eenheid, three layers | Milieu & circulariteit |

Consumers must switch on `meta.kind` before parsing.

### Generators

| Script | Produces |
|---|---|
| `tools/build-meetstandaard.py` | effect-based meetstandaard |
| `tools/build-interventiebibliotheek.py` | interventiebibliotheek |
| `tools/xlsx_common.py` | shared cell parsing — Dutch numbers, sign normalisation, strict `to_number` |

Both emit a `controle` block: what could not be parsed, and what the source contradicts. That block is part of the contract, not debug output.

## Pipeline B — panel data

`categories` (6) → `effects` (32) → `questions` (147), plus `scores[]` on an effect.

This is the older shape and holds **two standaarden distinguished only by the `sectors` tag on each effect**: `arbeidsparticipatie` (21 effects) and `gelijke-kansen` (10). Categories are shared — "Gezondheid en Welzijn" holds effects from both — so **split on `effect.sectors`, never on category**.

Nothing here is versioned. The version numbers shown in the panel (0.9 and 1.0) live in `src/standaarden.js`. `docs/migratie-standaarden.md` covers moving these onto pipeline A.

## Cloud Functions

Five, all `onRequest`, all read-only, all wrapped by `publicEndpoint` in `index.js` (CORS + method check + rate limit + `maxInstances: 10` + error handling).

| Function | Serves |
|---|---|
| `meetstandaard` | published standaarden (registry-driven) |
| `monetarisering` | monetarisering onderbouwing |
| `arbeidsparticipatie` | participatieladder parameters |
| `database` | panel data as one tree (origin-allowlisted CORS) |
| `benchmark` | dataset benchmarks |

`versionedResource.js` is shared by the first three: version listing, resolution, pinning, ETag, validation. It is deliberately small — see `docs/decisions.md#adr-002`.

Functions authenticate with a service account and use the **Admin SDK, which bypasses Firestore rules entirely**. Locking down rules never affects the public API.

## Frontend

Vite + React. One authenticated route: `Home`, which is the whole panel — five standaarden as tabs, all read-only.

```
src/
  standaarden.js                 registry: label, source, version strategy
  pages/Home.jsx                 tabs + version dropdown
  components/standaard/
    PublishedStandaard.jsx       effect-based documents
    InterventiesStandaard.jsx    interventiebibliotheek (table, not list/detail)
    ParametersStandaard.jsx      participatieladder
    EffectenStandaard.jsx        pipeline B, filtered by sector
    SharedStyles.js              shared read-only presentation
  firebase/useVersionedStandaard.js   version list + selected document
```

Renderers are presentational and take `doc`; `Home` owns version selection so the dropdown behaves identically across tabs. `EffectenStandaard` is the exception — it loads its own data, because pipeline B has no versions to select.

## Security model

| Layer | Rule |
|---|---|
| Public API | No auth, CORS `*`, read-only, 60 req/min per client, `maxInstances: 10` |
| Firestore rules | Reads require a signed-in user; **no client may write any `Meetstandaard*` collection** |
| Cloud Functions | Admin SDK, bypasses rules |
| Panel | `ProtectedRoute` — UI gating only, never the enforcement point |

Published versions are writable **only** by the seed scripts. That is what makes immutability real rather than aspirational.
