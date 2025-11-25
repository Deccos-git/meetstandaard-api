import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  doc,
  collection,
  getDoc,
  getDocs,
} from 'firebase/firestore';
import { db } from '../firebase/config';

// Helpers
const isFsTs = v => v && typeof v === 'object' && '_seconds' in v;
const tsToMillis = v =>
  !v ? 0
    : typeof v.toMillis === 'function' ? v.toMillis()
    : isFsTs(v) ? v._seconds * 1000 + Math.floor(v._nanoseconds / 1e6)
    : new Date(v).getTime() || 0;

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

const DataSetDetail = () => {
  const { datasetId } = useParams();

  const [dataset, setDataset] = useState(null);
  const [rows, setRows] = useState([]);
  const [indicators, setIndicators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  // Fetch dataset metadata + rows + indicators
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setErr('');
      try {
        // Parent dataset doc
        const dsRef = doc(db, 'dataSets', datasetId);
        const dsSnap = await getDoc(dsRef);

        if (!dsSnap.exists()) {
          setErr('Dataset niet gevonden.');
          setLoading(false);
          return;
        }

        setDataset({ id: datasetId, ...dsSnap.data() });

        // Rows
        const rowsSnap = await getDocs(
          collection(db, 'dataSets', datasetId, 'rows')
        );
        const rowList = rowsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setRows(rowList);

        // Indicators
        const indSnap = await getDocs(
          collection(db, 'dataSets', datasetId, 'indicators')
        );
        const indList = indSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setIndicators(indList);
      } catch (e) {
        console.error('Error loading dataset detail:', e);
        setErr('Fout bij het laden van de dataset.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [datasetId]);

  // Fixed columns for the raw table
  const fixedCols = [
    { key: 'personaId', label: 'PersonaID' },
    { key: 'orgId', label: 'OrganisatieID' },
    { key: 'timestampDisplay', label: 'Timestamp' },
    { key: 'meetmoment', label: 'Meetmoment' },
    { key: 'meetstandardVersion', label: 'Meetstandaard versie' },
  ];

  // Dynamic columns for the raw table (based on saved indicators)
  const dynamicCols = useMemo(() => {
    return indicators
      .filter(ind => !ind.isDummy)
      .map(ind => ({
        indicatorId: ind.indicatorId,
        label: ind.label,
        effectId: ind.effectId,
      }));
  }, [indicators]);

  // === Benchmarks per effect: growth between first & last meetmoment ===
  const effectBenchmarks = useMemo(() => {
    if (!rows.length || !indicators.length) return [];

    // Map: effectId -> { effectId, effectName, indicatorIds: [] }
    const effectMap = new Map();

    indicators.forEach(ind => {
      if (ind.isDummy) return;
      const effectId = ind.effectId;
      if (!effectId) return;

      // Try to derive effectName from label: "Effectnaam → Vraag ..."
      let effectName = effectId;
      if (ind.label && typeof ind.label === 'string') {
        const parts = ind.label.split('→');
        if (parts.length > 1) {
          effectName = parts[0].trim();
        }
      }

      if (!effectMap.has(effectId)) {
        effectMap.set(effectId, {
          effectId,
          effectName,
          indicatorIds: [],
        });
      }
      effectMap.get(effectId).indicatorIds.push(ind.indicatorId);
    });

    const results = [];

    for (const eff of effectMap.values()) {
      const byMoment = new Map(); // moment -> [values]

      rows.forEach(row => {
        const mRaw = row.meetmoment;
        if (mRaw == null) return;
        const m = Number(mRaw);
        if (Number.isNaN(m)) return;

        eff.indicatorIds.forEach(indId => {
          const raw = row.values?.[indId];
          if (raw == null || raw === '') return;

          const num = Number(raw);
          if (Number.isNaN(num)) return;

          if (!byMoment.has(m)) byMoment.set(m, []);
          byMoment.get(m).push(num);
        });
      });

      if (byMoment.size === 0) continue;

      const moments = [...byMoment.keys()].sort((a, b) => a - b);
      const firstMoment = moments[0];
      const lastMoment = moments[moments.length - 1];

      const avg = arr =>
        !arr || !arr.length
          ? 0
          : arr.reduce((sum, v) => sum + v, 0) / arr.length;

      const firstVal = avg(byMoment.get(firstMoment));
      const lastVal = avg(byMoment.get(lastMoment));
      const growthAbs = lastVal - firstVal;
      const growthPct =
        firstVal === 0 ? null : (growthAbs / Math.abs(firstVal)) * 100;

      results.push({
        effectId: eff.effectId,
        effectName: eff.effectName,
        firstMoment,
        lastMoment,
        firstVal,
        lastVal,
        growthAbs,
        growthPct,
      });
    }

    return results;
  }, [rows, indicators]);

  if (loading) return <p>Dataset wordt geladen…</p>;
  if (err) return <p style={{ color: 'crimson' }}>{err}</p>;
  if (!dataset) return <p>Dataset niet gevonden.</p>;

  return (
    <div style={{ padding: 24 }}>
      <h1>Dataset Detail</h1>

      <p><strong>ID:</strong> {dataset.id}</p>
      <p><strong>Aangemaakt op:</strong> {formatTs(dataset.createdAt)}</p>
      <p><strong>Rijen:</strong> {dataset.rowCount}</p>
      <p><strong>Kolommen:</strong> {dataset.columnCount}</p>

      {/* ==== Benchmarks per effect ==== */}
      {effectBenchmarks.length > 0 && (
        <section style={{ marginTop: 24, marginBottom: 32 }}>
          <h2>Benchmarks</h2>
          <div
            style={{
              overflowX: 'auto',
              border: '1px solid #eee',
              borderRadius: 8,
              marginTop: 8,
            }}
          >
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                minWidth: 800,
              }}
            >
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #ddd', background: '#f7f7f7' }}>
                    Effect
                  </th>
                  <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #ddd', background: '#f7f7f7' }}>
                    Eerste meetmoment
                  </th>
                  <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #ddd', background: '#f7f7f7' }}>
                    Laatste meetmoment
                  </th>
                  <th style={{ textAlign: 'right', padding: 8, borderBottom: '1px solid #ddd', background: '#f7f7f7' }}>
                    Startwaarde (gem.)
                  </th>
                  <th style={{ textAlign: 'right', padding: 8, borderBottom: '1px solid #ddd', background: '#f7f7f7' }}>
                    Eindwaarde (gem.)
                  </th>
                  <th style={{ textAlign: 'right', padding: 8, borderBottom: '1px solid #ddd', background: '#f7f7f7' }}>
                    Groei (absoluut)
                  </th>
                  <th style={{ textAlign: 'right', padding: 8, borderBottom: '1px solid #ddd', background: '#f7f7f7' }}>
                    Groei (%)
                  </th>
                </tr>
              </thead>
              <tbody>
                {effectBenchmarks.map(b => (
                  <tr key={b.effectId}>
                    <td style={{ padding: 8, borderBottom: '1px solid #f2f2f2' }}>
                      {b.effectName}
                    </td>
                    <td style={{ padding: 8, borderBottom: '1px solid #f2f2f2' }}>
                      {b.firstMoment}
                    </td>
                    <td style={{ padding: 8, borderBottom: '1px solid #f2f2f2' }}>
                      {b.lastMoment}
                    </td>
                    <td style={{ padding: 8, borderBottom: '1px solid #f2f2f2', textAlign: 'right' }}>
                      {b.firstVal.toFixed(2)}
                    </td>
                    <td style={{ padding: 8, borderBottom: '1px solid #f2f2f2', textAlign: 'right' }}>
                      {b.lastVal.toFixed(2)}
                    </td>
                    <td style={{ padding: 8, borderBottom: '1px solid #f2f2f2', textAlign: 'right' }}>
                      {b.growthAbs.toFixed(2)}
                    </td>
                    <td style={{ padding: 8, borderBottom: '1px solid #f2f2f2', textAlign: 'right' }}>
                      {b.growthPct == null ? '-' : `${b.growthPct.toFixed(1)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ==== Raw data table ==== */}
      <section>
        <h2>Ruwe data</h2>
        {rows.length === 0 ? (
          <p>Geen rijen gevonden.</p>
        ) : (
          <div
            style={{
              marginTop: 8,
              overflowX: 'auto',
              border: '1px solid #eee',
              borderRadius: 8,
            }}
          >
            <table
              style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1200 }}
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
                      }}
                    >
                      {c.label}
                    </th>
                  ))}
                  {dynamicCols.map((c, idx) => (
                    <th
                      key={idx}
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
                {rows.map((r, ri) => (
                  <tr key={ri}>
                    {fixedCols.map(c => (
                      <td
                        key={c.key}
                        style={{
                          borderBottom: '1px solid #f2f2f2',
                          padding: 8,
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
                        {cellText(r.values?.[c.indicatorId])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export default DataSetDetail;
