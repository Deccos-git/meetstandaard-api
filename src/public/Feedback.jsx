import { useEffect, useMemo, useState } from 'react';
import { dienFeedbackIn, haalFeedback } from '../api/client';
import { STATUS_LABEL, doelenVan, labelVoorDoel } from './feedbackDoelen';
import { entryVoorFeedback } from './useChangelog';

// Feedback on a standaard, readable and writable by everyone.
//
// Reading is deliberately open: someone deciding whether to adopt a standaard
// should be able to see what others found wrong with it and what was done about
// that. A feedback section only visible to the people who already signed up
// would be a suggestion box, not a public record.
//
// Writing is open for the same reason it is read: an account was a threshold in
// front of the one thing this project asks of an outsider. What takes its place
// is moderation — the API stores a submission immediately and publishes it only
// once a beheerder has seen it — so this list shows reviewed feedback, never
// whatever arrived last.
const Feedback = ({ standaard, doc, versie, changelog }) => {
  const [items, setItems] = useState(null);
  const [fout, setFout] = useState('');

  const doelen = useMemo(() => doelenVan(doc), [doc]);

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

      <Formulier standaard={standaard} versie={versie} doelen={doelen} />

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

const LEEG = { naam: '', bedrijf: '', email: '' };

const Formulier = ({ standaard, versie, doelen }) => {
  const [velden, setVelden] = useState(LEEG);
  const [doelSleutel, setDoelSleutel] = useState('standaard');
  const [tekst, setTekst] = useState('');
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  const [geplaatst, setGeplaatst] = useState(false);

  const wijzig = veld => e => {
    setVelden({ ...velden, [veld]: e.target.value });
    setGeplaatst(false);
  };

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
      await dienFeedbackIn({ standaard: standaard.key, versie, doel, tekst, ...velden });
      // Alleen de reactie leegmaken. Wie twee dingen te melden heeft, hoort zijn
      // naam en adres niet twee keer te hoeven typen.
      setTekst('');
      setGeplaatst(true);
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
          <p>
            Dank je wel. Je reactie is binnen. Hij verschijnt hieronder zodra we hem hebben
            beoordeeld — met het besluit erbij.
          </p>
        </div>
      )}
      {fout && (
        <div className="publiek-melding publiek-melding-fout">
          <p>{fout}</p>
        </div>
      )}

      <div className="publiek-veld">
        <label htmlFor="naam">Je naam</label>
        <input
          id="naam"
          type="text"
          value={velden.naam}
          onChange={wijzig('naam')}
          autoComplete="name"
          maxLength={120}
          required
        />
      </div>

      <div className="publiek-veld">
        <label htmlFor="bedrijf">Organisatie</label>
        <input
          id="bedrijf"
          type="text"
          value={velden.bedrijf}
          onChange={wijzig('bedrijf')}
          autoComplete="organization"
          maxLength={160}
        />
        <p className="publiek-notitie">Optioneel. Laat leeg als je op persoonlijke titel reageert.</p>
      </div>

      <div className="publiek-veld">
        <label htmlFor="email">E-mailadres</label>
        <input
          id="email"
          type="email"
          value={velden.email}
          onChange={wijzig('email')}
          autoComplete="email"
          maxLength={254}
          required
        />
        {/* Wie zijn adres achterlaat hoort te weten waar het heen gaat. Het is
            het enige veld op dit formulier dat niet publiek wordt. */}
        <p className="publiek-notitie">
          Niet publiek zichtbaar. Alleen om contact met je op te nemen over deze reactie.
        </p>
      </div>

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
          onChange={e => {
            setTekst(e.target.value);
            setGeplaatst(false);
          }}
          rows={5}
          maxLength={4000}
          required
        />
      </div>

      <button
        type="submit"
        className="publiek-knop publiek-knop-zwart"
        disabled={bezig || !tekst.trim() || !velden.naam.trim() || !velden.email.trim()}
      >
        {bezig ? 'Versturen…' : 'Plaats reactie'}
      </button>

      <p className="publiek-notitie" style={{ marginTop: 12 }}>
        Reacties worden eerst gelezen en daarna gepubliceerd, met naam, organisatie en het besluit
        dat we erover namen.
      </p>
    </form>
  );
};

export default Feedback;
