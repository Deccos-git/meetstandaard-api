import { useMemo, useState } from 'react';

// ---------- Firestore Timestamp helpers ----------
const isFsTs = v => v && typeof v === 'object' && '_seconds' in v && '_nanoseconds' in v;

const tsToMillis = v => {
  if (!v) return 0;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (isFsTs(v)) return v._seconds * 1000 + Math.floor(v._nanoseconds / 1e6);
  if (v instanceof Date) return v.getTime();
  const n = Number(v);
  if (!Number.isNaN(n)) return n;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
};

const formatTs = v => {
  const ms = tsToMillis(v);
  return ms ? new Date(ms).toLocaleString() : '';
};

const cellText = v => {
  if (v == null) return '';
  if (isFsTs(v)) return formatTs(v);
  if (v instanceof Date) return v.toLocaleString();
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

const L = x => (Array.isArray(x) ? x : []);

const latestByTime = (arr = []) => {
  if (!arr.length) return null;
  return [...arr]
    .map(r => ({ ...r, __t: tsToMillis(r.Timestamp || r.createdAt || r.updatedAt) }))
    .sort((a, b) => b.__t - a.__t)[0];
};

// =============== Component ===============
const Data = () => {
  const [data, setData] = useState([]);  
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const fetchData = async () => {
    setLoading(true);
    setErr('');
    try {
      const res = await fetch('https://us-central1-deccos-app.cloudfunctions.net/benchmarkEndpoint', {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(Array.isArray(json) ? json : []);
    } catch (e) {
      console.error(e);
      setErr('Kon data niet ophalen.');
    } finally {
      setLoading(false);
    }
  };

  // Left columns 
  const fixedCols = [
    { key: 'PersonalID', label: 'PersonalID' },
    { key: 'OrganisatieID', label: 'OrganisatieID' },
    { key: 'Timestamp', label: 'Timestamp' },
    { key: 'Meetmoment', label: 'Meetmoment' },
    { key: 'Meetstandaard versie', label: 'Meetstandaard versie' },
  ];

  // Build dynamic columns: for each effect, up to 4 indicators → header "Effect X → Vraag Y"
  const dynamicCols = useMemo(() => {
    const cols = [];
    data.forEach(cat => {
      L(cat.effects).forEach(effect => {
        const inds = L(effect.indicators).slice(0, 4); // cap at 4
        const padded = [...inds];
        // pad to 4 for stable layout
        for (let i = inds.length; i < 4; i++) {
          padded.push({ id: `__dummy_${effect.id}_${i}`, question: `Vraag ${i + 1}`, __dummy: true });
        }
        padded.forEach((ind, i) => {
          cols.push({
            effectId: effect.id,
            indicatorId: ind.id,
            label: `${effect.name || 'Effect'} → ${ind.question || `Vraag ${i + 1}`}`,
            __dummy: ind.__dummy,
          });
        });
      });
    });
    return cols;
  }, [data]);

  // Build rows: one row per response instance (PersonalID + OrganisatieID + Timestamp + Meetmoment)
  const rows = useMemo(() => {
    const map = new Map();

    const pushResp = (ind, r) => {
      if (!r) return;
      const personalId = r.PersonalID || r.PersonID || r.UserID || '';
      const orgId = r.CompagnyID || r.CompanyID || r.OrganisationID || r.OrganizationID || '';
      const timestampRaw = r.Timestamp || '';
      const meetmoment = r.MomentPosition ?? r.Meetmoment ?? r.Moment ?? '';

      const key = [personalId, orgId, tsToMillis(timestampRaw), meetmoment].join('|');

      if (!map.has(key)) {
        map.set(key, {
          PersonalID: personalId,
          OrganisatieID: orgId,
          Timestamp: formatTs(timestampRaw),
          Meetmoment: meetmoment,
          'Meetstandaard versie': r.StandardVersion || r.MeetstandaardVersie || '',
          cells: new Map(), // indicatorId -> value
        });
      }

      // keep latest per indicator
      const prev = map.get(key).cells.get(ind?.id);
      const cand = latestByTime([prev, r].filter(Boolean));
      map.get(key).cells.set(ind?.id, cand?.Input ?? '');
    };

    data.forEach(cat => {
      L(cat.effects).forEach(effect => {
        L(effect.indicators).forEach(ind => {
          L(ind.responses).forEach(r => pushResp(ind, r));
        });
      });
    });

    return [...map.values()];
  }, [data]);

  return (
    <div>
      <h1>Dataset</h1>

      {data.length === 0 && !loading && !err && (
        <button onClick={fetchData}>Data ophalen</button>
      )}
      {loading && <p>Laden…</p>}
      {err && <p style={{ color: 'crimson' }}>{err}</p>}

      {data.length > 0 && (
        <div style={{ overflowX: 'auto', border: '1px solid #eee', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1200 }}>
            <thead>
              <tr>
                {fixedCols.map(c => (
                  <th
                    key={c.key}
                    style={{
                      background: '#eaf1fb',
                      textAlign: 'left',
                      padding: 8,
                      borderBottom: '1px solid #d7e3ff',
                      whiteSpace: 'nowrap',
                      position: 'sticky',
                      left: 0,
                      zIndex: 2,
                    }}
                  >
                    {c.label}
                  </th>
                ))}
                {dynamicCols.map((c, i) => (
                  <th
                    key={`${c.effectId}-${c.indicatorId}-${i}`}
                    style={{
                      background: '#eaf1fb',
                      textAlign: 'left',
                      padding: 8,
                      borderBottom: '1px solid #d7e3ff',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={fixedCols.length + dynamicCols.length} style={{ padding: 12, color: '#666' }}>
                    Geen responses gevonden.
                  </td>
                </tr>
              ) : (
                rows.map((r, ri) => (
                  <tr key={ri}>
                    {fixedCols.map(c => (
                      <td
                        key={c.key}
                        style={{
                          borderBottom: '1px solid #f2f2f2',
                          padding: 8,
                          position: 'sticky',
                          left: 0,
                          background: '#fff',
                          zIndex: 1,
                        }}
                      >
                        {cellText(r[c.key])}
                      </td>
                    ))}
                    {dynamicCols.map((c, ci) => (
                      <td key={ci} style={{ borderBottom: '1px solid #f2f2f2', padding: 8 }}>
                        {c.__dummy ? '' : cellText(r.cells.get(c.indicatorId))}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Data;
