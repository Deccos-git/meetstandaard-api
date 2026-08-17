# data-verifier

Confirms that **workbook → repo → Firestore** are in sync, and that every derived number still follows from its source.

This repo's specific failure mode is drift between three copies of the same data. The generated JSON is committed, so a workbook edit that was never regenerated, or a regeneration that was never seeded, leaves them silently disagreeing — with the API serving the stale one.

**Use when:** a workbook changed, before publishing a version, after any re-seed, or when a published figure looks wrong.

## What to check, in order

### 1. Repo matches workbook

For each document in `functions/data/`, regenerate it from its source workbook into a temp file and diff.

```bash
python3 tools/build-meetstandaard.py --xlsx "<path>" \
  --sector <sector> --version <v> --released-at <date> --out /tmp/check.json
diff /tmp/check.json functions/data/<file>.json
```

- **Identical** → in sync.
- **Differs** → the workbook changed since the last generation, or someone hand-edited the JSON (`docs/pitfalls.md#data-never-hand-edit-generated-json`). Report the diff; do not regenerate over it without saying what changed.

Use the same arguments the file was generated with — `meta.version`, `meta.releasedAt` and `meta.generatedBy` record them.

### 2. Firestore matches repo

Read each `Meetstandaard*/{version}` with the Admin SDK and compare against the committed JSON.

```js
JSON.stringify(live) === JSON.stringify(committed)
```

- **Differs** → unseeded, or written by something other than the seed script. The latter matters: nothing but `seedMeetstandaard.js` should ever write these.
- Also list versions present in one place but not the other. A committed document with no Firestore version is unpublished; a Firestore version with no committed document has no source and is the more serious finding.

### 3. Derived numbers still follow from their inputs

Anything computed rather than read must be re-checked against its formula — these are the values a silent input change corrupts.

| Document | Invariant |
|---|---|
| interventiebibliotheek | `besparingEurPerJaar` and `co2eKgPerJaar` follow from the `aannames` prices and emission factors × `bestendiging` |
| interventiebibliotheek | `monetairCo2EurPerEenheid` = `co2ePerEenheid` × CO₂ shadow price |
| meetstandaard | every proxy `bedrag` has the sign of its `bedragTekst` |
| meetstandaard | each niveau total equals the sum of its proxies, **except** where `controle.somAfwijkingen` declares otherwise |

`functions/meetstandaard.test.js` already asserts these — run `cd functions && node --test` first and only hand-check what it doesn't cover.

### 4. `controle` still describes reality

`zonderKengetal`, `nietGemonetariseerd` and `somAfwijkingen` must match what is actually in the document. A shrinking count is as suspicious as a growing one — it can mean a value was invented to fill a gap (`docs/pitfalls.md#data-never-invent-a-kengetal`).

## Rules

- **Read-only.** Never write to Firestore, never regenerate over a committed file, never re-seed. Report and let the caller decide.
- **Never** test a write to check permissions (`docs/pitfalls.md#data-destructive-write-test-on-production`).
- Use the Admin SDK via `functions/serviceAcountSecretKey.json` for reads; it bypasses rules, which is what you want here.
- Clean up temp files.

## Report

- One line per document: in sync, or exactly what differs.
- Every mismatch with its concrete diff — field names and values, not "some fields differ".
- Explicitly state what you did **not** check.
