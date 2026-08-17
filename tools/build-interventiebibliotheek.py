#!/usr/bin/env python3
"""
Build a versioned interventiebibliotheek JSON document from the source workbook.

This is a different kind of standaard from the effect-based meetstandaarden: it
catalogues *interventions* and what they physically do, in three layers —

    Laag A  interventie -> fysiek effect   (kengetal per eenheid)
    Laag B  conversie                      (central prices/emission factors, tab Aannames)
    Laag C  monetarisatie                  (CO2 at the shadow price)

The workbook computes Laag B/C in Excel formulas, and those cells have **no
cached values** (the file has never been recalculated by Excel), so reading them
yields nothing. This script therefore recomputes them from the Aannames sheet
using the same formulas, and records both the inputs and the formula in the
output so a consumer can check the arithmetic rather than trust it.

Usage:
    python3 tools/build-interventiebibliotheek.py \
        --xlsx "/path/to/interventiebibliotheek.xlsx" \
        --standaard milieu-circulariteit \
        --label "Milieu & circulariteit" \
        --version 0.9 \
        --released-at 2026-08-17 \
        --out functions/data/interventiebibliotheek-milieu-circulariteit-0.9.json

Requires: openpyxl. Not a runtime dependency of the Cloud Functions — the
generated JSON is committed and imported directly.
"""

import argparse
import json
from collections import Counter, OrderedDict

import openpyxl

from xlsx_common import clean, rounded, rows, slugify, to_number

# The four sheets that hold interventions. "Klimaat & Energie" is the only one
# with per-year physical factors; the rest carry a CO2 figure per unit.
INTERVENTIE_SHEETS = ["Klimaat & Energie", "Klimaat & Energie - overig", "Biodiversiteit & Natuur", "Circulariteit"]

# Aannames rows referenced by the workbook's formulas, by their B-column row.
AANNAME_ROWS = {
    "elektriciteitsprijs": 2,
    "gasprijs": 3,
    "waterprijs": 4,
    "emissiefactorElektriciteit": 5,
    "emissiefactorGas": 6,
    "emissiefactorWater": 7,
    "bestendigingsfactor": 8,
    "co2Schaduwprijs": 9,
}

# The status-kengetal vocabulary, and the variants the workbook actually uses.
# Normalising here keeps consumers from having to know that "casusgebonden" and
# "casusgebonden / vergelijkend" are the same thing.
STATUS_ALIASES = {
    "casusgebonden": "casusgebonden / vergelijkend",
    "enabler-output": "enabler / output",
}


def read_aannames(wb):
    """Central prices and emission factors — Laag B, and the formula inputs."""
    ws = wb["Aannames"]
    lijst = [
        OrderedDict(
            id=slugify(row["Parameter"]),
            parameter=row["Parameter"],
            waarde=to_number(row.get("Waarde")),
            eenheid=row.get("Eenheid"),
            bron=row.get("Bron / status"),
            # The workbook marks its own confidence in the status text.
            geverifieerd=str(row.get("Bron / status") or "").upper().startswith("GEVERIFIEERD"),
        )
        for row in rows(ws)
    ]
    waarden = {key: to_number(ws.cell(rij, 2).value) for key, rij in AANNAME_ROWS.items()}
    return lijst, waarden


def build_interventies(wb, a):
    """One record per intervention, with Laag B/C recomputed from Aannames."""
    interventies, seen = [], set()

    for sheet in INTERVENTIE_SHEETS:
        for row in rows(wb[sheet]):
            naam = row.get("Interventie")
            if not naam:
                continue

            slug = slugify(naam)
            if slug in seen:
                raise SystemExit(f"duplicate interventie slug: {slug}")
            seen.add(slug)

            status = row.get("Status kengetal")
            gas = to_number(row.get("Gas (m3/jr)"))
            elektra = to_number(row.get("Elektra (kWh/jr)"))
            water = to_number(row.get("Water (m3/jr)"))
            bestendiging = to_number(row.get("Bestendiging"))
            co2PerEenheid = to_number(row.get("CO2e (kg/eenheid)"))

            kengetallen = OrderedDict(
                gasM3PerJaar=gas,
                elektraKwhPerJaar=elektra,
                waterM3PerJaar=water,
                bestendiging=bestendiging,
                co2ePerEenheid=co2PerEenheid,
                co2ePerEenheidTekst=row.get("CO2e (kg/eenheid)"),
            )

            berekend = OrderedDict(besparingEurPerJaar=None, co2eKgPerJaar=None, monetairCo2EurPerEenheid=None)

            # Laag B: the Klimaat & Energie rows carry physical consumption, so
            # savings and emissions follow from the central prices and factors.
            if any(v is not None for v in (gas, elektra, water)):
                factor = 1 if bestendiging is None else bestendiging
                berekend["besparingEurPerJaar"] = rounded(
                    ((gas or 0) * a["gasprijs"] + (elektra or 0) * a["elektriciteitsprijs"] + (water or 0) * a["waterprijs"])
                    * factor
                )
                berekend["co2eKgPerJaar"] = rounded(
                    (
                        (gas or 0) * a["emissiefactorGas"]
                        + (elektra or 0) * a["emissiefactorElektriciteit"]
                        + (water or 0) * a["emissiefactorWater"]
                    )
                    * factor
                )

            # Laag C: everything else is monetised straight off its CO2 figure.
            if co2PerEenheid is not None:
                berekend["monetairCo2EurPerEenheid"] = rounded(co2PerEenheid * a["co2Schaduwprijs"])

            interventies.append(
                OrderedDict(
                    id=row.get("Code") or slug,
                    slug=slug,
                    code=row.get("Code"),
                    domein=row.get("Domein"),
                    activiteitstype=row.get("Activiteitstype"),
                    interventie=naam,
                    eenheid=row.get("Eenheid"),
                    primaireEffecten=row.get("Primaire effecten"),
                    rekenmodel=row.get("Rekenmodel"),
                    monetarisatiebron=row.get("Monetarisatiebron"),
                    onderbouwing=row.get("Onderbouwing"),
                    bewijssterkte=row.get("Bewijssterkte"),
                    statusKengetal=STATUS_ALIASES.get(status, status),
                    statusKengetalBron=status,
                    afbakening=row.get("Afbakening / overlap"),
                    nietCo2Monetair=row.get("Niet-CO2 monetair (laag C)"),
                    wikipagina=row.get("Wikipagina"),
                    kengetallen=kengetallen,
                    berekend=berekend,
                )
            )

    return interventies


def build_controle(interventies, aannames):
    """Publish what is not settled, rather than letting it look settled.

    Much of this library is explicitly provisional: the workbook's own rule is
    "geen kengetallen verzinnen — ontbreekt een bron, dan needs verification".
    Surfacing that count is the honest way to serve it.
    """
    zonder_kengetal = [
        OrderedDict(id=i["id"], interventie=i["interventie"], domein=i["domein"], tekst=i["kengetallen"]["co2ePerEenheidTekst"])
        for i in interventies
        if i["kengetallen"]["co2ePerEenheid"] is None
        and i["berekend"]["co2eKgPerJaar"] is None
    ]

    genormaliseerd = [
        OrderedDict(id=i["id"], van=i["statusKengetalBron"], naar=i["statusKengetal"])
        for i in interventies
        if i["statusKengetalBron"] != i["statusKengetal"]
    ]

    return OrderedDict(
        toelichting=(
            "Automatische controles op deze versie. `zonderKengetal` bevat interventies waarvoor geen "
            "berekenbaar CO2-kengetal beschikbaar is (needs verification, casusgebonden of enabler); die "
            "leveren geen getal op en mogen niet als nul worden gelezen. `statusGenormaliseerd` toont "
            "statuswaarden die in de bron inconsistent geschreven waren en hier zijn gelijkgetrokken."
        ),
        aantalInterventies=len(interventies),
        zonderKengetal=zonder_kengetal,
        statusGenormaliseerd=genormaliseerd,
        nietGeverifieerdeAannames=[a["parameter"] for a in aannames if not a["geverifieerd"]],
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--xlsx", required=True)
    parser.add_argument("--standaard", required=True)
    parser.add_argument("--label", required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--released-at", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    wb = openpyxl.load_workbook(args.xlsx, data_only=True)
    missing = [s for s in INTERVENTIE_SHEETS + ["Aannames", "Bronnen", "Afbakening"] if s not in wb.sheetnames]
    if missing:
        raise SystemExit(f"workbook is missing required sheets: {missing}")

    aannames, waarden = read_aannames(wb)
    interventies = build_interventies(wb, waarden)

    document = OrderedDict(
        meta=OrderedDict(
            version=args.version,
            standaard=args.standaard,
            label=args.label,
            # Distinguishes this from the effect-based meetstandaarden served by
            # the same endpoint: the document shape is entirely different.
            kind="interventiebibliotheek",
            releasedAt=args.released_at,
            source="Interventiebibliotheek maatschappelijke impact (interventiebibliotheek.xlsx)",
            generatedBy="tools/build-interventiebibliotheek.py",
            toelichting=(
                "Bibliotheek van interventies met hun fysieke effect per eenheid. Drie lagen: "
                "laag A het kengetal per interventie, laag B omrekening via de centrale prijzen en "
                "emissiefactoren in `aannames`, laag C monetarisering van CO2 tegen de milieuprijs. "
                "De besparings- en CO2-kolommen zijn hier herberekend uit `aannames` — pas een prijs "
                "daar aan en alles schuift mee. Niet elk kengetal is hard: zie `bewijssterkte` en "
                "`statusKengetal` per interventie en het `controle`-blok. Tel binnen een overlapcluster "
                "niet op zonder de regels in `afbakening` toe te passen."
            ),
        ),
        domeinen=list(dict.fromkeys(i["domein"] for i in interventies if i["domein"])),
        interventies=interventies,
        aannames=aannames,
        bronnen=[
            OrderedDict(
                id=slugify(row["Bron"]),
                bron=row["Bron"],
                domein=row.get("Domein"),
                laag=row.get("Laag"),
                toegang=row.get("Toegang"),
                wikipagina=row.get("Wikipagina"),
            )
            for row in rows(wb["Bronnen"])
        ],
        afbakening=[
            OrderedDict(onderwerp=row[0], toelichting=row[1])
            for row in ([clean(c) for c in r] for r in wb["Afbakening"].iter_rows(values_only=True))
            if row[0] or row[1]
        ],
        leeswijzer=[clean(r[0]) for r in wb["Leeswijzer"].iter_rows(values_only=True) if clean(r[0])],
        controle=build_controle(interventies, aannames),
    )

    with open(args.out, "w", encoding="utf-8") as handle:
        json.dump(document, handle, ensure_ascii=False, indent=2)
        handle.write("\n")

    per_domein = Counter(i["domein"] for i in interventies)
    berekend = sum(1 for i in interventies if i["berekend"]["co2eKgPerJaar"] is not None)
    print(f"Wrote {args.out}: {len(interventies)} interventies {dict(per_domein)}")
    print(f"  {berekend} met herberekende jaarcijfers, {len(document['controle']['zonderKengetal'])} zonder CO2-kengetal")
    print(f"  {len(document['bronnen'])} bronnen, {len(aannames)} aannames")


if __name__ == "__main__":
    main()
