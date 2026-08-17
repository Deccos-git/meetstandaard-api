// The four meetstandaarden this panel shows, all read-only.
//
// They come from two different places, and that difference is temporary:
//
// - `published`: a versioned document per version in its own Firestore
//   collection, generated from an authoring workbook and seeded via the Admin
//   SDK. The version dropdown lists the versions that actually exist.
// - `effects`: the older shape, where a standard is the subset of the shared
//   `effects` collection tagged with its sector. Nothing there is versioned, so
//   the version below is the one the standard is known by, recorded here rather
//   than in the data.
//
// See docs/migratie-standaarden.md: once both `effects` standards are authored
// in a workbook like Energiearmoede, they become `published` too and the
// hardcoded version disappears.

export const STANDAARDEN = [
  {
    key: 'arbeidsparticipatie',
    label: 'Arbeidsparticipatie',
    source: 'effects',
    sector: 'arbeidsparticipatie',
    version: '0.9',
  },
  {
    key: 'gelijke-kansen',
    label: 'Gelijke kansen',
    source: 'effects',
    sector: 'gelijke-kansen',
    version: '1.0',
  },
  {
    key: 'energiearmoede',
    label: 'Energiearmoede',
    source: 'published',
    collection: 'MeetstandaardEnergiearmoede',
  },
  {
    key: 'participatieladder',
    label: 'Participatieladder',
    source: 'published',
    collection: 'MeetstandaardParameters',
    render: 'parameters',
  },
];

// Numeric-aware compare so "1.10" sorts after "1.2", matching the API.
export const compareVersions = (a, b) => {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
};

export const euro = n =>
  typeof n === 'number'
    ? n.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 })
    : '';
