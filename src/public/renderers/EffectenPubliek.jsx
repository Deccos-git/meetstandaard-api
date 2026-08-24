import { useMemo, useState } from 'react';
import { euro } from '../../standaarden';

// An effect-based meetstandaard for the people who will use it: practitioners
// deciding what to measure, financiers deciding what to believe.
//
// So no internal identifiers, and every amount shows the source it rests on —
// that is the question this audience actually has.
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
          placeholder="Zoek een effect of vraag"
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
        {niveaus.length === 0 && <span className="publiek-badge">nog geen bedragen</span>}
      </summary>

      <div className="publiek-effect-body">
        {effect.definitie && <p className="publiek-smal">{effect.definitie}</p>}

        {effect.stellingen.length > 0 && (
          <>
            <h4>Wat je vraagt</h4>
            <div className="publiek-tabelwrap">
              <table className="publiek-tabel">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Vraag</th>
                  </tr>
                </thead>
                <tbody>
                  {effect.stellingen.map(s => (
                    <tr key={s.nummer}>
                      <td>{s.nummer}</td>
                      <td>
                        {s.stelling}
                        {/* A negatively phrased question scores the other way
                            round. Whoever fills in the answers needs to know
                            that; it is not a technical detail. */}
                        {s.negatiefGeformuleerd && (
                          <span className="publiek-badge publiek-badge-let-op" style={{ marginLeft: 8 }}>
                            eens = ongunstig
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
            <h4>Wat een score maatschappelijk waard is</h4>

            {niveaus.map(n => (
              <div className="publiek-niveau" key={n.niveau}>
                <div className="publiek-niveau-kop">
                  <strong>Score {n.niveau}</strong>
                  {n.schets?.label && <span className="publiek-badge">{n.schets.label}</span>}
                  <span className="publiek-badge">
                    {n.totaleWaardeIndicatief === null
                      ? 'nog geen bedrag'
                      : `${euro(n.totaleWaardeIndicatief)} per jaar`}
                  </span>
                </div>
                {n.schets?.situatieschets && <p style={{ fontSize: 16 }}>{n.schets.situatieschets}</p>}

                {n.proxies?.length > 0 && (
                  <div className="publiek-tabelwrap">
                    <table className="publiek-tabel">
                      <thead>
                        <tr>
                          <th>Voor wie</th>
                          <th>Waar het bedrag over gaat</th>
                          <th className="num">Bedrag per jaar</th>
                          <th>Berekening</th>
                          <th>Bron</th>
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
                            <td>
                              {p.berekening}
                              {p.aannames && <div className="publiek-notitie">{p.aannames}</div>}
                            </td>
                            {/* The source of the amount and the evidence that
                                the effect leads to it are two different claims,
                                and both belong next to the figure. */}
                            <td className="publiek-notitie">
                              {p.bronBedrag}
                              {p.bronEffectProxyRelatie && (
                                <div style={{ marginTop: 4 }}>
                                  Onderbouwing: {p.bronEffectProxyRelatie}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {n.onderbouwing && <p className="publiek-notitie">Onderbouwing: {n.onderbouwing}</p>}
              </div>
            ))}
          </>
        )}
      </div>
    </details>
  );
};

export default EffectenPubliek;
