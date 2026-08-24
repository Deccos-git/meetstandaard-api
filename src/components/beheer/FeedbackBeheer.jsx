import { useEffect, useState } from 'react';
import { auth } from '../../firebase/config';
import { beoordeelFeedback, haalFeedback } from '../../api/client';
import { STANDAARDEN } from '../../standaarden';
import { badge, note, tableWrap } from '../standaard/SharedStyles';

const STATUSSEN = ['nieuw', 'in-behandeling', 'verwerkt', 'afgewezen'];

// Reviewing feedback. Reads through the same public endpoint the site uses, so
// an admin sees exactly what a visitor sees — including that the author's email
// is not part of it. If contacting someone directly ever becomes necessary, that
// needs a deliberate second endpoint rather than a wider projection here.
const FeedbackBeheer = () => {
  const [standaard, setStandaard] = useState(STANDAARDEN[0].key);
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState('alles');
  const [fout, setFout] = useState('');

  const laad = key =>
    haalFeedback(key)
      .then(d => setItems(d.feedback))
      .catch(e => setFout(e.message));

  useEffect(() => {
    setItems(null);
    setFout('');
    laad(standaard);
  }, [standaard]);

  const zichtbaar = items?.filter(i => filter === 'alles' || i.status === filter);

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', margin: '16px 0' }}>
        <label htmlFor="fb-standaard" style={note}>Standaard</label>
        <select id="fb-standaard" value={standaard} onChange={e => setStandaard(e.target.value)}>
          {STANDAARDEN.map(s => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>

        <label htmlFor="fb-status" style={note}>Status</label>
        <select id="fb-status" value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="alles">alles</option>
          {STATUSSEN.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        {items && <span style={badge}>{zichtbaar.length} van {items.length}</span>}
      </div>

      {fout && <p style={{ color: 'crimson' }}>{fout}</p>}
      {items === null && !fout && <p>Laden…</p>}
      {zichtbaar?.length === 0 && <p style={note}>Geen feedback in deze selectie.</p>}

      {zichtbaar?.map(item => (
        <Beoordeling key={item.id} item={item} opGewijzigd={() => laad(standaard)} />
      ))}
    </div>
  );
};

const Beoordeling = ({ item, opGewijzigd }) => {
  const [status, setStatus] = useState(item.status);
  const [toelichting, setToelichting] = useState(item.besluit?.toelichting || '');
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');

  const gewijzigd = status !== item.status || toelichting !== (item.besluit?.toelichting || '');

  const bewaar = async () => {
    setBezig(true);
    setFout('');
    try {
      await beoordeelFeedback(item.id, { status, toelichting }, auth.currentUser);
      await opGewijzigd();
    } catch (e) {
      setFout(e.fouten ? Object.values(e.fouten).join(' ') : e.message);
    } finally {
      setBezig(false);
    }
  };

  return (
    <div style={{ ...tableWrap, padding: 16 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <strong>
          {item.doel.type === 'standaard' ? 'De standaard als geheel' : `${item.doel.type} ${item.doel.id}`}
        </strong>
        <span style={badge}>versie {item.versie}</span>
        <span style={badge}>{item.status}</span>
      </div>

      <p style={{ whiteSpace: 'pre-wrap' }}>{item.tekst}</p>
      <p style={note}>
        {item.auteur.naam}
        {item.auteur.bedrijf && ` · ${item.auteur.bedrijf}`}
        {' · '}
        {new Date(item.aangemaaktOp).toLocaleString('nl-NL')}
      </p>

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap', marginTop: 12 }}>
        <select value={status} onChange={e => setStatus(e.target.value)}>
          {STATUSSEN.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <textarea
          value={toelichting}
          onChange={e => setToelichting(e.target.value)}
          rows={3}
          placeholder="Waarom dit besluit? Dit is publiek zichtbaar."
          style={{ flex: 1, minWidth: 280, fontFamily: 'inherit', fontSize: 14, padding: 8 }}
        />

        <button type="button" onClick={bewaar} disabled={bezig || !gewijzigd}>
          {bezig ? 'Bezig…' : 'Opslaan'}
        </button>
      </div>

      {/* The endpoint refuses any status but `nieuw` without a reason; saying so
          here beats a 400 the moment they press save. */}
      {status !== 'nieuw' && !toelichting.trim() && (
        <p style={note}>Een status anders dan &quot;nieuw&quot; heeft een toelichting nodig.</p>
      )}
      {fout && <p style={{ color: 'crimson' }}>{fout}</p>}
    </div>
  );
};

export default FeedbackBeheer;
