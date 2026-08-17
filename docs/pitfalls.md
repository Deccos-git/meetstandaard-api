# Pitfalls

Things that have actually gone wrong here, and how to not repeat them.

## How to use

`CLAUDE.md` lists triggers: "about to do X → read `#anchor`". Read the entry **before** writing the code, not after it breaks.

Every entry below is a real incident with a date. Nothing here is hypothetical.

## Anchor format

`#category-short-name`, where category is one of: `deploy`, `data`, `xlsx`, `versioning`, `verify`, `lint`, `analysis`, `git`.

Add new entries via `/retro`.

---

## deploy-firestore-rules-full-replace

**Trigger:** deploying `firestore.rules`, or adding a Firestore collection.

**Incident (2026-08-17):** `MeetstandaardMilieuCirculariteit` was added to the API and seeded, but never added to `firestore.rules`. The rules enumerated the three collections that existed when they were written, so the new one fell through to the catch-all — and any signed-in client could overwrite a published, immutable version. Found by testing writes as an authenticated user.

**Two separate hazards:**

1. **A rules deploy fully replaces the live ruleset.** Anything present in the backend but missing from your local file is silently removed. Diff local against live before deploying; the local file should be a *superset*, never a replacement.
2. **Enumerating collections goes stale.** Every new collection is unprotected until someone remembers this file.

❌ Wrong — a list that a future collection will not be on:
```
match /MeetstandaardEnergiearmoede/{d=**} { allow write: if false; }
match /MeetstandaardParameters/{d=**}     { allow write: if false; }
```

✅ Right — match the shape, so a new collection is protected the moment it exists:
```
match /{collection}/{document=**} {
  allow read: if request.auth != null;
  allow write: if request.auth != null && !collection.matches('Meetstandaard.*');
}
```

**Verify after deploying**, as an authenticated user *and* anonymously — a rule that reads correctly can still be wrong.

---

## data-destructive-write-test-on-production

**Trigger:** testing whether a permission is enforced; any write to Firestore from outside a seed script.

**Incident (2026-08-17):** to check whether the rules blocked client writes, a REST `PATCH` was sent to the live `MeetstandaardMilieuCirculariteit/0.9`. The rules did not block it (see above) and **`PATCH` without an `updateMask` replaces the entire document** — 95 interventions became `{pwned: "x"}`. Restored from the committed JSON within a minute; nothing consumed it yet.

**The mistake was testing a write against real data at all.** The rule outcome was unknown — that is the whole point of the test — so the target must be something whose destruction costs nothing.

❌ Wrong:
```js
fetch(`${BASE}/MeetstandaardMilieuCirculariteit/0.9`, { method: "PATCH", ... })
```

✅ Right — a document id that does not exist, cleaned up after:
```js
const SCRATCH = "zz-claude-scratch-do-not-use";
fetch(`${BASE}/${collection}/${SCRATCH}`, { method: "PATCH", ... })
// if it unexpectedly succeeds, delete it via the Admin SDK
```

**Recovery:** every published document is committed under `functions/data/`, so `node seedMeetstandaard.js` restores it byte-identical. Verify with a JSON comparison against the committed source, not by eye.

---

## xlsx-formula-columns-have-no-cached-value

**Trigger:** reading a numeric column from a workbook.

**Incident (2026-08-17):** the interventiebibliotheek's `Besparing (EUR/jr)` and `CO2e (kg/jr)` columns are Excel formulas. openpyxl with `data_only=True` returns the *cached* value — and the file had never been recalculated by Excel, so every cached value was `None`. Reading them naively would have published `null` for the two most useful numbers in the library.

**Check both views before trusting a column:**
```python
wv = openpyxl.load_workbook(P, data_only=True)   # cached values
wf = openpyxl.load_workbook(P, data_only=False)  # formulas
# formula present + cached None  ->  you must compute it yourself
```

✅ Recompute from the source parameters rather than depending on whether someone opened Excel, and publish the inputs so the arithmetic is checkable:
```
besparingEurPerJaar = (gas × gasprijs + kWh × elektriciteitsprijs + m³ × waterprijs) × bestendiging
```

Then **pin it with a test** against the same formula, so changing a price cannot silently change an output.

---

## xlsx-typographic-minus-flips-sign

**Trigger:** parsing an amount from a workbook.

**Incident (2026-08-17):** EFF-07 in the energiearmoede workbook wrote negative amounts with U+2212 MINUS SIGN (`−1.000`) instead of hyphen-minus. A `[-+]?` regex does not match it, so the sign was dropped and **~€3.600 of societal costs were published as benefits**.

Workbooks also use en dash and em dash. Normalise all of them:
```python
SIGNS = str.maketrans({"−": "-", "–": "-", "—": "-"})
```

**But do not normalise blindly.** In the same workbook an en dash is a *range separator* (`7.800–79.600`) and a typographic minus is a *subtraction operator* in prose (`€ 5.362,50 − € 0`). Only the leading sign of an otherwise-numeric cell is a minus.

Parsing lives in `tools/xlsx_common.py`. It is deliberately strict: anything that is not a single unambiguous number returns `None` and the verbatim text is kept.

✅ **Test the invariant, not the values** — assert every parsed amount's sign matches its source text.

---

## data-never-invent-a-kengetal

**Trigger:** a source has no value, or an ambiguous one.

**Rule, from the standards themselves:** *geen kengetallen verzinnen*. Where no reliable source exists there is no number — not `0`, not an average, not an estimate.

- Parse to `null`, keep the verbatim source text (`"needs verification"`, `"PM"`, `"n.v.t."`, `"+4,6% tot +12,3%"`).
- Publish the list in a `controle` block so consumers see what is unquantified. In milieu-circulariteit 0.9 that is **37 of 95** interventions.
- Render as `—`, never `0`. Zero claims a measure has no impact; `null` says it has not been quantified. Those are completely different statements.

The same applies to inconsistencies: two niveau totals in energiearmoede 0.9 disagree with the sum of their proxies (a percentage totalled as euros). They are **published in `controle.somAfwijkingen`**, not silently reconciled.

---

## data-never-hand-edit-generated-json

**Trigger:** correcting a value in `functions/data/*.json`.

The workbook is the source of truth. `functions/data/*.json` is generated, and the next `tools/build-*.py` run overwrites any hand edit.

✅ Fix the workbook → regenerate → verify the diff is only what you intended → re-seed.

**Incident (2026-08-17):** fixing the U+2212 characters at source produced a diff touching **only `bedragTekst`** (which records source text verbatim). Every parsed `bedrag`, every niveau total, and every other section were byte-identical — which is how we knew no published value had ever been wrong. Always check the regeneration diff; it is the cheapest correctness signal available.

---

## versioning-reseeding-strands-cached-clients

**Trigger:** re-seeding a version that has already been served.

**Incident (2026-08-17):** after re-seeding `energiearmoede/0.9`, the live endpoint still returned the old body. Not a stale write — Google's edge cache honouring `Cache-Control: public, max-age=86400`. Firestore had the new document immediately; a cache-busted request confirmed it.

- Verify a re-seed against **Firestore directly** or with a cache-busting query param, never the plain URL you already fetched.
- A published version is immutable *by contract*. Re-seeding one in place is only safe while you are the sole consumer. Once anyone pins a version, republishing it silently changes numbers they have already reported — ship a new version instead.

---

## verify-panel-is-behind-auth

**Trigger:** verifying anything in the admin panel.

Every panel route sits behind `ProtectedRoute`, and the Firestore rules require an authenticated user, so `preview_*` tools only ever reach the login screen. Claude cannot sign in.

✅ **The working pattern** — export the real data with the service account (Admin SDK bypasses rules), feed it to the components, screenshot, then revert:

1. Dump the collections to a temporary `src/__preview_fixtures.json`.
2. Patch the data-loading hook to import that file, and add a `preview` route outside `ProtectedRoute`.
3. Verify. Prefer `javascript_tool` DOM queries over screenshots for counts and structure — they are exact and don't blank out.
4. Revert both patches, delete the fixture, and `grep` to prove nothing remains.

This has caught real defects each time: inline spans running text together, a flex item that could not shrink so the page scrolled sideways, and a default selection that highlighted an off-screen item.

**Always state what you could not verify.** The signed-in render path stays unverified by this method — say so rather than implying full coverage.

---

## lint-prop-types-is-the-house-style

**Trigger:** seeing `react/prop-types` errors, or any lint error in a file you did not write.

No component in this codebase declares propTypes — `Effects`, `Scores`, `Tooltip` and every component since. `npx eslint src/` reports dozens of them. **That is the house style; matching it is correct.** Adding propTypes to one new file makes it the odd one out.

Before treating any lint error as yours, check whether it predates you:
```bash
git stash -q && npx eslint <file>; git stash pop -q
```

Two known pre-existing errors live in `Login.jsx` and `Topbar.jsx`. Filter by rule to see whether you introduced anything real:
```bash
npx eslint src/ -f json | python3 -c "..."   # group by ruleId, ignore react/prop-types
```

Same for `functions/`: eslint cannot parse `assert { type: "json" }` in *any* file there, including pre-existing ones.

---

## analysis-cross-sector-means-identical-questions

**Trigger:** claiming two effects can be compared or benchmarked across sectors.

**The rule:** two effects are cross-sector **only if their question sets are exactly identical**. Any wording difference makes them sector-specific and non-comparable — even when the concept and the name match.

The same concept is deliberately measured with different instruments per sector ("Fysieke gezondheid" is youth-framed in `gelijke-kansen`, work-framed in `arbeidsparticipatie`). Comparing scores from different instruments is invalid.

**Never trust a hand-maintained flag.** The `crossSectorBenchmarkbaar` column in the workbooks is a *claim*, and measurement showed it wrong twice: EFF-12 and EFF-13 are marked "stellingen letterlijk uit SI" but only 2/4 and 3/5 statements actually match.

✅ Derive it from the instrument — hash each effect's normalised, sorted question set; identical hash across sectors means cross-sector. Self-maintaining: reword one question and the effect correctly drops out.

Measured against current data, **exactly one** effect qualifies (`arbeidsvaardigheden`, 4/4). See `docs/decisions.md#adr-003`.

---

## git-no-force-push-without-explicit-approval

**Trigger:** `git push --force`, `git reset --hard`, `commit --amend` on pushed commits, any history rewrite.

**Incident (2026-08-17):** a commit accidentally included a build artefact. The user said "drop it and add to gitignore" — which was approval to untrack the file, not clearly approval to rewrite pushed history. The amend + force-push went ahead anyway.

- Approval for a *goal* is not approval for a *destructive method*. Say which method you intend and get a yes.
- When force-pushing is agreed, always `--force-with-lease`, never `--force`.
- Prefer the non-rewriting option (a follow-up commit) unless the history really matters.

**Also:** `git commit -am` stages every tracked modified file, including ones unrelated to your change. Stage explicit paths.
