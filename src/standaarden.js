// The six meetstandaarden, for both the public site and the panel.
//
// All six are now published documents: one Firestore collection per standaard,
// one document per version, generated and seeded via the Admin SDK. The version
// numbers that used to be hardcoded here for arbeidsparticipatie and gelijke
// kansen are gone — those two are snapshotted into versioned documents by
// functions/exportEffectenStandaard.js, so every version a visitor sees comes
// from the API.
//
// Each entry says where to read it from twice, because the two front-ends read
// differently and deliberately so:
//
// - `api`     the public site, over HTTP, unauthenticated. Anonymous visitors
//             cannot read Firestore at all — the rules require an admin.
// - `collection`  the panel, over the Firebase SDK as a signed-in admin.
export const STANDAARDEN = [
  {
    key: 'arbeidsparticipatie',
    label: 'Arbeidsparticipatie',
    omschrijving: 'Effecten van begeleiding naar werk, van mentale gezondheid tot vakvaardigheden.',
    collection: 'MeetstandaardArbeidsparticipatie',
    api: { functie: 'meetstandaard', resource: 'arbeidsparticipatie' },
  },
  {
    key: 'gelijke-kansen',
    label: 'Gelijke kansen',
    omschrijving: 'Effecten op kansengelijkheid van kinderen en jongeren.',
    collection: 'MeetstandaardGelijkeKansen',
    api: { functie: 'meetstandaard', resource: 'gelijke-kansen' },
  },
  {
    key: 'arbeidsvaardigheden',
    label: 'Arbeidsvaardigheden',
    omschrijving: 'Wat een deelnemer zelf op de werkvloer kan, van zelfstandigheid tot betrouwbaarheid.',
    collection: 'MeetstandaardArbeidsvaardigheden',
    api: { functie: 'meetstandaard', resource: 'arbeidsvaardigheden' },
  },
  {
    key: 'energiearmoede',
    label: 'Energiearmoede',
    omschrijving: 'Effecten van interventies bij huishoudens met een hoge energierekening.',
    collection: 'MeetstandaardEnergiearmoede',
    api: { functie: 'meetstandaard', resource: 'energiearmoede' },
  },
  {
    key: 'milieu-circulariteit',
    label: 'Milieu & circulariteit',
    omschrijving: 'Interventies met hun fysieke besparing per eenheid en de waarde daarvan.',
    collection: 'MeetstandaardMilieuCirculariteit',
    api: { functie: 'meetstandaard', resource: 'milieu-circulariteit' },
    render: 'interventies',
  },
  {
    key: 'participatieladder',
    label: 'Participatieladder',
    omschrijving: 'De parameters waarmee een stap op de participatieladder wordt gewaardeerd.',
    collection: 'MeetstandaardParameters',
    api: { functie: 'arbeidsparticipatie', resource: 'parameters' },
    render: 'parameters',
  },
];

export const standaardVoorKey = key => STANDAARDEN.find(s => s.key === key) ?? null;

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

// 2026-08-17 leest als een systeemveld; 17 augustus 2026 leest als een datum.
export const datum = iso => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
};
