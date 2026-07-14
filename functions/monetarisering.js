import { handleVersionedResource } from "./versionedResource.js";

// Canonical onderbouwing (substantiation) of the monetarisering in the
// Meetstandaard Social Impact. Doel: 100% transparantie — integrerende software
// kan per effect en per score laten zien waaróm een situatie de genoemde
// maatschappelijke waarde heeft: de literatuur, de rekenkundige opbouw per
// kostencomponent, de aannames en de bronnen.
//
// Inhoud overgenomen uit "Meetstandaard Social Impact - versie 1.0" en de
// onderbouwingsdocumenten per effect (Fysieke gezondheid, Gezonde leefstijl,
// Mentale gezondheid) en de participatieladder-notitie.
//
// Structuur:
// - effecten[].niveaus[]: per Likert-score (1-5) de situatie, waarde per jaar,
//   literatuuronderbouwing en (waar uitgewerkt) de financiële `opbouw`.
// - opbouw[]: kostencomponenten die optellen tot `waardePerJaar`. Elke component
//   noemt de stakeholder die de kost/baat draagt, de berekening, de aannames en
//   de bronnen (id's in de `bronnen`-registry).
// - prijsbasis[]: de "universele bronnen" — vaste tarieven/prijzen waarmee is
//   gerekend, met bronverwijzing.
// - bronnen: centrale registry, keyed by id. `type` onderscheidt "universeel"
//   (prijslijsten/tarieven) van "literatuur" (wetenschappelijke onderbouwing van
//   aannames). `url` is null wanneer geen publieke link bestaat.
// - status per effect: "volledig" (opbouw per niveau uitgewerkt), "gedeeltelijk"
//   (deels uitgewerkt) of "concept" (waardering vastgesteld, gedetailleerde
//   opbouw volgt in de definitieve versie 1.0).
//
// Dit constant is de bron voor het seeden van Firestore
// (MeetstandaardMonetarisering/{version}). De HTTP-functie leest uit Firestore
// zodat nieuwe versies zonder redeploy toegevoegd kunnen worden.
export const MONETARISERING_1_0 = {
  meta: {
    version: "1.0",
    source: "Meetstandaard Social Impact v1.0",
    updatedAt: "2026-07-14",
    status: "demo",
    toelichting:
      "Demo-versie van de onderbouwing. De effecten met status 'concept' krijgen in de definitieve versie 1.0 een volledig uitgewerkte financiële opbouw per niveau. Alle bedragen zijn maatschappelijke kosten (negatief) of baten (positief) per persoon per jaar, ten opzichte van de nullijn (het landelijk gemiddelde).",
  },

  effecten: [
    {
      id: "fysieke-gezondheid",
      effect: "Fysieke gezondheid",
      categorie: "Gezondheid en Welzijn",
      status: "volledig",
      methodiek:
        "De vijf Likert-niveaus zijn gedefinieerd en gemonetariseerd op basis van de Zorginstituut Nederland (ZIN) richtlijnen voor economische evaluaties (referentieprijzen 2022) en wetenschappelijke literatuur over Self-Rated Physical Health (SRPH) en fysieke activiteit. De maatschappelijke kosten zijn verdeeld over zorgkosten (overheid/zorgverzekeraar) en arbeidsproductiviteit/verzuim (werkgever/maatschappij). Niveau 4 (goede fysieke gezondheid) is de nullijn.",
      prijsbasis: [
        { label: "Verpleegdag ziekenhuis", waarde: 644, eenheid: "€ per dag", bronnen: ["zin-referentieprijzen-2022"] },
        { label: "Polikliniekbezoek", waarde: 120, eenheid: "€ per bezoek", bronnen: ["zin-referentieprijzen-2022"] },
        { label: "Bezoek spoedeisende hulp", waarde: 258, eenheid: "€ per bezoek", bronnen: ["zin-referentieprijzen-2022"] },
        { label: "Fysiotherapiebehandeling", waarde: 38.89, eenheid: "€ per behandeling", bronnen: ["zin-referentieprijzen-2022"] },
        { label: "Huisartsconsult", waarde: 30.87, eenheid: "€ per consult", bronnen: ["zin-referentieprijzen-2022"] },
        { label: "Productiviteitsverlies betaald werk", waarde: 39.88, eenheid: "€ per uur (€319 per 8-urige werkdag)", bronnen: ["zin-referentieprijzen-2022"] },
      ],
      niveaus: [
        {
          score: 1,
          situatie:
            "De persoon ervaart continu ernstige pijn of lichamelijk ongemak en is sterk beperkt in mobiliteit (\"ik kan niet makkelijk bewegen\"). Dagelijkse taken kunnen vrijwel niet worden uitgevoerd door een chronisch gebrek aan energie en het algemene fitheidsniveau is zeer laag. Er is vaak sprake van complexe multimorbiditeit of ernstige functionele achteruitgang.",
          waardePerJaar: -17500,
          literatuur:
            "Personen die hun gezondheid als 'poor' (slecht) beoordelen, hebben een significant hoger risico op mortaliteit en ziekenhuisopnames. De groep met 'poor' Self-Rated Health (SRH) verblijft gemiddeld 10,7 dagen per jaar in het ziekenhuis en heeft frequent contact met artsen. Werknemers in de laagste categorie van fysieke activiteit (0-74 minuten per week) hebben een 3,5 keer hogere kans op ziekteverzuim vergeleken met actieve werknemers.",
          opbouw: [
            {
              component: "zorgkosten",
              stakeholder: "zorgverzekeraar",
              bedrag: -8000,
              berekening:
                "Gemiddeld 10,7 ziekenhuisdagen à €644 per verpleegdag (≈ €6.890), aangevuld met meerdere bezoeken aan de spoedeisende hulp (€258 per bezoek), polikliniek (€120 per consult) en intensieve eerstelijnszorg.",
              aannames: ["Gemiddeld 10,7 ziekenhuisdagen per jaar bij 'poor' Self-Rated Health."],
              bronnen: ["zin-referentieprijzen-2022", "srh-zorggebruik-literatuur"],
            },
            {
              component: "arbeidsproductiviteit",
              stakeholder: "werkgever",
              bedrag: -9500,
              berekening:
                "Circa 30 extra verzuimdagen ten opzichte van het gemiddelde: 30 dagen × 8 uur × €39,88 ≈ €9.571.",
              aannames: [
                "Verzuim is 3,5 keer hoger dan normaal (laagste categorie fysieke activiteit, 0-74 minuten per week).",
              ],
              bronnen: ["zin-referentieprijzen-2022", "fysieke-activiteit-verzuim-literatuur"],
            },
          ],
          bronnen: ["zin-referentieprijzen-2022", "srh-zorggebruik-literatuur", "fysieke-activiteit-verzuim-literatuur"],
        },
        {
          score: 2,
          situatie:
            "De persoon heeft vaak pijn of fysieke klachten die het functioneren belemmeren. Basisactiviteiten lukken nog, maar kosten veel energie. Er is sprake van fysieke inactiviteit en beperkte kracht of uithoudingsvermogen, wat leidt tot een lagere algemene gezondheidsbeleving.",
          waardePerJaar: -8500,
          literatuur:
            "Een matige subjectieve fysieke gezondheid voorspelt een slechter verloop van het verouderingsproces en leidt nog steeds tot aanzienlijk zorggebruik. Personen die matig lichamelijk actief zijn (75-149 minuten per week) hebben 2,4 keer vaker ongepland ziekteverzuim. De fysieke domeinen van de SF-36 (zoals fysiek functioneren en lichamelijke pijn) correleren hier sterk met gemelde beperkingen en een hogere ziektelast.",
          opbouw: [
            {
              component: "zorgkosten",
              stakeholder: "zorgverzekeraar",
              bedrag: -4000,
              berekening:
                "Gemiddeld ziekenhuisverblijf is aanzienlijk maar lager dan bij niveau 1 (circa 5 dagen à €644 = €3.220). Overige kosten bestaan uit frequente huisartsbezoeken (€30,87 per keer) en fysiotherapie (€38,89 per sessie).",
              aannames: ["Circa 5 ziekenhuisdagen per jaar bij matige subjectieve fysieke gezondheid."],
              bronnen: ["zin-referentieprijzen-2022", "srh-zorggebruik-literatuur"],
            },
            {
              component: "arbeidsproductiviteit",
              stakeholder: "werkgever",
              bedrag: -4500,
              berekening: "Circa 14 extra verzuimdagen: 14 dagen × 8 uur × €39,88 ≈ €4.466.",
              aannames: ["Verzuim is 2,4 keer hoger dan bij actieve werknemers (75-149 minuten beweging per week)."],
              bronnen: ["zin-referentieprijzen-2022", "fysieke-activiteit-verzuim-literatuur"],
            },
          ],
          bronnen: ["zin-referentieprijzen-2022", "srh-zorggebruik-literatuur", "fysieke-activiteit-verzuim-literatuur"],
        },
        {
          score: 3,
          situatie:
            "De persoon functioneert naar behoren, maar ervaart soms lichamelijk ongemak of een gebrek aan energie na inspanning. Bewegen gaat over het algemeen goed, al wordt de norm voor structurele intensieve fysieke gezondheid niet altijd gehaald.",
          waardePerJaar: -3000,
          literatuur:
            "Dit vertegenwoordigt de brede middengroep ('fair' tot 'good' SRH). Het zorggebruik ligt rond of net boven het landelijk gemiddelde; ziekenhuisdagen variëren rond de 2 à 3,9 dagen. Fysieke achteruitgang is beperkt, maar het preventieve buffer-effect van sporten ontbreekt grotendeels.",
          opbouw: [
            {
              component: "zorgkosten",
              stakeholder: "zorgverzekeraar",
              bedrag: -1500,
              berekening:
                "Beperkt tot af en toe een ziekenhuisopname voor niet-chronische of preventieve zaken (circa 2 dagen = €1.288), reguliere huisartsbezoeken en lichte paramedische zorg.",
              aannames: ["Circa 2 ziekenhuisdagen per jaar."],
              bronnen: ["zin-referentieprijzen-2022", "srh-zorggebruik-literatuur"],
            },
            {
              component: "arbeidsproductiviteit",
              stakeholder: "werkgever",
              bedrag: -1500,
              berekening:
                "Verzuim ligt rond of net iets boven de gezonde basislijn: incidenteel kortdurend verzuim, circa 4 à 5 extra dagen (4,7 × 8 uur × €39,88 ≈ €1.500).",
              aannames: ["Circa 4,7 extra verzuimdagen per jaar."],
              bronnen: ["zin-referentieprijzen-2022", "fysieke-activiteit-verzuim-literatuur"],
            },
          ],
          bronnen: ["zin-referentieprijzen-2022", "srh-zorggebruik-literatuur"],
        },
        {
          score: 4,
          situatie:
            "De persoon voelt zich vitaal, heeft geen last van pijn en beschikt over meer dan voldoende energie om dagelijkse en professionele taken soepel uit te voeren. Men is fysiek actief en ondervindt geen functionele belemmeringen.",
          waardePerJaar: 0,
          literatuur:
            "'Excellent/very good' SRH gaat gepaard met het laagste zorggebruik (bij ouderen is het aantal ziekenhuisdagen 70% lager dan in de slechte categorie; voor de gemiddelde volwassene nagenoeg nul). Ook poliklinische en tweedelijns artsbezoeken zijn significant lager. Dit niveau dient als nullijn: er is regulier of preventief basiszorggebruik (huisarts, tandarts) zonder excessieve meerkosten, en het verzuim is in lijn met het natuurlijke, niet-ziektegerelateerde verzuim.",
          opbouw: null,
          bronnen: ["srh-zorggebruik-literatuur"],
        },
        {
          score: 5,
          situatie:
            "De persoon floreert fysiek, heeft een hoge mate van uithoudingsvermogen, flexibiliteit en spierkracht. Er is structureel een overschot aan energie, blessures herstellen snel en een gezonde levensstijl fungeert als beschermende factor (\"buffer\") tegen externe fysieke of werkgerelateerde stressoren.",
          waardePerJaar: 2000,
          literatuur:
            "Het bereiken en behouden van een hoge fysieke activiteit (≥150 minuten per week) verlaagt ongeplande ziektegerelateerde uitval drastisch en optimaliseert de algehele mortaliteit en morbiditeit. Deze robuuste fysieke staat beschermt tegen de ontwikkeling van chronische ziekten (zoals hart- en vaatziekten), leidt op latere leeftijd tot aanzienlijk beter welzijn en verbetert prestaties op de werkvloer (minder presenteïsme, meer focus).",
          opbouw: [
            {
              component: "maatschappelijkeBaten",
              stakeholder: "maatschappij",
              bedrag: 2000,
              berekening:
                "Preventieve waarde voor de toekomst (vermeden toekomstige behandelkosten, de 'brede baten' van gezondheid) plus structureel extra toegevoegde waarde voor werkgevers: minste ziekte-uitval en verhoogde productiviteit, conform de methodiek bij Mentale gezondheid.",
              aannames: ["Netto economische besparing voor werkgever en maatschappij die de nullijn overstijgt."],
              bronnen: ["fysieke-activiteit-verzuim-literatuur"],
            },
          ],
          bronnen: ["fysieke-activiteit-verzuim-literatuur"],
        },
      ],
    },

    {
      id: "gezonde-leefstijl",
      effect: "Gezonde leefstijl",
      categorie: "Gezondheid en Welzijn",
      status: "volledig",
      methodiek:
        "Het monetariseringsmodel combineert de universele bronnen voor de financiële basisbouwstenen (Maatschappelijke prijslijst: lonen, uitkeringen en Zvw-tarieven 2026) met wetenschappelijke literatuur voor de effectspecifieke aannames. Over de hele linie is gerekend met een bruto jaarloon MBO 2-4/havo/vwo van €36.960 (€148 per werkdag bij 250 werkdagen). Niveau 4 (landelijk gemiddelde leefstijl) is de nullijn.",
      prijsbasis: [
        { label: "Bruto jaarloon MBO 2-4/havo/vwo", waarde: 36960, eenheid: "€ per jaar", bronnen: ["maatschappelijke-prijslijst-2026"] },
        { label: "Loonwaarde per werkdag (250 werkdagen)", waarde: 148, eenheid: "€ per dag", bronnen: ["maatschappelijke-prijslijst-2026"] },
        { label: "Bijstandsuitkering gehuwd/samenwonend (Participatiewet)", waarde: 2144, eenheid: "€ per maand", bronnen: ["maatschappelijke-prijslijst-2026"] },
        { label: "Fysiotherapie regulier", waarde: 39, eenheid: "€ per zitting", bronnen: ["maatschappelijke-prijslijst-2026"] },
        { label: "Diëtetiek op locatie", waarde: 21, eenheid: "€ per zitting", bronnen: ["maatschappelijke-prijslijst-2026"] },
        { label: "Huisartsconsult 5-20 minuten", waarde: 13, eenheid: "€ per consult", bronnen: ["maatschappelijke-prijslijst-2026"] },
      ],
      niveaus: [
        {
          score: 1,
          situatie:
            "De persoon heeft een sterk ongezonde leefstijl: ernstig overgewicht (obesitas), chronisch fysiek inactief, rookt en/of heeft problematisch alcoholgebruik. In het dagelijks leven ervaart de persoon forse fysieke belemmeringen en een structureel gebrek aan energie. Er is vaak sprake van multimorbiditeit (bijv. diabetes type 2, hart- en vaatziekten), wat leidt tot intensief zorggebruik, langdurig verzuim of volledige uitstroom uit het arbeidsproces naar een uitkering.",
          waardePerJaar: -15000,
          literatuur:
            "Een ongezonde leefstijl (roken, ongezonde voeding, weinig bewegen, alcoholgebruik) is verantwoordelijk voor zo'n 14% van de totale ziektelast in Nederland. Mensen met obesitas en een slechte fysieke gezondheid hebben een sterk verhoogde kans op chronische aandoeningen en een tweemaal hogere kans op langdurig verzuim en uitstroom naar arbeidsongeschiktheid.",
          opbouw: [
            {
              component: "uitkeringen",
              stakeholder: "gemeente",
              bedrag: -5145,
              berekening: "20% verhoogde kans op (gedeeltelijke) uitstroom naar de bijstand: 20% van een jaaruitkering (€2.144 per maand × 12 = €25.728) = €5.145.",
              aannames: ["20% verhoogde kans op uitstroom naar de bijstand, gebaseerd op literatuur over obesitas en arbeidsongeschiktheid."],
              bronnen: ["maatschappelijke-prijslijst-2026", "tno-duurzame-inzetbaarheid-2018"],
            },
            {
              component: "ziekteverzuim",
              stakeholder: "werkgever",
              bedrag: -4440,
              berekening: "30 extra ziektedagen per jaar × €148 per werkdag (bruto MBO/havo-loon €36.960 per jaar bij 250 werkdagen) = €4.440.",
              aannames: ["30 extra verzuimdagen per jaar, gebaseerd op literatuur over obesitas en arbeidsongeschiktheid."],
              bronnen: ["maatschappelijke-prijslijst-2026", "tno-duurzame-inzetbaarheid-2018"],
            },
            {
              component: "zorgkosten",
              stakeholder: "zorgverzekeraar",
              bedrag: -2415,
              berekening:
                "Intensief gebruik van paramedische en huisartsenzorg: 20 zittingen fysiotherapie (20 × €39 = €780), 10 zittingen diëtetiek op locatie (10 × €21 = €210), 5 reguliere huisartsconsulten (5 × €13 = €65) en overige/specialistische trajecten en medicatie ter waarde van €1.360.",
              aannames: ["Zorgprofiel passend bij multimorbiditeit en intensief eerstelijnsgebruik."],
              bronnen: ["maatschappelijke-prijslijst-2026"],
            },
            {
              component: "arbeidsproductiviteit",
              stakeholder: "werkgever",
              bedrag: -3000,
              berekening: "Verminderde productiviteit door chronische klachten (presenteïsme).",
              aannames: ["Presenteïsme-effect bij chronische klachten."],
              bronnen: ["tno-duurzame-inzetbaarheid-2018"],
            },
          ],
          bronnen: ["bmj-healthy-lifestyle-2020", "oecd-ncd-2026", "rivm-vtv-2024", "tno-duurzame-inzetbaarheid-2018"],
        },
        {
          score: 2,
          situatie:
            "De persoon vertoont meerdere ongezonde gedragingen: overgewicht, voldoet niet aan de beweegrichtlijn, rookt mogelijk of eet structureel ongezond. De persoon redt zich in de maatschappij, maar is sneller vermoeid, herstelt langzamer van ziektes en bezoekt vaker de eerste lijn voor lichte chronische klachten of gewrichtspijn.",
          waardePerJaar: -6000,
          literatuur:
            "Slechts 47% van de Nederlanders voldoet aan de beweegrichtlijn en 50% heeft overgewicht. Een gebrek aan fysieke activiteit en overgewicht vergroten de kans op verzuim en verminderen de inzetbaarheid aanzienlijk.",
          opbouw: [
            {
              component: "ziekteverzuim",
              stakeholder: "werkgever",
              bedrag: -2220,
              berekening: "15 extra ziektedagen per jaar × €148 per werkdag = €2.220.",
              aannames: ["Halvering van het verzuimprofiel ten opzichte van niveau 1, passend bij milde fysieke belemmeringen."],
              bronnen: ["maatschappelijke-prijslijst-2026", "tno-duurzame-inzetbaarheid-2018"],
            },
            {
              component: "arbeidsproductiviteit",
              stakeholder: "werkgever",
              bedrag: -3120,
              berekening: "Verminderde productiviteit door vermoeidheid.",
              aannames: ["Presenteïsme door vermoeidheid en langzamer herstel."],
              bronnen: ["tno-duurzame-inzetbaarheid-2018"],
            },
            {
              component: "zorgkosten",
              stakeholder: "zorgverzekeraar",
              bedrag: -660,
              berekening: "10 zittingen fysiotherapie (10 × €39 = €390), 3 huisartsconsulten (3 × €13 = €39) en lichte overige zorgkosten (€231).",
              aannames: ["Halvering van het zorgprofiel ten opzichte van niveau 1."],
              bronnen: ["maatschappelijke-prijslijst-2026"],
            },
          ],
          bronnen: ["cbs-bewegen-2022", "cbs-leefstijl-2022", "oecd-ncd-2026", "rivm-vtv-2024", "tno-duurzame-inzetbaarheid-2018"],
        },
        {
          score: 3,
          situatie:
            "De persoon is relatief gezond, maar beweegt net niet voldoende, heeft licht overgewicht of ervaart incidenteel stress door een verstoorde balans. De persoon is volledig zelfredzaam en functioneert naar behoren, maar de leefstijl fungeert niet als beschermende buffer, wat leidt tot kleine fysieke klachten na inspanning.",
          waardePerJaar: -2500,
          literatuur:
            "Lichte ongezonde gedragingen leiden niet direct tot grote medische trajecten, maar kosten de werkgever op termijn wel geld door een iets lager werkvermogen en kortdurend verzuim.",
          opbouw: [
            {
              component: "ziekteverzuim",
              stakeholder: "werkgever",
              bedrag: -740,
              berekening: "5 extra ziektedagen per jaar × €148 per werkdag = €740.",
              aannames: ["Beperkte impact die voornamelijk op de werkvloer wordt gevoeld (studies naar leefstijl en presenteïsme)."],
              bronnen: ["maatschappelijke-prijslijst-2026", "tno-duurzame-inzetbaarheid-2018"],
            },
            {
              component: "arbeidsproductiviteit",
              stakeholder: "werkgever",
              bedrag: -1630,
              berekening: "Lichte productiviteitsdaling.",
              aannames: ["Licht verlaagd werkvermogen zonder medisch traject."],
              bronnen: ["tno-duurzame-inzetbaarheid-2018"],
            },
            {
              component: "zorgkosten",
              stakeholder: "zorgverzekeraar",
              bedrag: -130,
              berekening: "Incidentele zorg: 1 huisartsconsult (€13) en 3 zittingen fysiotherapie (€117).",
              aannames: ["Incidenteel eerstelijnsgebruik."],
              bronnen: ["maatschappelijke-prijslijst-2026"],
            },
          ],
          bronnen: ["tno-duurzame-inzetbaarheid-2018"],
        },
        {
          score: 4,
          situatie:
            "De persoon heeft een leefstijl die overeenkomt met het landelijk gemiddelde. Dit houdt in dat men redelijk oplet qua voeding, af en toe sport, matig alcohol drinkt, en doorgaans een regulier aantal dagen per jaar ziek is. Er is sprake van een neutrale maatschappelijke impact: er worden geen bovenmatige zorg- of verzuimkosten gemaakt, maar er zijn ook geen extra baten.",
          waardePerJaar: 0,
          literatuur:
            "Dit niveau fungeert als de nullijn. Ongeveer 50% van de volwassenen in Nederland schommelt rond dit gemiddelde (heeft bijvoorbeeld nét wel/geen overgewicht en voldoet nét wel/niet aan de richtlijnen). Alle zorg- en verzuimkosten zitten ingebed in de macro-economische gemiddelden; ten opzichte van dit gemiddelde treden er geen extra maatschappelijke kosten of besparingen op.",
          opbouw: null,
          bronnen: ["cbs-bewegen-2022", "cbs-leefstijl-2022"],
        },
        {
          score: 5,
          situatie:
            "De persoon hanteert een actieve, zeer gezonde leefstijl (dagelijks voldoende beweging, gezond gewicht, gezond dieet, geen roken). De persoon barst van de energie, floreert in werk en privé, herstelt extreem snel van tegenslagen en heeft een hoge veerkracht tegen stress. Zorggebruik voor fysieke klachten is nihil.",
          waardePerJaar: 2000,
          literatuur:
            "Een blijvend gezonde leefstijl (nooit roken, gezond gewicht, fysiek actief) wordt in onderzoek geassocieerd met aanzienlijk lagere zorgkosten, minder ziekteverzuim, een hogere levensverwachting (zonder chronische ziekten) en het zogeheten 'healthy worker effect' waarbij men bovengemiddeld productief is.",
          opbouw: [
            {
              component: "ziekteverzuim",
              stakeholder: "werkgever",
              bedrag: 592,
              berekening: "4 dagen minder verzuim ten opzichte van het landelijk gemiddelde × €148 per werkdag = €592.",
              aannames: ["4 verzuimdagen minder dan het landelijk gemiddelde."],
              bronnen: ["maatschappelijke-prijslijst-2026", "tno-duurzame-inzetbaarheid-2018"],
            },
            {
              component: "arbeidsproductiviteit",
              stakeholder: "werkgever",
              bedrag: 1250,
              berekening: "Hogere productiviteit, energie en bevlogenheid op het werk.",
              aannames: ["Effecten van vitaliteit op arbeidsproductiviteit, ondersteund door internationale literatuur over 'healthy lifestyle' en economische baten."],
              bronnen: ["oecd-ncd-2026", "tno-duurzame-inzetbaarheid-2018"],
            },
            {
              component: "zorgkosten",
              stakeholder: "zorgverzekeraar",
              bedrag: 158,
              berekening: "Lagere reguliere zorgconsumptie (vermijden van reguliere fysiotherapie en huisartsbezoeken).",
              aannames: ["Vermeden reguliere zorgconsumptie ten opzichte van het gemiddelde."],
              bronnen: ["maatschappelijke-prijslijst-2026"],
            },
          ],
          bronnen: ["bmj-healthy-lifestyle-2020", "oecd-ncd-2026", "tno-duurzame-inzetbaarheid-2018"],
        },
      ],
    },

    {
      id: "mentale-gezondheid",
      effect: "Mentale gezondheid",
      categorie: "Gezondheid en Welzijn",
      status: "concept",
      methodiek:
        "Mentale gezondheid is het vermogen van een individu om emotioneel, psychologisch en sociaal welzijn te behouden. De waardering per niveau is vastgesteld in lijn met de overige effecten binnen het domein Gezondheid en Welzijn; de gedetailleerde financiële opbouw per niveau wordt uitgewerkt voor de definitieve versie 1.0. Van de maatschappelijke kosten van slechte mentale gezondheid bestaat circa een kwart uit zorgkosten (eerstelijn en ggz) en driekwart uit productiviteitsverliezen.",
      prijsbasis: [
        { label: "Behandeling psycholoog", waarde: 150, eenheid: "€ per uur (praktijkrange €140-€160)", bronnen: ["zorgwijzer-psychologische-zorg"] },
        { label: "Verzuimkosten zieke werknemer", waarde: 250, eenheid: "€ per dag", bronnen: ["inkomen-collectief-verzuimcijfers"] },
        { label: "Bijstandsuitkering alleenstaand", waarde: 1345.45, eenheid: "€ per maand", bronnen: ["rijksoverheid-bijstand"] },
      ],
      niveaus: [
        {
          score: 1,
          situatie:
            "De persoon ervaart ernstige psychische klachten (bijv. depressie of angststoornis) die het dagelijks functioneren volledig belemmeren. Er is sprake van langdurig verzuim, een hoog risico op arbeidsongeschiktheid (WIA/IVA) of werkloosheid. De persoon maakt intensief gebruik van specialistische zorg (tweedelijns GGZ), gebruikt medicatie en ervaart sterke eenzaamheid.",
          waardePerJaar: -15000,
          literatuur:
            "De kans op werkloosheid bij mensen met ernstige actuele psychische klachten is drie keer zo groot als bij mensen zonder psychische klachten, en hun gemiddelde inkomen ligt 20% lager dan dat van de gemiddelde beroepsbevolking. Psychische problematiek is de meest voorkomende reden van arbeidsongeschiktheid, en circa 50% van de mensen in de bijstand heeft mentale klachten.",
          opbouw: null,
          bronnen: ["trimbos-arbeid-psychische-aandoeningen", "trimbos-leefsituatie-epa", "vzinfo-arbeidsongeschiktheid", "rijksoverheid-bijstand"],
        },
        {
          score: 2,
          situatie:
            "De persoon ervaart duidelijke klachten (bijv. somberheid, stress, angst) die het functioneren beperken, maar er is nog enige deelname aan de maatschappij of werk. Er is sprake van frequent kort verzuim of verminderde productiviteit op het werk (presenteïsme). Zorggebruik bestaat uit huisarts, POH-GGZ of Basis-GGZ en eventueel medicatie.",
          waardePerJaar: -6000,
          literatuur:
            "Een zieke werknemer kost een werkgever gemiddeld €250 per dag. Behandeling in de Basis-GGZ of gespecialiseerde GGZ wordt vergoed door de zorgverzekeraar; een behandeling bij een psycholoog kost in de praktijk €140 tot €160 per uur.",
          opbouw: null,
          bronnen: ["inkomen-collectief-verzuimcijfers", "zorgwijzer-psychologische-zorg", "ggz-werkgeluk-verzuim"],
        },
        {
          score: 3,
          situatie:
            "De persoon functioneert, maar ervaart regelmatig stress of lichte angstklachten. Er is geen sprake van een gediagnosticeerde stoornis die specialistische zorg vereist, maar wel van een beroep op eerstelijnszorg (huisarts/POH-GGZ). Het verzuim ligt rond het landelijk gemiddelde. De veerkracht is beperkt; bij tegenslag dreigt terugval.",
          waardePerJaar: -3350,
          literatuur:
            "Aan psychische aandoeningen sterven relatief weinig mensen, maar ze maken wel lang ziek; preventie van deze aandoeningen resulteert daarom naar verwachting in lagere zorgkosten. Het zorggebruik op dit niveau blijft beperkt tot de eerste lijn.",
          opbouw: null,
          bronnen: ["esb-preventie-gezondheid", "trimbos-mentaal-gezonde-samenleving"],
        },
        {
          score: 4,
          situatie:
            "De persoon voelt zich mentaal gezond, ervaart werkgeluk en is productief. Er is sprake van een goede balans en voldoende veerkracht om dagelijkse stress op te vangen. Zorggebruik voor mentale klachten is nihil. Verzuim is lager dan het gemiddelde.",
          waardePerJaar: 0,
          literatuur:
            "Dit niveau fungeert als de nullijn: zorggebruik en verzuim liggen op of onder het landelijk gemiddelde en er zijn geen aan mentale gezondheid toe te schrijven meerkosten.",
          opbouw: null,
          bronnen: ["trimbos-mentaal-gezonde-samenleving"],
        },
        {
          score: 5,
          situatie:
            "De persoon floreert, heeft een hoge mate van veerkracht en draagt actief bij aan de maatschappij (bijv. via mantelzorg, vrijwilligerswerk of hoge arbeidsproductiviteit). Er is sprake van duurzame inzetbaarheid en een preventieve werking op fysieke gezondheid (succesvol ouder worden).",
          waardePerJaar: 2000,
          literatuur:
            "Goede mentale gezondheid is geassocieerd met een 15 tot 20 jaar langere levensverwachting vergeleken met mensen met een slechte mentale gezondheid, en met levenskwaliteit, veerkracht, maatschappelijke participatie, werkgeluk, (arbeids)productiviteit, afname van zorggebruik en een geringer beroep op uitkeringen voor arbeidsongeschiktheid. Goede mentale gezondheid heeft daarmee naast intrinsieke ook aanzienlijke economische waarde.",
          opbouw: null,
          bronnen: ["trimbos-mentaal-gezonde-samenleving", "ggz-werkgeluk-verzuim"],
        },
      ],
    },

    {
      id: "participatieladder",
      effect: "Participatieladder",
      categorie: "Werk en Economie",
      status: "gedeeltelijk",
      methodiek:
        "De treden van de participatieladder zijn gewaardeerd op basis van uitkeringslasten, gederfde inkomstenbelasting en zorg-/veiligheidskosten door inactiviteit. De volledige parameterset (inkomens per opleidingsniveau en urenklasse, belastingschijven, uitkeringsbedragen) wordt apart en versieerd gepubliceerd via het arbeidsparticipatie-endpoint (GET .../arbeidsparticipatie/parameters).",
      prijsbasis: [],
      niveaus: [
        {
          score: 1,
          situatie:
            "Geïsoleerd: geen contact buitenshuis, behalve functionele bezoeken (bijv. supermarkt of huisarts). Contact beperkt tot huisgenoten.",
          waardePerJaar: -21150,
          literatuur:
            "Hoogste maatschappelijke last. De kosten bestaan uit een gewogen gemiddelde van uitkeringen (€5.600), gederfde inkomstenbelasting (€11.050) en hoge zorg- en veiligheidskosten door inactiviteit (€4.500).",
          opbouw: [
            {
              component: "uitkeringen",
              stakeholder: "gemeente",
              bedrag: -5600,
              berekening: "Gewogen gemiddelde uitkeringslast (bijstand/WW/arbeidsongeschiktheid).",
              aannames: ["Gewogen gemiddelde over uitkeringstypen; 1 op de 5 werklozen had in 2020 een WW-uitkering."],
              bronnen: ["cbs-ww-uitkering", "factcheck-vlaanderen"],
            },
            {
              component: "inkomstenbelasting",
              stakeholder: "rijksoverheid",
              bedrag: -11050,
              berekening: "Gederfde inkomstenbelasting en premies bij volledige inactiviteit.",
              aannames: ["Derving gebaseerd op de belastingafdracht bij regulier betaald werk (trede 5)."],
              bronnen: ["factcheck-vlaanderen"],
            },
            {
              component: "zorgEnVeiligheid",
              stakeholder: "maatschappij",
              bedrag: -4500,
              berekening: "Hoge zorg- en veiligheidskosten door inactiviteit en sociaal isolement.",
              aannames: ["'Brede baten van werk': inactiviteit verhoogt beroep op ggz, Wmo en veiligheidsdomein."],
              bronnen: ["scp-cpb-brede-baten-werk"],
            },
          ],
          bronnen: ["cbs-ww-uitkering", "akc-participatieladder", "soci-com-participatieladder", "factcheck-vlaanderen", "scp-cpb-brede-baten-werk"],
        },
        {
          score: 2,
          situatie:
            "Sociale contacten buitenshuis: minimaal eens per week informeel contact met buren of kennissen. Geen georganiseerde activiteiten.",
          waardePerJaar: -19500,
          literatuur:
            "Lichte daling in zorgbehoefte. Het doorbreken van sociaal isolement verlaagt het risico op zware mentale problematiek, maar er is nog geen productieve bijdrage of belastingafdracht.",
          opbouw: [
            {
              component: "uitkeringen",
              stakeholder: "gemeente",
              bedrag: -5600,
              berekening: "Gewogen gemiddelde uitkeringslast; ongewijzigd ten opzichte van trede 1.",
              aannames: ["Uitkeringssituatie verandert niet door informele sociale contacten."],
              bronnen: ["cbs-ww-uitkering"],
            },
            {
              component: "inkomstenbelasting",
              stakeholder: "rijksoverheid",
              bedrag: -11050,
              berekening: "Gederfde inkomstenbelasting; ongewijzigd ten opzichte van trede 1.",
              aannames: ["Nog geen belastingafdracht."],
              bronnen: ["factcheck-vlaanderen"],
            },
            {
              component: "zorgEnVeiligheid",
              stakeholder: "maatschappij",
              bedrag: -2850,
              berekening: "Lagere zorg- en veiligheidskosten dan trede 1 door doorbroken sociaal isolement.",
              aannames: ["Doorbreken van sociaal isolement verlaagt het risico op zware mentale problematiek."],
              bronnen: ["scp-cpb-brede-baten-werk"],
            },
          ],
          bronnen: ["akc-participatieladder", "soci-com-participatieladder", "scp-cpb-brede-baten-werk"],
        },
        {
          score: 3,
          situatie:
            "Deelname en onbetaald werk: meedoen aan georganiseerde clubs/cursussen of het verrichten van vrijwilligerswerk met verantwoordelijkheid.",
          waardePerJaar: -15000,
          literatuur:
            "Productieve bijdrage zonder loon. De 'brede baten' stijgen door minder beroep op ggz en Wmo (besparing circa €2.000). Vrijwilligerswerk levert maatschappelijke waarde, maar de uitkeringslast blijft deels bestaan.",
          opbouw: null,
          bronnen: ["akc-participatieladder", "soci-com-participatieladder", "scp-cpb-brede-baten-werk"],
        },
        {
          score: 4,
          situatie: "Betaald werk met ondersteuning: werken met loonkostensubsidie, jobcoach of in een beschutte omgeving.",
          waardePerJaar: -5000,
          literatuur:
            "Netto bijdrage begint. De uitkeringslast daalt scherp (terugverdieneffect). Men gaat voor het eerst belasting en premies afdragen, hoewel er nog kosten zijn voor begeleiding en subsidies.",
          opbouw: null,
          bronnen: ["akc-participatieladder", "soci-com-participatieladder"],
        },
        {
          score: 5,
          situatie:
            "Regulier betaald werk: werken zonder aanvullende uitkering of overheidssteun (inclusief zzp/ondernemerschap).",
          waardePerJaar: 11050,
          literatuur:
            "Maximale maatschappelijke baat. De overheid bespaart de volledige uitkering en ontvangt circa €11.000 aan belastingen en premies. Zorgkosten zijn minimaal en de economische productiviteit is maximaal.",
          opbouw: null,
          bronnen: ["akc-participatieladder", "soci-com-participatieladder", "factcheck-vlaanderen"],
        },
      ],
    },

    {
      id: "financiele-gezondheid",
      effect: "Financiële gezondheid",
      categorie: "Werk en Economie",
      status: "concept",
      methodiek:
        "De waardering per niveau is vastgesteld op basis van het onderbouwingsdocument Financiële gezondheid; de gedetailleerde financiële opbouw en bronvermelding per niveau worden toegevoegd in de definitieve versie 1.0.",
      prijsbasis: [],
      niveaus: [
        {
          score: 1,
          situatie:
            "De respondent scoort extreem laag op de vier stellingen. Er is geen overzicht van inkomsten en uitgaven, rekeningen kunnen structureel niet betaald worden, post wordt genegeerd (ongeopend gelaten) en de persoon is geïsoleerd en durft of weet geen hulp te vragen. Er is sprake van crisis.",
          waardePerJaar: -15000,
          literatuur: null,
          opbouw: null,
          bronnen: [],
        },
        {
          score: 2,
          situatie:
            "De respondent scoort overwegend negatief. Er is onvoldoende overzicht en aan het eind van de maand is er vaak tekort. De persoon herkent belangrijke post wel, maar stelt actie uit door stress. De drempel om hulp in te schakelen is te hoog, men probeert het krampachtig zelf op te lossen.",
          waardePerJaar: -5500,
          literatuur: null,
          opbouw: null,
          bronnen: [],
        },
        {
          score: 3,
          situatie:
            "De respondent scoort neutraal of wisselend. Inkomsten en uitgaven zijn globaal bekend en rekeningen worden meestal betaald, maar er is geen buffer. Post wordt gelezen en deels afgehandeld. Bij onbegrip weet men wel enigszins waar informatie te vinden is, maar men is reactief.",
          waardePerJaar: -800,
          literatuur: null,
          opbouw: null,
          bronnen: [],
        },
        {
          score: 4,
          situatie:
            "De respondent scoort positief. Men heeft goed inzicht in inkomsten en uitgaven, betaalt rekeningen moeiteloos, opent en snapt de post (of onderneemt direct actie) en zoekt proactief hulp bij complexe financiële vragen.",
          waardePerJaar: 0,
          literatuur: "Dit niveau fungeert als de nullijn.",
          opbouw: null,
          bronnen: [],
        },
        {
          score: 5,
          situatie:
            "De respondent scoort maximaal op alle stellingen. Er is niet alleen grip op het heden, maar men plant ook voor de lange termijn (pensioen, buffers voor life events). Administratie is geautomatiseerd, en men maakt actief en met vertrouwen gebruik van (professioneel) onafhankelijk advies.",
          waardePerJaar: 1000,
          literatuur: null,
          opbouw: null,
          bronnen: [],
        },
      ],
    },
  ],

  // Centrale bronnenregistry, keyed by id. `type`: "universeel" voor prijslijsten
  // en tarieven waarmee gerekend is, "literatuur" voor de wetenschappelijke
  // onderbouwing van aannames. `url` is null wanneer geen publieke link bestaat.
  bronnen: {
    "maatschappelijke-prijslijst-2026": {
      id: "maatschappelijke-prijslijst-2026",
      type: "universeel",
      title:
        "Maatschappelijke prijslijst 2026 — gemiddelde lonen, prijzen Participatiewet en inkomen, prijzen Zorgverzekeringswet",
      publisher: "Maatschappelijke prijslijst",
      year: 2026,
      url: null,
      note: "Veelgebruikte referentieprijslijst; geen publieke URL.",
    },
    "zin-referentieprijzen-2022": {
      id: "zin-referentieprijzen-2022",
      type: "universeel",
      title:
        "Richtlijn voor het uitvoeren van economische evaluaties in de gezondheidszorg — referentieprijzen (kostenhandleiding)",
      publisher: "Zorginstituut Nederland",
      year: 2022,
      url: null,
      note: "ZIN-referentieprijzen 2022: verpleegdag €644, polikliniekbezoek €120, SEH-bezoek €258, fysiotherapie €38,89, huisartsconsult €30,87, productiviteitsverlies €39,88 per uur.",
    },
    "srh-zorggebruik-literatuur": {
      id: "srh-zorggebruik-literatuur",
      type: "literatuur",
      title:
        "Wetenschappelijke literatuur over Self-Rated (Physical) Health en zorggebruik (o.a. gemiddeld 10,7 ziekenhuisdagen per jaar bij 'poor' SRH)",
      publisher: "Diverse",
      url: null,
      note: "Bronverwijzingen in het interne onderbouwingsdocument Fysieke gezondheid; publieke referenties volgen in de definitieve versie 1.0.",
    },
    "fysieke-activiteit-verzuim-literatuur": {
      id: "fysieke-activiteit-verzuim-literatuur",
      type: "literatuur",
      title:
        "Literatuur over fysieke activiteit en ziekteverzuim (0-74 min/week: 3,5× hogere verzuimkans; 75-149 min/week: 2,4×; ≥150 min/week: referentie)",
      publisher: "Diverse",
      url: null,
      note: "Bronverwijzingen in het interne onderbouwingsdocument Fysieke gezondheid; publieke referenties volgen in de definitieve versie 1.0.",
    },
    "bmj-healthy-lifestyle-2020": {
      id: "bmj-healthy-lifestyle-2020",
      type: "literatuur",
      title:
        "Healthy lifestyle and life expectancy free of cancer, cardiovascular disease, and type 2 diabetes: prospective cohort study (Li et al.)",
      publisher: "BMJ",
      year: 2020,
      url: "https://www.bmj.com/content/bmj/368/bmj.l6669.full.pdf",
    },
    "oecd-ncd-2026": {
      id: "oecd-ncd-2026",
      type: "literatuur",
      title: "The Health and Economic Benefits of Tackling Non-Communicable Diseases (OECD Health Policy Studies)",
      publisher: "OECD",
      year: 2026,
      url: "https://doi.org/10.1787/e20cbbc3-en",
    },
    "rivm-vtv-2024": {
      id: "rivm-vtv-2024",
      type: "literatuur",
      title: "Volksgezondheid Toekomst Verkenning 2024 (RIVM-rapport 2024-0110)",
      publisher: "RIVM",
      year: 2024,
      url: "https://doi.org/10.21945/RIVM-2024-0110",
    },
    "tno-duurzame-inzetbaarheid-2018": {
      id: "tno-duurzame-inzetbaarheid-2018",
      type: "literatuur",
      title: "Duurzame Inzetbaarheid in Nederland",
      publisher: "TNO",
      year: 2018,
      url: "https://monitorarbeid.tno.nl/wp-content/uploads/sites/16/2023/10/Duurzame-Inzetbaarheid-in-Nederland2018.pdf",
    },
    "cbs-bewegen-2022": {
      id: "cbs-bewegen-2022",
      type: "literatuur",
      title: "18- tot 35-jarigen bewogen minder in 2021",
      publisher: "CBS",
      year: 2022,
      url: "https://www.cbs.nl/nl-nl/nieuws/2022/20/18-tot-35-jarigen-bewogen-minder-in-2021",
    },
    "cbs-leefstijl-2022": {
      id: "cbs-leefstijl-2022",
      type: "literatuur",
      title: "Overgewicht, roken en alcoholgebruik nauwelijks gedaald sinds 2018",
      publisher: "CBS",
      year: 2022,
      url: "https://www.cbs.nl/nl-nl/nieuws/2022/10/overgewicht-roken-en-alcoholgebruik-nauwelijks-gedaald-sinds-2018",
    },
    "trimbos-mentaal-gezonde-samenleving": {
      id: "trimbos-mentaal-gezonde-samenleving",
      type: "literatuur",
      title: "Samen werken aan een mentaal gezonde samenleving (AF1913)",
      publisher: "Trimbos-instituut",
      year: 2025,
      url: "https://www.trimbos.nl/wp-content/uploads/2025/10/AF1913-Samen-werken-aan-een-mentaal-gezonde-samenleving.pdf",
    },
    "trimbos-arbeid-psychische-aandoeningen": {
      id: "trimbos-arbeid-psychische-aandoeningen",
      type: "literatuur",
      title: "Arbeid en psychische aandoeningen (AF1419)",
      publisher: "Trimbos-instituut",
      year: 2021,
      url: "https://www.trimbos.nl/wp-content/uploads/sites/31/2021/09/af1419-arbeid-en-psychische-aandoeningen.pdf",
    },
    "trimbos-leefsituatie-epa": {
      id: "trimbos-leefsituatie-epa",
      type: "literatuur",
      title:
        "Leefsituatie en ervaringen met zorg van mensen met ernstige psychische aandoeningen (AF1838, panel Psychisch Gezien)",
      publisher: "Trimbos-instituut",
      year: 2021,
      url: "https://www.trimbos.nl/wp-content/uploads/2021/11/AF1838-3-Leefsituatie-en-ervaringen-met-zorg-van-mensen-met-ernstige-psychische-aandoeningen.pdf",
    },
    "ggz-werkgeluk-verzuim": {
      id: "ggz-werkgeluk-verzuim",
      type: "literatuur",
      title: "Gezonde, veilige ggz: meer werkgeluk, minder verzuim",
      publisher: "de Nederlandse ggz",
      year: 2024,
      url: "https://ggz.nl/wp-content/uploads/2024/01/gezonde-veilige-ggz-meer-werkgeluk-minder-verzuim.pdf",
    },
    "esb-preventie-gezondheid": {
      id: "esb-preventie-gezondheid",
      type: "literatuur",
      title: "Wegen naar goede gezondheid liggen ook buiten de zorg (ESB-dossier)",
      publisher: "ESB",
      year: 2023,
      url: "https://esb.nu/wp-content/uploads/2023/07/Bladerpdf4794.pdf#page=30",
    },
    "zorgwijzer-psychologische-zorg": {
      id: "zorgwijzer-psychologische-zorg",
      type: "universeel",
      title: "Vergoeding psychologische zorg (kosten psycholoog €140-€160 per uur)",
      publisher: "Zorgwijzer",
      url: "https://www.zorgwijzer.nl/zorgverzekering-vergelijken/psychologische-zorg",
    },
    "inkomen-collectief-verzuimcijfers": {
      id: "inkomen-collectief-verzuimcijfers",
      type: "universeel",
      title: "Verzuim in cijfers — een zieke werknemer kost een werkgever gemiddeld €250 per dag",
      publisher: "Inkomen Collectief (trendrapport juni 2023)",
      year: 2023,
      url: "https://inkomencollectief.h5mag.com/trendrapport_juni_2023/verzuim_in_cijfers",
    },
    "rijksoverheid-bijstand": {
      id: "rijksoverheid-bijstand",
      type: "universeel",
      title: "Hoe hoog is mijn bijstandsuitkering? (alleenstaand €1.345,45 per maand)",
      publisher: "Rijksoverheid",
      url: "https://www.rijksoverheid.nl/onderwerpen/bijstand/vraag-en-antwoord/hoe-hoog-is-mijn-bijstandsuitkering",
    },
    "vzinfo-arbeidsongeschiktheid": {
      id: "vzinfo-arbeidsongeschiktheid",
      type: "literatuur",
      title: "Arbeidsongeschiktheid — psychische problematiek meest voorkomende reden",
      publisher: "VZinfo (RIVM)",
      url: "https://www.vzinfo.nl/arbeidsongeschiktheid",
    },
    "cbs-ww-uitkering": {
      id: "cbs-ww-uitkering",
      type: "literatuur",
      title: "Van alle werklozen had 1 op de 5 in 2020 een WW-uitkering",
      publisher: "CBS",
      year: 2021,
      url: "https://www.cbs.nl/nl-nl/nieuws/2021/50/van-alle-werklozen-had-1-op-de-5-in-2020-een-ww-uitkering",
    },
    "akc-participatieladder": {
      id: "akc-participatieladder",
      type: "literatuur",
      title: "Participatieladder — kennisdocument",
      publisher: "Arbeidsdeskundig Kenniscentrum (AKC)",
      url: "https://www.arbeidsdeskundigen.nl/akc/kennis/map/document/4402",
    },
    "soci-com-participatieladder": {
      id: "soci-com-participatieladder",
      type: "literatuur",
      title: "Is de participatieladder nog van deze tijd?",
      publisher: "Soci-Com",
      url: "https://soci-com.nl/blog/is-participatieladder-en-doet-soci-com-daarmee/",
    },
    "factcheck-vlaanderen": {
      id: "factcheck-vlaanderen",
      type: "literatuur",
      title: "Werkloze kan overheid jaarlijks €32.000 kosten",
      publisher: "Factcheck Vlaanderen",
      url: "https://factcheck.vlaanderen/factcheck/werkloze-kan-overheid-jaarlijks-32000-euro-kosten",
    },
    "scp-cpb-brede-baten-werk": {
      id: "scp-cpb-brede-baten-werk",
      type: "literatuur",
      title: "De brede baten van werk",
      publisher: "SCP / CPB",
      year: 2020,
      url: "https://www.scp.nl/site/binaries/site-content/collections/documents/2020/03/20/de-brede-waarde-van-werk/CPB-SCP-Boek-mrt2020-De-brede-baten-van-werk.pdf",
    },
  },
};

const COLLECTION = "MeetstandaardMonetarisering";

// The contract path is /api/v1/monetarisering/...:
//   GET .../versions                 -> { versions: [...] }
//   GET .../onderbouwing             -> latest version body
//   GET .../onderbouwing/{version}   -> pinned version body (404 if unknown)
export const handleMonetarisering = (firestore, request, response) =>
  handleVersionedResource({
    firestore,
    collection: COLLECTION,
    resourceSegment: "onderbouwing",
    request,
    response,
  });
