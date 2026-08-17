# Handoff: integrating a sector meetstandaard

**Audience:** coding agent or developer building software that consumes the Meetstandaard API and needs the full measurement standard for a sector — the effects, the survey statements, the situation descriptions per level, and the monetisation with its complete substantiation.

**Goal:** everything needed to run a measurement and explain its outcome, from one versioned document. Which statements to ask, what each score means in words, what a score is worth in euros, which stakeholder bears that value, how the amount was calculated, and which source it comes from.

Currently published: **Energiearmoede, version 0.9.**

No authentication, no API key, CORS is `*`.

---

## 1. Endpoints

Base: `https://us-central1-meetstandaard-api.cloudfunctions.net/meetstandaard`

| Route | Returns |
|---|---|
| `GET {base}/api/v1/meetstandaard` | Index of available sectoren |
| `GET {base}/api/v1/meetstandaard/energiearmoede/0.9` | Version 0.9 — **pin this** (~195 KB) |
| `GET {base}/api/v1/meetstandaard/energiearmoede` | Newest version, whatever it currently is |
| `GET {base}/api/v1/meetstandaard/energiearmoede/versions` | `{ "versions": ["0.9"], "latest": "0.9" }` |

See [versionering.md](versionering.md) for the contract. Short version: **request `/0.9` explicitly and persist `meta.version` next to every measurement you store.** A published version never changes and never stops being served, so pinning is safe indefinitely; moving to `1.0` later is a deliberate step you take when you have checked what changed.

`0.9` is the release candidate for `1.0`: complete and internally audited, but not yet externally validated. Items marked `needs verification` / `(nv)` may still change. Show `meta.toelichting` somewhere in your UI.

## 2. Document shape

```jsonc
{
  "meta": {
    "version": "0.9",
    "sector": "energiearmoede",
    "sectorLabel": "Energiearmoede",
    "releasedAt": "2026-08-17",
    "source": "Meetstandaard Energiearmoede (meetstandaard.xlsx)",
    "toelichting": "…"                  // render this
  },

  "effecten": [ /* 13 entries, EFF-01 … EFF-13 */ ],
  "bronnen":   { /* 25 entries, keyed by id (U01…U12, S01…S13) */ },
  "parameters":  [ /* 33 central values with peiljaar and range */ ],
  "aggregatie":  { /* overlap model — read §5 before summing anything */ },
  "gevoeligheid": { /* low/mid/high outcome scenarios per driver */ },
  "audit":       [ /* 22 resolved findings from the internal audit */ ],
  "controle":    { /* automated consistency checks on this version */ }
}
```

### An effect

```jsonc
{
  "id": "EFF-01",                          // stable within the sector
  "slug": "fysieke-gezondheid",            // stable, url-safe, use for routing
  "effectId": null,                        // currently always null — see §3
  "effect": "Betere fysieke gezondheid",
  "categorie": "Gezondheid",
  "typeEffect": "individueel",
  "definitie": "…",
  "bronDefinitie": "…",
  "doelgroep": "bewoners",
  "monetariseerbaarheid": "hoog",          // hoog | middel | laag
  "crossSectorBenchmarkbaar": "gedeeltelijk",

  "stellingen": [                          // the survey items — ask these verbatim
    {
      "nummer": 3,
      "stelling": "Ik moet vaak hoesten of niezen",
      "bron": "Meetplan (tabblad Bewonersniveau); Meetstandaard en RIVM + Longfonds",
      "gebruikteSchaal": "5-punt Likert (1-5)",
      "richting": "negatief",
      "negatiefGeformuleerd": true,        // ← reverse-code before aggregating
      "letterlijkOvergenomen": true,
      "toelichting": "Reverse-coderen: hoge instemming = slechtere gezondheid"
    }
  ],

  "situatieschetsen": [                    // what a score means, in words
    { "niveau": "2", "score": 2, "label": "negatief", "situatieschets": "…", "bron": "…" }
  ],

  "monetarisering": {
    "document": "wiki/monetarisering/fysieke-gezondheid.md",
    "eenheid": "€/jaar (indicatief; …)",
    "niveaus": [
      {
        "niveau": "1",
        "score": 1,                        // null when the effect is not Likert-scored
        "totaleWaardeIndicatief": -15537.3,
        "berekening": "som proxybedragen dit niveau",
        "proxies": [ /* see below */ ]
      }
    ]
  }
}
```

**`negatiefGeformuleerd` is not decoration.** Those statements must be reverse-coded (1↔5) before you average them into an effect score, or the score inverts.

### A proxy line — the unit of traceability

```jsonc
{
  "stakeholder": "Zorgverzekeraar/zorgstelsel",
  "proxy": "Huisartsconsult",
  "bedrag": -308.7,                        // parsed number, null if not a single amount
  "bedragTekst": "-308,70",                // verbatim source text — always present
  "eenheid": "€ / jaar",
  "bronBedrag": "UNIVERSEEL_Zorg - Verdiepingsmodule+Kostenhandleiding+(versie+2024).pdf (Huisarts consult gemiddeld)",
  "bronEffectProxyRelatie": "Kari e.a. - 2023",
  "toelichtingProxykeuze": "Frequent huisartscontact bij multimorbiditeit",
  "berekening": "10 bezoeken × € 30,87",
  "aannames": "10 consulten per jaar",
  "aannamescore": 6,                       // 1–10 confidence in the assumption
  "overlapgroep": "zorgkosten"             // ← see §5
}
```

This is what makes the standard defensible: for any euro on screen you can show who bears it, how it was computed, what was assumed, how confident that assumption is, and which document it came from.

## 3. Identity — key on `slug`, not `effectId`

**Use `slug`** (`fysieke-gezondheid`) for routing and storage: stable, url-safe and readable. `id` (`EFF-01`) is equally stable and is what the source workbook and the audit trail refer to. Between them these fully identify an effect; you do not need anything external.

`effectId` exists to link an effect to a record in the dashboard's `effects` collection, but **it is currently `null` for every effect, deliberately.** That collection holds one record per (effect, sector) with its own question wording, and has no energiearmoede records — so the only available matches were other sectors' variants of the same-named effect. Those are not the same effect: an effect is only the same across sectors when its questions are *identical*, and for 5 of 6 candidates they were not. Publishing a join that claims otherwise would invite exactly the invalid cross-sector comparison this standard is meant to prevent.

Treat `null` as "no counterpart in the dashboard" and render everything else normally. Handle the field being non-null in future: it will be repopulated once energiearmoede effect records exist.

## 4. Semantics of the numbers

- All amounts are **per person per year**, relative to the nullijn (level 4 = national average), unless `eenheid` says otherwise. Some proxies use per-unit units such as `€ / opname` or `€ / dag` — check `eenheid` before formatting.
- **Negative = societal cost, positive = societal benefit.**
- `totaleWaardeIndicatief` is the sum of that level's proxies. It is indicative: it mixes real costs with transfers (uitkeringen, belastingafdracht), which you should not present as one number to a funder without saying so.
- The value of *moving* from score A to score B is the difference between the two levels, not the value of B.

## 5. Do not naively sum across effects

Effects overlap. A person scoring low on both physical and mental health does not incur two separate full sets of `zorgkosten`. Every proxy line therefore names an `overlapgroep`, and `aggregatie.overlapgroepen` says how to combine them:

| `alpha` | Method |
|---|---|
| `0` | count once — take the dominant contribution only |
| `0.5` | dominant contribution + half of the remainder |
| `1` | full sum (no overlap) |

`aggregatie.voorbeeld` works through a real case: three effects at level 2 naively sum to €20 507, and correct to €15 181 — a €5 326 overcount. **Summing proxies without this correction overstates impact by roughly a third.**

`cluster` (`A` = bewoners, `B` = fixers/coaches, `C` = milieu) matters because the same overlapgroep can carry a different alpha per cluster.

## 6. `controle` — the honest bits

Generated automatically per version; render or log it rather than hiding it.

- `nietGemonetariseerd` — proxy lines whose amount is not a single number (`PM`, `n.v.t.`, or a percentage range like `+4,6% tot +12,3%`). Their `bedrag` is `null` and they contribute `0` to sums. Show `bedragTekst` instead of a euro amount.
- `somAfwijkingen` — levels where the stated total disagrees with the sum of its proxies. These are inconsistencies **in the source workbook**, published rather than silently reconciled. In `0.9` there are two, both where a percentage was totalled as if it were euros (EFF-07 level 5, EFF-11 "Naar betaald werk").

## 7. Suggested rendering

1. **Measure** — for each effect, present `stellingen` on a 1–5 Likert scale; reverse-code where `negatiefGeformuleerd`; average to a score.
2. **Interpret** — show the `situatieschets` for that score. This is what makes a number mean something to a resident or a funder.
3. **Value** — show `totaleWaardeIndicatief` for the score, with the delta versus the baseline.
4. **Substantiate** — behind a disclosure, list the `proxies` for that level: stakeholder, amount, `berekening`, `aannames`, `aannamescore`, and the source. This is the transparency payload; do not bury it more than one click deep.
5. **Aggregate** — apply §5 before showing any cross-effect total, and say that you did.
6. **Qualify** — surface `meta.toelichting`, and `parameters[].range*` plus `gevoeligheid` wherever you present a total as a single figure. The ranges are wide and honest; presenting a point estimate as precise is the main way this data gets misused.

## 8. Practical notes

- **Size:** ~195 KB. Fetch once per session and cache on the ETag (`Cache-Control: public, max-age=86400`).
- **Rate limit:** 60 requests/minute per client; over that, `429` with `Retry-After`. Cache the response (see above) rather than refetching per page view.
- **No write API.** Content corrections happen upstream in the Meetstandaard workbook and arrive as a new version.
- **Error handling:** `404` on a pinned version means it never existed (check `/versions`). Treat network failure as "substantiation temporarily unavailable" — never block display of the measurement itself.

## 9. Quick verification

```bash
BASE=https://us-central1-meetstandaard-api.cloudfunctions.net/meetstandaard/api/v1/meetstandaard

curl -s "$BASE" | jq '.sectoren'
curl -s "$BASE/energiearmoede/versions" | jq
curl -s "$BASE/energiearmoede" | jq '.meta, (.effecten | length)'
curl -sD- -o/dev/null "$BASE/energiearmoede/0.9" | grep -i 'x-meetstandaard\|cache-control'

# one effect, end to end
curl -s "$BASE/energiearmoede/0.9" \
  | jq '.effecten[] | select(.slug=="fysieke-gezondheid")
        | {effect, stellingen: [.stellingen[].stelling],
           niveau1: .monetarisering.niveaus[0]}'
```
