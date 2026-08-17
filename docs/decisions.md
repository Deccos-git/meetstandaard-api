# Architecture Decision Records

Why we chose what we chose. Prevents relitigating settled decisions.

---

## ADR-001: A published version is immutable and served forever

**Date:** 2026-08-17 · **Status:** Accepted

### Context

Meetstandaarden change: tariffs are corrected, statements reworded, monetisation refined. A measurement valued in 2026 must still be explainable in 2030, when the standaard has moved several versions on.

### Decision

A published version is immutable. Corrections ship as a **new** version; old versions are served indefinitely. Nothing is ever removed.

Consumers pin a version explicitly and persist `meta.version` next to every stored measurement. Upgrading is deliberate handwork on the consumer's side.

### Consequences

- No deprecation machinery, no lifecycle states, no automatic migration — all of that exists to manage *automatic* upgrades, which do not happen here. An earlier design had `preview`/`stable`/`deprecated`, `Sunset` headers and successor links; it was removed as ceremony.
- Firestore rules must forbid client writes to published collections, or immutability is a promise nothing enforces. See `docs/pitfalls.md#deploy-firestore-rules-full-replace`.
- Re-seeding a version in place is a contract violation once anyone has pinned it.
- Every response states its own version, in `meta.version` and the `X-Meetstandaard-Version` header, so it is always visible which one you are on.

---

## ADR-002: Keep the versioning layer small

**Date:** 2026-08-17 · **Status:** Accepted

### Context

`versionedResource.js` briefly grew to ~215 lines: semver prerelease ordering, lifecycle states, deprecation and sunset headers, a `releases[]` index, a `/latest` alias, and cache policies that varied by lifecycle.

### Decision

Cut it back to ~106 lines. Three routes (`{resource}`, `{resource}/{version}`, `versions`), one cache policy, numeric version ordering, `latest` = highest version.

### Consequences

- Fully backwards compatible: `{versions: [...]}` unchanged, `latest` resolution identical, pinned bodies byte-identical. Verified against the real datasets.
- Version ids must be dot-separated numbers. Anything else is a `404`, which also keeps a hostile segment away from Firestore's `doc()`.
- If automatic migration is ever needed, the removed machinery is in git history — but it should not return without that need.

---

## ADR-003: Cross-sector comparability is derived, never declared

**Date:** 2026-08-17 · **Status:** Accepted

### Context

Effects with the same name exist in several sectors. The workbooks carry a `crossSectorBenchmarkbaar` column asserting which are comparable.

### Decision

Two effects are cross-sector **only if their question sets are exactly identical**, and this is computed from the instrument rather than read from a flag.

### Consequences

- The authored column is a claim, and measurement showed it wrong twice (EFF-12 and EFF-13 assert verbatim reuse; only 2/4 and 3/5 statements match).
- Measured against current data, exactly **one** effect qualifies.
- A derived value is self-maintaining: rewording a question drops that effect out automatically, so a wording change elsewhere cannot silently make a stale flag wrong.
- Implementation (an instrument hash on each effect) is deferred until the new arbeidsparticipatie wording is public — comparing against the current data would measure wording that is about to change.

---

## ADR-004: The panel is read-only; authoring belongs in the workbook

**Date:** 2026-08-17 · **Status:** Accepted

### Context

The panel used to be a CRUD editor over `categories`/`effects`/`questions` — a form on top of the production database, with no versioning and no review step.

### Decision

The panel displays standaarden and does not edit them. Authoring happens in the workbook, which is generated, committed, reviewed as a diff, and seeded.

### Consequences

- **The 31 effects in arbeidsparticipatie and gelijke kansen cannot currently be edited at all.** They are on pipeline B, which has no workbook yet. This is a real cost, accepted deliberately; `docs/migratie-standaarden.md` is the way out.
- Enforced, not just intended: the Firestore rules deny client writes to published collections.
- The panel needs no write path, which is why every renderer is presentational.

---

## ADR-005: Publish what is uncertain rather than hiding it

**Date:** 2026-08-17 · **Status:** Accepted

### Context

The source workbooks contain values that are provisional, absent, or internally inconsistent. A clean-looking document would have to either invent numbers or quietly drop rows.

### Decision

Publish the uncertainty as data. Every generated document carries a `controle` block; unavailable values are `null` with their verbatim source text.

### Consequences

- `controle.somAfwijkingen` names two energiearmoede niveaus whose stated total disagrees with the sum of their proxies — a source defect, surfaced rather than reconciled.
- `controle.zonderKengetal` names 41 of 95 interventions with no usable CO₂ figure.
- Consumers must handle `null` and must not render it as `0`. The handoff docs say so explicitly.
- This follows the workbooks' own rule — *geen kengetallen verzinnen* — and is the whole point of a transparency standard: a figure you cannot trace is worse than a gap you can see.

---

## ADR-006: A tariff shift is not valued, because the model cannot express one

**Date:** 2026-08-17 · **Status:** Accepted

### Context

`EG11` "Apparaten op nachttarief" carried a literal `0` for gas, elektra and water in the workbook, so the generator produced "€0 saved, 0 kg CO₂e per year".

Both figures looked defensible for different reasons, and only one was:

- **0 kg CO₂e is arguably right.** A night tariff moves consumption in time, not in volume, so total emissions genuinely do not change.
- **€0 saved is not.** Saving money is the entire point of the intervention. But `aannames` holds a *single* electricity price, so a day/night tariff difference cannot be represented anywhere in the model.

Its `statusKengetal` of `direct brongetal` made this worse rather than better: it lent a modelling gap the appearance of a sourced result.

### Decision

Blank the consumption cells so both figures parse to `null`, and let `EG11` join `controle.zonderKengetal`. Do not invent a tariff spread to produce a number.

### Consequences

- The document now states "not quantified" where it previously stated "no saving". Only the first is true.
- No interventie in milieu-circulariteit 0.9 publishes a hard `0`.
- **Valuing this properly requires a second electricity tariff in `aannames`** (and a way to express which share of consumption shifts). That is a modelling decision for the workbook, not something to infer in the generator.
- The CO₂ figure was lost along with the euro figure, because the two are computed from the same consumption cells. Accepted: a correct `0 kg` alongside a wrong `€0` still ships a wrong row, and the pair cannot currently be separated.
- Generalises beyond this row: a literal `0` in a source is indistinguishable from a measured zero, so where the model *cannot represent* the effect, blank the cell. See `docs/pitfalls.md#data-never-invent-a-kengetal`.
