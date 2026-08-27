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
besparingHuishoudenEurPerJaar = (gas × gasprijs + kWh × elektriciteitsprijs_gewogen + m³ × waterprijs) × bestendiging
```

Then **pin it with a test** against the same formula, so changing a price cannot silently change an output.

**The second incident (2026-08-17, same workbook): an *input* column was a formula too.** `Bestendiging` held `=Aannames!$B$8` on the 13 behaviour measures — same empty cache, so `to_number()` returned `None`, and the recomputation's `factor = 1 if bestendiging is None else bestendiging` treated "I could not read it" as "no factor applies". Every one of those interventions was published **25% too high**. The `or 0` / `if None` fallbacks that make a formula robust are exactly what makes this silent.

Two rules follow, and both are now in `build-interventiebibliotheek.py`:

1. **A None you did not expect is an error, not a default.** Resolve the reference or `raise SystemExit` — never fall back to a neutral value.
```python
if isinstance(waarde, str) and waarde.startswith("="):
    if waarde.replace(" ", "") != "=Aannames!$B$8":
        raise SystemExit(f"unknown bestendiging formula: {waarde}")
    return aannames["bestendigingsfactor"]
```
2. **Compare the formula you re-implement against the formula in the cell**, per row, and fail the build on a mismatch (`controleer_formules()`). This is what catches a workbook that starts multiplying by a different Aannames row — which is exactly what happened when the weighted electricity price (B12) replaced the bare one (B2) in the savings column.

Load the workbook with `data_only=False` when you need this: formulas are the thing worth reading in a file that has no cached values at all.

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
- Publish the list in a `controle` block so consumers see what is unquantified. In milieu-circulariteit 0.9 that is **42 of 114** interventions.
- A literal `0` in the source is the same trap wearing a disguise: if the status says the figure is not established, blank the cell so it parses to `null`. `0` claims no impact; `null` says not quantified.
- Render as `—`, never `0`. Zero claims a measure has no impact; `null` says it has not been quantified. Those are completely different statements.

The same applies to inconsistencies: two niveau totals in energiearmoede 0.9 disagree with the sum of their proxies (a percentage totalled as euros). They are **published in `controle.somAfwijkingen`**, not silently reconciled.

---

## data-never-hand-edit-generated-json

**Trigger:** correcting a value in `functions/data/*.json`.

The workbook is the source of truth. `functions/data/*.json` is generated, and the next `tools/build-*.py` run overwrites any hand edit.

✅ Fix the workbook → regenerate → verify the diff is only what you intended → re-seed.

**Incident (2026-08-17):** fixing the U+2212 characters at source produced a diff touching **only `bedragTekst`** (which records source text verbatim). Every parsed `bedrag`, every niveau total, and every other section were byte-identical — which is how we knew no published value had ever been wrong. Always check the regeneration diff; it is the cheapest correctness signal available.

---

## deploy-import-assertions-break-on-node-22

**Trigger:** raising the Cloud Functions runtime, or any Node major upgrade.

**Incident (2026-08-17):** the deploy warned that Node.js 20 is decommissioned on 2026-10-30, so `engines.node` went to `22`. Node 22 does not deprecate `import x from "./y.json" assert { type: "json" }` — it **removed** it. The old syntax is a hard `SyntaxError` at module load, so every function would have failed to start. Eight files used it, `meetstandaard.js` among them.

Node 20 only *warns* about it, which is exactly why it survived that long:

```
(node:79824) V8: 'assert' is deprecated in import statements ... use 'with' instead
```

✅ The fix is a one-word swap, and `with` works on Node 18.20+, 20 and 22 — so it is safe to make before the runtime moves:
```js
import doc from "./data/document.json" with { type: "json" };
```

**The lesson is the verification order.** A runtime bump is not done when the deploy succeeds — the container builds fine and fails at *load*, per request. Run the suite on the target runtime **before** deploying:
```bash
"$HOME/.nvm/versions/node/v22.14.0/bin/node" --test
```
That is what caught this: 78 tests passed on Node 18 and 20, and the same suite collapsed to 41 on Node 22.

After deploying, confirm the runtime actually changed rather than trusting the CLI's summary — `npx firebase functions:log` shows `"runtime":"nodejs22"` in the UpdateFunction audit entry.

---

## versioning-reseeding-strands-cached-clients

**Trigger:** re-seeding a version that has already been served.

**Incident (2026-08-17):** after re-seeding `energiearmoede/0.9`, the live endpoint still returned the old body. Not a stale write — Google's edge cache honouring `Cache-Control: public, max-age=86400`. Firestore had the new document immediately; a cache-busted request confirmed it.

- Verify a re-seed against **Firestore directly** or with a cache-busting query param, never the plain URL you already fetched.
- A published version is immutable *by contract*. Re-seeding one in place is only safe while you are the sole consumer. Once anyone pins a version, republishing it silently changes numbers they have already reported — ship a new version instead.

**Near miss (2026-08-24): the live document can be ahead of the repo.** Before seeding two new standaarden, a comparison of the committed JSON against Firestore showed `energiearmoede/0.9` differing on every effect:

```
.effecten[0].uid    live  : "energiearmoede:fysieke-gezondheid"
                    lokaal: undefined
```

`uid` appeared nowhere on `main` — not in the generator, not in the seed script, not in the JSON's git history — yet the API serves it to consumers today. `seedMeetstandaard.js` writes with `set()`, which **replaces the whole document**, so a plain `node seedMeetstandaard.js` would have deleted all thirteen.

**Where it actually came from (established 2026-08-24, after this entry was first written).** Not an out-of-band edit: the unmerged branch `fix/posneg-provenance-and-workbook-seed` adds `uid` in `seedMeetstandaard.js` at seed time, and production was seeded from that branch. The first version of this entry said the field existed nowhere in the repo, because the search only covered `main`.

That correction makes the trap sharper, not smaller: **`main` no longer described what was live, and no diff on `main` could reveal it.** A branch that is deployed but not merged is invisible to every check that starts from the default branch. `git log --all -S'<field>'` finds it; `grep` in the working tree does not.

It also argues for where the field belongs. Adding it at seed time keeps it derived, but it means the committed document and the served document differ by design — which is the drift this entry is about. Deriving it in the generator, so it lands in the committed JSON, makes the two identical and a diff meaningful.

- **Never assume the committed document is what is live.** Diff before seeding, the same way you diff `firestore.rules` before deploying. Generated-and-committed is only the source of truth if nothing else writes.
- The script now refuses to overwrite an existing version without `--force`, and prints which field paths would change before it skips. Reaching for `--force` should feel like a decision.
- A field that only exists in production is a bug waiting for the next regeneration. `uid` is now emitted by `tools/build-meetstandaard.py` and by `functions/exportEffectenStandaard.js`, composed as `{sector}:{slug}` — the same value the consumer reconstructs when it is absent, and pinned by a test.
- The committed `meetstandaard-energiearmoede-0.9.json` still has no `uid`, because regenerating it needs the workbook and 0.9 is published and immutable. It arrives with the next version. Until then the drift is real and the `--force` guard is what keeps it harmless.

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

---

## data-new-requirements-strand-existing-accounts

**Trigger:** adding a precondition to an action — a verified address, a required profile field, an accepted agreement, a claim — when accounts or records already exist.

> *Naschrift (2026-08-27):* deze twee preconditions bestaan niet meer — het feedbackformulier staat inmiddels open en vraagt naam, organisatie en e-mailadres in het formulier zelf. Wat hieronder staat is het incident, niet de huidige code. De les geldt onverminderd voor de volgende precondition.

**Incident (2026-08-24):** feedback got two preconditions, a verified email and a `users/{uid}` profile with a name. Both were correct, both were tested, and both locked out the person who owns the project.

`info@deccos.nl` was created 2024-09-27, long before this codebase ever sent a verification mail, so `emailVerified` was `false`. Neither admin had a profile document either, because the only code that writes one is the registration flow — which those accounts predate by two years. The result was a 403 saying *"bevestig eerst je e-mailadres"* and then, once past that, a 400 saying *"vul je naam en organisatie aan"*.

**Why the tests didn't catch it.** They did test the refusals — and passed. What they never tested was an account that predates the feature, because every fixture was written in the image of the flow that had just been built:

```js
const profiel = { "users/u1": { naam: "Gijs", bedrijf: "Deccos" } };
const indiener = { uid: "u1", email: "gijs@voorbeeld.nl", email_verified: true };
```

A fixture built from the new happy path shares the author's assumption, so it can only confirm it. **Every existing account is a fixture you did not write.**

**The second half is worse than the first.** Both errors named an action the user could not perform from where they stood: the resend-verification screen only appears during sign-in (they were already signed in from a restored session), and no profile page existed at all. A precondition the user cannot satisfy at the point of refusal is not a refusal, it is a wall.

❌ Wrong — a precondition whose only satisfying path is the flow that created the account:
```js
if (gebruiker.email_verified !== true) return sendError(response, 403, { error: "Bevestig eerst je e-mailadres." });
const profiel = (await firestore.collection("users").doc(gebruiker.uid).get()).data();
if (!profiel?.naam) return sendError(response, 400, { error: "Vul je naam en organisatie aan." });
```

✅ Right — three things together:
```js
// 1. Name who is exempt, and why it is provenance rather than convenience.
//    The admin claim comes from running setAdminClaims.js against a fixed list,
//    which is stronger evidence than a clicked link.
if (gebruiker.email_verified !== true && gebruiker.admin !== true) { ... }

// 2. A test whose fixture is an OLD account, not a fresh one.
test("een beheerder mag ook zonder bevestigd adres plaatsen", ...)

// 3. A route out of every refusal — /profiel exists and the error links to it.
```

**Before shipping a precondition, list the accounts that already exist and check each against it.** Two accounts took one Admin SDK query:

```js
const { users } = await auth.listUsers(1000);
for (const u of users) {
  const snap = await fs.collection("users").doc(u.uid).get();
  console.log(u.email, u.emailVerified, snap.exists);
}
```

That query, run before the deploy instead of after the complaint, would have found both defects at once.

---

## data-ui-default-never-persisted

**Trigger:** reading a field that a form wrote, or adding a `<select>`/checkbox with a default value.

**Incident (2026-08-17):** `posNeg` marks whether a question is reverse-worded — a high score means *less* of the effect. In `arbeidsparticipatie`, **65 of 86 questions have no `posNeg` key in Firestore at all**, and **zero are stored `'positive'`**. The old panel rendered `value={question.posNeg || "positive"}` and wrote only on `onChange`, so the dropdown *showed* "positive" for every unset question while storing nothing. The meaning of those 65 questions lived in a frontend fallback.

`/database` passes the field through as absent. Deccos copies these questions into per-organisation records and scores answers against them, so every consumer had to re-derive the convention. Combined with the stored values being hand-editable in place — no version stamp, no audit trail — a changed flag silently reversed the meaning of answers already recorded at real organisations.

❌ Wrong:
```jsx
<select value={question.posNeg || "positive"} onChange={posNegHandler}>
```
The default is displayed, never written. "Absent" and "positive" become indistinguishable to every later reader of the data.

✅ Right:
- Write the resolved value on create, so every record carries its own meaning. A default belongs in the write path, never only in the render.
- A field that changes how existing answers are interpreted is **semantic, not editable**. It belongs in a versioned document, where a published version is immutable and an answer can be tied to the flag value it was given under.
- When reading such data, `'posNeg' in q` and `q.posNeg == null` are different questions. Check key presence, not truthiness.

**Resolution (2026-08-24).** The convention was confirmed: absent meant positief. The two published snapshots fill it in and put `herkomstRichting: "afgeleid"` beside every derived value, so derived and recorded stay distinguishable — see `docs/decisions.md#adr-008`. That settles `posNeg` specifically. It does not make a blank cell safe to default anywhere else, which is why `ja_nee()` in the generator still returns `None`.

**The clue was the zero.** Not "65 missing" — *no `'positive'` values at all*, while `gelijke-kansen` had 41. A field used only to mark exceptions looks identical to a field that lost data, except for that zero.

---

## analysis-never-aggregate-across-standaarden

**Trigger:** reporting a count, percentage or coverage figure over `effects`, `questions`, or any collection holding more than one standaard.

**Incident (2026-08-17):** measuring `posNeg` coverage across the whole `effects` collection gave "66 of 139 null, 47%" — a figure describing nothing real. Split per standaard it was **65 of 86 (76%) for arbeidsparticipatie and 1 of 53 (2%) for gelijke-kansen**: one standaard almost entirely unset, the other essentially complete. The average hid both facts and produced two wrong diagnoses before anyone split it.

The `effects` collection holds multiple standaarden, told apart by the `sectors` array on each effect. Categories are shared between them, so a per-category figure mixes standaarden too.

❌ Wrong:
```python
sum(1 for q in all_questions if not q.get('posNeg'))
```

✅ Right: group by `effect.sectors` first, report per standaard, and only then look for a pattern.

Two standaarden are two standaarden — the same principle applied to comparison is `#analysis-cross-sector-means-identical-questions`.

---

## deploy-removed-function-stays-live

**Trigger:** deleting an export from `functions/index.js`, or removing a file under `functions/` that backed an endpoint.

**Incident (2026-08-27):** the accounts model was taken out — registration, profiles, `functions/gebruikers.js`. The source was gone, `src/` referenced nothing, 161 tests passed and the deploy succeeded. `gebruikers` kept running in `us-central1` the whole time, on its last-deployed code, still accepting an authenticated `POST` and still writing to `users/{uid}`. It had been orphaned since at least the account work of 2026-08-24.

Nothing was corrupted — that function was narrowly written (only `naam` and `bedrijf`, `uid` taken from the token, no body spread). **The damage was to a guarantee, not to data.** `firestore.rules` states, in a comment above the catch-all, *"There is deliberately no client write path left"*. That sentence was false for three days, and the file that made the claim had no way to know. It surfaced only because `firebase functions:list` happened to get run before an unrelated deploy.

**Root cause:** a filtered deploy never deletes anything. Only an unfiltered `firebase deploy --only functions` compares the deployed set against your exports and offers to remove the difference — and the filtered form is what this repo's own commands section recommends, so it is the habit.

This is the mirror image of `#deploy-firestore-rules-full-replace`. Rules deploys remove **too much** (the live ruleset is replaced wholesale, so anything missing locally is dropped). Function deploys remove **too little** (nothing is ever dropped). Both bite because the local file stops being an accurate picture of the backend, in opposite directions.

❌ Wrong — deletes the source, deploys the rest, leaves the endpoint serving:
```bash
git rm functions/gebruikers.js
npx firebase deploy --only functions:meetstandaard,functions:feedback
```

✅ Right — after removing any export, reconcile the deployed set against the source:
```bash
npx firebase functions:list                       # what is actually running
grep '^export const' functions/index.js           # what should be running
npx firebase functions:delete gebruikers --region us-central1
```

**Verify by hitting the URL**, not by reading the list: a deleted function returns `404` at
`https://us-central1-meetstandaard-api.cloudfunctions.net/{naam}/...`. Until it does, it is live.

An endpoint with no source is worse than one with source: nothing greps for it, no test covers it, and no review will ever look at it again.
