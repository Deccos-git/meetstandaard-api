import { Link, NavLink, Outlet } from 'react-router-dom';
import Logo from '../assets/logo-meetstandaard-alt.svg';
import './public.css';

// The public shell. Its header, palette and pill buttons follow meetstandaard.nl
// so a visitor arriving from there does not feel handed off to a different
// system — see src/public/public.css for where the values came from.
const PubliekeLayout = () => (
  <div className="publiek">
    <header className="publiek-header">
      <div className="publiek-header-inner">
        <Link to="/">
          <img className="publiek-logo" src={Logo} alt="Meetstandaard social impact" />
        </Link>
        <nav className="publiek-nav">
          <NavLink to="/">Meetstandaarden</NavLink>
          <NavLink to="/over">Over de standaard</NavLink>
          <a href="https://meetstandaard.nl" target="_blank" rel="noopener noreferrer">
            meetstandaard.nl
          </a>
          <Link className="publiek-knop publiek-knop-oranje publiek-knop-klein" to="/inloggen">
            Inloggen
          </Link>
        </nav>
      </div>
    </header>

    <main>
      <Outlet />
    </main>

    <footer className="publiek-footer">
      <div className="publiek-breed">
        <p>
          De meetstandaarden worden gepubliceerd via een open, alleen-lezen API. Elke versie blijft
          bestaan, zodat een meting van vandaag over jaren nog uit te leggen is.
        </p>
        <p>
          <Link to="/over">Over de standaard en de API</Link>
        </p>
      </div>
    </footer>
  </div>
);

export default PubliekeLayout;
