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

// 2026.2: iemand die deels werkt en aanvullende bijstand houdt, was in 2026.1 niet
// te registreren — de uitkeringsvraag gold alleen bij "geen werk", en een
// uitkering telde altijd volledig. Alle bedragen zijn ongewijzigd ten opzichte van
// 2026.1; alleen de uitvraag en de rekenregel voor uitkeringskosten veranderen.
export const PARAMETERS_2026_2 = {
  ...PARAMETERS_2026_1,
  meta: {
    ...PARAMETERS_2026_1.meta,
    version: "2026.2",
    updatedAt: "2026-10-13",
  },

  options: {
    ...PARAMETERS_2026_1.options,
    // Antwoordklassen zoals employabilityFactor, geen kengetal: welk deel van de
    // volledige bijstandsnorm iemand nog ontvangt.
    benefitShare: [1, 0.75, 0.5, 0.25],
  },

  benefitRules: {
    // De uitkeringsvraag wordt bij elke hoofdactiviteit gesteld, ook bij werk.
    askedForMainActivity: [...PARAMETERS_2026_1.options.mainActivity],
    // Alleen bijstand: het WAO/WIA/WAZ/WAJONG-bedrag is een UWV-gemiddelde dat
    // gedeeltelijke uitkeringen al bevat, dus een factor zou dubbel korten.
    shareAppliesTo: ["Bijstandsuitkering"],
    // Een gedeeltelijke uitkering vraagt dezelfde uitvoering (inkomstenverrekening),
    // dus de uitvoeringskosten schalen niet mee. Aanname, needs verification.
    uitvoeringskostenScaleWithShare: false,
    calculation:
      "uitkeringskosten = benefitAmountPerYear[benefitType] × (benefitType in shareAppliesTo ? benefitShare : 1), plus bijstandUitvoeringskostenPerYear (onverkort) bij een Bijstandsuitkering",
  },
};

// 2026.3: het rekenmodel van de MSI-kennisbank is leidend (besluit 2026-10-20),
// `sectoren/arbeidsparticipatie/output/build/bouw_outputmeting.py`. Geldt voor
// arbeidsparticipatie EFF-18 en energiearmoede EFF-11. Wijzigingen ten opzichte
// van 2026.2, genummerd zoals het tabblad 'Wijzigingen' van het rekenmodel:
//   1  belasting over het loon ná de inzetbaarheidsfactor
//   2  heffingskortingen 2026 (algemene heffingskorting, arbeidskorting)
//   3  uitkomst per stakeholder plus een reële waarde, geen opgeteld totaal
//   3b naast werk alleen een aanvulling tot het uitkeringsniveau; vervangt benefitShare
//   4  vrijwilligerswaarde €11 per uur
//   5  uitvoeringskosten bijstand €3.500
//   6  leeftijdsovergang, herkend aan de geboortedatum (tab Gegevens)
//   7  bruto loon = mediaan uurloon van het beroepsniveau bij de opleiding × uren × 52
//   8  WIA en Wajong apart, bedragen uit het parameterregister
//   9  verschil per stakeholder en per post, met typeWaardering; overdrachten bij
//      betaler en ontvanger
//   10 opgegeven vrije tijd van de deelnemer (niet-financieel)
//   11 verwachte loonwinst van wie een opleiding volgt (indirect financieel)
// plus de regelingen en kosten die het rekenmodel kent: WW, IOAW, AOW,
// loonkostensubsidie en dagbesteding. Beschut werk staat in het parameterblad
// van het rekenmodel maar het model rekent er niet mee, dus het staat hier niet.
// Besluiten 2026-11-02 (vragen Deccos): dagdelen 1 t/m 10, typeWaardering bij
// elke post, vrijwilligerswerk bij de Maatschappij.
// Lopende metingen blijven op 2026.2.
const BRONNEN_2026_3 = {
  ...PARAMETERS_2026_1.bronnen,
  "belastingdienst-heffingskortingen-2026": {
    id: "belastingdienst-heffingskortingen-2026",
    title: "Tabel arbeidskorting 2026; Voorlopige aanslag 2026: tarieven en heffingskortingen",
    publisher: "Belastingdienst",
    year: 2026,
    url: null,
    note: "Zoals opgenomen in het rekenmodel van de MSI-kennisbank (bouw_outputmeting.py).",
  },
  "msi-parameterregister": {
    id: "msi-parameterregister",
    title: "Gedeeld parameterregister, Meetstandaard Social Impact (gedeeld/wiki/parameters.md)",
    publisher: "Meetstandaard Social Impact",
    year: 2026,
    url: null,
    note: "Uitvoeringskosten bijstand: Berenschot (2018) €2.883, geïndexeerd naar 2025. Vrijwilligerswaarde: 50% van het vervangingstarief van €21,62. WIA/WAO: UWV, prijspeil 2025. Wajong: UWV, gemiddelde jaaruitkering 2024.",
  },
  "uwv-jaarverslag-2025": {
    id: "uwv-jaarverslag-2025",
    title: "Jaarverslag 2025 (WW-uitkering)",
    publisher: "UWV",
    year: 2025,
    url: null,
  },
  "macrobudget-2025": {
    id: "macrobudget-2025",
    title: "Definitief macrobudget participatiewet 2025 (IOAW; loonkostensubsidie €13.144 per lopende subsidie)",
    publisher: "Rijksoverheid",
    year: 2025,
    url: null,
  },
  "svb-jaarverslag-2025": {
    id: "svb-jaarverslag-2025",
    title: "Jaarverslag 2025 (AOW-uitkering)",
    publisher: "SVB",
    year: 2025,
    url: null,
  },
  "cbs-uurloon-beroepsniveau": {
    id: "cbs-uurloon-beroepsniveau",
    title: "Werknemers; uurloon en beroep, mediaan bruto uurloon 2025 (voorlopig)",
    publisher: "CBS",
    year: 2025,
    dataset: "86355NED",
    url: "https://opendata.cbs.nl/#/CBS/nl/dataset/86355NED/table",
  },
  "werkwijzer-mkba-sociaal-domein": {
    id: "werkwijzer-mkba-sociaal-domein",
    title: "Werkwijzer voor kosten-batenanalyse in het sociale domein, p. 78-80, tabel 6.1 (waardering vrije tijd)",
    publisher: "SEO Economisch Onderzoek",
    year: 2016,
    url: null,
  },
  "duo-slaagkans-mbo": {
    id: "duo-slaagkans-mbo",
    title: "Jaarresultaat mbo 2024/2025, alle niveaus (voorlopig)",
    publisher: "DUO, via OCW in cijfers",
    year: 2025,
    url: null,
  },
  "vh-slaagkans-hbo": {
    id: "vh-slaagkans-hbo",
    title: "Diplomarendement hbo-bachelor voltijd na 8 jaar, cohort 2015",
    publisher: "Vereniging Hogescholen",
    year: null,
    url: null,
    note: "Publicatiejaar niet in het rekenmodel vastgelegd.",
  },
  "maatschappelijke-prijslijst-dagbesteding": {
    id: "maatschappelijke-prijslijst-dagbesteding",
    title: "Maatschappelijke prijslijst — dagbesteding per dagdeel (Wmo, Jeugdwet, Wlz)",
    publisher: "Bureau Anderzoek",
    year: 2025,
    url: null,
  },
};

export const PARAMETERS_2026_3 = {
  meta: {
    version: "2026.3",
    taxYear: 2026,
    source: "Rekenmodel participatieladder, MSI-kennisbank (bouw_outputmeting.py)",
    updatedAt: "2026-11-02",
  },
  weeksPerYear: 52,
  volunteerValuePerHour: 11,
  // Wijziging 9 en besluit 2026-11-02: de waarde van vrijwilligerswerk is van de
  // Maatschappij, niet van de Gemeente.
  volunteerValueStakeholder: "Maatschappij",

  taxBrackets: PARAMETERS_2026_1.taxBrackets,
  // Wijziging 2. belasting = schijftarief(loon + uitkering)
  //   − algemene heffingskorting(loon + uitkering) − arbeidskorting(loon), minimaal 0.
  taxCredits: {
    algemeneHeffingskorting: { max: 3115, afbouwVanaf: 29736, afbouwPercentage: 0.06398 },
    // Stuksgewijs: korting = base + rate × (loon − from) voor loon tot en met upTo,
    // nooit onder 0. Boven de laatste grens is de korting 0.
    arbeidskorting: [
      { from: 0, upTo: 11965, base: 0, rate: 0.08324 },
      { from: 11965, upTo: 25845, base: 996, rate: 0.31009 },
      { from: 25845, upTo: 45592, base: 5300, rate: 0.0195 },
      { from: 45592, upTo: 132920, base: 5685, rate: -0.0651 },
      { from: 132920, upTo: null, base: 0, rate: 0 },
    ],
  },

  // Wijziging 7. Bruto loon = hourlyWageByEducation × hoursPerWeekByBand × 52,
  // afgerond op hele euro's; gelijk aan incomeByEducationAndHoursBand. Was:
  // CBS-gemiddeld persoonlijk inkomen (85277NED) over alle werkenden.
  hourlyWageByEducation: {
    "Geen startkwalificatie": 16.9, // beroepsniveau 1
    "MBO 2-4/havovwo": 21.6, // beroepsniveau 2
    "HBO/WO": 28.4, // beroepsniveau 3; niveau 4 (€36,90) voorzichtigheidshalve niet
  },
  // Midden van de urenklasse; voltijd 38 uur is een aanname van het rekenmodel.
  hoursPerWeekByBand: {
    "minder dan 12 uur per week": 8,
    "12 tot 20 uur per week": 16,
    "20 tot 35 uur per week": 27.5,
    Voltijd: 38,
  },
  incomeByEducationAndHoursBand: {
    "Geen startkwalificatie": {
      "minder dan 12 uur per week": 7030,
      "12 tot 20 uur per week": 14061,
      "20 tot 35 uur per week": 24167,
      Voltijd: 33394,
    },
    "MBO 2-4/havovwo": {
      "minder dan 12 uur per week": 8986,
      "12 tot 20 uur per week": 17971,
      "20 tot 35 uur per week": 30888,
      Voltijd: 42682,
    },
    "HBO/WO": {
      "minder dan 12 uur per week": 11814,
      "12 tot 20 uur per week": 23629,
      "20 tot 35 uur per week": 40612,
      Voltijd: 56118,
    },
  },

  // Wijziging 11. Wie een opleiding volgt, krijgt de verwachte loonwinst:
  // slaagkans × (loon op het doelniveau − loon op het huidige niveau), beide bij
  // `hoursBand`. Alleen als het doelniveau hoger is dan de hoogst afgeronde
  // opleiding; entree levert geen loonwinst.
  wageGainFromEducation: {
    targetLevel: { Entree: "Geen startkwalificatie", "MBO 2-4/havovwo": "MBO 2-4/havovwo", "HBO/WO": "HBO/WO" },
    successRate: { "MBO 2-4/havovwo": 0.7175, "HBO/WO": 0.704 },
    hoursBand: "20 tot 35 uur per week",
  },

  // Wijziging 10. Werkwijzer MKBA sociaal domein: de netto compensatie voor
  // opgegeven vrije tijd én weggevallen uitkering is voor 70% (toetreder) of 90%
  // (extra uren) vrije tijd waard.
  freeTime: { factorEntrant: 0.7, factorExtraHours: 0.9 },

  // Wijziging 8: WIA en Wajong apart. Kosten negatief, zoals in 2026.1.
  benefitAmountPerYear: {
    Bijstandsuitkering: -18768,
    WW: -25578,
    "WAO/WIA/WAZ": -21123,
    Wajong: -17851,
    IOAW: -21500,
    AOW: -15112,
  },
  // Wie de uitkering betaalt. De belasting gaat altijd naar het Rijk.
  benefitPayer: {
    Bijstandsuitkering: "Gemeente",
    WW: "UWV",
    "WAO/WIA/WAZ": "UWV",
    Wajong: "UWV",
    IOAW: "Gemeente",
    AOW: "SVB",
  },
  bijstandUitvoeringskostenPerYear: -3500,
  // Gemeente betaalt, werkgever ontvangt: een overdracht, telt niet in de reële waarde.
  loonkostensubsidiePerYear: -13144,
  dagbestedingPerDagdeel: {
    Wmo: { amount: -49, payer: "Gemeente" },
    Jeugdwet: { amount: -78, payer: "Gemeente" },
    Wlz: { amount: -80, payer: "Rijk" },
  },

  // Wijziging 9 en besluit 2026-11-02: de posten waarin het verschil tussen 0- en
  // 1-meting wordt gerapporteerd. Een overdracht staat bij betaler en ontvanger,
  // telt per stakeholder mee onder zijn type en valt alleen in het totaal weg. De
  // som van alle posten is de maatschappelijke waarde.
  posts: [
    { stakeholder: "Deelnemer", post: "Bruto loon", typeWaardering: "direct financieel", overdracht: false },
    { stakeholder: "Deelnemer", post: "Verwachte loonwinst na opleiding", typeWaardering: "indirect financieel", overdracht: false },
    { stakeholder: "Deelnemer", post: "Belasting en premies", typeWaardering: "direct financieel", overdracht: true },
    { stakeholder: "Deelnemer", post: "Uitkering", typeWaardering: "direct financieel", overdracht: true },
    { stakeholder: "Deelnemer", post: "Opgegeven vrije tijd", typeWaardering: "niet-financieel", overdracht: false },
    { stakeholder: "Rijk", post: "Belasting en premies", typeWaardering: "direct financieel", overdracht: true },
    { stakeholder: "benefitPayer", post: "Uitkering", typeWaardering: "direct financieel", overdracht: true },
    { stakeholder: "Gemeente", post: "Uitvoeringskosten bijstand", typeWaardering: "direct financieel", overdracht: false },
    { stakeholder: "Gemeente", post: "Loonkostensubsidie", typeWaardering: "direct financieel", overdracht: true },
    { stakeholder: "Werkgever", post: "Loonkostensubsidie", typeWaardering: "direct financieel", overdracht: true },
    { stakeholder: "dagbestedingPayer", post: "Dagbesteding", typeWaardering: "direct financieel", overdracht: false },
    { stakeholder: "Maatschappij", post: "Vrijwilligerswerk", typeWaardering: "niet-financieel", overdracht: false },
  ],

  calculation: {
    stakeholders: ["Deelnemer", "Rijk", "Gemeente", "UWV", "SVB", "Werkgever", "Maatschappij"],
    steps: [
      "loon = incomeByEducationAndHoursBand[educationLevel][hoursBand] × employabilityFactor (0 zonder werk); educationLevel is de hoogst afgeronde opleiding",
      "uitkering = |benefitAmountPerYear[benefitType]|; met werk: max(0, uitkering − loon) (wijziging 3b)",
      "belasting = max(0, schijftarief(loon + uitkering) − algemeneHeffingskorting(loon + uitkering) − arbeidskorting(loon)); arbeidskorting alleen bij loon > 0 (wijziging 1 en 2)",
      "Deelnemer = loon + uitkering − belasting; Rijk = belasting; benefitPayer[benefitType] = −uitkering",
      "bij bijstand (uitkering > 0): Gemeente += bijstandUitvoeringskostenPerYear",
      "bij loonkostensubsidie: Gemeente += loonkostensubsidiePerYear, Werkgever −= loonkostensubsidiePerYear",
      "bij dagbesteding: payer += amount × dagdelenPerWeek × weeksPerYear",
      "vrijwilligerswaarde = volunteerHoursPerWeek × volunteerValuePerHour × weeksPerYear (Maatschappij, niet-financieel)",
      "loonwinst = bij een opleiding met doelniveau hoger dan educationLevel: successRate[doel] × (income[doel][hoursBand] − income[educationLevel][hoursBand]); anders 0",
      "per post: verschil = waarde 1-meting − waarde 0-meting, met de stakeholders uit `posts`",
      "opgegeven vrije tijd (alleen bij een verschil in bruto loon): Δuitkering = uitkering₀ − uitkering₁; Δnetto = (Deelnemer₁ − Deelnemer₀) + Δuitkering; f = factorEntrant als loon₀ = 0 en het loon stijgt, anders factorExtraHours; bij meer loon: −max(0, f × Δnetto − Δuitkering), bij minder loon: max(0, f × −Δnetto + Δuitkering)",
      "maatschappelijke waarde = som van alle posten (de overdrachten vallen daarin tegen elkaar weg)",
    ],
    // Wijziging 3 en 9: rapporteer per stakeholder en per post; tel overdrachten
    // niet bij een maatschappelijk totaal op.
    result: "per stakeholder en per post het verschil 1-meting − 0-meting; de som van alle posten is de maatschappelijke waarde",
    // Besluit 2026-10-22: op het verschil gelden dezelfde rekenregels als bij de
    // effecten (impactclaim, tijdshorizon, drop-off, disconto). Die horen bij de
    // meetlaag, niet bij deze parameters; de bedragen hier zijn bruto jaarbedragen.
    rekenregels: "impactclaim 40%, tijdshorizon uit de matrix van duur en intensiteit, 25% drop-off, 2,8% disconto, op elke post (MSI gedeeld/wiki/methodiek/rekenregels-monetarisering.md)",
    // Wijziging 6.
    ageTransition: {
      rule: "Passeert een deelnemer tussen 0- en 1-meting de leeftijdsgrens van een regeling, dan krijgen beide metingen de uitkeringsgrondslag van de 1-meting; alleen het verschil dat niet uit de leeftijdsovergang volgt telt mee.",
      // Besluit 2026-10-20: de geboortedatum is verplicht in de tab Gegevens.
      detection: "geboortedatum van de deelnemer (tab Gegevens), vergeleken met de datum van de 0- en de 1-meting",
      // Besluit 2026-10-20: 18 jaar voor alle regelingen, 67 voor de AOW
      // (AOW-leeftijd in belastingjaar 2026). Wie tussen de metingen de grens
      // passeert, krijgt bij beide metingen de grondslag van de 1-meting.
      ageLimits: { default: 18, AOW: 67 },
    },
    assumptions: [
      "bruto bedragen, zonder vrijlatingsregeling",
      "de uitkering wordt als belast inkomen behandeld",
      "belasting voor één persoon zonder andere inkomsten of aftrekposten",
    ],
  },

  // Treden met naam en omschrijving. De vaste waardering per trede (2026.1 en
  // 2026.2) vervalt: de waarde volgt uit `calculation` (besluit 2026-10-20).
  ladderLevels: PARAMETERS_2026_1.ladderLevels.map(({ trede, label, description }) => ({ trede, label, description })),

  options: {
    ...PARAMETERS_2026_1.options,
    benefitType: ["Geen", "Bijstandsuitkering", "WW", "WAO/WIA/WAZ", "Wajong", "IOAW", "AOW"],
    loonkostensubsidie: [false, true],
    dagbesteding: ["Geen", "Wmo", "Jeugdwet", "Wlz"],
    // Besluit 2026-11-02: hele dagdelen, maximaal vijf dagen van twee dagdelen.
    // Alleen gevraagd als dagbesteding niet "Geen" is; dan telt het als 0.
    dagdelenPerWeek: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    // Wijziging 11: naar welk niveau leidt de opleiding die de deelnemer volgt.
    educationTarget: ["Entree", "MBO 2-4/havovwo", "HBO/WO"],
  },

  benefitRules: {
    // De uitkeringsvraag wordt bij elke hoofdactiviteit gesteld, ook bij werk.
    askedForMainActivity: [...PARAMETERS_2026_1.options.mainActivity],
    // Antwoorden van voor 2026.3 op een optie die niet meer bestaat. Besluit
    // 2026-10-20: de samengevoegde optie wordt WAO/WIA/WAZ, ook voor wie Wajong had.
    legacyBenefitType: { "WAO/WIA/WAZ/WAJONG": "WAO/WIA/WAZ" },
  },

  bronnen: BRONNEN_2026_3,

  sourceRefs: {
    incomeByEducationAndHoursBand: ["cbs-uurloon-beroepsniveau"],
    hourlyWageByEducation: ["cbs-uurloon-beroepsniveau"],
    wageGainFromEducation: { "MBO 2-4/havovwo": ["duo-slaagkans-mbo"], "HBO/WO": ["vh-slaagkans-hbo"] },
    freeTime: ["werkwijzer-mkba-sociaal-domein"],
    taxBrackets: ["belastingdienst-heffingskortingen-2026"],
    taxCredits: ["belastingdienst-heffingskortingen-2026"],
    volunteerValuePerHour: ["msi-parameterregister"],
    benefitAmountPerYear: {
      Bijstandsuitkering: ["bijstand-prijslijst"],
      WW: ["uwv-jaarverslag-2025"],
      "WAO/WIA/WAZ": ["msi-parameterregister"],
      Wajong: ["msi-parameterregister"],
      IOAW: ["macrobudget-2025"],
      AOW: ["svb-jaarverslag-2025"],
    },
    bijstandUitvoeringskostenPerYear: ["msi-parameterregister"],
    loonkostensubsidiePerYear: ["macrobudget-2025"],
    dagbestedingPerDagdeel: ["maatschappelijke-prijslijst-dagbesteding"],
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
