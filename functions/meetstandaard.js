import { handleVersionedResource, sendCached, sendError } from "./versionedResource.js";
import energiearmoede09 from "./data/meetstandaard-energiearmoede-0.9.json" assert { type: "json" };

// The sector meetstandaarden: per sector, the full standard as one versioned
// document — effecten with their stellingen, situatieschetsen, monetarisering
// per niveau (incl. stakeholder-proxywaarden), plus the shared bronnen,
// parameters, aggregatie/overlapmodel, gevoeligheidsanalyse and audittrail.
//
// The documents themselves are generated from the authoring workbook by
// tools/build-meetstandaard.py and committed under data/. They are the source
// for seeding Firestore (see seedMeetstandaard.js); the HTTP function reads from
// Firestore so a new version can be published without redeploying.
//
// Adding a sector = one entry here + its generated document. Adding a version =
// generate the document and seed it; no code change, since the endpoint resolves
// versions from the collection.
export const SECTOREN = {
  energiearmoede: {
    sector: "energiearmoede",
    label: "Energiearmoede",
    collection: "MeetstandaardEnergiearmoede",
    documenten: [energiearmoede09],
  },
};

export const MEETSTANDAARD_ENERGIEARMOEDE_0_9 = energiearmoede09;

const basePath = (request) => {
  const segments = (request.path || "/").split("/").filter(Boolean);
  const index = segments.lastIndexOf("meetstandaard");
  return index === -1 ? "/api/v1/meetstandaard" : `/${segments.slice(0, index + 1).join("/")}`;
};

const sectorIndex = (request) => ({
  sectoren: Object.values(SECTOREN).map(({ sector, label }) => ({
    sector,
    label,
    href: `${basePath(request)}/${sector}`,
    versions: `${basePath(request)}/${sector}/versions`,
  })),
});

// The contract path is /api/v1/meetstandaard/...:
//   GET .../meetstandaard                     -> index of available sectoren
//   GET .../meetstandaard/{sector}            -> latest version of that sector
//   GET .../meetstandaard/{sector}/versions   -> version index for that sector
//   GET .../meetstandaard/{sector}/{version}  -> pinned version (404 if unknown)
export const handleMeetstandaard = async (firestore, request, response) => {
  const segments = (request.path || "/").split("/").filter(Boolean);
  const last = segments[segments.length - 1];
  const prev = segments[segments.length - 2];

  // The sector is the last segment on a bare sector request, and the
  // second-to-last on `/versions`, `/latest` and pinned-version requests.
  const sector = SECTOREN[last] ? last : SECTOREN[prev] ? prev : null;

  if (!sector) {
    // `last` is undefined when the function is hit at its bare URL (path "/"),
    // which is the natural place to discover what this endpoint serves.
    if (!last || last === "meetstandaard") {
      return sendCached(request, response, sectorIndex(request));
    }
    // Versions are per sector, so a bare /versions is a route mistake rather
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
    collection: SECTOREN[sector].collection,
    resourceSegment: sector,
    request,
    response,
  });
};
