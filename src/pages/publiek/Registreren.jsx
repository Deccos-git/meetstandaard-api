import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { auth } from '../../firebase/config';
import { bewaarProfiel } from '../../api/client';

// Registration is deliberately two steps against two systems, and they can fail
// independently:
//
//   1. Firebase Auth creates the account (that is Auth, not Firestore).
//   2. The name and company are posted to the API with the fresh ID token,
//      because no client may write to Firestore at all.
//
// If step 2 fails the account exists without a profile. That is recoverable
// rather than hidden: the endpoint is idempotent by uid, so the form offers to
// retry just that step instead of asking for a password that already worked.
const FOUTTEKST = {
  'auth/email-already-in-use': 'Er bestaat al een account met dit e-mailadres.',
  'auth/invalid-email': 'Dit e-mailadres klopt niet.',
  'auth/weak-password': 'Kies een wachtwoord van minimaal 6 tekens.',
  'auth/network-request-failed': 'Geen verbinding. Probeer het opnieuw.',
};

const Registreren = () => {
  const [velden, setVelden] = useState({ naam: '', bedrijf: '', email: '', wachtwoord: '' });
  const [fout, setFout] = useState('');
  const [veldFouten, setVeldFouten] = useState({});
  const [bezig, setBezig] = useState(false);
  const [klaar, setKlaar] = useState(false);
  // Set only when the account exists but its profile was not stored.
  const [halveRegistratie, setHalveRegistratie] = useState(null);

  const navigate = useNavigate();
  const wijzig = veld => e => setVelden({ ...velden, [veld]: e.target.value });

  const bewaar = async gebruiker => {
    await bewaarProfiel({ naam: velden.naam, bedrijf: velden.bedrijf }, gebruiker);
    setHalveRegistratie(null);
    setKlaar(true);
  };

  const verstuur = async e => {
    e.preventDefault();
    setFout('');
    setVeldFouten({});
    setBezig(true);

    try {
      const { user } = await createUserWithEmailAndPassword(auth, velden.email, velden.wachtwoord);

      // Before the profile call: a verification mail that fails to send must not
      // cost the account, and feedback is gated on a verified address later.
      await sendEmailVerification(user);

      try {
        await bewaar(user);
      } catch (profielFout) {
        setHalveRegistratie(user);
        setVeldFouten(profielFout.fouten || {});
        setFout(profielFout.message);
      }
    } catch (authFout) {
      setFout(FOUTTEKST[authFout.code] || authFout.message);
    } finally {
      setBezig(false);
    }
  };

  const opnieuwBewaren = async () => {
    setBezig(true);
    setFout('');
    try {
      await bewaar(halveRegistratie);
    } catch (e) {
      setVeldFouten(e.fouten || {});
      setFout(e.message);
    } finally {
      setBezig(false);
    }
  };

  if (klaar) {
    return (
      <section className="publiek-sectie">
        <div className="publiek-breed publiek-smal">
          <p className="publiek-eyebrow">Account aangemaakt</p>
          <h1>Bevestig je e-mailadres.</h1>
          <div className="publiek-melding publiek-melding-goed">
            <p>
              We hebben een bevestigingsmail gestuurd naar <strong>{velden.email}</strong>. Klik op
              de link daarin; daarna kun je feedback geven op een standaard.
            </p>
          </div>
          <p className="publiek-notitie">
            De standaarden lezen kan altijd, ook zonder account. Verificatie is er alleen om te
            voorkomen dat feedback van een niet-bestaand adres komt.
          </p>
          <p>
            <button type="button" className="publiek-knop publiek-knop-zwart" onClick={() => navigate('/')}>
              Naar de meetstandaarden
            </button>
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="publiek-sectie">
      <div className="publiek-breed publiek-smal">
        <p className="publiek-eyebrow">Account aanmaken</p>
        <h1>Meepraten over de standaard.</h1>
        <p>
          Lezen kan zonder account. Een account heb je alleen nodig om feedback te geven — je naam
          en organisatie staan dan bij je reactie, zodat te zien is wie iets vindt.
        </p>

        {fout && (
          <div className="publiek-melding publiek-melding-fout">
            <p>{fout}</p>
            {halveRegistratie && (
              <p style={{ marginTop: 10 }}>
                Je account is wél aangemaakt. Alleen je naam en organisatie zijn nog niet opgeslagen.
              </p>
            )}
          </div>
        )}

        {halveRegistratie ? (
          <button
            type="button"
            className="publiek-knop publiek-knop-zwart"
            onClick={opnieuwBewaren}
            disabled={bezig}
          >
            {bezig ? 'Bezig…' : 'Probeer opnieuw op te slaan'}
          </button>
        ) : (
          <form className="publiek-formulier" onSubmit={verstuur}>
            {[
              { veld: 'naam', label: 'Naam', type: 'text', autoComplete: 'name' },
              { veld: 'bedrijf', label: 'Organisatie', type: 'text', autoComplete: 'organization' },
              { veld: 'email', label: 'E-mailadres', type: 'email', autoComplete: 'email' },
            ].map(({ veld, label, type, autoComplete }) => (
              <div className="publiek-veld" key={veld}>
                <label htmlFor={veld}>{label}</label>
                <input
                  id={veld}
                  type={type}
                  value={velden[veld]}
                  onChange={wijzig(veld)}
                  autoComplete={autoComplete}
                  aria-invalid={veldFouten[veld] ? 'true' : undefined}
                  required
                />
                {veldFouten[veld] && <p className="publiek-veldfout">{veldFouten[veld]}</p>}
              </div>
            ))}

            <div className="publiek-veld">
              <label htmlFor="wachtwoord">Wachtwoord</label>
              <input
                id="wachtwoord"
                type="password"
                value={velden.wachtwoord}
                onChange={wijzig('wachtwoord')}
                autoComplete="new-password"
                minLength={6}
                required
              />
              <p className="publiek-hint">Minimaal 6 tekens.</p>
            </div>

            <button type="submit" className="publiek-knop publiek-knop-zwart" disabled={bezig}>
              {bezig ? 'Bezig…' : 'Account aanmaken'}
            </button>
          </form>
        )}

        <p className="publiek-notitie" style={{ marginTop: 22 }}>
          Heb je al een account? <Link to="/inloggen">Inloggen</Link>
        </p>
      </div>
    </section>
  );
};

export default Registreren;
