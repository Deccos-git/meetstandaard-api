import { useEffect, useState } from 'react';
import { auth } from '../firebase/config';

// Who is signed in, and whether they are an admin.
//
// `gebruiker` is undefined while Firebase is still restoring the session, null
// when signed out. The distinction matters: rendering "log in" during the
// restore makes the header flicker on every page load for someone who is
// already signed in.
//
// The admin flag is read from the ID token, the same place the Firestore rules
// read it, so the UI and the enforcement cannot disagree.
export const useAuth = () => {
  const [gebruiker, setGebruiker] = useState(undefined);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(
    () =>
      auth.onAuthStateChanged(async u => {
        setGebruiker(u);
        if (!u) return setIsAdmin(false);
        const token = await u.getIdTokenResult();
        setIsAdmin(token.claims.admin === true);
      }),
    []
  );

  return { gebruiker, isAdmin, laden: gebruiker === undefined };
};
