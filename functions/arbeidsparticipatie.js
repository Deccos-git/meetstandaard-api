import crypto from "crypto";

// Canonical parameters for the arbeidsparticipatie / participatieladder monetisation.
// Values copied verbatim from "Arbeidsparticipatie - Meetstandaard Social Impact - versie 1.0".
// This constant is the source used to seed Firestore (MeetstandaardParameters/{version}).
// The HTTP function itself reads from Firestore so new years can be added without redeploy.
export const PARAMETERS_2026_1 = {
  meta: {
    version: "2026.1",
    taxYear: 2026,
    source: "Meetstandaard Social Impact v1.0",
    updatedAt: "2026-01-01",
  },
  weeksPerYear: 52,
  volunteerValuePerHour: 10,

  taxBrackets: [
    { upTo: 38883, rate: 0.3575 },
    { upTo: 78426, rate: 0.3756 },
    { upTo: null, rate: 0.495 },
  ],

  incomeByEducationAndHoursBand: {
    "Geen startkwalificatie": {
      "minder dan 12 uur per week": 7800,
      "12 tot 20 uur per week": 15000,
      "20 tot 35 uur per week": 29000,
      Voltijd: 50400,
    },
    "MBO 2-4/havovwo": {
      "minder dan 12 uur per week": 15000,
      "12 tot 20 uur per week": 19300,
      "20 tot 35 uur per week": 35600,
      Voltijd: 56300,
    },
    "HBO/WO": {
      "minder dan 12 uur per week": 29700,
      "12 tot 20 uur per week": 30200,
      "20 tot 35 uur per week": 50900,
      Voltijd: 79600,
    },
  },

  benefitAmountPerYear: {
    Bijstandsuitkering: -18768,
    "WAO/WIA/WAZ/WAJONG": -21123,
  },
  bijstandUitvoeringskostenPerYear: -2900,

  ladderLabels: {
    1: "Geïsoleerd",
    2: "Sociale contacten buitenshuis",
    3: "Deelname / onbetaald werk",
    4: "Betaald werk met ondersteuning",
    5: "Regulier betaald werk",
  },

  options: {
    mainActivity: ["Opleiding", "Werk", "Vrijwilligerswerk", "Dagbesteding", "Werkzoekend", "Niet actief"],
    hoursBand: ["minder dan 12 uur per week", "12 tot 20 uur per week", "20 tot 35 uur per week", "Voltijd"],
    employabilityFactor: [1, 0.7, 0.5, 0.3, 0.1],
    educationLevel: ["Geen startkwalificatie", "MBO 2-4/havovwo", "HBO/WO"],
    volunteerHoursPerWeek: [0, 4, 12, 20, 32],
    benefitType: ["Geen", "Bijstandsuitkering", "WAO/WIA/WAZ/WAJONG"],
  },

  sources: {
    income: "CBS – Gemiddeld persoonlijk inkomen, bruto € per jaar, 2024 (dataset 85277NED)",
    bijstand: "Maatschappelijke prijslijst; bijstand 21 jr tot AOW-leeftijd per 1-1-2026; alleenstaand €1.564/mnd",
    bijstandUitvoeringskosten: "gemeente.nu – uitvoering bijstand kost bijna €2.900 per uitkering",
    arbeidsongeschiktheid: "vzinfo.nl – kosten arbeidsongeschiktheid",
  },
};

const COLLECTION = "MeetstandaardParameters";

// Numeric-aware compare so "2026.10" sorts after "2026.2".
const compareVersions = (a, b) => {
  const pa = String(a).split(".").map(Number);
  const pb = String(b).split(".").map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da !== db) return da - db;
  }
  return 0;
};

const listVersions = async (firestore) => {
  const snap = await firestore.collection(COLLECTION).get();
  return snap.docs.map((d) => d.id).sort(compareVersions);
};

// Send JSON with caching headers + ETag / If-None-Match handling.
const sendCached = (request, response, payload) => {
  const body = JSON.stringify(payload);
  const etag = `"${crypto.createHash("sha1").update(body).digest("hex")}"`;

  response.set("Cache-Control", "public, max-age=86400");
  response.set("ETag", etag);

  if (request.headers["if-none-match"] === etag) {
    return response.status(304).end();
  }

  response.set("Content-Type", "application/json; charset=utf-8");
  return response.status(200).send(body);
};

const sendError = (response, status, message) =>
  response.status(status).json({ error: message });

const sendLatest = async (firestore, request, response) => {
  const versions = await listVersions(firestore);
  if (versions.length === 0) {
    return sendError(response, 404, "No parameter versions available");
  }
  const doc = await firestore.collection(COLLECTION).doc(versions[versions.length - 1]).get();
  return sendCached(request, response, doc.data());
};

const sendVersion = async (firestore, request, response, version) => {
  const doc = await firestore.collection(COLLECTION).doc(version).get();
  if (!doc.exists) {
    return sendError(response, 404, `Unknown version: ${version}`);
  }
  return sendCached(request, response, doc.data());
};

// Routing matches the trailing path segments, so it works regardless of how the
// request arrives (bare function URL, emulator, or hosting rewrite). The contract
// path is /api/v1/arbeidsparticipatie/..., but .../versions, .../parameters and
// .../parameters/{version} all resolve the same way:
//   GET .../versions              -> { versions: [...] }
//   GET .../parameters            -> latest version body
//   GET .../parameters/{version}  -> pinned version body (404 if unknown)
export const handleArbeidsparticipatie = async (firestore, request, response) => {
  const segments = (request.path || "/").split("/").filter(Boolean);
  const last = segments[segments.length - 1];
  const prev = segments[segments.length - 2];

  if (last === "versions") {
    const versions = await listVersions(firestore);
    return sendCached(request, response, { versions });
  }

  if (last === "parameters") {
    return sendLatest(firestore, request, response);
  }

  if (prev === "parameters") {
    return sendVersion(firestore, request, response, decodeURIComponent(last));
  }

  return sendError(response, 404, "Not found");
};
