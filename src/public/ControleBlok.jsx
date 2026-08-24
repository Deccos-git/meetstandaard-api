// Every generated document carries a `controle` block: what could not be
// parsed, what was derived or normalised rather than read, and what the source
// contradicts.
//
// It is shown rather than hidden on purpose. A standaard that publishes only
// its clean figures asks to be trusted; one that publishes what it had to do to
// get them can be checked. That is what this project is for (ADR-005).
// Every key any published document actually emits. An unknown key still renders
// — under its raw name — rather than being dropped, because silently hiding a
// block a new generator introduces is the one failure this section cannot have.
const LABELS = {
  afgeleideRichting: 'Stellingen waarvan de richting is afgeleid, niet vastgelegd',
  nietGemonetariseerd: 'Niveaus die niet in geld zijn uitgedrukt',
  zonderMonetarisering: 'Effecten die nog niet gemonetariseerd zijn',
  zonderOnderbouwing: 'Niveaus zonder onderbouwing',
  zonderKengetal: 'Interventies zonder bruikbaar kengetal',
  somAfwijkingen: 'Niveaus waarvan het totaal afwijkt van de som van de proxies',
  nietGeverifieerdeAannames: 'Aannames die nog niet extern zijn geverifieerd',
  statusGenormaliseerd: 'Statuswaarden die zijn gelijkgetrokken',
  metBestendigingsfactor: 'Interventies waarop een bestendigingsfactor is toegepast',
  ontbrekendeVelden: 'Velden die in deze standaard niet bestaan',
};

const ControleBlok = ({ controle }) => {
  if (!controle) return null;

  const lijsten = Object.entries(controle).filter(
    ([, waarde]) => Array.isArray(waarde) && waarde.length > 0
  );
  if (lijsten.length === 0) return null;

  return (
    <section style={{ marginTop: 48 }}>
      <p className="publiek-eyebrow">Controle</p>
      <h2>Wat deze versie zelf meldt</h2>
      <p className="publiek-smal publiek-notitie">
        Gaten, afleidingen en bewerkingen die deze versie zelf rapporteert. Dit hoort bij de
        standaard, niet ernaast: een cijfer dat je niet kunt navertellen is minder waard dan een gat
        dat je kunt zien.
      </p>

      {lijsten.map(([sleutel, waarden]) => (
        <details className="publiek-effect" key={sleutel}>
          <summary>
            {LABELS[sleutel] || sleutel}
            <span className="publiek-badge">{waarden.length}</span>
          </summary>
          <div className="publiek-effect-body">
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {waarden.map((w, i) => (
                <li key={i} style={{ fontSize: 15, marginBottom: 4 }}>
                  {typeof w === 'string' ? w : JSON.stringify(w)}
                </li>
              ))}
            </ul>
          </div>
        </details>
      ))}
    </section>
  );
};

export default ControleBlok;
