# Handoff: integrating the Meetstandaard monetarisering onderbouwing

**Audience:** coding agent working on software that consumes the Meetstandaard API (e.g. an impact dashboard) and needs to show users the substantiation ("onderbouwing") behind every monetary impact value.

**Goal:** 100% transparency. When your UI shows that a person moving from score 1 to score 3 on "Gezonde leefstijl" represents €12.500 of societal value, the user must be able to see exactly where those numbers come from: the calculation, the assumptions, the tariffs used, and the sources.

Everything you need is served by one new public endpoint. No authentication, no API key, CORS is `*`.

---

## 1. Endpoints

Base: `https://us-central1-meetstandaard-api.cloudfunctions.net/monetarisering`

| Route | Returns |
|---|---|
| `GET {base}/api/v1/monetarisering/onderbouwing` | Latest version (full document) |
| `GET {base}/api/v1/monetarisering/onderbouwing/{version}` | Pinned version, e.g. `/1.0` (404 if unknown) |
| `GET {base}/api/v1/monetarisering/versions` | `{ "versions": ["1.0", ...] }` (sorted ascending) |

All responses are JSON, `Cache-Control: public, max-age=86400`, with an `ETag`. Send `If-None-Match` to get `304`. Only `GET` is allowed (anything else → `405`).

**Versioning policy:** documents are immutable per version. New/updated content arrives as a new version (e.g. `1.1`), so:

- For **display of current methodology**, fetch the latest (`.../onderbouwing`).
- When you **store or report on measurements**, persist `meta.version` alongside them so historic results stay explainable against the exact methodology they were valued with (`.../onderbouwing/{version}`).

The companion endpoint `https://us-central1-meetstandaard-api.cloudfunctions.net/arbeidsparticipatie/api/v1/arbeidsparticipatie/parameters` (same conventions) serves the detailed parameter set for the Participatieladder (incomes per education level/hours band, tax brackets, benefit amounts). The Participatieladder entry in this document points to it in its `methodiek`.

## 2. Document shape

```jsonc
{
  "meta": {
    "version": "1.0",
    "source": "Meetstandaard Social Impact v1.0",
    "updatedAt": "2026-07-14",
    "status": "demo",           // top-level lifecycle flag, see §5
    "toelichting": "…"          // human-readable note about this version — show it
  },

  "effecten": [
    {
      "id": "gezonde-leefstijl",        // stable slug
      "effectId": "6bb2…",              // Firestore effect id — join key, see §3
      "effect": "Gezonde leefstijl",    // display name
      "categorie": "Gezondheid en Welzijn",
      "status": "volledig",             // volledig | gedeeltelijk | concept, see §5
      "methodiek": "…",                 // prose: how this effect was monetised
      "prijsbasis": [                   // the universal tariffs used ("universele bronnen")
        {
          "label": "Fysiotherapie regulier",
          "waarde": 39,
          "eenheid": "€ per zitting",
          "bronnen": ["maatschappelijke-prijslijst-2026"]   // ids into top-level bronnen
        }
      ],
      "niveaus": [                      // always exactly 5, scores 1..5 in order
        {
          "score": 1,
          "situatie": "…",              // description of the situation at this score
          "waardePerJaar": -15000,      // € per person per year; negative = societal cost
          "literatuur": "…",            // prose justification from literature (can be null)
          "opbouw": [                   // financial breakdown (can be null, see §5)
            {
              "component": "ziekteverzuim",       // see §4 for the enum
              "stakeholder": "werkgever",         // who bears the cost/benefit
              "bedrag": -4440,                    // € — all opbouw bedragen sum EXACTLY to waardePerJaar
              "berekening": "30 extra ziektedagen per jaar × €148 per werkdag …",
              "aannames": ["30 extra verzuimdagen per jaar, gebaseerd op …"],
              "bronnen": ["maatschappelijke-prijslijst-2026", "tno-duurzame-inzetbaarheid-2018"]
            }
          ],
          "bronnen": ["bmj-healthy-lifestyle-2020", "…"]    // level-wide citations
        }
      ]
    }
  ],

  "bronnen": {                          // central source registry, keyed by id
    "maatschappelijke-prijslijst-2026": {
      "id": "maatschappelijke-prijslijst-2026",  // key === id, guaranteed
      "type": "universeel",             // universeel (tariff/price list) | literatuur (scientific)
      "title": "…",
      "publisher": "…",
      "year": 2026,                     // optional
      "url": null,                      // null when no public link exists…
      "note": "…"                       // …in which case note explains why (guaranteed present)
    }
  }
}
```

Guarantees you can rely on (enforced by tests in the API repo):

- Every id in any `bronnen` array (on niveaus, opbouw components, prijsbasis) resolves to an entry in the top-level `bronnen` registry — no dangling citations.
- When `opbouw` is non-null it is non-empty and its `bedrag` values **sum exactly** to `waardePerJaar`.
- Every effect has exactly 5 `niveaus` with `score` 1–5 in order.
- A bron with `url: null` always has a `note`.

Not guaranteed: `literatuur` may be `null`, `opbouw` may be `null`, `prijsbasis` may be `[]`, `bronnen` arrays may be `[]`, and `effectId` may be `null` if an effect could not be matched at seed time. Handle all of these.

## 3. Joining onto the existing `database` endpoint

You are presumably already consuming `GET …/database` (categories → effects → `scores[]`). Join keys:

- `onderbouwing.effecten[].effectId` ↔ `database` effect `.id` (primary join).
- Fallback: match on normalised effect name (`effect` field) if `effectId` is null.
- Within an effect: `niveaus[].score` ↔ `scores[].score` (both 1–5).

Consistency check worth asserting in your integration: `niveaus[].waardePerJaar === scores[].monetaryValue` for the same effect+score. If they ever diverge, prefer the value you already use for calculations and log a warning — the onderbouwing document explains values, it does not redefine them.

Note: the `database` endpoint's `scores[].onderbouwing` is a legacy free-text string (often a placeholder). Ignore it once you render from this endpoint.

## 4. Semantics of the numbers

- All amounts are **€ per person per year**, expressed **relative to the nullijn** (the national-average situation, which is the score with `waardePerJaar: 0` — score 4 for most effects, absent for the Participatieladder where even trede 5 is positive).
- **Negative = societal cost, positive = societal benefit.** An improvement from score *a* to score *b* is worth `waarde(b) − waarde(a)`.
- `component` values currently in use: `uitkeringen`, `ziekteverzuim`, `arbeidsproductiviteit`, `zorgkosten`, `inkomstenbelasting`, `zorgEnVeiligheid`, `maatschappelijkeBaten`. Treat as an open enum (render label from the string; don't hard-fail on unknown values).
- `stakeholder` values currently in use: `werkgever`, `zorgverzekeraar`, `gemeente`, `rijksoverheid`, `maatschappij`. Same advice: open enum.
- `bronnen[].type`: `universeel` = a price/tariff that was calculated with (Maatschappelijke prijslijst, ZIN referentieprijzen); `literatuur` = scientific/statistical underpinning of an assumption. Distinguishing these visually is the core of the transparency story: *every euro = universal price × literature-based assumption*.

## 5. Status flags — set expectations in the UI

- `meta.status: "demo"` — this whole document is a demo release; the definitive v1.0 content is expected soon as a new version. Surface `meta.toelichting` somewhere visible (e.g. an info banner in the onderbouwing view).
- Per effect, `status`:
  - `volledig` — every non-zero niveau has a full `opbouw`. Render everything.
  - `gedeeltelijk` — some niveaus have `opbouw`, others only `literatuur`. Render what's there; no "missing data" error styling.
  - `concept` — values and literature context are final-ish, but the detailed financial breakdown is still being authored. Show the situatie, waarde and literatuur, plus a neutral notice like *"Gedetailleerde financiële opbouw volgt in de definitieve versie 1.0."* Do **not** hide these effects.

## 6. Suggested rendering

Wherever your UI shows a monetary impact value (per effect score, or an aggregate), add an affordance ("ⓘ Onderbouwing" / expandable row / modal) that shows, for that effect+score:

1. **Header**: effect name, score, situatie, waarde per jaar, status notice if `concept`/`gedeeltelijk`.
2. **Methodiek** (effect-level prose) — collapsible.
3. **Opbouw table** (when present): component | stakeholder | bedrag | berekening, with `aannames` as sub-bullets and bron links per row. Consider a footer row showing the sum (= waardePerJaar).
4. **Prijsbasis table** (effect-level, when non-empty): label | waarde | eenheid | bron. Caption it "Gehanteerde tarieven (universele bronnen)".
5. **Literatuur** prose + **Bronnen** list for the level.

Bron rendering rule (reuse everywhere): if `url` is non-null render a link with `title` (append `publisher`, `year` when present); if `url` is null render plain text with the `note` as tooltip/subscript. There is an existing reference implementation of exactly this in the Meetstandaard admin frontend: `bronLinks()` in `src/pages/Participatieladder.jsx` of the meetstandaard-api repo.

For aggregate views (e.g. total impact across participants), the honest framing is: link each contributing effect's onderbouwing rather than inventing an aggregate justification.

## 7. Practical notes

- **Caching:** the payload is ~50 KB and changes rarely. Fetch once per session or cache with the ETag; the 24h `max-age` is safe.
- **Locale:** all content is Dutch. Format amounts as Dutch euros (`€ 15.000`, minus sign for costs — or render costs/benefits with color + sign convention, but keep the sign semantics of §4).
- **Error handling:** 404 on a pinned version means it doesn't exist (check `/versions`); treat network failure as "onderbouwing temporarily unavailable" — never block the display of the impact values themselves.
- **No write API.** Content corrections happen upstream in the Meetstandaard repo and arrive as new versions.

## 8. Quick verification

```bash
curl -s https://us-central1-meetstandaard-api.cloudfunctions.net/monetarisering/api/v1/monetarisering/onderbouwing \
  | jq '{version: .meta.version, effects: [.effecten[] | {id, status, effectId}], bronnen: (.bronnen | length)}'
```

Expected (as of version 1.0): five effects — `fysieke-gezondheid` (volledig), `gezonde-leefstijl` (volledig), `mentale-gezondheid` (concept), `participatieladder` (gedeeltelijk), `financiele-gezondheid` (concept) — each with a non-null `effectId`, and 24 bronnen.

And a self-check to build into your integration tests:

```js
for (const effect of doc.effecten) {
  for (const niveau of effect.niveaus) {
    if (!niveau.opbouw) continue;
    const sum = niveau.opbouw.reduce((a, c) => a + c.bedrag, 0);
    console.assert(sum === niveau.waardePerJaar, `${effect.id}#${niveau.score} opbouw mismatch`);
  }
}
```
