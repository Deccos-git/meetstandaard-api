import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from './config';
import { compareVersions } from '../standaarden';

// Loads every published version of a standaard from its collection and lets the
// caller switch between them. One read fetches the lot: version documents are
// few, and switching version then costs nothing.
//
// Defaults to the newest version, matching the API's unpinned route.
export const useVersionedStandaard = collectionName => {
  const [byVersion, setByVersion] = useState({});
  const [version, setVersion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setErr('');
      try {
        const snap = await getDocs(collection(db, collectionName));
        if (cancelled) return;
        if (snap.empty) throw new Error('Geen versies gevonden.');

        const map = Object.fromEntries(snap.docs.map(d => [d.id, d.data()]));
        const newest = Object.keys(map).sort(compareVersions).pop();
        setByVersion(map);
        setVersion(newest);
      } catch (e) {
        console.error(e);
        if (!cancelled) setErr('De standaard ophalen is mislukt.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [collectionName]);

  const versions = useMemo(() => Object.keys(byVersion).sort(compareVersions), [byVersion]);

  return { versions, version, setVersion, doc: version ? byVersion[version] : null, loading, err };
};
