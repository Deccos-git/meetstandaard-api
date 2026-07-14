import { handleVersionedResource } from "./versionedResource.js";

// Canonical parameters for the arbeidsparticipatie / participatieladder monetisation.
// Values copied verbatim from "Arbeidsparticipatie - Meetstandaard Social Impact - versie 1.0".
// This constant is the source used to seed Firestore (MeetstandaardParameters/{version}).
// The HTTP function itself reads from Firestore so new years can be added without redeploy.
export const PARAMETERS_2026_1 = {
  meta: {
    version: "2026.1",
    taxYear: 2026,
    source: "Meetstandaard Social Impact v1.0",
    updatedAt: "2026-06-08",
  },
  weeksPerYear: 52,
  volunteerValuePerHour: 10,

  taxBrackets: [
    { upTo: 38883, rate: 0.3575 },
    { upTo: 78426, rate: 0.3756 },
    { upTo: null, rate: 0.495 },
  ],

  incomeByEducationAndHoursBand: {
    "Geen startkwalificatie": {
      "minder dan 12 uur per week": 7800,
      "12 tot 20 uur per week": 15000,
      "20 tot 35 uur per week": 29000,
      Voltijd: 50400,
    },
    "MBO 2-4/havovwo": {
      "minder dan 12 uur per week": 15000,
      "12 tot 20 uur per week": 19300,
      "20 tot 35 uur per week": 35600,
      Voltijd: 56300,
    },
    "HBO/WO": {
      "minder dan 12 uur per week": 29700,
      "12 tot 20 uur per week": 30200,
      "20 tot 35 uur per week": 50900,
      Voltijd: 79600,
    },
  },

  benefitAmountPerYear: {
    Bijstandsuitkering: -18768,
    "WAO/WIA/WAZ/WAJONG": -21123,
  },
  bijstandUitvoeringskostenPerYear: -2900,

  // Treden van de participatieladder met hun maatschappelijke waardering per jaar
  // (kosten negatief, baten positief). `breakdown` is alleen bekend waar de
  // bronnotitie die uitsplitst. `sources` verwijst naar id's in `bronnen`.
  ladderLevels: [
    {
      trede: 1,
      label: "Geïsoleerd",
      description:
        "Geen contact buitenshuis, behalve functionele bezoeken (bijv. supermarkt of huisarts). Contact beperkt tot huisgenoten.",
      valuePerYear: -21150,
      breakdown: { uitkeringen: -5600, inkomstenbelasting: -11050, zorgVeiligheid: -4500 },
      rationale:
        "Hoogste maatschappelijke last. De kosten bestaan uit een gewogen gemiddelde van uitkeringen (€5.600), gederfde inkomstenbelasting (€11.050) en hoge zorg- en veiligheidskosten door inactiviteit (€4.500).",
      sources: [
        "cbs-ww-uitkering",
        "akc-participatieladder",
        "soci-com-participatieladder",
        "factcheck-vlaanderen",
        "scp-cpb-brede-baten-werk",
      ],
    },
    {
      trede: 2,
      label: "Sociale contacten buitenshuis",
      description:
        "Minimaal eens per week informeel contact met buren of kennissen. Geen georganiseerde activiteiten.",
      valuePerYear: -19500,
      breakdown: { uitkeringen: -5600, inkomstenbelasting: -11050, zorgVeiligheid: -2850 },
      rationale:
        "Lichte daling in zorgbehoefte. Het doorbreken van sociaal isolement verlaagt het risico op zware mentale problematiek, maar er is nog geen productieve bijdrage of belastingafdracht.",
      sources: [
        "akc-participatieladder",
        "soci-com-participatieladder",
        "brede-baten-pdf",
        "scp-cpb-brede-baten-werk",
      ],
    },
    {
      trede: 3,
      label: "Deelname / onbetaald werk",
      description:
        "Meedoen aan georganiseerde clubs/cursussen of het verrichten van vrijwilligerswerk met verantwoordelijkheid.",
      valuePerYear: -15000,
      breakdown: null,
      rationale:
        "Productieve bijdrage zonder loon. De 'brede baten' stijgen door minder beroep op ggz en Wmo (besparing ~€2.000). Vrijwilligerswerk levert maatschappelijke waarde, maar de uitkeringslast blijft deels bestaan.",
      sources: ["akc-participatieladder", "soci-com-participatieladder", "scp-cpb-brede-baten-werk"],
    },
    {
      trede: 4,
      label: "Betaald werk met ondersteuning",
      description: "Werken met loonkostensubsidie, jobcoach of in een beschutte omgeving.",
      valuePerYear: -5000,
      breakdown: null,
      rationale:
        "Netto bijdrage begint. De uitkeringslast daalt scherp (terugverdieneffect). Men gaat voor het eerst belasting en premies afdragen, hoewel er nog kosten zijn voor begeleiding en subsidies.",
      sources: ["akc-participatieladder", "soci-com-participatieladder"],
    },
    {
      trede: 5,
      label: "Regulier betaald werk",
      description:
        "Werken zonder aanvullende uitkering of overheidssteun (inclusief zzp/ondernemerschap).",
      valuePerYear: 11050,
      breakdown: null,
      rationale:
        "Maximale maatschappelijke baat. De overheid bespaart de volledige uitkering en ontvangt circa €11.000 aan belastingen/premies. Zorgkosten zijn minimaal en de economische productiviteit is maximaal.",
      sources: ["akc-participatieladder", "soci-com-participatieladder", "factcheck-vlaanderen"],
    },
  ],

  options: {
    mainActivity: ["Opleiding", "Werk", "Vrijwilligerswerk", "Dagbesteding", "Werkzoekend", "Niet actief"],
    hoursBand: ["minder dan 12 uur per week", "12 tot 20 uur per week", "20 tot 35 uur per week", "Voltijd"],
    employabilityFactor: [1, 0.7, 0.5, 0.3, 0.1],
    educationLevel: ["Geen startkwalificatie", "MBO 2-4/havovwo", "HBO/WO"],
    volunteerHoursPerWeek: [0, 4, 12, 20, 32],
    benefitType: ["Geen", "Bijstandsuitkering", "WAO/WIA/WAZ/WAJONG"],
  },

  // Bronnen (structured) keyed by id, so data fields and ladder-treden can refer
  // to them by id. `url` is null when no public link exists.
  bronnen: {
    "cbs-inkomen": {
      id: "cbs-inkomen",
      title: "Gemiddeld persoonlijk inkomen, bruto € per jaar",
      publisher: "CBS",
      year: 2024,
      dataset: "85277NED",
      url: "https://opendata.cbs.nl/#/CBS/nl/dataset/85277NED/table",
    },
    "bijstand-prijslijst": {
      id: "bijstand-prijslijst",
      title:
        "Maatschappelijke prijslijst — bijstandsuitkering 21 jaar tot AOW-leeftijd (alleenstaand €1.564 per maand, per 1 januari 2026)",
      publisher: "Maatschappelijke prijslijst",
      year: 2026,
      url: null,
    },
    "gemeente-nu-uitvoeringskosten": {
      id: "gemeente-nu-uitvoeringskosten",
      title: "Uitvoering bijstand kost bijna €2.900 per uitkering",
      publisher: "gemeente.nu",
      url: "https://www.gemeente.nu/sociaal/uitvoering-bijstand-kost-bijna-2900-euro-per-uitkering/",
    },
    "vzinfo-arbeidsongeschiktheid": {
      id: "vzinfo-arbeidsongeschiktheid",
      title: "Kosten van arbeidsongeschiktheid",
      publisher: "VZinfo (RIVM)",
      url: "https://www.vzinfo.nl/arbeidsongeschiktheid/kosten",
    },
    "cbs-ww-uitkering": {
      id: "cbs-ww-uitkering",
      title: "Van alle werklozen had 1 op de 5 in 2020 een WW-uitkering",
      publisher: "CBS",
      year: 2021,
      url: "https://www.cbs.nl/nl-nl/nieuws/2021/50/van-alle-werklozen-had-1-op-de-5-in-2020-een-ww-uitkering",
    },
    "akc-participatieladder": {
      id: "akc-participatieladder",
      title: "Participatieladder — kennisdocument",
      publisher: "Arbeidsdeskundig Kenniscentrum (AKC)",
      url: "https://www.arbeidsdeskundigen.nl/akc/kennis/map/document/4402",
    },
    "soci-com-participatieladder": {
      id: "soci-com-participatieladder",
      title: "Is de participatieladder nog van deze tijd?",
      publisher: "Soci-Com",
      url: "https://soci-com.nl/blog/is-participatieladder-en-doet-soci-com-daarmee/",
    },
    "factcheck-vlaanderen": {
      id: "factcheck-vlaanderen",
      title: "Werkloze kan overheid jaarlijks €32.000 kosten",
      publisher: "Factcheck Vlaanderen",
      url: "https://factcheck.vlaanderen/factcheck/werkloze-kan-overheid-jaarlijks-32000-euro-kosten",
    },
    "scp-cpb-brede-baten-werk": {
      id: "scp-cpb-brede-baten-werk",
      title: "De brede baten van werk",
      publisher: "SCP / CPB",
      year: 2020,
      url: "https://www.scp.nl/site/binaries/site-content/collections/documents/2020/03/20/de-brede-waarde-van-werk/CPB-SCP-Boek-mrt2020-De-brede-baten-van-werk.pdf",
    },
    "brede-baten-pdf": {
      id: "brede-baten-pdf",
      title: "Onderbouwend document (interne projectmap)",
      publisher: "Meetstandaard Social Impact",
      url: null,
      note: "PDF beschikbaar in de interne projectmap; geen publieke URL.",
    },
  },

  // Koppelt de geserveerde dataveldwaarden aan de bron(nen) die ze onderbouwen.
  // Ladder-treden dragen hun eigen `sources`; zie ladderLevels.
  sourceRefs: {
    incomeByEducationAndHoursBand: ["cbs-inkomen"],
    benefitAmountPerYear: {
      Bijstandsuitkering: ["bijstand-prijslijst"],
      "WAO/WIA/WAZ/WAJONG": ["vzinfo-arbeidsongeschiktheid"],
    },
    bijstandUitvoeringskostenPerYear: ["gemeente-nu-uitvoeringskosten"],
  },
};

const COLLECTION = "MeetstandaardParameters";

// The contract path is /api/v1/arbeidsparticipatie/...:
//   GET .../versions              -> { versions: [...] }
//   GET .../parameters            -> latest version body
//   GET .../parameters/{version}  -> pinned version body (404 if unknown)
export const handleArbeidsparticipatie = (firestore, request, response) =>
  handleVersionedResource({
    firestore,
    collection: COLLECTION,
    resourceSegment: "parameters",
    request,
    response,
  });
