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

  return (
    <div>
      <h1>Participatieladder</h1>

      <p style={{ color: '#555' }}>
        Monetariseringsparameters voor arbeidsparticipatie — versie{' '}
        <strong>{params.meta?.version}</strong> (belastingjaar {params.meta?.taxYear}).
        Bron: {params.meta?.source}. Bijgewerkt: {params.meta?.updatedAt}.
      </p>

      {/* Ladder labels */}
      <h2>Treden van de participatieladder</h2>
      <div style={tableWrap}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={th}>Trede</th>
              <th style={th}>Omschrijving</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(params.ladderLabels || {}).map(([k, v]) => (
              <tr key={k}>
                <td style={td}>{k}</td>
                <td style={td}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Income table */}
      <h2>Bruto jaarinkomen per opleiding en uren per week</h2>
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
            </tr>
          </thead>
          <tbody>
            {Object.entries(params.benefitAmountPerYear || {}).map(([k, v]) => (
              <tr key={k}>
                <td style={td}>{k}</td>
                <td style={tdNum}>{euro(v)}</td>
              </tr>
            ))}
            <tr>
              <td style={td}>Uitvoeringskosten bijstand</td>
              <td style={tdNum}>{euro(params.bijstandUitvoeringskostenPerYear)}</td>
            </tr>
            <tr>
              <td style={td}>Vrijwilligerswaarde per uur</td>
              <td style={tdNum}>{euro(params.volunteerValuePerHour)}</td>
            </tr>
            <tr>
              <td style={td}>Weken per jaar</td>
              <td style={tdNum}>{params.weeksPerYear}</td>
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
              <th style={th}>Onderwerp</th>
              <th style={th}>Bron</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(params.sources || {}).map(([k, v]) => (
              <tr key={k}>
                <td style={td}>{k}</td>
                <td style={td}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Participatieladder;
