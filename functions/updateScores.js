/**
 * One-off migration: write the monetarisering score data from the
 * "Meetstandaard 1.0" sheet to each effect in Firestore.
 *
 * Each effect gets a `scores` array of 5 entries (score 1-5):
 *   { score, situation, monetaryValue, onderbouwing }
 * matching the columns "Score afgerond", "Situatieomschrijving per score",
 * "Monetaire waarde" and "Onderbouwing monetarisering".
 *
 * Source: Meetstandaard Social Impact - versie 1.0 (XLSX), sheet "Meetstandaard 1.0".
 *
 * Run: node updateScores.js
 */

import admin from "firebase-admin";
import serviceAccount from "./serviceAcountSecretKey.json" assert { type: "json" };

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const firestore = admin.firestore();

const normalize = (s) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// Map of effect name -> array of 5 score entries. Keys are matched
// case- and accent-insensitively against the effect's `name`.
const SCORES = {
  "Mentale gezondheid": [
    {
      "score": 1,
      "situation": "De persoon ervaart ernstige psychische klachten (bijv. depressie of angststoornis) die het dagelijks functioneren volledig belemmeren. Er is sprake van langdurig verzuim, een hoog risico op arbeidsongeschiktheid (WIA/IVA) of werkloosheid. De persoon maakt intensief gebruik van specialistische zorg (tweedelijns GGZ), gebruikt medicatie en ervaart sterke eenzaamheid.",
      "monetaryValue": -15000,
      "onderbouwing": "Mentale gezondheid onderbouwing"
    },
    {
      "score": 2,
      "situation": "De persoon ervaart duidelijke klachten (bijv. somberheid, stress, angst) die het functioneren beperken, maar er is nog enige deelname aan de maatschappij of werk. Er is sprake van frequent kort verzuim of verminderde productiviteit op het werk (presenteïsme). Zorggebruik bestaat uit huisarts, POH-GGZ of Basis-GGZ en eventueel medicatie.",
      "monetaryValue": -6000,
      "onderbouwing": "Mentale gezondheid uitwerking Notebook LM"
    },
    {
      "score": 3,
      "situation": "De persoon functioneert, maar ervaart regelmatig stress of lichte angstklachten. Er is geen sprake van een gediagnosticeerde stoornis die specialistische zorg vereist, maar wel van een beroep op eerstelijnszorg (huisarts/POH-GGZ). Het verzuim ligt rond het landelijk gemiddelde. De veerkracht is beperkt; bij tegenslag dreigt terugval.",
      "monetaryValue": -3350,
      "onderbouwing": ""
    },
    {
      "score": 4,
      "situation": "De persoon voelt zich mentaal gezond, ervaart werkgeluk en is productief. Er is sprake van een goede balans en voldoende veerkracht om dagelijkse stress op te vangen. Zorggebruik voor mentale klachten is nihil. Verzuim is lager dan het gemiddelde.",
      "monetaryValue": 0,
      "onderbouwing": ""
    },
    {
      "score": 5,
      "situation": "De persoon floreert, heeft een hoge mate van veerkracht en draagt actief bij aan de maatschappij (bijv. via mantelzorg, vrijwilligerswerk of hoge arbeidsproductiviteit). Er is sprake van duurzame inzetbaarheid en een preventieve werking op fysieke gezondheid (succesvol ouder worden).",
      "monetaryValue": 2000,
      "onderbouwing": ""
    }
  ],
  "Fysieke gezondheid": [
    {
      "score": 1,
      "situation": "De persoon ervaart continu ernstige pijn of lichamelijk ongemak en is sterk beperkt in mobiliteit (\"ik kan niet makkelijk bewegen\"). Dagelijkse taken kunnen vrijwel niet worden uitgevoerd door een chronisch gebrek aan energie en het algemene fitheidsniveau is zeer laag. Er is vaak sprake van complexe multimorbiditeit of ernstige functionele achteruitgan",
      "monetaryValue": -17500,
      "onderbouwing": "Fysieke gezondheid uitwerking Notebook LM"
    },
    {
      "score": 2,
      "situation": "De persoon heeft vaak pijn of fysieke klachten die het functioneren belemmeren. Basisactiviteiten lukken nog, maar kosten veel energie. Er is sprake van fysieke inactiviteit en beperkte kracht of uithoudingsvermogen, wat leidt tot een lagere algemene gezondheidsbeleving.",
      "monetaryValue": -8500,
      "onderbouwing": "Link notebook"
    },
    {
      "score": 3,
      "situation": "De persoon functioneert naar behoren, maar ervaart soms lichamelijk ongemak of een gebrek aan energie na inspanning. Bewegen gaat over het algemeen goed, al wordt de norm voor structurele intensieve fysieke gezondheid niet altijd gehaald.",
      "monetaryValue": -3000,
      "onderbouwing": ""
    },
    {
      "score": 4,
      "situation": "De persoon voelt zich vitaal, heeft geen last van pijn en beschikt over meer dan voldoende energie om dagelijkse en professionele taken soepel uit te voeren. Men is fysiek actief en ondervindt geen functionele belemmeringen.",
      "monetaryValue": 0,
      "onderbouwing": ""
    },
    {
      "score": 5,
      "situation": "De persoon floreert fysiek, heeft een hoge mate van uithoudingsvermogen, flexibiliteit en spierkracht. Er is structureel een overschot aan energie, blessures herstellen snel en een gezonde levensstijl fungeert als beschermende factor (\"buffer\") tegen externe fysieke of werkgerelateerde stressoren.",
      "monetaryValue": 2000,
      "onderbouwing": ""
    }
  ],
  "Gezonde leefstijl": [
    {
      "score": 1,
      "situation": "De persoon heeft een sterk ongezonde leefstijl: ernstig overgewicht (obesitas), chronisch fysiek inactief, rookt en/of heeft problematisch alcoholgebruik. In het dagelijks leven ervaart de persoon forse fysieke belemmeringen en een structureel gebrek aan energie. Er is vaak sprake van multimorbiditeit (bijv. diabetes type 2, hart- en vaatziekten), wat leidt tot intensief zorggebruik, langdurig verzuim of volledige uitstroom uit het arbeidsproces naar een uitkering [1, 2].",
      "monetaryValue": -15000,
      "onderbouwing": "Gezonde leefstijl uitwerking Notebook LM"
    },
    {
      "score": 2,
      "situation": "De persoon vertoont meerdere ongezonde gedragingen: overgewicht, voldoet niet aan de beweegrichtlijn, rookt mogelijk of eet structureel ongezond. De persoon redt zich in de maatschappij, maar is sneller vermoeid, herstelt langzamer van ziektes en bezoekt vaker de eerste lijn voor lichte chronische klachten of gewrichtspijn.",
      "monetaryValue": -6000,
      "onderbouwing": "https://notebooklm.google.com/notebook/8f13c7fc-576c-4b85-90a6-da32819101a5"
    },
    {
      "score": 3,
      "situation": "De persoon is relatief gezond, maar beweegt net niet voldoende, heeft licht overgewicht of ervaart incidenteel stress door een verstoorde balans. De persoon is volledig zelfredzaam en functioneert naar behoren, maar de leefstijl fungeert niet als beschermende buffer, wat leidt tot kleine fysieke klachten na inspanning.",
      "monetaryValue": -2500,
      "onderbouwing": ""
    },
    {
      "score": 4,
      "situation": "De persoon heeft een leefstijl die overeenkomt met het landelijk gemiddelde. Dit houdt in dat men redelijk oplet qua voeding, af en toe sport, matig alcohol drinkt, en doorgaans een regulier aantal dagen per jaar ziek is. Er is sprake van een neutrale maatschappelijke impact: er worden geen bovenmatige zorg- of verzuimkosten gemaakt, maar er zijn ook geen extra baten.",
      "monetaryValue": 0,
      "onderbouwing": ""
    },
    {
      "score": 5,
      "situation": "De persoon hanteert een actieve, zeer gezonde leefstijl (dagelijks voldoende beweging, gezond gewicht, gezond dieet, geen roken). De persoon barst van de energie, floreert in werk en privé, herstelt extreem snel van tegenslagen en heeft een hoge veerkracht tegen stress. Zorggebruik voor fysieke klachten is nihil.",
      "monetaryValue": 2000,
      "onderbouwing": ""
    }
  ],
  "Participatieladder": [
    {
      "score": 1,
      "situation": "Geïsoleerd: Geen contact buitenshuis, behalve functionele bezoeken (bijv. supermarkt of huisarts). Contact beperkt tot huisgenoten (3, 4).",
      "monetaryValue": -21150,
      "onderbouwing": "Hoogste maatschappelijke last. De kosten bestaan uit een gewogen gemiddelde van uitkeringen (€5.600), gederfde inkomstenbelasting (€11.050) en hoge zorg- en veiligheidskosten door inactiviteit (€4.500). (2, 5, 6)"
    },
    {
      "score": 2,
      "situation": "Sociale contacten buitenshuis:Minimaal eens per week informeel contact met buren of kennissen. Geen georganiseerde activiteiten (7, 8)",
      "monetaryValue": -19500,
      "onderbouwing": "Lichte daling in zorgbehoefte. Het doorbreken van sociaal isolement verlaagt het risico op zware mentale problematiek, maar er is nog geen productieve bijdrage of belastingafdracht.(9, 10)"
    },
    {
      "score": 3,
      "situation": "Deelname & Onbetaald werk:Meedoen aan georganiseerde clubs/cursussen of het verrichten van vrijwilligerswerk met verantwoordelijkheid (7, 8, 11)",
      "monetaryValue": -15000,
      "onderbouwing": "Productieve bijdrage zonder loon. De 'brede baten' stijgen door minder beroep op ggz en Wmo (besparing ~€2.000). Vrijwilligerswerk levert maatschappelijke waarde, maar de uitkeringslast blijft deels bestaan (6, 12)"
    },
    {
      "score": 4,
      "situation": "Betaald werk met ondersteuning:Werken met loonkostensubsidie, jobcoach of in een beschutte omgeving (11, 13).",
      "monetaryValue": -5000,
      "onderbouwing": "Netto bijdrage begint. De uitkeringslast daalt scherp (terugverdieneffect). Men gaat voor het eerst belasting en premies afdragen, hoewel er nog kosten zijn voor begeleiding en subsidies (14, 15)."
    },
    {
      "score": 5,
      "situation": "Regulier betaald werk: Werken zonder aanvullende uitkering of overheidssteun (inclusief zzp/ondernemerschap) (16, 17)",
      "monetaryValue": 11050,
      "onderbouwing": "Maximale maatschappelijke baat. De overheid bespaart de volledige uitkering en ontvangt circa €11.000 aan belastingen/premies. Zorgkosten zijn minimaal en de economische productiviteit is maximaal (5, 18)."
    }
  ],
  "Financiële gezondheid": [
    {
      "score": 1,
      "situation": "De respondent scoort extreem laag op de vier stellingen. Er is geen overzicht van inkomsten en uitgaven, rekeningen kunnen structureel niet betaald worden, post wordt genegeerd (ongeopend gelaten) en de persoon is geïsoleerd en durft of weet geen hulp te vragen. Er is sprake van crisis.",
      "monetaryValue": -15000,
      "onderbouwing": "Financiele gezondheid onderbouwing"
    },
    {
      "score": 2,
      "situation": "De respondent scoort overwegend negatief. Er is onvoldoende overzicht en aan het eind van de maand is er vaak tekort. De persoon herkent belangrijke post wel, maar stelt actie uit door stress. De drempel om hulp in te schakelen is te hoog, men probeert het krampachtig zelf op te lossen.",
      "monetaryValue": -5500,
      "onderbouwing": "Financiele gezondheid Notebook LM"
    },
    {
      "score": 3,
      "situation": "De respondent scoort neutraal of wisselend. Inkomsten en uitgaven zijn globaal bekend en rekeningen worden meestal betaald, maar er is geen buffer. Post wordt gelezen en deels afgehandeld. Bij onbegrip weet men wel enigszins waar informatie te vinden is, maar men is reactief.",
      "monetaryValue": -800,
      "onderbouwing": ""
    },
    {
      "score": 4,
      "situation": "De respondent scoort positief. Men heeft goed inzicht in inkomsten en uitgaven, betaalt rekeningen moeiteloos, opent en snapt de post (of onderneemt direct actie) en zoekt proactief hulp bij complexe financiële vragen.",
      "monetaryValue": 0,
      "onderbouwing": ""
    },
    {
      "score": 5,
      "situation": "De respondent scoort maximaal op alle stellingen. Er is niet alleen grip op het heden, maar men plant ook voor de lange termijn (pensioen, buffers voor life events). Administratie is geautomatiseerd, en men maakt actief en met vertrouwen gebruik van (professioneel) onafhankelijk advies.",
      "monetaryValue": 1000,
      "onderbouwing": ""
    }
  ]
};

const lookup = new Map();
for (const [name, scores] of Object.entries(SCORES)) {
  lookup.set(normalize(name), scores);
}

const run = async () => {
  const snapshot = await firestore.collection("effects").get();

  let matched = 0;
  let skipped = 0;
  const unmatched = [];

  const batch = firestore.batch();

  snapshot.forEach((d) => {
    const data = d.data();
    const scores = lookup.get(normalize(data.name));

    if (!scores) {
      skipped += 1;
      return;
    }

    if (JSON.stringify(data.scores || null) === JSON.stringify(scores)) {
      skipped += 1;
      return;
    }

    batch.update(d.ref, { scores });
    matched += 1;
  });

  if (matched > 0) {
    await batch.commit();
  }

  // Report which expected effects were not found in Firestore.
  const foundNames = new Set();
  snapshot.forEach((d) => foundNames.add(normalize(d.data().name)));
  for (const name of Object.keys(SCORES)) {
    if (!foundNames.has(normalize(name))) unmatched.push(name);
  }

  console.log(`Updated ${matched} effect(s) with scores. Skipped ${skipped}.`);
  if (unmatched.length > 0) {
    console.log("No matching effect found in Firestore for:");
    for (const name of unmatched) console.log(`  - ${name}`);
  }
};

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
