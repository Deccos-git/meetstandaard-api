import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';

// Numeric-aware compare so "2026.10" sorts after "2026.2".
const compareVersions = (a, b) => {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] || 0;
    const db_ = pb[i] || 0;
    if (da !== db_) return da - db_;
  }
  return 0;
};

const euro = n =>
  typeof n === 'number'
    ? n.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' })
    : '';

const th = {
  background: '#eaf1fb',
  textAlign: 'left',
  padding: 8,
  borderBottom: '1px solid #d7e3ff',
  whiteSpace: 'nowrap',
};
const td = { padding: 8, borderBottom: '1px solid #f2f2f2' };
const tdNum = { ...td, textAlign: 'right' };
const tableWrap = {
  marginTop: 12,
  marginBottom: 24,
  border: '1px solid #eee',
  borderRadius: 8,
  overflowX: 'auto',
};
const tableStyle = { width: '100%', borderCollapse: 'collapse' };
const srcNote = { color: '#555', fontSize: 13, margin: '4px 0 0' };

const Participatieladder = () => {
  const [params, setParams] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDocs(collection(db, 'MeetstandaardParameters'));
        if (snap.empty) {
          throw new Error('Geen parameters gevonden.');
        }
        const docs = snap.docs.sort((a, b) => compareVersions(a.id, b.id));
        setParams(docs[docs.length - 1].data());
      } catch (e) {
        console.error(e);
        setErr('Parameters ophalen is mislukt.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) return <div><h1>Participatieladder</h1><p>Laden…</p></div>;
  if (err) return <div><h1>Participatieladder</h1><p style={{ color: 'crimson' }}>{err}</p></div>;
  if (!params) return null;

  const bands = params.options?.hoursBand || [];
  const bronnenById = params.bronnen || {};

  // Render a list of bron-id's as a comma-separated set of links (or plain text
  // when a bron has no public URL).
  const bronLinks = ids => {
    const items = (ids || []).map(id => bronnenById[id]).filter(Boolean);
    if (items.length === 0) return null;
    return items.map((b, i) => (
      <span key={b.id}>
        {i > 0 && ', '}
        {b.url ? (
          <a href={b.url} target="_blank" rel="noopener noreferrer">
            {b.publisher}
          </a>
        ) : (
          <span title={b.note || ''}>{b.publisher}</span>
        )}
      </span>
    ));
  };

  return (
    <div>
      <h1>Participatieladder</h1>

      <p style={{ color: '#555' }}>
        Monetariseringsparameters voor arbeidsparticipatie — versie{' '}
        <strong>{params.meta?.version}</strong> (belastingjaar {params.meta?.taxYear}).
        Bron: {params.meta?.source}. Bijgewerkt: {params.meta?.updatedAt}.
      </p>

      {/* Ladder levels with valuation + bronnen */}
      <h2>Treden van de participatieladder</h2>
      <div style={tableWrap}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={th}>Trede</th>
              <th style={th}>Niveau</th>
              <th style={th}>Omschrijving</th>
              <th style={{ ...th, textAlign: 'right' }}>Waardering / jaar</th>
              <th style={th}>Bronnen</th>
            </tr>
          </thead>
          <tbody>
            {(params.ladderLevels || []).map(lvl => (
              <tr key={lvl.trede}>
                <td style={td}>{lvl.trede}</td>
                <td style={td}>{lvl.label}</td>
                <td style={td}>
                  {lvl.description}
                  {lvl.rationale && (
                    <div style={{ color: '#666', fontSize: 13, marginTop: 4 }}>{lvl.rationale}</div>
                  )}
                </td>
                <td style={tdNum}>{euro(lvl.valuePerYear)}</td>
                <td style={td}>{bronLinks(lvl.sources)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Income table */}
      <h2>Bruto jaarinkomen per opleiding en uren per week</h2>
      <p style={srcNote}>Bron: {bronLinks(params.sourceRefs?.incomeByEducationAndHoursBand)}</p>
      <div style={tableWrap}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={th}>Opleidingsniveau</th>
              {bands.map(b => (
                <th key={b} style={{ ...th, textAlign: 'right' }}>{b}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(params.incomeByEducationAndHoursBand || {}).map(([edu, row]) => (
              <tr key={edu}>
                <td style={td}>{edu}</td>
                {bands.map(b => (
                  <td key={b} style={tdNum}>{euro(row[b])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Tax brackets */}
      <h2>Belastingschijven</h2>
      <div style={tableWrap}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={th}>Tot en met</th>
              <th style={{ ...th, textAlign: 'right' }}>Tarief</th>
            </tr>
          </thead>
          <tbody>
            {(params.taxBrackets || []).map((b, i) => (
              <tr key={i}>
                <td style={td}>{b.upTo === null ? 'Geen plafond' : euro(b.upTo)}</td>
                <td style={tdNum}>{(b.rate * 100).toLocaleString('nl-NL')}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Benefits + other amounts */}
      <h2>Uitkeringen en overige bedragen (per jaar)</h2>
      <div style={tableWrap}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={th}>Post</th>
              <th style={{ ...th, textAlign: 'right' }}>Bedrag</th>
              <th style={th}>Bron</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(params.benefitAmountPerYear || {}).map(([k, v]) => (
              <tr key={k}>
                <td style={td}>{k}</td>
                <td style={tdNum}>{euro(v)}</td>
                <td style={td}>{bronLinks(params.sourceRefs?.benefitAmountPerYear?.[k])}</td>
              </tr>
            ))}
            <tr>
              <td style={td}>Uitvoeringskosten bijstand</td>
              <td style={tdNum}>{euro(params.bijstandUitvoeringskostenPerYear)}</td>
              <td style={td}>{bronLinks(params.sourceRefs?.bijstandUitvoeringskostenPerYear)}</td>
            </tr>
            <tr>
              <td style={td}>Vrijwilligerswaarde per uur</td>
              <td style={tdNum}>{euro(params.volunteerValuePerHour)}</td>
              <td style={td} />
            </tr>
            <tr>
              <td style={td}>Weken per jaar</td>
              <td style={tdNum}>{params.weeksPerYear}</td>
              <td style={td} />
            </tr>
          </tbody>
        </table>
      </div>

      {/* Options */}
      <h2>Keuzelijsten</h2>
      <div style={tableWrap}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={th}>Veld</th>
              <th style={th}>Opties</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(params.options || {}).map(([k, arr]) => (
              <tr key={k}>
                <td style={td}>{k}</td>
                <td style={td}>{(arr || []).join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Sources */}
      <h2>Bronnen</h2>
      <div style={tableWrap}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={th}>Bron</th>
              <th style={th}>Uitgever</th>
              <th style={th}>Jaar</th>
              <th style={th}>Link</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(bronnenById).map(b => (
              <tr key={b.id}>
                <td style={td}>
                  {b.title}
                  {b.dataset && <span style={{ color: '#888' }}> (dataset {b.dataset})</span>}
                  {b.note && <div style={{ color: '#888', fontSize: 13 }}>{b.note}</div>}
                </td>
                <td style={td}>{b.publisher}</td>
                <td style={td}>{b.year || ''}</td>
                <td style={td}>
                  {b.url ? (
                    <a href={b.url} target="_blank" rel="noopener noreferrer">Open</a>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Participatieladder;
