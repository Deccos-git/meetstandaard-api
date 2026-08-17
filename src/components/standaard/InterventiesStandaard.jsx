import { useMemo, useState } from 'react';
import { euro } from '../../standaarden';
import { badge, note, tableStyle, tableWrap, td, tdNum, th } from './SharedStyles';

// Read-only view of an interventiebibliotheek. Unlike the effect-based
// standaarden this is a catalogue you scan and compare, so it renders as a table
// per domein rather than a list-and-detail pane: with 95 interventies the point
// is seeing them side by side. Detail opens inline on the row you care about.

// The workbook's own confidence vocabulary, worth colouring: much of this
// library is explicitly provisional and that should be visible at a glance.
const bewijsColor = value =>
  ({ Hoog: '#e6f7ea', 'Middel-Hoog': '#eef7e6', Middel: '#fff6e0', 'Laag-Middel': '#fdeee0', Laag: '#ffe6e6' }[value] ||
  '#f4f4f4');

const number = n => (typeof n === 'number' ? n.toLocaleString('nl-NL') : null);

const InterventiesStandaard = ({ doc }) => {
  const [domein, setDomein] = useState(doc.domeinen[0]);
  const [open, setOpen] = useState(null);

  const interventies = useMemo(
    () => doc.interventies.filter(i => i.domein === domein),
    [doc, domein]
  );

  // Only the Klimaat & Energie rows carry per-year consumption, so the two
  // year columns would be entirely empty for the other domeinen.
  const showsJaarcijfers = interventies.some(i => i.berekend.co2eKgPerJaar !== null);

  return (
    <div>
      {doc.meta.toelichting && <p style={{ ...note, maxWidth: 900 }}>{doc.meta.toelichting}</p>}

      <div className="tab-container">
        {doc.domeinen.map(d => (
          <div key={d} className={domein === d ? 'active' : 'tablinks'} onClick={() => setDomein(d)}>
            <p>
              {d} <span style={{ opacity: 0.7 }}>({doc.interventies.filter(i => i.domein === d).length})</span>
            </p>
          </div>
        ))}
      </div>

      <div style={tableWrap}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={th}>Interventie</th>
              <th style={th}>Eenheid</th>
              {showsJaarcijfers ? (
                <>
                  <th style={{ ...th, textAlign: 'right' }}>Besparing / jaar</th>
                  <th style={{ ...th, textAlign: 'right' }}>CO₂e / jaar</th>
                </>
              ) : (
                <>
                  <th style={{ ...th, textAlign: 'right' }}>CO₂e / eenheid</th>
                  <th style={{ ...th, textAlign: 'right' }}>Monetair CO₂</th>
                </>
              )}
              <th style={th}>Bewijs</th>
              <th style={th}>Status kengetal</th>
            </tr>
          </thead>
          <tbody>
            {interventies.map(i => {
              const isOpen = open === i.slug;
              return [
                <tr
                  key={i.slug}
                  onClick={() => setOpen(isOpen ? null : i.slug)}
                  style={{ cursor: 'pointer', background: isOpen ? '#fdf1dc' : undefined }}
                >
                  <td style={td}>
                    {i.interventie}
                    <span style={{ ...note, display: 'block', marginTop: 2 }}>
                      {i.activiteitstype}
                      {i.code && ` · ${i.code}`}
                    </span>
                  </td>
                  <td style={td}>{i.eenheid}</td>
                  {showsJaarcijfers ? (
                    <>
                      <td style={tdNum}>{i.berekend.besparingEurPerJaar !== null ? euro(i.berekend.besparingEurPerJaar) : '—'}</td>
                      <td style={tdNum}>
                        {i.berekend.co2eKgPerJaar !== null ? `${number(i.berekend.co2eKgPerJaar)} kg` : '—'}
                      </td>
                    </>
                  ) : (
                    <>
                      {/* A missing kengetal is a real state here ("geen
                          kengetallen verzinnen"), so show why rather than 0. */}
                      <td style={tdNum}>
                        {i.kengetallen.co2ePerEenheid !== null ? (
                          `${number(i.kengetallen.co2ePerEenheid)} kg`
                        ) : (
                          <span style={{ color: '#777' }} title={i.kengetallen.co2ePerEenheidTekst || ''}>
                            —
                          </span>
                        )}
                      </td>
                      <td style={tdNum}>
                        {i.berekend.monetairCo2EurPerEenheid !== null ? euro(i.berekend.monetairCo2EurPerEenheid) : '—'}
                      </td>
                    </>
                  )}
                  <td style={td}>
                    <span style={{ ...badge, marginLeft: 0, background: bewijsColor(i.bewijssterkte) }}>
                      {i.bewijssterkte}
                    </span>
                  </td>
                  <td style={{ ...td, fontSize: 13, color: '#555' }}>{i.statusKengetal}</td>
                </tr>,

                isOpen && (
                  <tr key={`${i.slug}-detail`}>
                    <td style={{ ...td, background: '#fffaf2' }} colSpan={6}>
                      <dl style={{ margin: 0, maxWidth: 1000 }}>
                        {[
                          ['Primaire effecten', i.primaireEffecten],
                          ['Rekenmodel', i.rekenmodel],
                          ['Monetarisatiebron', i.monetarisatiebron],
                          ['Onderbouwing', i.onderbouwing],
                          ['Afbakening / overlap', i.afbakening],
                          ['Niet-CO₂ monetair (laag C)', i.nietCo2Monetair],
                          ['Wikipagina', i.wikipagina],
                        ]
                          .filter(([, v]) => v)
                          .map(([label, value]) => (
                            <div key={label} style={{ marginBottom: 6 }}>
                              <dt style={{ ...note, fontWeight: 600, margin: 0 }}>{label}</dt>
                              <dd style={{ margin: '2px 0 0' }}>{value}</dd>
                            </div>
                          ))}
                      </dl>
                    </td>
                  </tr>
                ),
              ];
            })}
          </tbody>
        </table>
      </div>

      <h3>Aannames</h3>
      <p style={note}>
        Laag B: de centrale prijzen en emissiefactoren waarmee de cijfers hierboven zijn berekend. Eén
        wijziging hier werkt door in alle interventies.
      </p>
      <div style={tableWrap}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={th}>Parameter</th>
              <th style={{ ...th, textAlign: 'right' }}>Waarde</th>
              <th style={th}>Eenheid</th>
              <th style={th}>Bron / status</th>
            </tr>
          </thead>
          <tbody>
            {doc.aannames.map(a => (
              <tr key={a.id}>
                <td style={td}>{a.parameter}</td>
                <td style={tdNum}>{number(a.waarde)}</td>
                <td style={td}>{a.eenheid}</td>
                <td style={{ ...td, fontSize: 13, color: a.geverifieerd ? '#555' : '#a15c00' }}>{a.bron}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Bronnen</h3>
      <div style={tableWrap}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={th}>Bron</th>
              <th style={th}>Domein</th>
              <th style={th}>Laag</th>
              <th style={th}>Toegang</th>
            </tr>
          </thead>
          <tbody>
            {doc.bronnen.map(b => (
              <tr key={b.id}>
                <td style={td}>{b.bron}</td>
                <td style={td}>{b.domein}</td>
                <td style={td}>{b.laag}</td>
                <td style={td}>{b.toegang}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default InterventiesStandaard;
