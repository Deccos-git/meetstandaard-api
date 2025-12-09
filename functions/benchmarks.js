const SCALE_MIN = 1;
const SCALE_MAX = 5;
const SCALE_RANGE = SCALE_MAX - SCALE_MIN; // 4

const clampToScale = v => Math.min(SCALE_MAX, Math.max(SCALE_MIN, v));

const avg = arr =>
  !arr || !arr.length
    ? 0
    : arr.reduce((sum, v) => sum + v, 0) / arr.length;

/**
 * Berekent benchmarks per effect (5-puntsschaal) op basis van rows + indicators.
 * Return: array van
 * {
 *   effectId,
 *   effectName,
 *   firstMoment,
 *   lastMoment,
 *   firstVal,
 *   lastVal,
 *   growthAbs,
 *   growthPct
 * }
 */
const computeEffectBenchmarks = (rows, indicators) => {
  if (!rows.length || !indicators.length) return [];

  // Map: effectId -> { effectId, effectName, indicatorIds: [] }
  const effectMap = new Map();

  indicators.forEach(ind => {
    if (ind.isDummy) return;
    const effectId = ind.effectId;
    if (!effectId) return;

    // Probeer effectName uit label te halen: "Effectnaam → Vraag ..."
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
    const byMoment = new Map(); // meetmoment (number) -> [values op 1–5 schaal]

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

        // 5-puntsschaal afdwingen
        const scaled = clampToScale(num);

        if (!byMoment.has(m)) byMoment.set(m, []);
        byMoment.get(m).push(scaled);
      });
    });

    if (byMoment.size === 0) continue;

    const moments = [...byMoment.keys()].sort((a, b) => a - b);
    const firstMoment = moments[0];
    const lastMoment = moments[moments.length - 1];

    const firstVal = avg(byMoment.get(firstMoment));
    const lastVal = avg(byMoment.get(lastMoment));
    const growthAbs = lastVal - firstVal;

    // Groei als % van de volledige 5-puntsschaal (1 → 5 = 100%)
    const growthPct =
      SCALE_RANGE <= 0
        ? null
        : (growthAbs / SCALE_RANGE) * 100;

    results.push({
      effectId: eff.effectId,
      effectName: eff.effectName,
      firstMoment,
      lastMoment,
      firstVal: firstVal.toFixed(1),
      lastVal: lastVal.toFixed(1),
      growthAbs: growthAbs.toFixed(1),
      growthPct: growthPct ? growthPct.toFixed(1) : null,
    });
  }

  return results;
};

/**
 * Haalt de meest recente dataset op (op basis van createdAt) en berekent de benchmarks.
 * Return:
 * {
 *   datasetId,
 *   datasetName,
 *   createdAt,
 *   benchmarks: [ ...effectBenchmarks ]
 * }
 * of null als er geen datasets zijn.
 */
const benchmarks = async ({ firestore }) => {
  // Meest recente dataset ophalen
  const dataSetsSnap = await firestore
    .collection('dataSets')
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();

  if (dataSetsSnap.empty) {
    return null;
  }

  const dsDoc = dataSetsSnap.docs[0];
  const datasetId = dsDoc.id;
  const dsData = dsDoc.data() || {};

  // rows + indicators parallel ophalen
  const [rowsSnap, indicatorsSnap] = await Promise.all([
    firestore
      .collection('dataSets')
      .doc(datasetId)
      .collection('rows')
      .get(),
    firestore
      .collection('dataSets')
      .doc(datasetId)
      .collection('indicators')
      .get(),
  ]);

  const rows = rowsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const indicators = indicatorsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const effectBenchmarks = computeEffectBenchmarks(rows, indicators);

  return {
    datasetId,
    createdAt: dsData.createdAt || null,
    benchmarks: effectBenchmarks,
  };
};

export default benchmarks;
