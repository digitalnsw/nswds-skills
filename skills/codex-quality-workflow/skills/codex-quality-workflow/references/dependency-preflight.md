# Dependency preflight (parent only)

Run this before initial freeze/validation in full, review-only, prepare and validate
modes. Init-only still writes configuration only; quick checks and reviewers never
install dependencies. This is environment preparation, not a code-repair round.

1. Honor the repository's runtime pin using an already installed matching runtime;
   do not install/upgrade Node or the package manager silently. Then run
   `node SCRIPTS/dependency-preflight.mjs check`. It is read-only. READY means
   the inspected npm dependency inventory is usable, not that tests pass.
   NOT_APPLICABLE means no npm dependency tree needs this helper. For a different
   ecosystem, inspect its declared manager, lockfile and installed environment;
   do not use npm, invent a lockfile, or claim that environment was verified.
2. NEEDS_RESTORE is not a source defect. Explain the missing/stale dependencies
   briefly. The workflow authorizes one restore from the existing lockfile. Obtain
   filesystem/network approval through the host when needed, then run
   `node SCRIPTS/dependency-preflight.mjs restore`. Do not ask the user to install
   manually or authorize every following stage. The helper runs npm ci with
   lifecycle scripts, audit and funding disabled; it replaces node_modules, never
   updates dependency versions or the lockfile, includes development dependencies,
   and uses a Git-local download cache. Tracked or shared/symlinked node_modules
   requires manual preparation rather than destructive replacement.
   Do not hand-create symlinks to conceal an incomplete install.
3. The helper reserves both adapters' validation locks, records one attempt per
   source fingerprint, and checks HEAD, staged/unstaged changes and untracked files
   afterwards. BUSY means wait for the existing run, then check again. A failed
   restore, registry/auth problem, exhausted attempt, manifest/lock mismatch, or
   changed source is a concrete blocker. Preserve logs and changes; never reset,
   clean, stash, regenerate the lockfile, or erase the attempt to force another run.
4. Lifecycle scripts are not silently reenabled. If a required native binary or
   generated dependency artifact is absent, inspect the specific script and
   request permission for that additional setup, then recheck source invariants.
   Missing build outputs from a local workspace belong in the existing build/task
   graph; they are not automatically dependency failures.
5. On success, continue automatically with freeze/preparation and rerun the full
   configured validation. Do not reuse evidence from before restoration. The
   verifier checks preflight before its cache and fingerprints installed npm
   metadata so old failures/successes are not reused after restoration. A remaining
   typecheck/test/lint failure still blocks review. Diagnose once; no install loop.

If a gate fails later with a concrete dependency-resolution error, run this check
before classifying it. The parent may use the same one-attempt restoration path and
rerun validation; reviewers and repair workers never install. Ordinary assertion,
type or lint errors do not justify installing anything. After accepted source
repairs, preserve the accepted snapshot and refresh preparation as usual.

For non-npm managers, use only the repository's declared frozen/immutable install
after inspecting its script policy and obtaining required permissions. Retain
before/after source evidence and a single attempt; do not convert package managers.
Report missing or unsupported setup explicitly rather than certifying it.

Reference: https://docs.npmjs.com/cli/v11/commands/npm-ci (lockfile-preserving clean
installation and ignore-scripts behavior). This helper is not a full npm resolver
or a substitute for the build and test gates.
