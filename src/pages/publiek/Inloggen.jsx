import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../firebase/config';

// Inloggen is er alleen nog voor beheerders. Bezoekers hebben geen account meer
// nodig: feedback geven gaat via een open formulier op de standaard zelf.

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

  const navigate = useNavigate();

  const verstuur = async e => {
    e.preventDefault();
    setFout('');
    setBezig(true);

    try {
      const { user } = await signInWithEmailAndPassword(auth, email, wachtwoord);

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
          Inloggen is voor beheerders. Feedback op een standaard geven kan zonder account,
          onderaan de pagina van die standaard.
        </p>
      </div>
    </section>
  );
};

export default Inloggen;
