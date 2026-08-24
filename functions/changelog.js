import { sendCached, sendError } from "./versionedResource.js";
import { FEEDBACK_STANDAARDEN } from "./feedback.js";
import changelog from "./data/changelog.json" with { type: "json" };

// What actually changed between versions of a standaard.
//
// Deliberately NOT versioned, unlike everything else here. A published version
// is immutable and can therefore never contain its own history — the entry that
// records a correction has to live somewhere the correction can be added to.
// So this list grows, and the immutable documents stay untouched.
//
// It is maintained by hand rather than generated, because only a person knows
// why a value changed. `docs/pitfalls.md#data-never-hand-edit-generated-json`
// does not apply: that rule protects documents a generator owns, and this file
// has no generator. The commit hash on every entry is what keeps it honest —
// an entry that names no commit is a claim rather than a record.
//
// Two soorten worth telling apart:
//
//   publicatie           a new version was published
//   correctie-in-plaats  an already-published version was changed where it stood
//
// The second one is a deviation from ADR-001 and is recorded as such rather than
// smoothed over. It was defensible for 0.9 because nobody had pinned it yet; the
// moment someone has, a correction has to become a new version instead.
export const CHANGELOG = changelog.standaarden;

const index = () => ({
  standaarden: Object.entries(CHANGELOG).map(([standaard, entries]) => ({
    standaard,
    aantal: entries.length,
    laatsteWijziging: entries[0]?.datum ?? null,
  })),
});

// GET .../api/v1/changelog                 -> per standaard hoeveel entries
// GET .../api/v1/changelog/{standaard}     -> de entries, nieuwste eerst
export const handleChangelog = async (request, response) => {
  const segments = (request.path || "/").split("/").filter(Boolean);
  const last = segments[segments.length - 1];

  if (!last || last === "changelog") {
    return sendCached(request, response, index());
  }

  const entries = CHANGELOG[last];
  if (!entries) {
    // An empty changelog and an unknown standaard are different answers, and a
    // consumer that cannot tell them apart will report "no changes" for a name
    // it simply typed wrong.
    return sendError(response, 404, {
      error: `Onbekende standaard: ${last}`,
      standaarden: Object.keys(CHANGELOG),
    });
  }

  return sendCached(request, response, { standaard: last, aantal: entries.length, entries });
};

// Exported so the tests can assert the changelog covers exactly the standaarden
// that are actually published, rather than a list that drifts.
export const GEDEKTE_STANDAARDEN = FEEDBACK_STANDAARDEN;
