# /retro — Post-bug retrospective

Run after a bug that took more than ~30 minutes, appeared twice, corrupted or lost data, or was a security issue.

**Usage:** `/retro [what went wrong]`

The output is a pitfall entry. If it doesn't change what a future session does, it isn't worth writing.

## Steps

1. **Establish the root cause, not the symptom.**
   - What actually went wrong, mechanically?
   - Why didn't the existing checks catch it?
   - Where else could the same cause bite? (A rules gap for one collection is a rules gap for every future collection.)

2. **Decide whether it belongs in `docs/pitfalls.md`.**

   | Write an entry | Don't |
   |---|---|
   | A trap in a tool or format (Excel caches, REST semantics, flexbox) | A one-off typo |
   | A rule that has to be remembered at a specific moment | Something the type system or a test already prevents |
   | A wrong assumption that looked reasonable | A pure knowledge gap, already fixed by knowing |

   If a **test** would prevent recurrence more reliably than a rule, write the test instead — or both, when the rule is what tells you to write the test.

3. **Write the entry** at the bottom of `docs/pitfalls.md`:

   ```markdown
   ## [category]-[short-name]

   **Trigger:** [the moment someone is about to hit this]

   **Incident (YYYY-MM-DD):** [what happened, concretely, including the damage]

   ❌ Wrong:
   ```
   [the code or command that caused it]
   ```

   ✅ Right:
   ```
   [what to do instead]
   ```
   ```

   Categories: `deploy`, `data`, `xlsx`, `versioning`, `verify`, `lint`, `analysis`, `git`.

   Be specific about the damage. "Could overwrite data" is ignorable; "replaced 95 interventions with `{pwned: "x"}`" is not.

4. **Add the trigger to `CLAUDE.md`.** An entry nobody reads at the right moment is worthless. Add a row to the *Pitfall triggers* table phrased as the moment, not the topic: "About to deploy `firestore.rules`" beats "Firestore rules".

5. **Report** the anchor added, the trigger added, and any test written.

## Note

The incident is usually more useful than the rule. Keep the date, the concrete damage, and the reason the wrong thing looked right — that last part is what makes a reader recognise the situation they're in.
