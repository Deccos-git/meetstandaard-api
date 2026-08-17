# Handoff: integrating the interventiebibliotheek

**Audience:** developer or agent consuming the Meetstandaard API who needs to attach impact figures to *interventions* — what a measure physically does, and what that is worth.

**Goal:** given "we placed 40 m² radiatorfolie" or "we planted 12 trees", produce a defensible CO₂ and euro figure, with the calculation and the source visible.

Currently published: **Milieu & circulariteit, version 0.9** — 114 interventions across Klimaat & Energie (68), Circulariteit (31) and Biodiversiteit & Natuur (15).

No authentication, no API key, CORS is `*`.

---

## 1. It is not an effect-based meetstandaard

This document sits on the same endpoint as the sector meetstandaarden but has a **completely different shape**. Check `meta.kind` before parsing:

| `meta.kind` | Shape | Example |
|---|---|---|
| `meetstandaard` (or absent) | `effecten[]` with stellingen, situatieschetsen, monetarisering per niveau | Energiearmoede |
| `interventiebibliotheek` | `interventies[]` with a kengetal per unit | Milieu & circulariteit |

Where a meetstandaard measures a change *in people* on a 1–5 scale, this measures the physical output *of a measure* per unit.

## 2. Endpoints

Base: `https://us-central1-meetstandaard-api.cloudfunctions.net/meetstandaard`

| Route | Returns |
|---|---|
| `GET {base}/api/v1/meetstandaard/milieu-circulariteit/0.9` | Version 0.9 — **pin this** |
| `GET {base}/api/v1/meetstandaard/milieu-circulariteit` | Newest version |
| `GET {base}/api/v1/meetstandaard/milieu-circulariteit/versions` | `{ "versions": ["0.9"], "latest": "0.9" }` |

Versioning, caching and errors are exactly as in [versionering.md](versionering.md).

## 3. The three layers

```
Laag A   interventie -> fysiek effect     kengetallen.*   (gas m3, kWh, kg CO2e per eenheid)
Laag B   conversie                        aannames[]      (prices and emission factors)
Laag C   monetarisatie                    berekend.*      (CO2 at the shadow price)
```

**Laag B and C are computed by the generator, not read from the workbook.** The workbook holds them as Excel formulas whose cached values are empty, so reading the file naively yields nothing. They are recomputed from `aannames` using the workbook's own formulas, which the document publishes verbatim under `berekening`:

```
besparingHuishoudenEurPerJaar       = (gas × gasprijs + kWh × elektriciteitsprijs_gewogen + m³ × waterprijs) × bestendiging
co2eKgPerJaar                       = (gas × ef_gas   + kWh × ef_elektriciteit            + m³ × ef_water)   × bestendiging
maatschappelijkeBesparingEurPerJaar = co2eKgPerJaar × co2-schaduwprijs
totaleWaardeEurPerJaar              = besparingHuishoudenEurPerJaar + maatschappelijkeBesparingEurPerJaar
maatschappelijkeBesparingEurPerEenheid = co2ePerEenheid × co2-schaduwprijs
```

Every input is in `aannames[]` with its own `bron` and a `geverifieerd` flag, so you can re-derive any figure. Change a price there and every intervention moves with it.

Two of those inputs are themselves derived, and both say so:

- **`elektriciteitsprijs-gewogen-incl-groenestroomopslag`** (`afgeleid: true`, `formule: "=B2+B10*B11"`) — the grey price plus the green-certificate surcharge, weighted by the share of households on a green contract. **The savings column bills electricity at this price**, not at the bare `elektriciteitsprijs`. The emission factor deliberately stays location-based; a green contract does not change the physical netmix.
- **`bestendiging`** on behaviour measures is the central persistence factor (0,8), not 1. `controle.metBestendigingsfactor` lists the 18 interventions it applies to.

## 4. An intervention

```jsonc
{
  "id": "ET01",                       // workbook code where one exists, else the slug
  "slug": "radiatorfolie-plaatsen",   // stable, url-safe — key on this
  "domein": "Klimaat & Energie",
  "activiteitstype": "Energie besparen",
  "interventie": "Radiatorfolie plaatsen",
  "eenheid": "m2 folie",              // ← every kengetal is *per this unit*
  "primaireEffecten": "Gasbesparing -> CO2-reductie",
  "rekenmodel": "…",                  // prose: how the figure is derived
  "monetarisatiebron": "…",
  "onderbouwing": "GEVERIFIEERD: Milieu Centraal (10-11 m3 gas/m2)",
  "bewijssterkte": "Hoog",            // Hoog | Middel-Hoog | Middel | Laag-Middel | Laag
  "statusKengetal": "direct brongetal",
  "afbakening": "Overlapgroep ruimteverwarming — cap per woning, niet optellen",
  "wikipagina": "interventie-radiatorfolie.md",

  "kengetallen": {                    // laag A — verbatim from the workbook
    "gasM3PerJaar": 10, "elektraKwhPerJaar": 0, "waterM3PerJaar": 0,
    "bestendiging": 1,
    "co2ePerEenheid": null, "co2ePerEenheidTekst": null
  },
  "berekend": {                       // laag B/C — derived, re-checkable
    "besparingHuishoudenEurPerJaar": 13.5,        // uitkomst 2
    "co2eKgPerJaar": 21.34,
    "maatschappelijkeBesparingEurPerJaar": 2.77,  // uitkomst 3
    "totaleWaardeEurPerJaar": 16.27,              // 2 + 3
    "maatschappelijkeBesparingEurPerEenheid": null
  }
}
```

`elektraKwhPerJaar` is the workbook's uitkomst 1 ("1. Energiebesparing (kWh/jr)"). It is electricity specifically, and it goes **negative** where a measure uses more power: `WG10` (gasfornuis → inductie) is −175 kWh with 37 m³ gas saved, netting +36,26 kg CO₂e.

```jsonc
// aannames[] entry — the derived one carries its own derivation
{
  "id": "elektriciteitsprijs-gewogen-incl-groenestroomopslag",
  "waarde": 0.25585, "eenheid": "EUR/kWh",
  "geverifieerd": false, "afgeleid": true, "formule": "=B2+B10*B11"
}
```

**Multiply by quantity in the stated `eenheid`.** 40 m² radiatorfolie = 40 × 21,34 kg = 854 kg CO₂e/jaar. Units differ per intervention (m², stuk, kg, strekkende meter, deelnemer) — never sum across interventions without checking them.

## 5. Do not treat a missing figure as zero

This is the library's own governing rule: *geen kengetallen verzinnen*. Where no reliable source exists, there is no number.

- `kengetallen.co2ePerEenheid` is `null` with the verbatim reason in `co2ePerEenheidTekst` (`"needs verification"`).
- `berekend.*` stays `null` rather than defaulting to `0`.
- `controle.zonderKengetal` lists every such intervention — **42 of 114** in this version.

Rendering those as `0` would silently claim a measure has no impact, when the truth is that it has not been quantified.

`statusKengetal` tells you *why* a figure is or is not usable:

| Status | Meaning | Count |
|---|---|---|
| `direct brongetal` | straight from a verified source | 48 |
| `casusgebonden / vergelijkend` | exists, but strongly case-dependent | 34 |
| `herleidbare omrekening` | derived from source figures | 17 |
| `enabler / output` | no impact of its own; it enables other interventions | 13 |
| `needs verification` | no reliable source found | 2 |

`enabler / output` deserves care: counting an energy cooperative *and* the generation it facilitates double-counts.

One row is `null` for a reason that is not about its evidence: `EG11` (Apparaten op nachttarief) is `direct brongetal`, but a tariff shift cannot be expressed with the single electricity price in `aannames`, so it is published as unquantified rather than as €0. See [decisions.md](decisions.md) ADR-006.

`bewijssterkte` is a separate axis — **43 of 114 are `Laag`**, so present totals with that visible rather than as a precise figure.

## 6. Do not sum within an overlap cluster

`afbakening` on each intervention names its overlap cluster, and the top-level `afbakening[]` holds the rules. Radiatorfolie, kierdichting and isolatie all reduce the same space heating: applying all three does not save their sum, and several are capped per dwelling. Check the cluster before adding anything up.

## 7. Practical notes

- ~170 KB. Cache on the ETag; `Cache-Control: public, max-age=86400`.
- `controle.nietGeverifieerdeAannames` flags every assumption the workbook does not mark verified — currently six, including the drinking-water emission factor, the behaviour persistence factor and the green-contract share.
- CO₂ is valued at €0,13/kg (Handboek Milieuprijzen 2023, central value). That is a *societal* shadow price, not a market price — do not present it as cash saved.
- `besparingHuishoudenEurPerJaar` **is** cash (a lower energy bill); the `maatschappelijke` figures are societal value. `totaleWaardeEurPerJaar` adds the two, as the workbook does — an MKBA-style total, not cash. Publish it with both components beside it, never on its own. `berekening.waarschuwing` carries that sentence in the document itself.

## 8. Quick verification

```bash
BASE=https://us-central1-meetstandaard-api.cloudfunctions.net/meetstandaard/api/v1/meetstandaard

curl -s "$BASE/milieu-circulariteit/0.9" | jq '.meta, (.interventies | length)'

# one intervention, end to end
curl -s "$BASE/milieu-circulariteit/0.9" \
  | jq '.interventies[] | select(.slug=="radiatorfolie-plaatsen")
        | {interventie, eenheid, kengetallen, berekend, onderbouwing}'

# what is not quantified
curl -s "$BASE/milieu-circulariteit/0.9" | jq '.controle.zonderKengetal | length'   # 42

# the formulas behind every derived figure
curl -s "$BASE/milieu-circulariteit/0.9" | jq '.berekening'
```
