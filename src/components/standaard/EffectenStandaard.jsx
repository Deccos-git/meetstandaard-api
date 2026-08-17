import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { euro } from '../../standaarden';
import {
  detailColumn, listColumn, listItem, note, splitLayout,
  tableStyle, tableWrap, td, tdNum, th,
} from './SharedStyles';

// Read-only view of a standaard that lives in the shared `effects` collection,
// selected by its sector tag. Categories are shared between sectors (Gezondheid
// en Welzijn holds effects from both), so the split is on the effect's
// `sectors`, never on the category.
const EffectenStandaard = ({ sector }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [effectId, setEffectId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [cats, effs, qs] = await Promise.all([
          getDocs(collection(db, 'categories')),
          getDocs(collection(db, 'effects')),
          getDocs(collection(db, 'questions')),
        ]);
        if (cancelled) return;
        setData({
          categories: cats.docs.map(d => d.data()).sort((a, b) => (a.position || 0) - (b.position || 0)),
          effects: effs.docs.map(d => d.data()),
          questions: qs.docs.map(d => d.data()),
        });
      } catch (e) {
        console.error(e);
        if (!cancelled) setErr('De standaard ophalen is mislukt.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const effects = useMemo(
    () => (data ? data.effects.filter(e => (e.sectors || []).includes(sector)) : []),
    [data, sector]
  );

  // Only categories that actually hold an effect in this sector.
  const categories = useMemo(
    () => (data ? data.categories.filter(c => effects.some(e => e.categorie === c.id)) : []),
    [data, effects]
  );

  const byCategory = useMemo(
    () =>
      categories.map(c => ({
        category: c,
        effects: effects
          .filter(e => e.categorie === c.id)
          .sort((a, b) => (a.position || 0) - (b.position || 0)),
      })),
    [categories, effects]
  );

  useEffect(() => {
    if (effects.length && !effects.some(e => e.id === effectId)) {
      setEffectId(byCategory[0]?.effects[0]?.id ?? null);
    }
  }, [effects, byCategory, effectId]);

  if (loading) return <p>Laden…</p>;
  if (err) return <p style={{ color: 'crimson' }}>{err}</p>;
  if (!data) return null;
  if (!effects.length) return <p style={note}>Geen effecten voor deze sector.</p>;

  const effect = effects.find(e => e.id === effectId);
  const questions = effect
    ? data.questions
        .filter(q => q.effectId === effect.id)
        .sort((a, b) => (a.position || 0) - (b.position || 0))
    : [];
  const scores = [...(effect?.scores || [])].sort((a, b) => a.score - b.score);

  return (
    <div className="table-container">
      <div style={splitLayout}>
        <ul style={listColumn}>
          {byCategory.map(({ category, effects: inCategory }) => (
            <li key={category.id}>
              <p style={{ ...note, fontWeight: 600, margin: '12px 0 4px' }}>{category.name}</p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {inCategory.map(e => (
                  <li key={e.id} onClick={() => setEffectId(e.id)} style={listItem(e.id === effectId)}>
                    {e.name}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>

        <div style={detailColumn}>
          {effect && (
            <>
              <h3 style={{ marginTop: 0 }}>{effect.name}</h3>
              {effect.description && <p style={{ maxWidth: 900 }}>{effect.description}</p>}

              <h4>Stellingen</h4>
              {questions.length ? (
                <div style={tableWrap}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={th}>#</th>
                        <th style={th}>Stelling</th>
                      </tr>
                    </thead>
                    <tbody>
                      {questions.map((q, i) => (
                        <tr key={q.id}>
                          <td style={td}>{i + 1}</td>
                          <td style={td}>{q.name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p style={note}>Nog geen stellingen vastgelegd.</p>
              )}

              <h4>Niveaus en monetarisering</h4>
              {scores.length ? (
                <div style={tableWrap}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={th}>Score</th>
                        <th style={th}>Situatie</th>
                        <th style={th}>Waarde per jaar</th>
                        <th style={th}>Onderbouwing</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scores.map(s => (
                        <tr key={s.score}>
                          <td style={td}>{s.score}</td>
                          <td style={td}>{s.situation}</td>
                          <td style={tdNum}>{euro(s.monetaryValue)}</td>
                          <td style={{ ...td, fontSize: 13, color: '#555' }}>{s.onderbouwing}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                // Most effects in these two standaarden have no monetarisation
                // yet; say so rather than rendering an empty table.
                <p style={note}>Nog niet gemonetariseerd.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default EffectenStandaard;
