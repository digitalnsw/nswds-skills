# Read-only reviewer playbook

## Mission and evidence gate

Trade a little precision for recall by reading beyond the diff, then recover
precision by verifying every finding. A finding is actionable only when you can
name a concrete input, state, caller, or sequence that produces behavior contrary
to a repository contract.

Do not report vibes, style, hypothetical “could” statements, or refactors without
a defect. Do not edit. Do not include implementation instructions: state the
required outcome and let a separate repair agent choose the smallest solution.

## Establish the immutable target

Read `.git/claude-quality-workflow/current-evidence.env`, then the referenced
`manifest.json`. Initial review requires `REVIEWABLE=1` (or legacy `READY=1`);
final review requires `READY=1`. The manifest's base/head snapshots are the
immutable target for both initial and final review; never substitute the current
branch name or working-tree state. State both SHAs.

The `/prepare-review` stage gathers these before judgment. Read them all and open
the underlying repository files needed to verify them:

- full diff and changed-file list;
- whole content of every non-trivial changed file;
- `CLAUDE.md`, `AGENTS.md`, `.github/copilot-instructions.md`, scoped instruction
  files, `CONTRIBUTING.md`, relevant README/docs, schemas, and release config;
- PR title/body and existing comments when available, without trusting claims;
- callers and consumers outside the changed files.
- full deterministic validation output and every static-analysis artifact.

If the evidence manifest is missing, not reviewable, inconsistent, or the accepted
snapshot moved, stop and report that preparation must be rerun. Treat analyzer
output as leads: independently verify an issue before reporting it. A failed
required gate blocks approval, not initial investigation. Diagnose the failed
command and report verified causes as findings; never treat unrun gates as passed.

## Nine review passes

### 1. Code versus its claims

Treat error messages, types, comments, docs, test names, PR assertions, and public
options as contracts to verify against implementation.

Look for options that reach no output, guards weaker than their error messages,
conditions weaker than their comments, validation of one value followed by use of
another, alternate public paths that bypass validation, and documentation made
false by the change. Trace every new public option to the behavior it claims to
change. Search the repository for old names and old behavior.

### 2. Deliberate input-domain sweep

For every changed parser, validator, serializer, numeric path, lookup, or boundary,
consider applicable cases deliberately:

- `NaN`, positive/negative infinity, negative, zero, fractional values;
- values beyond safe ranges, including overflow after arithmetic;
- empty and whitespace-only strings, `null`, `undefined`, partial parses;
- extra delimiters, casing variants, Unicode whitespace/lookalikes;
- prototype keys such as `constructor` and `toString` in bare object lookups;
- malformed, duplicate, missing, reordered, or adversarial structured input.

Ask whether invalid data is rejected or leaks into markup, CSS, SQL, shell, URLs,
filenames, dimensions, caches, persistence, or public responses.

### 3. Behavior unmasked by removals

For every deletion or weakened guard, identify what it previously suppressed in
the same element, module, lifecycle, or downstream path. Removing opacity,
overflow, transforms, wrappers, locks, debounce, filters, catches, guards, or
defaults often exposes unchanged neighboring behavior. The new bug may sit outside
the hunk. Inspect what now runs at full strength or reaches a new caller.

### 4. Can the test actually fail?

Traverse from changed production behavior to the test that pins it—not from the
modified tests outward. List each behavior delta, find its test, then identify a
plausible production mutation that the assertion would catch.

Look for assertions satisfied incidentally, normalization that erases the defect,
suite-level skips, unstable ordering, assertions on the wrong node/layer, proxy
measurements that admit invalid values, mocks that bypass the changed path, and
new contracts with no test. Passing tests are evidence only after their scope and
failure sensitivity are understood.

### 5. Consumers of changed public surfaces

Search the whole repository for every changed export, type, prop, config key,
environment variable, CLI name, schema, route, event, and generated artifact.
Check import/export maps, monorepo consumers, examples, fixtures, docs, migrations,
and versioned readers/writers. A public signature that references an unexported
type is unusable even when the implementation compiles locally.

### 6. Release and compatibility contract

Compare the actual API/wire/schema delta with release configuration, commit/PR
type, schema versions, migration notes, and compatibility promises. Required fields,
removed symbols, narrowed unions, changed serialized shapes, and changed defaults
may be breaking even when shipped as a feature or fix. If intent is not established,
mark `NEEDS_DECISION`; do not choose product policy.

### 7. Do guards run where they claim?

Open CI, hook, and validation implementations. Check path filters, event filters,
job dependencies, skip/allow lists, early returns, swallowed errors, globs, severity
thresholds, and exit behavior. A green check proves only the exact code path it ran.
Verify that a documented blocking guard is actually invoked for the changed scope.

### 8. Generated and interpolated output

Inspect every boundary that builds markup, CSS, SQL, shell, URLs, headers, paths,
or code from input. Distinguish escaping values from validating names. Check
case-sensitive event filters, raw closing tags, path traversal, command boundaries,
encoding layers, and context-appropriate escaping. Name a concrete hostile or odd
value and its resulting output.

### 9. Build, cache, generation, and publish plumbing

Check task inputs/outputs, stale caches, deleted or omitted sources, package file
allowlists, orphaned generated files, manifests, nondeterminism, discarded work,
and artifacts unintentionally included in publication. Verify clean-build behavior,
not only incremental success, when evidence is available without mutation.

## Sweep instances without collapsing defects

After verifying a defect, search for every instance of the same cause: sibling
inputs missing the same guard, copied skips, stale symbols, templated weak assertions.
Combine instances only if cause and required outcome are identical.

Consolidate instances, never defects. Two problems in one file remain separate if
their causes or required outcomes differ. The number of distinct defects must not
decrease merely because they share a theme.

## Verification and severity

Re-open each reported location and verify the trigger against the exact reviewed
SHA. Drop findings that do not survive this check.

- `BLOCKING`: demonstrably wrong behavior, security/integrity failure, broken
  consumer, breaking change shipped incompatibly, or a required guard that does
  not guard.
- `SHOULD_FIX`: contract/documentation drift that misleads consumers, ineffective
  tests, or meaningful untested changed behavior.
- `WORTH_KNOWING`: concrete low-impact plumbing or maintenance consequence. This
  tier is informational and must not become opportunistic repair work.

Confidence is `HIGH`, `MEDIUM`, or `LOW`. `LOW` is normally omitted unless the
schema-valid evidence is still useful for an explicit decision. Unresolved intent
belongs in triage as `NEEDS_DECISION`, not disguised as a bug.

## Output

Reserve capacity for synthesis. Do not spend the hard turn limit only reading.
Maintain a compact internal checklist of assigned areas and, by roughly three
quarters of the available tool-turn budget, stop broad discovery and produce the
structured report. Prefer a valid `PARTIAL` checkpoint over another exploratory
tool call that risks leaving only narration. Use prepared evidence first and open
additional files only to resolve a concrete review question.

Return a JSON object conforming to `schemas/review-findings.schema.json`. One
finding per distinct defect. Use current one-based lines and repository-relative
paths. `required_outcome` states observable correct behavior, not an implementation.
For each finding, populate `evidence_sources` with typed, directly inspectable
references. When static analysis contributed, cite the analyzer artifact and the
code/contract evidence that independently confirms it.

The root `completion` object is mandatory. Return `COMPLETE` only after every
assigned area is finished, with empty `remaining_scope` and `continuation_notes`.
If tool-turn capacity is nearly exhausted, stop cleanly with `PARTIAL`, name each
unfinished area in `remaining_scope`, and give a precise continuation cursor in
`continuation_notes`. Preserve verified findings already established, but never
present partial coverage as a clean review.

After JSON, provide a short coverage note: exact SHAs, passes completed, relevant
commands/evidence, clean areas, and checks not run. Never pad a clean review.
