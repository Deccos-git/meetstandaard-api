import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { auth } from '../../firebase/config';

const ProtectedRoute = () => {
  const [isAuth, setIsAuth] = useState(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setIsAuth(!!user);
    });

    return () => unsubscribe();
  }, []);

  if (isAuth === null) {
    return null;
  }

  return isAuth ? <Outlet /> : <p>Log in om deze pagina te zien</p>;
};

export default ProtectedRoute;
