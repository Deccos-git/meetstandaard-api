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
//
// Er is niets meer waarvoor een bezoeker inlogt — feedback geven kan zonder
// account — dus de kop toont geen inlogknop meer. /inloggen blijft bestaan voor
// beheerders, die het adres kennen.
const Account = () => {
  const { gebruiker, isAdmin, laden } = useAuth();
  const navigate = useNavigate();

  if (laden || !gebruiker) return null;

  return (
    <div className="publiek-account">
      {isAdmin && <Link to="/beheer">Beheer</Link>}
      <span>{gebruiker.email}</span>
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

    {/* Leeg, net als het paneel: een gekleurde band die de pagina afsluit. */}
    <footer className="publiek-footer" />
  </div>
);

export default PubliekeLayout;
