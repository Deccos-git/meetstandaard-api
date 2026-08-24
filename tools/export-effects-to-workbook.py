#!/usr/bin/env python3
"""
Seed an authoring workbook for a standaard that still lives in the `effects`
collection (arbeidsparticipatie, gelijke kansen).

Step 1 of docs/migratie-standaarden.md. The published pipeline is
workbook -> build-meetstandaard.py -> versioned document, and these two
standaarden have no workbook. This script writes one, pre-filled with the
content that actually exists today, so the authoring work is "fill the gaps"
rather than "retype 21 effects".

It never guesses. A value the `effects` collection does not hold is left blank,
and every blank is listed in the report so the gap is visible instead of
implied. In particular `posNeg` is absent on 65 of 86 arbeidsparticipatie
questions — see docs/pitfalls.md#data-ui-default-never-persisted — and those
cells stay empty rather than defaulting to "nee".

Usage:
    python3 tools/export-effects-to-workbook.py \
        --sector arbeidsparticipatie \
        --out /tmp/arbeidsparticipatie.xlsx

    # offline, against a saved catalogue response
    python3 tools/export-effects-to-workbook.py --sector gelijke-kansen \
        --json /tmp/db.json --out /tmp/gelijke-kansen.xlsx

Requires: openpyxl.
"""

import argparse
import json
import os
import urllib.request
from collections import OrderedDict

import openpyxl

from xlsx_common import slugify

CATALOGUS_URL = "https://us-central1-meetstandaard-api.cloudfunctions.net/database"

# Header rows exactly as tools/build-meetstandaard.py reads them. Columns the
# generator does not read are still written when they carry authoring context
# (see `firestore_effect_id`); `rows()` keys on the header, so unknown columns
# are ignored rather than misparsed.
SHEETS = OrderedDict(
    [
        (
            "1-Effecten",
            [
                "effect_id",
                "effect",
                "categorie",
                "type_effect",
                "definitie",
                "bron_definitie",
                "doelgroep",
                "relevantie_sector",
                "cross_sector_benchmarkbaar",
                "herkomst_bestaande_standaard",
                "monetariseerbaarheid",
                "opmerkingen",
                "firestore_effect_id",
            ],
        ),
        (
            "2-Stellingen",
            [
                "effect_id",
                "stelling_nummer",
                "stelling",
                "bron_stelling",
                "originele_schaal",
                "gebruikte_schaal",
                "richting",
                "negatief_geformuleerd",
                "letterlijk_overgenomen",
                "toelichting",
                "firestore_question_id",
            ],
        ),
        (
            "3-Situatieschetsen",
            [
                "effect_id",
                "likert_niveau",
                "niveau_label",
                "situatieschets",
                "bron_situatieschets",
                "toelichting",
            ],
        ),
        (
            "4-Monetarisering-per-niveau",
            [
                "effect_id",
                "likert_niveau",
                "monetarisering_document",
                "eenheid",
                "totale_waarde_niveau_indicatief",
                "berekening",
                "belangrijkste_aannames",
                "aannamescore",
            ],
        ),
        (
            "5-Stakeholder-proxywaarden",
            [
                "effect_id",
                "likert_niveau",
                "stakeholder",
                "proxy",
                "bedrag",
                "eenheid",
                "bron_bedrag",
                "bron_effect_proxy_relatie",
                "toelichting_proxykeuze",
                "berekening",
                "aannames",
                "aannamescore",
                "overlapgroep",
            ],
        ),
        (
            "6-Bronnen",
            [
                "bron_id",
                "apa_referentie",
                "bestand",
                "type_bron",
                "relevant_voor",
                "pagina_tabblad_tabel",
                "betrouwbaarheid",
                "opmerkingen",
            ],
        ),
        (
            "7-Audit",
            ["onderdeel", "item_id", "probleem", "ernst", "voorgestelde_actie", "status"],
        ),
        ("8-Aggregatie", ["overlapgroep", "effecten", "toelichting"]),
        (
            "9-Parameters",
            [
                "parameter",
                "waarde",
                "eenheid",
                "peiljaar",
                "range_laag",
                "range_hoog",
                "bron",
                "gevoeligheid",
                "opmerking",
            ],
        ),
        (
            "10-Gevoeligheid",
            [
                "driver",
                "uitkomst-maat",
                "laag_waarde",
                "laag_uitkomst",
                "midden_waarde",
                "midden_uitkomst",
                "hoog_waarde",
                "hoog_uitkomst",
                "toelichting",
            ],
        ),
    ]
)


def load_catalogus(path):
    if path:
        with open(path, encoding="utf-8") as handle:
            return json.load(handle)
    with urllib.request.urlopen(CATALOGUS_URL, timeout=30) as response:
        return json.load(response)


def effects_for(catalogus, sector):
    """Effects tagged with this sector, with their category name attached.

    Categories are shared between standaarden ("Gezondheid en Welzijn" holds
    effects from both), so the split is on the effect's `sectors` and never on
    the category it sits under.
    """
    found = []
    for categorie in catalogus:
        for effect in categorie.get("effects", []):
            if sector in (effect.get("sectors") or []):
                found.append((categorie.get("name"), effect))
    # Sorted on the Firestore id so the minted EFF-nn are reproducible across
    # runs and stable against a later rename. They are minted exactly once:
    # after this the workbook is the source, and the ids never move again.
    return sorted(found, key=lambda pair: str(pair[1].get("id")))


def negatief_geformuleerd(question):
    """'ja' / 'nee' / blank — blank means the source never recorded it.

    `posNeg` is absent on most arbeidsparticipatie questions because the old
    panel only persisted the dropdown when it was changed away from its
    displayed default. Absent is therefore *unknown*, not 'nee': writing 'nee'
    here would assert a direction nobody ever recorded, which is the assertion
    that reverses a score.
    """
    if "posNeg" not in question or question.get("posNeg") is None:
        return None
    return "ja" if question["posNeg"] == "negative" else "nee"


def write_workbook(sector, effects, out_path):
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    sheets = OrderedDict()
    for name, header in SHEETS.items():
        ws = wb.create_sheet(name)
        ws.append(header)
        sheets[name] = ws

    gaps = OrderedDict(stellingen_zonder_richting=[], effecten_zonder_monetarisering=[])

    for index, (categorie, effect) in enumerate(effects, start=1):
        eid = f"EFF-{index:02d}"

        sheets["1-Effecten"].append(
            [
                eid,
                effect.get("name"),
                categorie,
                None,  # type_effect — not in `effects`
                effect.get("description"),
                None,  # bron_definitie
                None,  # doelgroep
                None,  # relevantie_sector
                None,  # cross_sector_benchmarkbaar — derive it, never hand-flag it
                None,  # herkomst_bestaande_standaard
                None,  # monetariseerbaarheid
                f"wiki/effecten/{slugify(effect.get('name'))}.md",
                effect.get("id"),
            ]
        )

        for nummer, question in enumerate(effect.get("questions", []), start=1):
            richting = negatief_geformuleerd(question)
            if richting is None:
                gaps["stellingen_zonder_richting"].append((eid, question.get("name")))
            sheets["2-Stellingen"].append(
                [
                    eid,
                    nummer,
                    question.get("name"),
                    None,  # bron_stelling
                    None,  # originele_schaal
                    question.get("scale"),
                    None,  # richting — free text in the published format
                    richting,
                    None,  # letterlijk_overgenomen
                    None,
                    question.get("id"),
                ]
            )

        scores = effect.get("scores") or []
        if not scores:
            gaps["effecten_zonder_monetarisering"].append((eid, effect.get("name")))
        for score in scores:
            niveau = score.get("score")
            sheets["3-Situatieschetsen"].append(
                [eid, niveau, None, score.get("situation"), None, None]
            )
            # The `effects` shape has one amount per score with no stakeholder
            # split, so it maps to the niveau total. Proxy rows stay empty:
            # inventing a stakeholder to fill sheet 5 would fabricate exactly
            # the attribution this standard exists to make traceable.
            sheets["4-Monetarisering-per-niveau"].append(
                [
                    eid,
                    niveau,
                    None,
                    None,
                    score.get("monetaryValue"),
                    None,
                    score.get("onderbouwing"),
                    None,
                ]
            )

    wb.save(out_path)
    return gaps


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sector", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--json", help="saved /database response; fetches live when omitted")
    parser.add_argument("--force", action="store_true", help="overwrite an existing workbook")
    args = parser.parse_args()

    # This script seeds a workbook once; after that the workbook is the source
    # and holds authoring that exists nowhere else — the polarity of 60
    # arbeidsparticipatie stellingen, for one, which `effects` never recorded.
    # A silent re-run would throw that away and refill the cells with blanks.
    if os.path.exists(args.out) and not args.force:
        raise SystemExit(
            f"{args.out} already exists. Re-exporting discards everything authored in it "
            "since the seed. Pass --force only if that is what you mean."
        )

    catalogus = load_catalogus(args.json)
    effects = effects_for(catalogus, args.sector)
    if not effects:
        raise SystemExit(f"no effects tagged with sector {args.sector!r}")

    gaps = write_workbook(args.sector, effects, args.out)

    stellingen = sum(len(effect.get("questions", [])) for _, effect in effects)
    print(f"{args.sector}: {len(effects)} effecten, {stellingen} stellingen -> {args.out}")
    print()
    print("Nog in te vullen in het workbook:")
    print(
        f"  negatief_geformuleerd leeg: {len(gaps['stellingen_zonder_richting'])} van {stellingen} stellingen"
    )
    for eid, stelling in gaps["stellingen_zonder_richting"][:5]:
        print(f"    {eid}  {stelling[:70]}")
    if len(gaps["stellingen_zonder_richting"]) > 5:
        print(f"    ... en {len(gaps['stellingen_zonder_richting']) - 5} meer")
    print(
        f"  zonder monetarisering: {len(gaps['effecten_zonder_monetarisering'])} van {len(effects)} effecten"
    )
    print("  leeg voor alle effecten: situatieschetsen-labels, proxies, bronnen,")
    print("    parameters, aggregatie/overlapgroepen, gevoeligheid, audit")


if __name__ == "__main__":
    main()
