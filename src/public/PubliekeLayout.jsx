import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import Logo from '../assets/logo-meetstandaard-alt.svg';
import { auth } from '../firebase/config';
import { useAuth } from './useAuth';
import './public.css';

// The public shell. Its header, palette and pill buttons follow meetstandaard.nl
// so a visitor arriving from there does not feel handed off to a different
// system — see src/public/public.css for where the values came from.
// Signed-out and still-loading both render nothing in the account slot rather
// than a login button, so the header does not flicker for someone whose session
// is still being restored.
const Account = () => {
  const { gebruiker, isAdmin, laden } = useAuth();
  const navigate = useNavigate();

  if (laden) return null;

  if (!gebruiker) {
    return (
      <Link className="publiek-knop publiek-knop-oranje publiek-knop-klein" to="/inloggen">
        Inloggen
      </Link>
    );
  }

  return (
    <div className="publiek-account">
      {isAdmin && <Link to="/beheer">Beheer</Link>}
      <Link to="/profiel">{gebruiker.email}</Link>
      <button
        type="button"
        onClick={async () => {
          await auth.signOut();
          navigate('/');
        }}
      >
        Uitloggen
      </button>
    </div>
  );
};

const PubliekeLayout = () => (
  <div className="publiek">
    <header className="publiek-header">
      <div className="publiek-header-inner">
        <Link to="/">
          <img className="publiek-logo" src={Logo} alt="Meetstandaard social impact" />
        </Link>
        <nav className="publiek-nav">
          <NavLink to="/">Meetstandaarden</NavLink>
          <Account />
        </nav>
      </div>
    </header>

    <main>
      <Outlet />
    </main>

    <footer className="publiek-footer">
      <div className="publiek-breed">
        <p>
          Elke versie van een meetstandaard blijft bestaan. Zo is een meting van vandaag over jaren
          nog uit te leggen tegen de methode waarmee hij is gedaan.
        </p>
      </div>
    </footer>
  </div>
);

export default PubliekeLayout;
