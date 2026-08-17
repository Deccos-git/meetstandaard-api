# Migratie: arbeidsparticipatie en gelijke kansen naar het versioned pipeline

Energiearmoede loopt via workbook → generator → versioned document → API. Arbeidsparticipatie (0.9) en gelijke kansen (1.0) niet: die staan nog als losse records in de gedeelde `effects`-collectie. Dit is wat er nodig is om ze gelijk te trekken.

## Waarom dit nu speelt

Het adminpanel is alleen-lezen geworden. Daarmee is er op dit moment **geen manier om arbeidsparticipatie en gelijke kansen te wijzigen** — de CRUD die dat deed is verwijderd (zie git, commit "restructure the panel"). Dat is bewust: bewerken hoort thuis in het authoring-formaat, niet in een formulier bovenop de productiedatabase. Maar tot de migratie klaar is, liggen beide standaarden vast.

## Waar ze nu staan

| | Arbeidsparticipatie | Gelijke kansen |
|---|---|---|
| Versie | 0.9 | 1.0 |
| Effecten | 21 | 10 |
| Bron | `effects` waar `sectors` de sector bevat | idem |
| Stellingen | `questions` via `effectId` | idem |
| Monetarisering | `scores[]` op het effect (score, situation, monetaryValue, onderbouwing) | idem |
| Versionering | geen — het versienummer staat in `src/standaarden.js`, niet in de data | idem |

Twee dingen om te onthouden:

- **Categorieën zijn gedeeld.** "Gezondheid en Welzijn" en "Sociaal en maatschappelijk" bevatten effecten uit beide sectoren. De scheiding loopt via `sectors` op het effect, nooit via de categorie.
- **Monetarisering is grotendeels leeg.** 5 van 21 arbeidsparticipatie-effecten en 2 van 10 gelijke-kansen-effecten hebben `scores`. De rest toont "Nog niet gemonetariseerd".

## Wat er verschilt met energiearmoede

De huidige data is armer dan wat het gepubliceerde formaat aankan. Per effect ontbreekt:

- `stellingen` met `bron`, `richting` en `negatiefGeformuleerd` — nu is een vraag alleen een naam, dus omgepoolde items zijn niet te herkennen. Dat is de gevaarlijkste ontbrekende kolom: zonder die vlag draait een score om.
- `situatieschetsen` per niveau met label en bron.
- `proxies` per niveau: stakeholder, bedrag, berekening, aannames, aannamescore, overlapgroep. Nu is er alleen één `monetaryValue` en een vrij tekstveld `onderbouwing`.
- `bronnen`, `parameters`, `aggregatie`, `gevoeligheid`, `audit` op documentniveau.

Zonder `overlapgroep` kan er niet over effecten heen geaggregeerd worden zonder dubbeltelling, en zonder `proxies` is er geen onderbouwing om te tonen.

## Stappen

1. **Workbook per standaard.** Zelfde 10 tabbladen als `meetstandaard.xlsx`. Vul de bestaande inhoud in als vertrekpunt: effect, definitie, categorie, stellingen (uit `questions`), en waar aanwezig de score-situaties en bedragen (uit `scores`).
2. **Generator hergebruiken.** `tools/build-meetstandaard.py` is niet sectorspecifiek; alleen `SECTOR_LABELS` moet uitgebreid. Draai met `--sector arbeidsparticipatie --version 0.9`.
3. **Ontbrekende velden aanvullen** in het workbook — met name `negatief_geformuleerd` per stelling en `overlapgroep` per proxy. De generator markeert wat niet parseert in het `controle`-blok, dus onvolledigheid wordt zichtbaar in plaats van stil.
4. **Registreren en seeden.** Voeg een entry toe aan `SECTOREN` in `functions/meetstandaard.js` en draai `node seedMeetstandaard.js`. Vanaf dat moment serveert de API `/api/v1/meetstandaard/arbeidsparticipatie`.
5. **Panel omzetten.** In `src/standaarden.js` wordt `source: 'effects'` dan `source: 'published'` met een `collection`, en het hardgecodeerde `version` verdwijnt — de dropdown leest de versies dan uit Firestore, net als bij de andere twee.
6. **Oude data opruimen** (pas hierna). De `effects`/`questions`/`categories`-collecties worden dan alleen nog gebruikt door het `database`-endpoint. Controleer eerst wie dat endpoint consumeert voordat er iets weg gaat.

## Wat dit oplost

Naast het terugkrijgen van bewerken:

- **Cross-sector wordt berekenbaar.** Een effect is alleen cross-sector als de stellingen exact gelijk zijn (zie de rule in `docs/`). Zodra beide standaarden hun stellingen in het gepubliceerde formaat hebben, is dat af te leiden uit de documenten in plaats van uit de `effects`-collectie met verouderde formuleringen.
- **Versies worden echt.** Nu bestaan 0.9 en 1.0 alleen als label in de frontend. Na de migratie zijn het documenten die blijven bestaan, zodat een meting van vandaag over vijf jaar nog uit te leggen is.

## Volgorde

Arbeidsparticipatie eerst — daar ligt al een nieuwe versie klaar (nog niet publiek op het moment van schrijven, 2026-08-17), dus die kan direct als workbook worden opgezet in plaats van dat 0.9 eerst wordt overgezet en daarna meteen vervangen.
