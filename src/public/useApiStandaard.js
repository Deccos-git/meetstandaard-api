import { useEffect, useState } from 'react';
import { haalStandaard, haalVersies } from '../api/client';
import { compareVersions } from '../standaarden';

// Loads one standaard from the public API: first which versions exist, then the
// selected one. Two requests rather than one because the version list is what
// the selector is built from, and it is tiny — the document is ~200 KB.
//
// The request is always pinned to an explicit version, even for the newest one.
// An unpinned request would quietly return something else the day a new version
// is published, and the whole point of showing the version is that what is on
// screen is identifiable.
export const useApiStandaard = api => {
  const [versies, setVersies] = useState([]);
  const [versie, setVersie] = useState(null);
  const [doc, setDoc] = useState(null);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState('');

  const sleutel = `${api.functie}/${api.resource}`;

  useEffect(() => {
    let afgebroken = false;
    setLaden(true);
    setFout('');
    setDoc(null);

    haalVersies(api)
      .then(({ versions }) => {
        if (afgebroken) return;
        const gesorteerd = [...versions].sort(compareVersions);
        setVersies(gesorteerd);
        setVersie(gesorteerd[gesorteerd.length - 1] ?? null);
      })
      .catch(e => {
        if (!afgebroken) {
          setFout(e.message);
          setLaden(false);
        }
      });

    return () => {
      afgebroken = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sleutel]);

  useEffect(() => {
    if (!versie) return undefined;
    let afgebroken = false;
    setLaden(true);

    haalStandaard(api, versie)
      .then(d => !afgebroken && setDoc(d))
      .catch(e => !afgebroken && setFout(e.message))
      .finally(() => !afgebroken && setLaden(false));

    return () => {
      afgebroken = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sleutel, versie]);

  return { versies, versie, setVersie, doc, laden, fout };
};
