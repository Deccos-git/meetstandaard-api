import { useEffect, useState } from 'react';
import { auth } from '../../firebase/config';
import { beoordeelFeedback, haalChangelog, haalFeedbackVoorBeheer } from '../../api/client';
import { entryVoorFeedback } from '../../public/useChangelog';
import { STANDAARDEN } from '../../standaarden';

const STATUSSEN = ['nieuw', 'in-behandeling', 'verwerkt', 'afgewezen', 'spam', 'verwijderd'];

// De statussen die een bezoeker te zien krijgt. Spiegelt PUBLIEKE_STATUSSEN in
// functions/feedback.js — een paneel dat iets anders belooft dan het endpoint
// doet is erger dan een paneel dat niets belooft.
const PUBLIEK = ['in-behandeling', 'verwerkt', 'afgewezen'];

const ALLE = 'alle';

// "Open" is de dagelijkse lijst: alles behalve wat is verwijderd. "Alles" is
// letterlijk alles, verwijderde reacties incluis — ze zijn immers niet weg, dat
// is het verschil tussen een softdelete en een delete.
const OPEN = 'open';

// Reviewing feedback. Sinds het formulier open staat is dit geen kijkvenster
// meer maar een wachtrij: wat hier op `nieuw` staat, staat nergens anders. Het
// leest daarom via het beheerendpoint — alles, inclusief het e-mailadres van de
// indiener, dat de publieke lijst nooit meegeeft.
const FeedbackBeheer = () => {
  const [standaard, setStandaard] = useState(ALLE);
  const [items, setItems] = useState(null);
  const [changelogs, setChangelogs] = useState({});
  const [filter, setFilter] = useState(OPEN);
  const [fout, setFout] = useState('');

  const laad = keuze => {
    const keys = keuze === ALLE ? STANDAARDEN.map(s => s.key) : [keuze];

    return Promise.all(
      keys.map(k =>
        Promise.all([haalFeedbackVoorBeheer(k, auth.currentUser), haalChangelog(k)]).then(
          ([f, c]) => ({ key: k, feedback: f.feedback, entries: c.entries })
        )
      )
    )
      .then(delen => {
        setItems(
          delen
            .flatMap(d => d.feedback)
            .sort((a, b) => String(b.aangemaaktOp).localeCompare(String(a.aangemaaktOp)))
        );
        setChangelogs(Object.fromEntries(delen.map(d => [d.key, d.entries])));
      })
      .catch(e => setFout(e.message));
  };

  useEffect(() => {
    setItems(null);
    setFout('');
    laad(standaard);
  }, [standaard]);

  const zichtbaar = items?.filter(i =>
    filter === OPEN ? i.status !== 'verwijderd' : filter === 'alles' || i.status === filter
  );

  return (
    <div className="publiek-beheer">
      <div className="publiek-beheer-balk">
        <label htmlFor="fb-standaard">Standaard</label>
        <select id="fb-standaard" value={standaard} onChange={e => setStandaard(e.target.value)}>
          <option value={ALLE}>alle</option>
          {STANDAARDEN.map(s => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>

        <label htmlFor="fb-status">Status</label>
        <select id="fb-status" value={filter} onChange={e => setFilter(e.target.value)}>
          <option value={OPEN}>open</option>
          <option value="alles">alles</option>
          {STATUSSEN.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        {items && <span className="publiek-badge">{zichtbaar.length} van {items.length}</span>}
      </div>

      {fout && (
        <div className="publiek-fout">
          <p>{fout}</p>
        </div>
      )}
      {items === null && !fout && <p>Laden…</p>}
      {zichtbaar?.length === 0 && <p className="publiek-notitie">Geen feedback in deze selectie.</p>}

      {zichtbaar?.map(item => (
        <Beoordeling
          key={item.id}
          item={item}
          entry={entryVoorFeedback(item.id, changelogs[item.standaard])}
          opGewijzigd={() => laad(standaard)}
        />
      ))}
    </div>
  );
};

const labelVoorStandaard = key => STANDAARDEN.find(s => s.key === key)?.label || key;

const Beoordeling = ({ item, entry, opGewijzigd }) => {
  const [status, setStatus] = useState(item.status);
  const [toelichting, setToelichting] = useState(item.besluit?.toelichting || '');
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');

  const gewijzigd = status !== item.status || toelichting !== (item.besluit?.toelichting || '');
  const verwijderd = item.status === 'verwijderd';

  const zet = async (nieuweStatus, nieuweToelichting) => {
    setBezig(true);
    setFout('');
    try {
      await beoordeelFeedback(
        item.id,
        { status: nieuweStatus, toelichting: nieuweToelichting },
        auth.currentUser
      );
      await opGewijzigd();
    } catch (e) {
      setFout(e.fouten ? Object.values(e.fouten).join(' ') : e.message);
    } finally {
      setBezig(false);
    }
  };

  // Een softdelete: het document blijft staan, het verdwijnt alleen uit de
  // publieke lijst en uit deze. Daarom is de bevestiging kort en de weg terug
  // een knop, niet een export uit Firestore.
  const verwijder = () => {
    if (window.confirm('Deze reactie verbergen? Hij blijft bewaard en je kunt hem terugzetten.')) {
      zet('verwijderd', '');
    }
  };

  return (
    <div className="publiek-niveau" style={{ marginBottom: 14, opacity: verwijderd ? 0.6 : 1 }}>
      <div className="publiek-niveau-kop">
        <strong>
          {item.doel.type === 'standaard' ? 'De standaard als geheel' : `${item.doel.type} ${item.doel.id}`}
        </strong>
        <span className={`publiek-badge publiek-status-${item.status}`}>{item.status}</span>
        <span className="publiek-badge">{labelVoorStandaard(item.standaard)}</span>
        <span className="publiek-badge">versie {item.versie}</span>
        {entry && <span className="publiek-badge">doorgevoerd in {entry.versie}</span>}
      </div>

      <p style={{ fontSize: 16, whiteSpace: 'pre-wrap' }}>{item.tekst}</p>
      <p className="publiek-notitie">
        {item.auteur.naam}
        {item.auteur.bedrijf && ` · ${item.auteur.bedrijf}`}
        {/* Alleen hier. De publieke lijst projecteert dit adres nooit. */}
        {item.auteurEmail && ` · ${item.auteurEmail}`}
        {' · '}
        {new Date(item.aangemaaktOp).toLocaleString('nl-NL')}
      </p>

      <div className="publiek-beheer-regel">
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
        />

        <button
          type="button"
          className="publiek-knop publiek-knop-zwart publiek-knop-klein"
          onClick={() => zet(status, toelichting)}
          disabled={bezig || !gewijzigd}
        >
          {bezig ? 'Bezig…' : 'Opslaan'}
        </button>

        <button
          type="button"
          className="publiek-knop publiek-knop-licht publiek-knop-klein"
          onClick={verwijderd ? () => zet('nieuw', '') : verwijder}
          disabled={bezig}
        >
          {verwijderd ? 'Terugzetten' : 'Verwijderen'}
        </button>
      </div>

      {/* The endpoint refuses a publicly visible status without a reason; saying
          so here beats a 400 the moment they press save. */}
      {PUBLIEK.includes(status) && !toelichting.trim() && (
        <p className="publiek-notitie">Deze status is publiek zichtbaar en heeft een toelichting nodig.</p>
      )}
      {fout && (
        <div className="publiek-melding publiek-melding-fout" style={{ marginTop: 12, marginBottom: 0 }}>
          <p>{fout}</p>
        </div>
      )}
    </div>
  );
};

export default FeedbackBeheer;
