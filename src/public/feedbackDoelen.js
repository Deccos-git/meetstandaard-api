// The things a reaction can be about, read out of the document that is on
// screen. Building the list here rather than putting a button inside every
// renderer keeps the three renderers presentational, and means a new document
// kind needs one branch instead of a change in three components.
//
// The label is resolved from the pinned document at render time. It is
// deliberately not stored on the feedback: the submitter names the target by id,
// so nobody can put words in the standaard's mouth by typing its label.
export const doelenVan = doc => {
  if (!doc) return [];

  if (Array.isArray(doc.effecten)) {
    return doc.effecten.map(e => ({ type: 'effect', id: e.id, label: `${e.id} — ${e.effect}` }));
  }
  if (Array.isArray(doc.interventies)) {
    return doc.interventies.map(i => ({
      type: 'interventie',
      id: i.id,
      label: `${i.id} — ${i.interventie}`,
    }));
  }
  if (Array.isArray(doc.ladderLevels)) {
    return doc.ladderLevels.map(l => ({
      type: 'parameter',
      id: String(l.trede),
      label: `Trede ${l.trede} — ${l.label}`,
    }));
  }
  return [];
};

// A reaction keeps pointing at its target even when that target no longer
// exists in the version being viewed — an effect can be renamed or dropped
// between versions. Saying "onbekend onderdeel" beats silently showing it as
// feedback on the standaard as a whole.
export const labelVoorDoel = (doel, doelen) => {
  if (!doel || doel.type === 'standaard') return 'De standaard als geheel';
  const gevonden = doelen.find(d => d.type === doel.type && d.id === doel.id);
  return gevonden ? gevonden.label : `${doel.id} (onbekend onderdeel in deze versie)`;
};

export const STATUS_LABEL = {
  nieuw: 'nieuw',
  'in-behandeling': 'in behandeling',
  verwerkt: 'verwerkt',
  afgewezen: 'afgewezen',
};
