# /wrap — Session wrap-up

Run at the end of a session, before `/clear`, or when the conversation gets long.

This repo has four places work can be left half-finished — **committed, pushed, deployed, seeded** — and they move independently. Code can be live but uncommitted; a document can be committed but unseeded. The point of `/wrap` is to name every gap.

## Steps

1. **State what changed**, in one short paragraph. Not a commit list — what is now true that wasn't.

2. **Check all four states.**

   ```bash
   git status --short && git status -sb | head -2      # committed / pushed
   ```

   | State | How to check |
   |---|---|
   | Committed | `git status --short` clean, ignoring `.claude/` |
   | Pushed | `git status -sb` shows no `ahead` |
   | Deployed | Did `functions/` or `firestore.rules` change since the last deploy? Code changes need `firebase deploy`; new *versions* do not |
   | Seeded | Does every document in `functions/data/` exist in Firestore at its version? |

   Report each gap explicitly. "Not deployed" is a finding, not an omission.

3. **Verify, don't assume.** If something was claimed to work this session, check it still does:
   ```bash
   cd functions && node --test
   npm run build
   ```
   For anything live, hit the endpoint — with a cache-buster if it was re-seeded (`docs/pitfalls.md#versioning-reseeding-strands-cached-clients`).

4. **Look for a `/retro`.** Did anything this session take >30 min, recur, lose data, or touch security? Suggest it, with the specific bug named.

5. **Check what memory should keep.** A durable project fact or constraint that isn't in the repo → write it. Something the code already records → don't.

6. **List what's genuinely open**, separating:
   - **Blocked** — and on what
   - **Deliberately parked** — and the condition for picking it up
   - **Unverified** — say plainly what was not checked and why

## Rules

- **Don't tidy silently.** If you spot something worth fixing while wrapping, name it — don't fix it and bury it in the summary.
- **Be honest about verification.** "Tests pass" and "it works" are different claims. If the signed-in UI was never seen, say so.
- Never end a wrap-up implying more confidence than the checks support.
