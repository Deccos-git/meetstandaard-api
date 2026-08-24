// The public site reads every standaard over HTTP, never through the Firebase
// SDK: the Firestore rules only let an admin read, so an anonymous visitor has
// no other way in. That is deliberate — it also means the page shows exactly
// what any other consumer of the API would get.
//
// Overridable so a preview build can point at an emulator without a rebuild of
// the registry.
const BASE =
  import.meta.env.VITE_API_BASE || 'https://us-central1-meetstandaard-api.cloudfunctions.net';

const resourcePath = ({ functie, resource }) => `${BASE}/${functie}/api/v1/${functie}/${resource}`;

const haal = async url => {
  const res = await fetch(url);
  if (!res.ok) {
    // The API answers a 404 with the versions that do exist and a 429 with a
    // Retry-After; both are worth showing rather than flattening to "mislukt".
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `De API antwoordde met ${res.status}.`);
  }
  return res.json();
};

// { versions: [...], latest } for one standaard.
export const haalVersies = api => haal(`${resourcePath(api)}/versions`);

// A pinned version, or the newest one when `version` is omitted. The public
// page always pins: it shows a version selector, and an unpinned request would
// silently change what is on screen the day a new version is published.
export const haalStandaard = (api, version) =>
  haal(version ? `${resourcePath(api)}/${version}` : resourcePath(api));

export const API_BASE = BASE;

// The write endpoints take the caller's Firebase ID token. They are the only
// way a client changes anything — the Firestore rules deny client writes
// outright — so every call goes through here rather than through the SDK.
export const postMetToken = async (pad, body, gebruiker) => {
  const token = await gebruiker.getIdToken();

  const res = await fetch(`${BASE}${pad}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

  const antwoord = await res.json().catch(() => null);
  if (!res.ok) {
    // The endpoint answers a 400 with which field was wrong, so hand that back
    // rather than flattening every failure to one message.
    const fout = new Error(antwoord?.error || `De server antwoordde met ${res.status}.`);
    fout.fouten = antwoord?.fouten || null;
    throw fout;
  }
  return antwoord;
};

export const bewaarProfiel = ({ naam, bedrijf }, gebruiker) =>
  postMetToken('/gebruikers/api/v1/gebruikers/profiel', { naam, bedrijf }, gebruiker);
