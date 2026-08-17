import { useState } from 'react';
import { STANDAARDEN } from '../standaarden';
import { useVersionedStandaard } from '../firebase/useVersionedStandaard';
import EffectenStandaard from '../components/standaard/EffectenStandaard';
import PublishedStandaard from '../components/standaard/PublishedStandaard';
import ParametersStandaard from '../components/standaard/ParametersStandaard';
import { badge, note, versionBar } from '../components/standaard/SharedStyles';

// A published standaard loads its versions from Firestore and offers them in a
// dropdown; the two effects-backed standaarden are not versioned yet, so they
// show their known version as a fixed label instead. Kept in one component so
// both cases share the same header.
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

      {standaard.render === 'parameters' ? <ParametersStandaard doc={doc} /> : <PublishedStandaard doc={doc} />}
    </>
  );
};

const Effecten = ({ standaard }) => (
  <>
    <div style={versionBar}>
      <label style={note} htmlFor="versie">
        Versie
      </label>
      {/* Not versioned in the data yet — see docs/migratie-standaarden.md. One
          option so the control reads the same across all four tabs. */}
      <select id="versie" value={standaard.version} disabled>
        <option value={standaard.version}>{standaard.version}</option>
      </select>
      <span style={badge}>nog niet geversioneerd</span>
      <span style={badge}>alleen-lezen</span>
    </div>

    <EffectenStandaard sector={standaard.sector} />
  </>
);

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
      </div>

      {/* Remount on tab change so each standaard loads its own data cleanly
          instead of briefly rendering the previous one's. */}
      {standaard.source === 'published' ? (
        <Published key={standaard.key} standaard={standaard} />
      ) : (
        <Effecten key={standaard.key} standaard={standaard} />
      )}
    </div>
  );
};

export default Home;
