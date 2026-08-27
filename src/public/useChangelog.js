import { useEffect, useState } from 'react';
import { haalChangelog } from '../api/client';

// Loaded once per standaard and shared, because two things need it: the history
// section, and the feedback list — a reaction that was acted on should say which
// version acted on it.
export const useChangelog = standaardKey => {
  const [entries, setEntries] = useState(null);
  const [fout, setFout] = useState('');

  useEffect(() => {
    let afgebroken = false;
    setEntries(null);
    setFout('');

    haalChangelog(standaardKey)
      .then(d => !afgebroken && setEntries(d.entries))
      .catch(e => !afgebroken && setFout(e.message));

    return () => {
      afgebroken = true;
    };
  }, [standaardKey]);

  return { entries, fout };
};

// Which changelog entry says it acted on this reaction, if any. The link lives
// on the entry rather than on the feedback: a version can answer several
// reactions at once, and the entry is what gets written when the change ships.
export const entryVoorFeedback = (feedbackId, entries) =>
  (entries || []).find(e => (e.feedback || []).includes(feedbackId)) || null;
