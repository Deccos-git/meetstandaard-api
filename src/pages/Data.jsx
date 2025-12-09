import { useState } from 'react';
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
import { db } from '../firebase/config'; // Meetstandaard Firestore
import { dbDeccos } from '../firebase/configDeccos';
import { useFirestoreOrderBy } from '../firebase/useFirestoreDeccos';

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

// =============== Component ===============
const Data = () => {
  const [selectedBenchmark, setSelectedBenchmark] = useState(null); // metadata from Deccos
  const [rows, setRows] = useState([]); // table rows built from Deccos/Rows
  const [dynamicCols, setDynamicCols] = useState([]); // columns from Deccos/Indicators
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  // Firestore: existing datasets (for position + overview table) – Meetstandaard side
  const datasets = useFirestore('dataSets', 'position', 'asc') || [];

  // Firestore: Deccos Benchmarks (metadata)
  const datasetsDeccos =
    useFirestoreOrderBy('Benchmarks', 'position', 'asc') || [];

  // Left columns
  const fixedCols = [
    { key: 'PersonaID', label: 'PersonaID' },
    { key: 'OrganisatieID', label: 'OrganisatieID' },
    { key: 'Timestamp', label: 'Timestamp' },
    { key: 'Meetmoment', label: 'Meetmoment' },
    { key: 'Meetstandaard versie', label: 'Meetstandaard versie' },
  ];

  // -------- Fetch benchmark data from Deccos Firestore --------
  const fetchData = async () => {
    setLoading(true);
    setErr('');

    try {
      if (!datasetsDeccos || datasetsDeccos.length === 0) {
        throw new Error('Geen benchmarks gevonden in Deccos database.');
      }

      // 1) Pak de laatste benchmark
      const latestBenchmark = datasetsDeccos[datasetsDeccos.length - 1];
      setSelectedBenchmark(latestBenchmark);

      const benchmarkId = latestBenchmark.id;
      if (!benchmarkId) throw new Error('Benchmark heeft geen ID.');

      // 2) Haal rows op uit Deccos: Benchmarks/{id}/Rows
      const rowsSnap = await getDocs(
        collection(dbDeccos, 'Benchmarks', benchmarkId, 'Rows')
      );
      const rawRows = rowsSnap.docs.map(d => d.data());

      // 3) Haal indicatoren op uit Deccos: Benchmarks/{id}/Indicators
      const indSnap = await getDocs(
        collection(dbDeccos, 'Benchmarks', benchmarkId, 'Indicators')
      );
      const indicators = indSnap.docs.map(d => d.data());

      // 4) Bouw dynamicCols
      const dynCols = indicators.map(ind => ({
        effectId: ind.effectId,
        indicatorId: ind.indicatorId,
        label: ind.label,
        __dummy: !!ind.isDummy,
      }));
      setDynamicCols(dynCols);

      // 5) Bouw rows in het formaat dat de tabel / CSV verwacht
      const tableRows = rawRows.map(r => {
        const ts = r.timestamp;
        const tsDate =
          ts && typeof ts.toDate === 'function' ? ts.toDate() : ts || null;

        return {
          PersonaID: r.personaId || '',
          OrganisatieID: r.orgId || '',
          TimestampRaw: tsDate,
          Timestamp: tsDate ? formatTs(tsDate) : '',
          Meetmoment: r.meetmoment || '',
          'Meetstandaard versie': r.meetstandardVersion || '',
          cells: new Map(Object.entries(r.values || {})), // indicatorId -> value
        };
      });

      setRows(tableRows);
    } catch (e) {
      console.error(e);
      setErr('Data ophalen is mislukt.');
    } finally {
      setLoading(false);
    }
  };

  // -------- Save data into Meetstandaard dataSets --------
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

  // -------- Download CSV for a SAVED dataset (Meetstandaard dataSets) --------
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

      {/* ===== Overview of saved datasets (Meetstandaard dataSets) ===== */}
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
      {rows.length === 0 && !loading && !err && (
        <button onClick={fetchData}>Data ophalen</button>
      )}
      {loading && <p>Data ophalen…</p>}
      {err && <p style={{ color: 'crimson' }}>{err}</p>}

      {rows.length > 0 && !loading && !err && (
        <button onClick={saveData} disabled={saving}>
          {saving ? 'Data opslaan…' : 'Data opslaan'}
        </button>
      )}

      {/* ===== Current dataset table (from Deccos Benchmarks) ===== */}
      {rows.length > 0 && (
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
