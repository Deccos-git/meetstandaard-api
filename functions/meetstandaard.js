import { handleVersionedResource, sendCached, sendError } from "./versionedResource.js";
import energiearmoede09 from "./data/meetstandaard-energiearmoede-0.9.json" with { type: "json" };
import milieuCirculariteit09 from "./data/interventiebibliotheek-milieu-circulariteit-0.9.json" with { type: "json" };

// The published standaarden, each served as one versioned document per version.
//
// Two kinds live here, distinguished by `meta.kind` on the document itself:
//
// - a sector meetstandaard ("meetstandaard"): effecten with their stellingen,
//   situatieschetsen and monetarisering per niveau, plus bronnen, parameters,
//   the aggregatie/overlapmodel, the gevoeligheidsanalyse and the audittrail.
// - an interventiebibliotheek ("interventiebibliotheek"): interventions with
//   their physical effect per unit, the central prices and emission factors they
//   are converted with, and the CO2 monetisation.
//
// The endpoint does not care which: a version is a document, and versioning,
// caching and routing are identical. Consumers switch on `meta.kind`.
//
// The documents are generated from their authoring workbooks by the scripts in
// tools/ and committed under data/. They are the source for seeding Firestore
// (see seedMeetstandaard.js); the HTTP function reads from Firestore so a new
// version can be published without redeploying.
//
// Adding a standaard = one entry here + its generated document. Adding a version
// = generate and seed; no code change, since versions are resolved per request.
export const STANDAARDEN = {
  energiearmoede: {
    sector: "energiearmoede",
    label: "Energiearmoede",
    collection: "MeetstandaardEnergiearmoede",
    documenten: [energiearmoede09],
  },
  "milieu-circulariteit": {
    sector: "milieu-circulariteit",
    label: "Milieu & circulariteit",
    collection: "MeetstandaardMilieuCirculariteit",
    documenten: [milieuCirculariteit09],
  },
};

export const MEETSTANDAARD_ENERGIEARMOEDE_0_9 = energiearmoede09;
export const INTERVENTIEBIBLIOTHEEK_MILIEU_CIRCULARITEIT_0_9 = milieuCirculariteit09;

const basePath = (request) => {
  const segments = (request.path || "/").split("/").filter(Boolean);
  const index = segments.lastIndexOf("meetstandaard");
  return index === -1 ? "/api/v1/meetstandaard" : `/${segments.slice(0, index + 1).join("/")}`;
};

const sectorIndex = (request) => ({
  sectoren: Object.values(STANDAARDEN).map(({ sector, label }) => ({
    sector,
    label,
    href: `${basePath(request)}/${sector}`,
    versions: `${basePath(request)}/${sector}/versions`,
  })),
});

// The contract path is /api/v1/meetstandaard/...:
//   GET .../meetstandaard                     -> index of available standaarden
//   GET .../meetstandaard/{sector}            -> latest version of that standaard
//   GET .../meetstandaard/{sector}/versions   -> version index for that standaard
//   GET .../meetstandaard/{sector}/{version}  -> pinned version (404 if unknown)
export const handleMeetstandaard = async (firestore, request, response) => {
  const segments = (request.path || "/").split("/").filter(Boolean);
  const last = segments[segments.length - 1];
  const prev = segments[segments.length - 2];

  // The sector is the last segment on a bare sector request, and the
  // second-to-last on `/versions` and pinned-version requests.
  const sector = STANDAARDEN[last] ? last : STANDAARDEN[prev] ? prev : null;

  if (!sector) {
    // `last` is undefined when the function is hit at its bare URL (path "/"),
    // which is the natural place to discover what this endpoint serves.
    if (!last || last === "meetstandaard") {
      return sendCached(request, response, sectorIndex(request));
    }
    // Versions are per standaard, so a bare /versions is a route mistake rather
    // than an unknown sector — say so instead of blaming the sector name.
    if (last === "versions") {
      return sendError(response, 404, {
        error: "Versions are listed per sector: use /{sector}/versions",
        ...sectorIndex(request),
      });
    }
    return sendError(response, 404, {
      error: `Unknown sector: ${last}`,
      ...sectorIndex(request),
    });
  }

  return handleVersionedResource({
    firestore,
    collection: STANDAARDEN[sector].collection,
    resourceSegment: sector,
    request,
    response,
  });
};
