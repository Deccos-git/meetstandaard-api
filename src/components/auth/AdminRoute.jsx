import { useEffect, useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { auth } from '../../firebase/config';

// The panel is for the two admin accounts, not for everyone who registered on
// the public site. Being signed in is no longer enough, so this checks the
// `admin` custom claim (see functions/setAdminClaims.js).
//
// This is a UI gate and nothing more: what actually keeps a visitor out of the
// panel's data is the Firestore rules, which require the same claim on every
// read. Without those, hiding the route would only hide the button.
const AdminRoute = () => {
  const [status, setStatus] = useState('laden');

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async user => {
      if (!user) return setStatus('uitgelogd');

      // Read the claim from the token rather than from a Firestore document:
      // it is the same source the rules check, so the two cannot disagree.
      const token = await user.getIdTokenResult();
      setStatus(token.claims.admin === true ? 'admin' : 'geen-admin');
    });

    return () => unsubscribe();
  }, []);

  if (status === 'laden') return null;
  if (status === 'admin') return <Outlet />;

  return (
    <div style={{ padding: 24 }}>
      <h2>Geen toegang</h2>
      <p>
        {status === 'uitgelogd'
          ? 'Log in met een beheeraccount om deze pagina te zien.'
          : 'Dit account heeft geen beheerrechten.'}
      </p>
      <p>
        <Link to="/">Terug naar de meetstandaarden</Link>
      </p>
    </div>
  );
};

export default AdminRoute;
