# Versioning

Applies to every versioned, read-only endpoint of the Meetstandaard API:

| Endpoint | Resource | Firestore collection |
|---|---|---|
| `meetstandaard` | `/api/v1/meetstandaard/{sector}` | one collection per standaard (`MeetstandaardEnergiearmoede`, `MeetstandaardMilieuCirculariteit`) |
| `monetarisering` | `/api/v1/monetarisering/onderbouwing` | `MeetstandaardMonetarisering` |
| `arbeidsparticipatie` | `/api/v1/arbeidsparticipatie/parameters` | `MeetstandaardParameters` |

All three share one implementation, [`functions/versionedResource.js`](../functions/versionedResource.js).

## The rules

1. **A published version is immutable and keeps being served.** Corrections ship as a new version. Nothing is ever removed, so an old version never stops working.
2. **Nothing upgrades on its own.** Moving to a new version is a deliberate step on the consumer's side, because a new version can change values and requires re-checking how they are used.
3. **Every response says which version it is** — in `meta.version` and in the `X-Meetstandaard-Version` response header.

## Routes

For a resource at `{base}` (e.g. `.../meetstandaard/energiearmoede`):

| Route | Returns |
|---|---|
| `GET {base}` | The newest version |
| `GET {base}/{version}` | That exact version — `404` if it never existed |
| `GET {base}/versions` | `{ "versions": ["0.9", "1.0"], "latest": "1.0" }` |

Versions sort numerically, so `1.10` is newer than `1.2`.

**Pin the version.** Request `{base}/{version}` with a version you have chosen, and store that version string next to any measurement you record. `{base}` without a version is for browsing and for discovering what is current — if you build against it, your numbers change under you the day a new version is published.

A `404` on an unknown version lists the ones that do exist, so finding the right one takes a single request:

```json
{ "error": "Unknown version: 9.9", "versions": ["0.9", "1.0"] }
```

## Other response details

- `Cache-Control: public, max-age=86400` and an `ETag` on every response. Send `If-None-Match` to get a `304`.
- Only `GET` is allowed; anything else returns `405`.
- CORS is `*` — public reference data, no credentials involved.
- **Rate limit: 60 requests per minute per client.** Over that you get `429` with a `Retry-After` header; `X-RateLimit-Limit` and `X-RateLimit-Remaining` are on every response. Honour the cache headers and you will never approach it — the documents change a few times a year.
- Version ids must be dot-separated numbers (`0.9`, `2026.1`). Anything else is `404`, not a server error.

## The changelog is not versioned

Everything above describes immutable documents. Their history cannot live inside them, so it lives beside them:

```
GET {base}/changelog/api/v1/changelog/{standaard}
```

That list grows; the documents it describes never change. It records both a `publicatie` and a `correctie-in-plaats` — the latter being a version that was changed where it stood, which happened to the 0.9 documents before anyone had pinned them, and which must not happen again now that they are in use.

## Publishing a new version

No code change and no redeploy: versions are read from Firestore at request time.

1. Produce the document. For a sector meetstandaard, regenerate it from the workbook (an interventiebibliotheek uses `tools/build-interventiebibliotheek.py` instead — see [handoff-interventiebibliotheek.md](handoff-interventiebibliotheek.md)):

   ```bash
   python3 tools/build-meetstandaard.py \
     --xlsx "path/to/meetstandaard.xlsx" \
     --sector energiearmoede --version 1.0 --released-at 2026-11-01 \
     --out functions/data/meetstandaard-energiearmoede-1.0.json
   ```

2. Add it to the `documenten` array of that standaard in [`functions/meetstandaard.js`](../functions/meetstandaard.js), **and add a changelog entry** in `functions/data/changelog.json` naming what changed, the commit, and the feedback ids it acts on. A test fails if the changelog mentions a version that does not exist; nothing fails if a version has no entry, so this step is on you. The endpoint serves two document kinds — an effect-based meetstandaard and an interventiebibliotheek — distinguished by `meta.kind`; versioning and routing are identical for both.
3. Seed it: `cd functions && node seedMeetstandaard.js`. This writes one document per version and is safe to re-run.

   Nothing stops you overwriting an already-published version this way. That is fine while you are the only consumer and are still finishing `0.9`; once other organisations pin a version, republishing one in place silently changes numbers they have already reported, so from then on treat a published version as append-only and ship corrections as a new version.

Deploy is only needed when the code changes: `firebase deploy --only functions`.
