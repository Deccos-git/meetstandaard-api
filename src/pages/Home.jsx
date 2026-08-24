import { useState } from 'react';
import { STANDAARDEN } from '../standaarden';
import { useVersionedStandaard } from '../firebase/useVersionedStandaard';
import PublishedStandaard from '../components/standaard/PublishedStandaard';
import ParametersStandaard from '../components/standaard/ParametersStandaard';
import InterventiesStandaard from '../components/standaard/InterventiesStandaard';
import FeedbackBeheer from '../components/beheer/FeedbackBeheer';
import { badge, note, versionBar } from '../components/standaard/SharedStyles';

// Every standaard now loads its versions from its own Firestore collection.
// Arbeidsparticipatie and gelijke kansen used to be the exception — they showed
// a version hardcoded in src/standaarden.js — until they were snapshotted into
// versioned documents too. There is no second case left to handle.
const Published = ({ standaard }) => {
  const { versions, version, setVersion, doc, loading, err } = useVersionedStandaard(standaard.collection);

  if (loading) return <p>Laden…</p>;
  if (err) return <p style={{ color: 'crimson' }}>{err}</p>;
  if (!doc) return null;

  return (
    <>
      <div style={versionBar}>
        <label style={note} htmlFor="versie">
          Versie
        </label>
        <select id="versie" value={version} onChange={e => setVersion(e.target.value)}>
          {versions.map(v => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        {doc.meta?.releasedAt && <span style={badge}>gepubliceerd {doc.meta.releasedAt}</span>}
        <span style={badge}>alleen-lezen</span>
      </div>

      {standaard.render === 'parameters' ? (
        <ParametersStandaard doc={doc} />
      ) : standaard.render === 'interventies' ? (
        <InterventiesStandaard doc={doc} />
      ) : (
        <PublishedStandaard doc={doc} />
      )}
    </>
  );
};

// Feedback is a tab beside the standaarden rather than a page of its own: it is
// read against the standaard it is about, and switching between the two should
// not be a navigation.
const FEEDBACK_TAB = 'feedback';

const Home = () => {
  const [active, setActive] = useState(STANDAARDEN[0].key);
  const standaard = STANDAARDEN.find(s => s.key === active);

  return (
    <div>
      <h1>Meetstandaarden</h1>

      <div className="tab-container">
        {STANDAARDEN.map(s => (
          <div
            key={s.key}
            className={active === s.key ? 'active' : 'tablinks'}
            onClick={() => setActive(s.key)}
          >
            <p>{s.label}</p>
          </div>
        ))}
        <div
          className={active === FEEDBACK_TAB ? 'active' : 'tablinks'}
          onClick={() => setActive(FEEDBACK_TAB)}
        >
          <p>Feedback</p>
        </div>
      </div>

      {/* Remount on tab change so each standaard loads its own data cleanly
          instead of briefly rendering the previous one's. */}
      {active === FEEDBACK_TAB ? (
        <FeedbackBeheer />
      ) : (
        <Published key={standaard.key} standaard={standaard} />
      )}
    </div>
  );
};

export default Home;
