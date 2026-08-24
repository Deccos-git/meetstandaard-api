import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { sendEmailVerification, signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../firebase/config';

const FOUTTEKST = {
  // Firebase answers wrong-password and unknown-account with the same code on
  // purpose, so that an attacker cannot use the login form to discover which
  // addresses have an account. Do not helpfully split them apart again.
  'auth/invalid-credential': 'E-mailadres of wachtwoord klopt niet.',
  'auth/invalid-email': 'Dit e-mailadres klopt niet.',
  'auth/too-many-requests': 'Te veel pogingen. Wacht even en probeer het opnieuw.',
  'auth/network-request-failed': 'Geen verbinding. Probeer het opnieuw.',
};

const Inloggen = () => {
  const [email, setEmail] = useState('');
  const [wachtwoord, setWachtwoord] = useState('');
  const [fout, setFout] = useState('');
  const [bezig, setBezig] = useState(false);
  const [opnieuwGestuurd, setOpnieuwGestuurd] = useState(false);
  const [onbevestigd, setOnbevestigd] = useState(null);

  const navigate = useNavigate();

  const verstuur = async e => {
    e.preventDefault();
    setFout('');
    setBezig(true);

    try {
      const { user } = await signInWithEmailAndPassword(auth, email, wachtwoord);

      // An unverified account may sign in and read — it just cannot post
      // feedback. Saying so here beats letting them discover it at the point
      // where they have already typed a reaction.
      if (!user.emailVerified) {
        setOnbevestigd(user);
        return;
      }

      // Admins have somewhere else to be; everyone else belongs on the public
      // site. Reading the claim beats sending everyone to /beheer and letting
      // AdminRoute turn most of them away.
      const token = await user.getIdTokenResult();
      navigate(token.claims.admin === true ? '/beheer' : '/');
    } catch (authFout) {
      setFout(FOUTTEKST[authFout.code] || authFout.message);
    } finally {
      setBezig(false);
    }
  };

  if (onbevestigd) {
    return (
      <section className="publiek-sectie">
        <div className="publiek-breed publiek-smal">
          <p className="publiek-eyebrow">Nog te bevestigen</p>
          <h1>Je e-mailadres is nog niet bevestigd.</h1>
          <p>
            Je bent ingelogd en kunt alle standaarden lezen. Feedback geven kan zodra je op de link
            in de bevestigingsmail hebt geklikt.
          </p>

          {opnieuwGestuurd ? (
            <div className="publiek-melding publiek-melding-goed">
              <p>Er is een nieuwe bevestigingsmail onderweg naar {onbevestigd.email}.</p>
            </div>
          ) : (
            <button
              type="button"
              className="publiek-knop publiek-knop-oranje"
              onClick={async () => {
                await sendEmailVerification(onbevestigd);
                setOpnieuwGestuurd(true);
              }}
            >
              Stuur de mail opnieuw
            </button>
          )}

          <p style={{ marginTop: 20 }}>
            <Link to="/">Naar de meetstandaarden</Link>
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="publiek-sectie">
      <div className="publiek-breed publiek-smal">
        <p className="publiek-eyebrow">Inloggen</p>
        <h1>Welkom terug.</h1>

        {fout && (
          <div className="publiek-melding publiek-melding-fout">
            <p>{fout}</p>
          </div>
        )}

        <form className="publiek-formulier" onSubmit={verstuur}>
          <div className="publiek-veld">
            <label htmlFor="email">E-mailadres</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div className="publiek-veld">
            <label htmlFor="wachtwoord">Wachtwoord</label>
            <input
              id="wachtwoord"
              type="password"
              value={wachtwoord}
              onChange={e => setWachtwoord(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          <button type="submit" className="publiek-knop publiek-knop-zwart" disabled={bezig}>
            {bezig ? 'Bezig…' : 'Inloggen'}
          </button>
        </form>

        <p className="publiek-notitie" style={{ marginTop: 22 }}>
          Nog geen account? <Link to="/registreren">Account aanmaken</Link>
        </p>
      </div>
    </section>
  );
};

export default Inloggen;
