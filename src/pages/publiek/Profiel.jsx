import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { bewaarProfiel } from '../../api/client';
import { useAuth } from '../../public/useAuth';

// Name and organisation for the signed-in account.
//
// Registration writes these, but until now that was the only moment they could
// be set — which left two kinds of people stuck: accounts created before that
// flow existed, and anyone whose registration got as far as the account but not
// as far as the profile. Both hit "je profiel is nog niet compleet" with nowhere
// to go.
//
// Reading is direct from Firestore, which the rules allow for your own document
// and nothing else. Writing goes through the API like every other write.
const Profiel = () => {
  const { gebruiker, laden: authLaadt } = useAuth();
  const [velden, setVelden] = useState({ naam: '', bedrijf: '' });
  const [laden, setLaden] = useState(true);
  const [bezig, setBezig] = useState(false);
  const [bewaard, setBewaard] = useState(false);
  const [fout, setFout] = useState('');
  const [veldFouten, setVeldFouten] = useState({});

  const navigate = useNavigate();

  useEffect(() => {
    if (authLaadt) return;
    if (!gebruiker) {
      setLaden(false);
      return;
    }

    let afgebroken = false;
    getDoc(doc(db, 'users', gebruiker.uid))
      .then(snap => {
        if (afgebroken) return;
        const data = snap.exists() ? snap.data() : {};
        setVelden({ naam: data.naam || '', bedrijf: data.bedrijf || '' });
      })
      .catch(() => {
        // A missing profile is the normal case here, not a failure — the form
        // simply starts empty.
      })
      .finally(() => !afgebroken && setLaden(false));

    return () => {
      afgebroken = true;
    };
  }, [gebruiker, authLaadt]);

  if (authLaadt || laden) return null;

  if (!gebruiker) {
    return (
      <section className="publiek-sectie">
        <div className="publiek-breed publiek-smal">
          <h1>Log eerst in.</h1>
          <p>
            <Link className="publiek-knop publiek-knop-zwart" to="/inloggen">
              Inloggen
            </Link>
          </p>
        </div>
      </section>
    );
  }

  const verstuur = async e => {
    e.preventDefault();
    setBezig(true);
    setFout('');
    setVeldFouten({});

    try {
      await bewaarProfiel(velden, gebruiker);
      setBewaard(true);
    } catch (e) {
      setVeldFouten(e.fouten || {});
      setFout(e.message);
    } finally {
      setBezig(false);
    }
  };

  return (
    <section className="publiek-sectie">
      <div className="publiek-breed publiek-smal">
        <p className="publiek-eyebrow">Je gegevens</p>
        <h1>Naam en organisatie.</h1>
        <p>Deze staan bij je reacties, zodat te zien is wie iets vindt.</p>

        {bewaard && (
          <div className="publiek-melding publiek-melding-goed">
            <p>Opgeslagen.</p>
          </div>
        )}
        {fout && (
          <div className="publiek-melding publiek-melding-fout">
            <p>{fout}</p>
          </div>
        )}

        <form className="publiek-formulier" onSubmit={verstuur}>
          {[
            { veld: 'naam', label: 'Naam', autoComplete: 'name' },
            { veld: 'bedrijf', label: 'Organisatie', autoComplete: 'organization' },
          ].map(({ veld, label, autoComplete }) => (
            <div className="publiek-veld" key={veld}>
              <label htmlFor={veld}>{label}</label>
              <input
                id={veld}
                type="text"
                value={velden[veld]}
                onChange={e => setVelden({ ...velden, [veld]: e.target.value })}
                autoComplete={autoComplete}
                aria-invalid={veldFouten[veld] ? 'true' : undefined}
                required
              />
              {veldFouten[veld] && <p className="publiek-veldfout">{veldFouten[veld]}</p>}
            </div>
          ))}

          <button type="submit" className="publiek-knop publiek-knop-zwart" disabled={bezig}>
            {bezig ? 'Opslaan…' : 'Opslaan'}
          </button>
        </form>

        <p className="publiek-notitie" style={{ marginTop: 22 }}>
          Ingelogd als {gebruiker.email}.{' '}
          <button
            type="button"
            className="publiek-tekstknop"
            onClick={() => navigate('/')}
          >
            Naar de meetstandaarden
          </button>
        </p>
      </div>
    </section>
  );
};

export default Profiel;
