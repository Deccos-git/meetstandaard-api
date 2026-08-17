import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/config';

// Read-only view of a published sector meetstandaard (e.g. Energiearmoede 0.9).
// Unlike the cross-sector standard on this page, a published version is
// immutable: it is generated from the authoring workbook, seeded via the Admin
// SDK, and the Firestore rules deny client writes to it entirely. So there is
// deliberately no editing here — corrections ship as a new version.

// Numeric-aware compare so "1.10" sorts after "1.2", matching the API.
const compareVersions = (a, b) => {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
};

const euro = n =>
  typeof n === 'number'
    ? n.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 })
    : '';

const th = {
  background: '#eaf1fb',
  textAlign: 'left',
  padding: 8,
  borderBottom: '1px solid #d7e3ff',
  whiteSpace: 'nowrap',
};
const td = { padding: 8, borderBottom: '1px solid #f2f2f2', verticalAlign: 'top' };
const tdNum = { ...td, textAlign: 'right', whiteSpace: 'nowrap' };
const tableWrap = {
  marginTop: 12,
  marginBottom: 24,
  border: '1px solid #eee',
  borderRadius: 8,
  overflowX: 'auto',
};
const tableStyle = { width: '100%', borderCollapse: 'collapse' };
const note = { color: '#555', fontSize: 13, margin: '4px 0 0' };
// Sub-notes sit under their label, so they must be block-level: as a span they
// would run straight onto the end of the preceding text.
const subNote = { ...note, display: 'block' };
const badge = {
  display: 'inline-block',
  padding: '2px 8px',
  borderRadius: 10,
  fontSize: 12,
  background: '#f4f4f4',
  marginLeft: 8,
};

const SectorMeetstandaard = ({ collectionName = 'MeetstandaardEnergiearmoede' }) => {
  const [versions, setVersions] = useState([]);
  const [version, setVersion] = useState(null);
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [effectId, setEffectId] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDocs(collection(db, collectionName));
        if (snap.empty) throw new Error('Geen versies gevonden.');
        const docs = snap.docs.sort((a, b) => compareVersions(a.id, b.id));
        setVersions(docs.map(d => d.id));
        setVersion(docs[docs.length - 1].id);
        setDoc(docs[docs.length - 1].data());
      } catch (e) {
        console.error(e);
        setErr('De meetstandaard ophalen is mislukt.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [collectionName]);

  // Switching version re-reads that document rather than keeping them all in memory:
  // a sector document is ~200 KB.
  const selectVersion = async id => {
    setVersion(id);
    const snap = await getDocs(collection(db, collectionName));
    const found = snap.docs.find(d => d.id === id);
    if (found) setDoc(found.data());
  };

  const categorieen = useMemo(
    () => (doc ? [...new Set(doc.effecten.map(e => e.categorie).filter(Boolean))] : []),
    [doc]
  );

  useEffect(() => {
    if (doc && !doc.effecten.some(e => e.id === effectId)) setEffectId(doc.effecten[0]?.id ?? null);
  }, [doc, effectId]);

  if (loading) return <p>Laden…</p>;
  if (err) return <p style={{ color: 'crimson' }}>{err}</p>;
  if (!doc) return null;

  const effect = doc.effecten.find(e => e.id === effectId);

  // situatieschetsen and monetarisering are separate lists keyed on `niveau`;
  // join them so each level reads as one row. Not every effect has a schets for
  // every level (EFF-01 has none for level 1), so tolerate a missing side.
  const niveaus = effect
    ? effect.monetarisering.niveaus.map(n => ({
        ...n,
        schets: effect.situatieschetsen.find(s => s.niveau === n.niveau) || null,
      }))
    : [];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>{doc.meta.sectorLabel}</h2>
        {versions.length > 1 ? (
          <select value={version} onChange={e => selectVersion(e.target.value)}>
            {versions.map(v => (
              <option key={v} value={v}>
                versie {v}
              </option>
            ))}
          </select>
        ) : (
          <span style={badge}>versie {doc.meta.version}</span>
        )}
        <span style={badge}>gepubliceerd {doc.meta.releasedAt}</span>
        <span style={badge}>alleen-lezen</span>
      </div>

      {doc.meta.toelichting && <p style={{ ...note, maxWidth: 900 }}>{doc.meta.toelichting}</p>}

      <div className="table-container">
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, width: 260, flexShrink: 0 }}>
            {categorieen.map(c => (
              <li key={c}>
                <p style={{ ...note, fontWeight: 600, margin: '12px 0 4px' }}>{c}</p>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {doc.effecten
                    .filter(e => e.categorie === c)
                    .map(e => (
                      <li
                        key={e.id}
                        onClick={() => setEffectId(e.id)}
                        style={{
                          cursor: 'pointer',
                          padding: '8px 10px',
                          borderRadius: 5,
                          marginBottom: 4,
                          background: e.id === effectId ? '#f9b03b' : '#f4f4f4',
                        }}
                      >
                        {e.effect}
                        <span style={{ ...subNote, marginTop: 2 }}>{e.id}</span>
                      </li>
                    ))}
                </ul>
              </li>
            ))}
          </ul>

          <div style={{ flex: 1, minWidth: 0 }}>
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
                  <div key={n.niveau} style={{ ...tableWrap, padding: 12, maxWidth: '100%' }}>
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

export default SectorMeetstandaard;
