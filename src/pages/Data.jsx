import { useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  updateDoc,
  doc,
  Timestamp,
  writeBatch,
  getDocs,
} from 'firebase/firestore';
import { useFirestore } from '../firebase/useFirestore';
import { db } from '../firebase/config'; // adjust path if needed

// ---------- Firestore Timestamp helpers ----------
const isFsTs = v =>
  v && typeof v === 'object' && '_seconds' in v && '_nanoseconds' in v;

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
    .map(r => ({
      ...r,
      __t: tsToMillis(r.Timestamp || r.createdAt || r.updatedAt),
    }))
    .sort((a, b) => b.__t - a.__t)[0];
};

// =============== Component ===============
const Data = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  // Firestore: existing datasets (for position + overview table)
  const datasets = useFirestore('dataSets', 'position', 'asc') || [];

  // Fetch data from Deccos Cloud Function
  const fetchData = async () => {
    setLoading(true);
    setErr('');
    try {
      const res = await fetch(
        'https://us-central1-deccos-app.cloudfunctions.net/benchmarkEndpoint',
        {
          headers: { Accept: 'application/json' },
        }
      );
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
    { key: 'PersonaID', label: 'PersonaID' },
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
          padded.push({
            id: `__dummy_${effect.id}_${i}`,
            question: `Vraag ${i + 1}`,
            __dummy: true,
          });
        }
        padded.forEach((ind, i) => {
          cols.push({
            effectId: effect.id,
            indicatorId: ind.id,
            label: `${effect.name || 'Effect'} → ${
              ind.question || `Vraag ${i + 1}`
            }`,
            __dummy: ind.__dummy,
          });
        });
      });
    });
    return cols;
  }, [data]);

  // Build rows: one row per response instance (PersonaID + OrganisatieID + Timestamp + Meetmoment)
  const rows = useMemo(() => {
    const map = new Map();

    const pushResp = (ind, r) => {
      if (!r) return;

      const personaId = r.Persona ?? r.PersonaID ?? '';
      const orgId = r.CompagnyID ?? r.OrganisatieID ?? '';
      const timestampRaw = r.Timestamp ?? r.createdAt ?? r.updatedAt ?? '';
      const meetmoment = r.MomentPosition ?? r.MomentMeta ?? '';

      const key = [personaId, orgId, tsToMillis(timestampRaw), meetmoment].join(
        '|'
      );

      if (!map.has(key)) {
        map.set(key, {
          PersonaID: personaId,
          OrganisatieID: orgId,
          Timestamp: formatTs(timestampRaw),
          TimestampRaw: timestampRaw, // for saving
          Meetmoment: meetmoment,
          'Meetstandaard versie':
            r.MeetstandaardVersie ?? r.StandardVersion ?? 1,
          cells: new Map(), // indicatorId -> value
        });
      }

      const row = map.get(key);
      const prev = row.cells.get(ind?.id);
      const cand = latestByTime([prev, r].filter(Boolean));
      row.cells.set(ind?.id, cand?.Input ?? cand?.Value ?? '');
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

  // Save data to Firestore: parent dataset doc + rows + indicators
  const saveData = async () => {
    if (!rows.length) return;

    setSaving(true);
    setErr('');

    try {
      const dsRef = await addDoc(collection(db, 'dataSets'), {
        position: (datasets?.length || 0) + 1,
        createdAt: Timestamp.fromDate(new Date()),
        rowCount: rows.length,
        columnCount: dynamicCols.length,
        source: 'benchmarkEndpoint',
      });

      await updateDoc(dsRef, { id: dsRef.id });

      const batch = writeBatch(db);

      // rows subcollection
      rows.forEach(r => {
        const values = Object.fromEntries(r.cells.entries());

        const rowRef = doc(collection(db, 'dataSets', dsRef.id, 'rows'));
        batch.set(rowRef, {
          datasetId: dsRef.id,
          personaId: r.PersonaID,
          orgId: r.OrganisatieID,
          meetmoment: r.Meetmoment,
          meetstandardVersion: r['Meetstandaard versie'] || '',
          timestampDisplay: r.Timestamp,
          timestamp:
            r.TimestampRaw && tsToMillis(r.TimestampRaw)
              ? Timestamp.fromMillis(tsToMillis(r.TimestampRaw))
              : null,
          values,
        });
      });

      // indicators / columns subcollection
      dynamicCols.forEach(c => {
        const colRef = doc(
          collection(db, 'dataSets', dsRef.id, 'indicators')
        );
        batch.set(colRef, {
          datasetId: dsRef.id,
          effectId: c.effectId,
          indicatorId: c.indicatorId,
          label: c.label,
          isDummy: !!c.__dummy,
        });
      });

      await batch.commit();
    } catch (e) {
      console.error(e);
      setErr('Opslaan van dataset is mislukt.');
    } finally {
      setSaving(false);
    }
  };

  const formatDatasetTimestamp = ds =>
    formatTs(ds.createdAt || ds.timestamp || ds.timstamp);

  // Download CSV for a SAVED dataset (from Firestore)
  const downloadSavedDatasetCsv = async datasetId => {
    try {
      // Fetch rows
      const rowsSnap = await getDocs(
        collection(db, 'dataSets', datasetId, 'rows')
      );
      const rowList = rowsSnap.docs.map(d => d.data());

      // Fetch column metadata
      const indSnap = await getDocs(
        collection(db, 'dataSets', datasetId, 'indicators')
      );
      const indicators = indSnap.docs.map(d => d.data());

      const dynamicColsSaved = indicators
        .filter(ind => !ind.isDummy)
        .map(ind => ({
          id: ind.indicatorId,
          label: ind.label,
        }));

      const fixedColsSaved = [
        { key: 'personaId', label: 'PersonaID' },
        { key: 'orgId', label: 'OrganisatieID' },
        { key: 'timestampDisplay', label: 'Timestamp' },
        { key: 'meetmoment', label: 'Meetmoment' },
        { key: 'meetstandardVersion', label: 'Meetstandaard versie' },
      ];

      const headerLabels = [
        ...fixedColsSaved.map(c => c.label),
        ...dynamicColsSaved.map(c => c.label),
      ];

      const escapeCsv = value => {
        const s = cellText(value);
        const escaped = s.replace(/"/g, '""');
        return `"${escaped}"`;
      };

      const lines = [];

      // Header
      lines.push(headerLabels.map(escapeCsv).join(','));

      // Rows
      rowList.forEach(r => {
        const fixedValues = fixedColsSaved.map(c => r[c.key] ?? '');
        const dynamicValues = dynamicColsSaved.map(c => r.values?.[c.id] ?? '');
        lines.push([...fixedValues, ...dynamicValues].map(escapeCsv).join(','));
      });

      const csv = lines.join('\r\n');

      const blob = new Blob([csv], {
        type: 'text/csv;charset=utf-8;',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date()
        .toISOString()
        .slice(0, 19)
        .replace(/[:T]/g, '-');

      a.href = url;
      a.download = `dataset-${datasetId}-${dateStr}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('CSV download failed', e);
      alert('CSV downloaden mislukt');
    }
  };

  return (
    <div>
      <h1>Datasets</h1>

      {/* ===== Overview of saved datasets ===== */}
      <section style={{ marginBottom: 24 }}>
        <h2>Opgeslagen datasets</h2>
        {(!datasets || datasets.length === 0) ? (
          <p>Er zijn nog geen datasets opgeslagen.</p>
        ) : (
          <div
            style={{
              maxWidth: 800,
              border: '1px solid #eee',
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
              }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      textAlign: 'left',
                      padding: 8,
                      borderBottom: '1px solid #ddd',
                      background: '#f7f7f7',
                    }}
                  >
                    Timestamp
                  </th>
                  <th
                    style={{
                      textAlign: 'left',
                      padding: 8,
                      borderBottom: '1px solid #ddd',
                      background: '#f7f7f7',
                    }}
                  >
                    Details
                  </th>
                  <th
                    style={{
                      textAlign: 'left',
                      padding: 8,
                      borderBottom: '1px solid #ddd',
                      background: '#f7f7f7',
                    }}
                  >
                    Download
                  </th>
                </tr>
              </thead>
              <tbody>
                {datasets.map(ds => (
                  <tr key={ds.id}>
                    <td
                      style={{
                        padding: 8,
                        borderBottom: '1px solid #f2f2f2',
                      }}
                    >
                      {formatDatasetTimestamp(ds)}
                    </td>
                    <td
                      style={{
                        padding: 8,
                        borderBottom: '1px solid #f2f2f2',
                      }}
                    >
                      <a href={`/datasets/${ds.id}`}>Details bekijken</a>
                    </td>
                    <td
                      style={{
                        padding: 8,
                        borderBottom: '1px solid #f2f2f2',
                      }}
                    >
                      <button onClick={() => downloadSavedDatasetCsv(ds.id)}>
                        Download CSV
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ===== Controls for fetching & saving current dataset ===== */}
      {data.length === 0 && !loading && !err && (
        <button onClick={fetchData}>Data ophalen</button>
      )}
      {loading && <p>Data ophalen…</p>}
      {err && <p style={{ color: 'crimson' }}>{err}</p>}

      {data.length > 0 && !loading && !err && (
        <button onClick={saveData} disabled={saving}>
          {saving ? 'Data opslaan…' : 'Data opslaan'}
        </button>
      )}

      {/* ===== Current dataset table ===== */}
      {data.length > 0 && (
        <div
          style={{
            marginTop: 16,
            overflowX: 'auto',
            border: '1px solid #eee',
            borderRadius: 8,
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              minWidth: 1200,
            }}
          >
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
                  <td
                    colSpan={fixedCols.length + dynamicCols.length}
                    style={{ padding: 12, color: '#666' }}
                  >
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
                      <td
                        key={ci}
                        style={{ borderBottom: '1px solid #f2f2f2', padding: 8 }}
                      >
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
