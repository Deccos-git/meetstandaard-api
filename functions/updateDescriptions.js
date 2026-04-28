/**
 * One-off migration: write the official "Definitie" text from the source files
 * to the `description` field of each effect in Firestore.
 *
 * Sources:
 *   - Meetstandaard Social Impact v1.0 (PDF) — canonical definitions
 *   - Meetstandaard-gelijke-kansen-maart 2026 (XLSX) — additions for GKA effects
 *
 * Run: node updateDescriptions.js
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

// Map of effect name -> definition. Keys are matched case- and accent-insensitively.
const DESCRIPTIONS = {
  // Meetstandaard Social Impact v1.0 (PDF)
  "Mentale gezondheid":
    "Mentale gezondheid is het vermogen van een individu om emotioneel, psychologisch en sociaal welzijn te behouden. Het omvat hoe iemand denkt, voelt en zich gedraagt, evenals hoe iemand omgaat met stress, relaties en dagelijkse uitdagingen.",
  "Fysieke gezondheid":
    "Fysieke gezondheid is de staat van het lichaam, waarbij aspecten zoals de afwezigheid van ziekten, de werking van organen, het immuunsysteem, en het algemene fitheidsniveau worden meegenomen. Dit omvat ook kracht, flexibiliteit, en uithoudingsvermogen.",
  "Gezonde leefstijl":
    "Een gezonde leefstijl omvat regelmatige lichaamsbeweging, niet roken, matig alcoholgebruik, gezonde voeding, en voldoende ontspanning. Het gaat om het bevorderen van gewoonten die bijdragen aan een langere en gezondere levensduur.",
  "Veerkracht":
    "Veerkracht, ook wel weerbaarheid genoemd, is het vermogen om te herstellen van tegenslagen, stress of moeilijke situaties. Het omvat de mentale en emotionele kracht om door te gaan, aan te passen en te groeien in het gezicht van uitdagingen en veranderingen.",
  "Dagelijks functioneren":
    "Dagelijks functioneren verwijst naar het vermogen van een individu om dagelijkse activiteiten uit te voeren die essentieel zijn voor zelfredzaamheid, zoals persoonlijke verzorging, huishoudelijke taken, en het beheren van tijd en middelen. Dit omvat ook de capaciteit om te werken of vrijwilligerswerk te doen.",
  "Zingeving":
    "Zingeving is het streven naar en het vinden van betekenis in het leven. Het omvat het ervaren dat wat we doen van waarde is en bijdraagt aan een groter doel of persoonlijke voldoening.",
  "Sociale contacten":
    "Sociale contacten verwijzen naar de relaties en interacties die een persoon heeft met familie, vrienden, buren, en andere mensen in hun omgeving. Goede sociale contacten zijn belangrijk voor emotionele steun, een gevoel van verbondenheid en algemeen welzijn.",
  "Sociale cohesie":
    "Sociale cohesie gaat over naar de mate waarin (groepen) mensen zich met elkaar verbonden voelen, en naar het gedrag dat hieraan invulling geeft.",
  "Integratie (nieuwkomers)":
    "Integratie verwijst naar het proces waarbij nieuwkomers zich aanpassen en opgenomen worden in een nieuwe samenleving. Dit omvat het leren van de taal, het vinden van werk, en het opbouwen van sociale relaties.",
  "Zelfvertrouwen":
    "Zelfvertrouwen is de mate waarin men vertrouwen heeft in het eigen kunnen. Een grote zelfverzekerdheid of zelfzekerheid betekent dat dit een sterk vertrouwen is.",
  "Zelf-effectiviteit":
    "Zelf-effectiviteit betekent vertrouwen hebben dat je acties verantwoordelijk zijn voor succesvolle uitkomsten, oftewel dat men controle heeft over uitdagende eisen die de omgeving stelt.",
  "Empowerment":
    "Empowerment is het proces waarin individuen meer controle krijgen over hun eigen leven. Dit omvat het vermogen om zelfstandig beslissingen te nemen, actie te ondernemen en op te komen voor hun rechten.",
  "Persoonlijke ontwikkeling":
    "Persoonlijke ontwikkeling is het proces van zelfverbetering en groei, waarbij individuen hun talenten en vaardigheden ontdekken, ontwikkelen en toepassen om hun persoonlijke en professionele doelen te bereiken.",
  "Zelfbewustzijn":
    "Zelfbewustzijn is het vermogen om jezelf te begrijpen en te reflecteren op je eigen gedachten, emoties, en gedragingen. Het omvat inzicht in je eigen sterke punten, zwakke punten, waarden en doelen.",
  "Sociale vaardigheden":
    "Sociale vaardigheden zijn de vaardigheden die nodig zijn om effectief en bevredigend met anderen te communiceren en relaties te onderhouden. Dit omvat luisteren, empathie, samenwerken en conflictoplossing.",
  "Sociaal emotionele vaardigheden":
    "Sociaal emotionele vaardigheden zijn de vaardigheden die nodig zijn om effectief en bevredigend met anderen te communiceren en relaties te onderhouden. Dit omvat luisteren, empathie, samenwerken en conflictoplossing.",
  "Arbeidsvaardigheden":
    "Arbeidsvaardigheden zijn de competenties en capaciteiten die een individu nodig heeft om succesvol te zijn in een werkomgeving. Dit omvat technische vaardigheden, communicatieve vaardigheden, teamwork en het vermogen om instructies te volgen en taken efficiënt uit te voeren.",
  "Digitale vaardigheden":
    "Digitale vaardigheden zijn de capaciteiten die een individu nodig heeft om informatie en communicatietechnologieën effectief te gebruiken. Dit omvat het gebruik van internet, computers, en andere digitale middelen voor persoonlijke, educatieve, en professionele doeleinden.",
  "Taalvaardigheid":
    "Taalvaardigheid verwijst naar het vermogen om effectief te communiceren in een bepaalde taal, zowel mondeling als schriftelijk. Dit omvat het begrijpen en produceren van gesproken en geschreven teksten, en het vermogen om gesprekken te voeren, informatie te delen, en meningen te uiten.",
  "Participatieladder":
    "Arbeidsparticipatie verwijst naar de mate waarin individuen deelnemen aan betaalde of onbetaalde arbeid, zoals (vrijwilligers)werk of stages. Het geeft aan hoe actief iemand is in de arbeidsmarkt en in welke mate men bijdraagt aan economische activiteiten.",
  "Werkgeluk":
    "Werkgeluk is de tevredenheid en het plezier dat een individu ervaart in zijn of haar werk. Het omvat gevoelens van voldoening, waardering, en de mate waarin het werk aansluit bij persoonlijke waarden en doelen.",
  "Financiële gezondheid":
    "Financiële gezondheid is de staat waarin een persoon voldoende financiële middelen heeft om in hun basisbehoeften te voorzien, financiële verplichtingen na te komen, en een zekere mate van financiële zekerheid te ervaren. Het omvat ook de kennis en vaardigheden om financiële beslissingen te nemen.",

  // Meetstandaard Gelijke Kansen (XLSX) — extra effects not in the v1.0 PDF
  "Ervaren discriminatie en racisme":
    "Ervaren discriminatie en racisme verwijzen naar de mate waarin mensen het gevoel hebben ongelijk, oneerlijk of respectloos behandeld te worden op basis van persoonlijke kenmerken, zoals afkomst, huidskleur, religie, geslacht, seksuele oriëntatie of andere identiteitskenmerken. Het gaat hierbij om de subjectieve ervaring van de persoon zelf, ongeacht of de discriminatie objectief vast te stellen is.",
  "Opvoedvaardigheden":
    "De mate waarin ouders/verzorgers in het dagelijks leven effectief en positief opvoedgedrag laten zien dat bijdraagt aan het welzijn en gedrag van hun kind.",
  "Ontwikkelingsondersteunend vermogen":
    "De mate waarin ouders/verzorgers actief bijdragen aan het leren, de ontwikkeling en talentontwikkeling van hun kind in het dagelijks leven.",
  "Ouderbetrokkenheid":
    "De mate waarin ouders/verzorgers actief contact hebben met school of interventie en deelnemen aan activiteiten rondom de ontwikkeling van hun kind.",
  "Sociale veiligheid (in de opvoeding)":
    "De mate waarin ouders/verzorgers zorgen voor een voorspelbare, respectvolle en veilige opvoedomgeving waarin het kind zich gezien en gehoord voelt.",
  "Sociale cohesie, verbondenheid en steun":
    "De mate waarin ouders/verzorgers actief gebruikmaken van hun opvoednetwerk (ouders, school, professionals, wijk) voor steun, informatie en samenwerking.",
  "Binding met school":
    "De subjectieve, gevoelsmatige band met school. Van lage binding is sprake bij een lage mate van toewijding, weinig inzet, weinig motivatie en weinig gevoel van binding met (personen van) school. Van hoge binding is sprake bij een hoge mate van toewijding, veel inzet, veel motivatie, een gevoel van binding met (personen op) school, het gevoel dat je inspraak hebt op wat er gebeurt op school (studenten kunnen zichzelf bijvoorbeeld uitspreken over regels) en/of het leuk vinden om naar school te gaan/te studeren.",
  "Kwaliteit van docenten":
    "De mate waarin docenten informatie begrijpelijk naar leerlingen kunnen communiceren en deze communicatie kunnen aanpassen aan het gedrag van de leerling.",
  "Kwaliteit van onderwijsaanbod":
    "Onderwijs die de ontwikkeling van individuele kinderen stimuleert over alle ontwikkelingsdomeinen en daarbij gebaseerd zijn op theorieën en literatuur (differentiatie bevorderend).",
  "Klas- en schoolklimaat":
    "De sfeer en omgeving van het klaslokaal opgedeeld in drie dimensies: instructionele ondersteuning, sociaalemotionele ondersteuning en organisatie/management. De kwaliteit en het karakter van het leven op school.",
};

// Aliases — alternative names that map to a key in DESCRIPTIONS.
const ALIASES = {
  "Gezondheid fysiek": "Fysieke gezondheid",
  "Sociaal-emotionele vaardigheid": "Sociaal emotionele vaardigheden",
  "Sociaal-emotionele vaardigheden": "Sociaal emotionele vaardigheden",
  "Sociale contacten, sociale cohesie, sochale verbondenheid": "Sociale contacten",
  "Sociale contacten, sociale cohesie, sociale verbondenheid": "Sociale contacten",
};

const lookup = new Map();
for (const [name, desc] of Object.entries(DESCRIPTIONS)) {
  lookup.set(normalize(name), desc);
}
for (const [alias, target] of Object.entries(ALIASES)) {
  const desc = DESCRIPTIONS[target];
  if (desc) lookup.set(normalize(alias), desc);
}

const run = async () => {
  const snapshot = await firestore.collection("effects").get();

  let matched = 0;
  let skipped = 0;
  const unmatched = [];

  const batch = firestore.batch();

  snapshot.forEach((d) => {
    const data = d.data();
    const key = normalize(data.name);
    const desc = lookup.get(key);

    if (!desc) {
      unmatched.push(data.name);
      skipped += 1;
      return;
    }

    if (data.description === desc) {
      skipped += 1;
      return;
    }

    batch.update(d.ref, { description: desc });
    matched += 1;
  });

  if (matched > 0) {
    await batch.commit();
  }

  console.log(`Updated ${matched} effect(s). Skipped ${skipped}.`);
  if (unmatched.length > 0) {
    console.log("No description found for:");
    for (const name of unmatched) console.log(`  - ${name}`);
  }
};

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
