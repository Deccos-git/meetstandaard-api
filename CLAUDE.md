# Meetstandaard API

Public API serving versioned meetstandaarden, a public site that shows them, and a small admin panel behind an admin claim.

Reads are unauthenticated and read-only. Writes exist only for what a visitor submits about themselves, through authenticated `POST` endpoints — the Firestore rules deny client writes entirely, so those endpoints are the only way in.

## Voice

Short, direct, one idea per paragraph. Tables and bullets over walls of text. If it fits in three sentences, don't write ten.

## Behaviour rules

**Don't write code unless asked.** During Q&A or while exploring options, answer and describe — implement only when asked to.

**No workarounds without permission.** Never add a temporary fix, fallback or mock value to get past a problem. Fix the real cause, or explain why you can't and ask.

**Never invent a number.** This is a transparency standard: every figure must trace to a source. A value that has no reliable source stays `null` with its verbatim source text — never `0`, never an estimate. See `docs/pitfalls.md#data-never-invent-a-kengetal`.

**Let errors be visible.** No swallowing catches, no placeholder text that masks a failure.

**Git safety.** Never run `git reset --hard`, `git push --force`, or history rewrites without explicit approval *for that specific action*. "Yes, commit" is not approval to force-push. Show what will change first.

**Deploy safety.**
- `firebase deploy --only functions` / `--only firestore:rules` are fine when asked.
- **Before deploying `firestore.rules`, diff the local file against the live ruleset.** A rules deploy fully replaces the backend — anything present live but missing locally is silently removed. See `docs/pitfalls.md#deploy-firestore-rules-full-replace`.
- **A filtered function deploy never deletes.** Removing an export leaves the old function running in production on its last-deployed code. After removing one, run `firebase functions:list`, compare against the exports in `functions/index.js`, and delete the difference explicitly. See `docs/pitfalls.md#deploy-removed-function-stays-live`.
- Never write to production Firestore to test a permission. Test writes go to a scratch document id that does not exist. See `docs/pitfalls.md#data-destructive-write-test-on-production`.

**No silent skipping.** Missing tooling, a step you want to skip, a conflict between instructions — say so and ask.

## Commands

```bash
npm run dev                     # Vite dev server (user often has one on :5173 — don't kill it)
npm run build                   # Production build → dist/
npx eslint src/                 # Lint (see pitfalls: prop-types noise is the house style)

cd functions && node --test     # Backend tests (node:test, no framework)
cd functions && node seedMeetstandaard.js   # Publish generated documents to Firestore

# Firebase CLI needs Node ≥20; the default here is 18. The deployed runtime is
# Node 22 — run the suite against it before any deploy that touches functions/:
export PATH="$HOME/.nvm/versions/node/v20.19.0/bin:$PATH"
"$HOME/.nvm/versions/node/v22.14.0/bin/node" --test     # from functions/
npx firebase deploy --only functions:meetstandaard
npx firebase deploy --only firestore:rules      # read Deploy safety first
npx firebase functions:list                     # after removing an export: a filtered deploy never deletes
```

## Architecture in one paragraph

A workbook is the authoring format. `tools/build-*.py` turns it into a versioned JSON document committed under `functions/data/`. `seedMeetstandaard.js` writes that document to a Firestore collection keyed by version. The Cloud Function serves it, resolving versions per request — so publishing a new version needs no deploy. The admin panel reads the same collections directly and is read-only.

Full detail: `docs/architecture.md`.

## Pitfall triggers

Read the linked entry in `docs/pitfalls.md` **before** writing code that matches:

| About to… | Read |
|---|---|
| Deploy `firestore.rules`, or add a Firestore collection | `#deploy-firestore-rules-full-replace` |
| Remove an export from `functions/index.js`, or delete a file under `functions/` | `#deploy-removed-function-stays-live` |
| Test a permission, or write to Firestore outside a seed script | `#data-destructive-write-test-on-production` |
| Read a numeric column from a workbook | `#xlsx-formula-columns-have-no-cached-value` |
| Parse an amount from a workbook | `#xlsx-typographic-minus-flips-sign` |
| Correct a value in a published document | `#data-never-hand-edit-generated-json` |
| Re-seed a version that already exists, or reach for `--force` | `#versioning-reseeding-strands-cached-clients` |
| Verify anything in the admin panel | `#verify-panel-is-behind-auth` |
| Require something of a user that accounts could already lack — verified email, profile field, claim | `#data-new-requirements-strand-existing-accounts` |
| "Fix" a lint error in a React file | `#lint-prop-types-is-the-house-style` |
| Say two effects are comparable across sectors | `#analysis-cross-sector-means-identical-questions` |
| Read a field a form wrote, or give a form control a default | `#data-ui-default-never-persisted` |
| Count or measure anything over the `effects` collection | `#analysis-never-aggregate-across-standaarden` |
| Raise the Node runtime, or upgrade a functions dependency | `#deploy-import-assertions-break-on-node-22` |

## Style rules

1. Match the surrounding file — comment density, naming, idiom.
2. Comments explain *why*, never *what*. If a line needs a "what" comment, rename something instead.
3. Arrow functions, `export default` at the bottom (frontend); named exports (functions/).
4. All presentation lives in `src/public/public.css` as `publiek-*` classes — don't redefine table/badge styles per component. `src/index.css` is the reset only.
5. Generators share `tools/xlsx_common.py` for cell parsing. Add parsing helpers there, not per script.
6. A new published standaard = one entry in `STANDAARDEN` (`functions/meetstandaard.js`) + one in `src/standaarden.js` + its generated document + a changelog entry in `functions/data/changelog.json`. Nothing else.
7. A new *version* of an existing standaard = generate, seed, and a changelog entry. Seeding refuses to overwrite an existing version without `--force`.

## Testing

`cd functions && node --test`. Plain `node:test`, no framework, tests co-located as `*.test.js`.

What earns a test here:

| Target | Test? |
|---|---|
| Version resolution, routing, caching (`versionedResource.js`) | Always |
| Rate limiting, input validation | Always |
| A published document's integrity (counts, ids, sums, signs) | Always — these catch bad regenerations |
| Any figure derived rather than read (recomputed formulas) | Always — pin it against the source formula |
| The React panel | No test setup exists; verify per `#verify-panel-is-behind-auth` |

## Documentation

| File | When |
|---|---|
| `docs/architecture.md` | Starting anything structural |
| `docs/pitfalls.md` | Before coding, when stuck, after a bug |
| `docs/decisions.md` | When a settled decision is about to be relitigated |
| `docs/versionering.md` | Anything touching versions |
| `docs/handoff-*.md` | Integrating a standaard from the consumer side |
| `docs/migratie-standaarden.md` | The two unversioned standaarden |

## Commands and agents

| Use | For |
|---|---|
| `/retro [what went wrong]` | After a bug that took >30 min, recurred, lost data, or was a security issue → writes a pitfall entry |
| `/wrap` | End of session: uncommitted work, undeployed code, unseeded versions |
| `.claude/agents/data-verifier.md` | Confirm workbook → repo → Firestore are in sync |

Suggest `/retro` yourself when a bug meets the bar — don't wait to be asked.
