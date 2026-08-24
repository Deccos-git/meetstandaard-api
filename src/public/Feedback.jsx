import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { dienFeedbackIn, haalFeedback } from '../api/client';
import { useAuth } from './useAuth';
import { STATUS_LABEL, doelenVan, labelVoorDoel } from './feedbackDoelen';
import { entryVoorFeedback } from './useChangelog';

// Feedback on a standaard, readable by everyone and writable by anyone with a
// verified account.
//
// Reading is deliberately open: someone deciding whether to adopt a standaard
// should be able to see what others found wrong with it and what was done about
// that. A feedback section only visible to the people who already signed up
// would be a suggestion box, not a public record.
const Feedback = ({ standaard, doc, versie, changelog }) => {
  const { gebruiker, isAdmin, laden: authLaadt } = useAuth();
  const [items, setItems] = useState(null);
  const [fout, setFout] = useState('');

  const doelen = useMemo(() => doelenVan(doc), [doc]);

  const laadOpnieuw = () =>
    haalFeedback(standaard.key)
      .then(d => setItems(d.feedback))
      .catch(e => setFout(e.message));

  useEffect(() => {
    let afgebroken = false;
    haalFeedback(standaard.key)
      .then(d => !afgebroken && setItems(d.feedback))
      .catch(e => !afgebroken && setFout(e.message));
    return () => {
      afgebroken = true;
    };
  }, [standaard.key]);

  return (
    <section style={{ marginTop: 56 }}>
      <p className="publiek-eyebrow">Feedback</p>

      {fout && (
        <div className="publiek-fout">
          <p>De feedback kon niet worden opgehaald. {fout}</p>
        </div>
      )}

      {!authLaadt && (
        <Formulier
          standaard={standaard}
          versie={versie}
          doelen={doelen}
          gebruiker={gebruiker}
          isAdmin={isAdmin}
          opGeplaatst={laadOpnieuw}
        />
      )}

      {items === null && !fout && <p>Feedback laden…</p>}
      {items?.length === 0 && <p className="publiek-notitie">Er is nog geen feedback op deze standaard.</p>}

      {items?.map(item => (
        <Item key={item.id} item={item} doelen={doelen} changelog={changelog} />
      ))}
    </section>
  );
};

const Item = ({ item, doelen, changelog }) => {
  const entry = entryVoorFeedback(item.id, changelog);

  return (
    <div className="publiek-niveau" style={{ marginBottom: 14 }}>
    <div className="publiek-niveau-kop">
      <strong>{labelVoorDoel(item.doel, doelen)}</strong>
      <span className={`publiek-badge publiek-status-${item.status}`}>{STATUS_LABEL[item.status]}</span>
      {/* The version the remark was made against. A reaction to 0.9 is about the
          wording 0.9 had, which is not necessarily the wording on screen. */}
      <span className="publiek-badge">versie {item.versie}</span>
    </div>

    <p style={{ fontSize: 16, whiteSpace: 'pre-wrap' }}>{item.tekst}</p>

    <p className="publiek-notitie">
      {item.auteur.naam}
      {item.auteur.bedrijf && ` · ${item.auteur.bedrijf}`}
      {' · '}
      {new Date(item.aangemaaktOp).toLocaleDateString('nl-NL')}
    </p>

    {item.besluit && (
      <div className="publiek-besluit">
        <p className="publiek-eyebrow" style={{ marginBottom: 4 }}>Besluit</p>
        <p style={{ fontSize: 16, whiteSpace: 'pre-wrap' }}>{item.besluit.toelichting}</p>
        <p className="publiek-notitie">
          {new Date(item.besluit.op).toLocaleDateString('nl-NL')}
          {/* Closes the loop: reaction to decision to the version that carried
              it out. Without this last step "verwerkt" is a word, not a fact. */}
          {entry && ` · doorgevoerd in versie ${entry.versie} (${entry.datum})`}
        </p>
      </div>
    )}
    </div>
  );
};

const Formulier = ({ standaard, versie, doelen, gebruiker, isAdmin, opGeplaatst }) => {
  const [doelSleutel, setDoelSleutel] = useState('standaard');
  const [tekst, setTekst] = useState('');
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  const [geplaatst, setGeplaatst] = useState(false);

  // No explanation, but still a way in: without a control here a visitor has no
  // route from reading to reacting.
  if (!gebruiker) {
    return (
      <p style={{ marginBottom: 24 }}>
        <Link className="publiek-knop publiek-knop-licht publiek-knop-klein" to="/inloggen">
          Reageren
        </Link>
      </p>
    );
  }

  // Mirrors the rule the endpoint applies, admin exemption included — a form
  // that blocks what the API would accept is worse than no check at all.
  if (!gebruiker.emailVerified && !isAdmin) {
    return (
      <div className="publiek-melding publiek-melding-fout" style={{ marginBottom: 24 }}>
        <p>
          Bevestig eerst je e-mailadres via de link in de bevestigingsmail. Daarna kun je reageren.
        </p>
      </div>
    );
  }

  const verstuur = async e => {
    e.preventDefault();
    setBezig(true);
    setFout('');

    const doel =
      doelSleutel === 'standaard'
        ? { type: 'standaard' }
        : (() => {
            const [type, ...rest] = doelSleutel.split(':');
            return { type, id: rest.join(':') };
          })();

    try {
      await dienFeedbackIn({ standaard: standaard.key, versie, doel, tekst }, gebruiker);
      setTekst('');
      setGeplaatst(true);
      await opGeplaatst();
    } catch (e) {
      setFout(e.fouten ? Object.values(e.fouten).join(' ') : e.message);
    } finally {
      setBezig(false);
    }
  };

  return (
    <form className="publiek-feedbackformulier" onSubmit={verstuur}>
      {geplaatst && (
        <div className="publiek-melding publiek-melding-goed">
          <p>Je reactie staat erbij. Je ziet hem hieronder terug zodra hij is beoordeeld.</p>
        </div>
      )}
      {fout && (
        <div className="publiek-melding publiek-melding-fout">
          <p>{fout}</p>
        </div>
      )}

      <div className="publiek-veld">
        <label htmlFor="doel">Waar gaat het over?</label>
        <select id="doel" value={doelSleutel} onChange={e => setDoelSleutel(e.target.value)}>
          <option value="standaard">De standaard als geheel</option>
          {doelen.map(d => (
            <option key={`${d.type}:${d.id}`} value={`${d.type}:${d.id}`}>
              {d.label}
            </option>
          ))}
        </select>
      </div>

      <div className="publiek-veld">
        <label htmlFor="tekst">Je reactie</label>
        <textarea
          id="tekst"
          value={tekst}
          onChange={e => setTekst(e.target.value)}
          rows={5}
          maxLength={4000}
          required
        />
        <p className="publiek-hint">
          Reageer je op versie {versie}. Dat wordt erbij vastgelegd, zodat later duidelijk is welke
          formulering je bedoelde.
        </p>
      </div>

      <button type="submit" className="publiek-knop publiek-knop-zwart" disabled={bezig || !tekst.trim()}>
        {bezig ? 'Versturen…' : 'Plaats reactie'}
      </button>
    </form>
  );
};

export default Feedback;
