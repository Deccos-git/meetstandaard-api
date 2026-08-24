# Meetstandaard API

Public API serving versioned meetstandaarden for social impact measurement, a public site that shows them, and a small admin panel behind an admin claim.

Everything a consumer reads is unauthenticated and read-only. The one exception is what a visitor submits themselves — a profile, and feedback on a standaard — which goes through authenticated `POST` endpoints, because the Firestore rules deny client writes outright.

A meetstandaard defines what to measure, how to score it, and what a score is worth in societal terms — with the calculation, the assumptions and the source visible behind every figure. The API exists so those figures can be cited and re-checked years later, not just consulted today.

## The API

The reference data needs no authentication, no API key, and answers CORS `*`. Base:

```
https://us-central1-meetstandaard-api.cloudfunctions.net
```

| Endpoint | Serves |
|---|---|
| `/meetstandaard/api/v1/meetstandaard` | Index of published standaarden |
| `/meetstandaard/api/v1/meetstandaard/{sector}/{version}` | A standaard, pinned |
| `/monetarisering/api/v1/monetarisering/onderbouwing` | Monetarisation substantiation |
| `/arbeidsparticipatie/api/v1/arbeidsparticipatie/parameters` | Participatieladder parameters |
| `/database` · `/benchmark` | Panel data and dataset benchmarks |

Write endpoints are a separate class: `POST` only, a Firebase ID token required, and CORS limited to the site's own origins.

| Endpoint | Accepts |
|---|---|
| `POST /gebruikers/api/v1/gebruikers/profiel` | Name and organisation for the signed-in account |

Published today:

| Standaard | Version | Content |
|---|---|---|
| `energiearmoede` | 0.9 | 13 effecten, 198 traceable proxyregels |
| `milieu-circulariteit` | 0.9 | 114 interventies across three domeinen |
| `arbeidsparticipatie` | 0.9 | 21 effecten, snapshot of the shared effects collection |
| `gelijke-kansen` | 1.0 | 10 effecten, same snapshot pipeline |

```bash
BASE=https://us-central1-meetstandaard-api.cloudfunctions.net/meetstandaard/api/v1/meetstandaard
curl -s "$BASE" | jq '.sectoren'
curl -s "$BASE/energiearmoede/0.9" | jq '.meta'
```

**Pin the version.** A published version is immutable and served indefinitely, so a measurement stays explainable against the exact methodology it was valued with. Store `meta.version` next to anything you record. Details in [docs/versionering.md](docs/versionering.md).

## Integrating

Start with the handoff for the standaard you need — each covers the document shape, the join keys, and the ways the data can be misread:

- [handoff-meetstandaard-integratie.md](docs/handoff-meetstandaard-integratie.md) — effect-based standaarden
- [handoff-interventiebibliotheek.md](docs/handoff-interventiebibliotheek.md) — interventions and their impact factors
- [handoff-onderbouwing-integratie.md](docs/handoff-onderbouwing-integratie.md) — monetarisation substantiation

Two things bite everyone at least once: a missing figure is `null` and **must not be rendered as `0`**, and proxy amounts **cannot be summed across effects** without applying the overlap correction first. Both handoffs say so at length.

## Development

```bash
npm install
npm run dev                     # Vite dev server
npm run build                   # → dist/

cd functions && npm install
cd functions && node --test     # backend tests
```

Firebase CLI needs Node ≥20; deploying only when code changes:

```bash
npx firebase deploy --only functions
npx firebase deploy --only firestore:rules   # read docs/pitfalls.md first — a deploy replaces the whole ruleset
```

## How a standaard gets published

```
workbook.xlsx  →  tools/build-*.py  →  functions/data/*.json  →  seed  →  Firestore  →  API
   authoring         generation           committed, diffable                    versioned
```

The workbook is the source of truth; the JSON is generated and must never be hand-edited. Publishing a **new version** needs no deploy — versions are resolved per request.

```bash
python3 tools/build-meetstandaard.py --xlsx "path/to/meetstandaard.xlsx" \
  --sector energiearmoede --version 1.0 --released-at 2026-11-01 \
  --out functions/data/meetstandaard-energiearmoede-1.0.json

cd functions && node seedMeetstandaard.js
```

## Layout

```
src/          React: the public site at / and the admin panel at /beheer
functions/    Cloud Functions + the generated documents they serve
tools/        Workbook → JSON generators
docs/         Architecture, decisions, pitfalls, integration handoffs
```

## Documentation

| | |
|---|---|
| [architecture.md](docs/architecture.md) | The two pipelines and where code belongs |
| [versionering.md](docs/versionering.md) | The versioning contract |
| [decisions.md](docs/decisions.md) | Why things are the way they are |
| [pitfalls.md](docs/pitfalls.md) | Things that have actually gone wrong here |
| [migratie-standaarden.md](docs/migratie-standaarden.md) | Moving the two unversioned standaarden onto the pipeline |

[CLAUDE.md](CLAUDE.md) holds the working rules for AI agents on this repo.
