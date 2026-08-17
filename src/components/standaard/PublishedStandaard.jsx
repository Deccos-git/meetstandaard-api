import { useEffect, useMemo, useState } from 'react';
import { euro } from '../../standaarden';
import {
  badge, detailColumn, listColumn, listItem, note, splitLayout, subNote,
  tableStyle, tableWrap, td, tdNum, th,
} from './SharedStyles';

// Read-only view of a published sector meetstandaard (e.g. Energiearmoede 0.9).
// A published version is immutable: it is generated from the authoring
// workbook, seeded via the Admin SDK, and the Firestore rules deny client
// writes to it. Corrections ship as a new version, never as an edit here.
const PublishedStandaard = ({ doc }) => {
  const [effectId, setEffectId] = useState(null);

  const categorieen = useMemo(
    () => [...new Set(doc.effecten.map(e => e.categorie).filter(Boolean))],
    [doc]
  );

  useEffect(() => {
    if (!doc.effecten.some(e => e.id === effectId)) setEffectId(doc.effecten[0]?.id ?? null);
  }, [doc, effectId]);

  const effect = doc.effecten.find(e => e.id === effectId);

  // situatieschetsen and monetarisering are separate lists keyed on `niveau`;
  // join them so each level reads as one block. Not every effect has a schets
  // for every level (EFF-01 has none for level 1), so tolerate a missing side.
  const niveaus = effect
    ? effect.monetarisering.niveaus.map(n => ({
        ...n,
        schets: effect.situatieschetsen.find(s => s.niveau === n.niveau) || null,
      }))
    : [];

  return (
    <div>
      {doc.meta.toelichting && <p style={{ ...note, maxWidth: 900 }}>{doc.meta.toelichting}</p>}

      <div className="table-container">
        <div style={splitLayout}>
          <ul style={listColumn}>
            {categorieen.map(c => (
              <li key={c}>
                <p style={{ ...note, fontWeight: 600, margin: '12px 0 4px' }}>{c}</p>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {doc.effecten
                    .filter(e => e.categorie === c)
                    .map(e => (
                      <li key={e.id} onClick={() => setEffectId(e.id)} style={listItem(e.id === effectId)}>
                        {e.effect}
                        <span style={{ ...subNote, marginTop: 2 }}>{e.id}</span>
                      </li>
                    ))}
                </ul>
              </li>
            ))}
          </ul>

          <div style={detailColumn}>
            {effect && (
              <>
                <h3 style={{ marginTop: 0 }}>
                  {effect.effect}
                  <span style={badge}>{effect.id}</span>
                  {effect.monetariseerbaarheid && (
                    <span style={badge}>monetariseerbaar: {effect.monetariseerbaarheid}</span>
                  )}
                </h3>
                {effect.definitie && <p style={{ maxWidth: 900 }}>{effect.definitie}</p>}
                {effect.bronDefinitie && <p style={note}>Bron definitie: {effect.bronDefinitie}</p>}

                {effect.stellingen.length > 0 && (
                  <>
                    <h4>Stellingen</h4>
                    <div style={tableWrap}>
                      <table style={tableStyle}>
                        <thead>
                          <tr>
                            <th style={th}>#</th>
                            <th style={th}>Stelling</th>
                            <th style={th}>Richting</th>
                            <th style={th}>Bron</th>
                          </tr>
                        </thead>
                        <tbody>
                          {effect.stellingen.map(s => (
                            <tr key={s.nummer}>
                              <td style={td}>{s.nummer}</td>
                              <td style={td}>
                                {s.stelling}
                                {/* Reverse-coded items must be flipped before averaging,
                                    so make that impossible to miss. */}
                                {s.negatiefGeformuleerd && (
                                  <span style={{ ...badge, background: '#ffe6e6' }}>omscoren (1↔5)</span>
                                )}
                              </td>
                              <td style={td}>{s.richting}</td>
                              <td style={{ ...td, fontSize: 12, color: '#555' }}>{s.bron}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                <h4>Niveaus en monetarisering</h4>
                <p style={note}>{effect.monetarisering.eenheid}</p>
                {niveaus.map(n => (
                  <div key={n.niveau} style={{ ...tableWrap, padding: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                      <strong>Niveau {n.niveau}</strong>
                      {n.schets?.label && <span style={badge}>{n.schets.label}</span>}
                      <span
                        style={{
                          ...badge,
                          background: n.totaleWaardeIndicatief < 0 ? '#ffe6e6' : '#e6f7ea',
                        }}
                      >
                        {euro(n.totaleWaardeIndicatief)} per jaar
                      </span>
                    </div>
                    {n.schets?.situatieschets && (
                      <p style={{ maxWidth: 900, marginBottom: 8 }}>{n.schets.situatieschets}</p>
                    )}

                    {n.proxies.length > 0 && (
                      <table style={tableStyle}>
                        <thead>
                          <tr>
                            <th style={th}>Stakeholder</th>
                            <th style={th}>Proxy</th>
                            <th style={th}>Bedrag</th>
                            <th style={th}>Berekening</th>
                            <th style={th}>Aannames</th>
                            <th style={th}>Zekerheid</th>
                            <th style={th}>Overlapgroep</th>
                          </tr>
                        </thead>
                        <tbody>
                          {n.proxies.map((p, i) => (
                            <tr key={i}>
                              <td style={td}>{p.stakeholder}</td>
                              <td style={td}>
                                {p.proxy}
                                <span style={{ ...subNote, marginTop: 2 }}>{p.bronBedrag}</span>
                              </td>
                              {/* bedrag is null when the source is not a single
                                  amount (PM, n.v.t., a percentage range) — show
                                  the verbatim text rather than invent a number. */}
                              <td style={tdNum}>
                                {p.bedrag === null ? (
                                  <span title={p.eenheid} style={{ color: '#777' }}>
                                    {p.bedragTekst}
                                  </span>
                                ) : (
                                  euro(p.bedrag)
                                )}
                              </td>
                              <td style={td}>{p.berekening}</td>
                              <td style={td}>{p.aannames}</td>
                              <td style={tdNum}>{p.aannamescore != null ? `${p.aannamescore}/10` : ''}</td>
                              <td style={td}>{p.overlapgroep}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                ))}

                {/* Summing proxies across effects double-counts without this. */}
                <p style={note}>
                  Let op: tel proxybedragen niet zonder meer op over effecten heen — pas eerst de
                  overlapcorrectie toe (zie <code>aggregatie</code> in de API).
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PublishedStandaard;
