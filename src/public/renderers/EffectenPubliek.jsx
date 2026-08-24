import { useMemo, useState } from 'react';
import { euro } from '../../standaarden';

// An effect-based meetstandaard, grouped by categorie and expandable per effect.
// Unlike the panel's master/detail pane this opens inline: a visitor scans the
// whole standaard first and only then goes into one effect.
const EffectenPubliek = ({ doc }) => {
  const [zoek, setZoek] = useState('');

  const gefilterd = useMemo(() => {
    const term = zoek.trim().toLowerCase();
    if (!term) return doc.effecten;
    return doc.effecten.filter(
      e =>
        e.effect.toLowerCase().includes(term) ||
        (e.definitie || '').toLowerCase().includes(term) ||
        e.stellingen.some(s => s.stelling.toLowerCase().includes(term))
    );
  }, [doc, zoek]);

  const categorieen = useMemo(
    () => [...new Set(gefilterd.map(e => e.categorie).filter(Boolean))],
    [gefilterd]
  );

  return (
    <>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginBottom: 22 }}>
        <input
          className="publiek-zoek"
          type="search"
          placeholder="Zoek in effecten en stellingen"
          value={zoek}
          onChange={e => setZoek(e.target.value)}
        />
        <span className="publiek-notitie">
          {gefilterd.length} van {doc.effecten.length} effecten
        </span>
      </div>

      {categorieen.map(categorie => (
        <section key={categorie} style={{ marginBottom: 34 }}>
          <p className="publiek-eyebrow">{categorie}</p>

          {gefilterd
            .filter(e => e.categorie === categorie)
            .map(effect => (
              <Effect key={effect.id} effect={effect} />
            ))}
        </section>
      ))}

      {gefilterd.length === 0 && <p>Geen effect gevonden voor “{zoek}”.</p>}
    </>
  );
};

const Effect = ({ effect }) => {
  const niveaus = effect.monetarisering.niveaus.map(n => ({
    ...n,
    schets: (effect.situatieschetsen || []).find(s => s.niveau === n.niveau) || null,
  }));

  return (
    <details className="publiek-effect">
      <summary>
        {effect.effect}
        <span className="publiek-badge">{effect.id}</span>
        {niveaus.length === 0 && <span className="publiek-badge">nog niet gemonetariseerd</span>}
      </summary>

      <div className="publiek-effect-body">
        {effect.definitie && <p className="publiek-smal">{effect.definitie}</p>}
        {effect.bronDefinitie && (
          <p className="publiek-notitie">Bron definitie: {effect.bronDefinitie}</p>
        )}

        {effect.stellingen.length > 0 && (
          <>
            <h4>Stellingen</h4>
            <div className="publiek-tabelwrap">
              <table className="publiek-tabel">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Stelling</th>
                    <th>Richting</th>
                  </tr>
                </thead>
                <tbody>
                  {effect.stellingen.map(s => (
                    <tr key={s.nummer}>
                      <td>{s.nummer}</td>
                      <td>
                        {s.stelling}
                        {/* A reverse-coded item has to be flipped before it is
                            averaged, so this cannot be a footnote. */}
                        {s.negatiefGeformuleerd && (
                          <span className="publiek-badge publiek-badge-let-op" style={{ marginLeft: 8 }}>
                            omscoren 1↔5
                          </span>
                        )}
                      </td>
                      <td>
                        {s.richting}
                        {/* Derived rather than recorded: see ADR-008. Showing it
                            is the whole reason the field exists. */}
                        {s.herkomstRichting === 'afgeleid' && (
                          <span
                            className="publiek-badge publiek-badge-afgeleid"
                            style={{ marginLeft: 8 }}
                            title="Niet vastgelegd in de bron; afgeleid uit de conventie dat alleen omgepoolde stellingen zijn gemarkeerd."
                          >
                            afgeleid
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {niveaus.length > 0 && (
          <>
            <h4>Niveaus en maatschappelijke waarde</h4>
            {effect.monetarisering.eenheid && (
              <p className="publiek-notitie">{effect.monetarisering.eenheid}</p>
            )}

            {niveaus.map(n => (
              <div className="publiek-niveau" key={n.niveau}>
                <div className="publiek-niveau-kop">
                  <strong>Niveau {n.niveau}</strong>
                  {n.schets?.label && <span className="publiek-badge">{n.schets.label}</span>}
                  {/* null is a real state — an unvalued level must not read as
                      "nothing gained". */}
                  <span className="publiek-badge">
                    {n.totaleWaardeIndicatief === null
                      ? 'niet gewaardeerd'
                      : `${euro(n.totaleWaardeIndicatief)} per jaar`}
                  </span>
                </div>
                {n.schets?.situatieschets && <p style={{ fontSize: 16 }}>{n.schets.situatieschets}</p>}

                {n.proxies?.length > 0 && (
                  <div className="publiek-tabelwrap">
                    <table className="publiek-tabel">
                      <thead>
                        <tr>
                          <th>Stakeholder</th>
                          <th>Proxy</th>
                          <th className="num">Bedrag</th>
                          <th>Berekening</th>
                          <th>Overlapgroep</th>
                        </tr>
                      </thead>
                      <tbody>
                        {n.proxies.map((p, i) => (
                          <tr key={i}>
                            <td>{p.stakeholder}</td>
                            <td>{p.proxy}</td>
                            <td className="num">
                              {p.bedrag === null ? (
                                <span className="publiek-notitie">{p.bedragTekst}</span>
                              ) : (
                                euro(p.bedrag)
                              )}
                            </td>
                            <td>{p.berekening}</td>
                            <td>{p.overlapgroep}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}

            <div className="publiek-waarschuwing">
              <p>
                Tel bedragen niet zonder meer op over effecten heen. Zonder de overlapcorrectie uit
                de standaard tel je dezelfde baat meerdere keren mee.
              </p>
            </div>
          </>
        )}
      </div>
    </details>
  );
};

export default EffectenPubliek;
