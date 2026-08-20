---
name: protect-branch
description: Set up merge-gating branch protection on a GitHub repo — a ruleset requiring CI status checks (strict/up-to-date), a CI workflow that fails fast on conflict markers and broken lockfiles, and a deploy-key bypass for release workflows that push to the protected branch. Use whenever the user asks to protect a branch, add branch protection, require CI/status checks before merge, stop red PRs from being merged, or set up rulesets — invoke it even if they only name a repo, e.g. "/protect-branch owner/repo".
---

# Protect a repo's default branch

Set up enforcement so a PR can never merge (and nothing lands on the default branch) unless CI passes — including the stale-branch case where a bad conflict resolution is introduced at merge time. The target repo is the argument (`owner/repo`); if none was given, ask which repo before doing anything. Work via `gh`; the user needs admin on the repo.

Origin story, so you know what this must prevent: in a production repo, a bot PR was merged with unresolved conflict markers (`<<<<<<<`/`>>>>>>>`) committed into package-lock.json via GitHub's web "Resolve conflicts" editor. A CI check on the PR **did fail**, but the branch had no protection, so the red check couldn't block the merge button. The broken lockfile then failed `npm ci` in the release pipeline. Detection existed; enforcement didn't.

## Step 1 — Survey the repo first

The right configuration depends on what's already there:

- List `.github/workflows/`. Note which jobs run on `pull_request` and their **job names** — those are the status-check contexts to require. Only require checks that run on *every* PR (skip path-filtered ones, or they'll block unrelated PRs forever).
- Detect the package manager (package-lock.json → npm, pnpm-lock.yaml → pnpm, yarn.lock → yarn) and whether there's a build script.
- Check whether any workflow **pushes to the default branch** (semantic-release, changesets version commits, auto-format bots, any `git push` in a workflow). If so, Step 4 is required — required status checks will block those pushes and break releases.
- Check for husky or another hook manager (Step 5).
- Check current state: `gh api repos/<O>/<R>/branches/<default>/protection` and `gh api repos/<O>/<R>/rulesets`. If protection already exists, reconcile with it rather than stacking a duplicate.
- Check commit-message rules (commitlint config): some repos don't allow a `ci:` type — use `ops:`, `build:`, or `chore:` for your commits.

## Step 2 — CI workflow (if no equivalent PR gate exists)

Add `.github/workflows/ci.yml`, adapted to the repo's stack:

```yaml
name: CI
on:
  pull_request:
permissions:
  contents: read
jobs:
  install:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      # Package managers report a lockfile containing conflict markers with
      # misleading errors — catch markers in any tracked file explicitly.
      - name: Check for unresolved merge conflict markers
        run: |
          if git grep -nE '^(<{7}|>{7}) '; then
            echo "❌ Unresolved merge conflict markers found in the files above."
            exit 1
          fi
      - uses: actions/setup-node@v6
        with:
          node-version: 'lts/*'
      - run: npm clean-install        # or: pnpm install --frozen-lockfile / yarn --immutable
      - run: npm run build --if-present
```

Why it's shaped this way: the `pull_request` event checks out the **test merge of PR + base**, so this validates the merged result — exactly where the incident happened. Verify install/build pass locally before making them required gates.

**Ordering matters:** get this workflow onto the default branch *before* creating the ruleset. Otherwise the required `install` check can never be satisfied, and if the pusher isn't a bypass actor, the push itself is blocked.

## Step 3 — Create the ruleset

`gh api repos/<O>/<R>/rulesets -X POST` with:

- `"conditions": {"ref_name": {"include": ["~DEFAULT_BRANCH"], "exclude": []}}`
- Rules: `deletion`, `non_fast_forward`, and `required_status_checks` with:
  - `"strict_required_status_checks_policy": true` — branch must be up to date with base. This closes the stale-branch loophole; the trade-off is bot PRs need "Update branch" before merging. Tell the user about this.
  - `required_status_checks`: the job names from Step 1 plus `install`, each with `"integration_id": 15368` (pins each check to GitHub Actions so it can't be spoofed by another app).
- `"bypass_actors": []` — **do NOT add repository admins (RepositoryRole 5) as a bypass actor.** An always-on admin bypass lets an admin `git push` to the default branch skip every required check silently — this is a real observed failure mode, not a hypothetical, and fleets that shipped with the admin bypass have had to strip it back out of every repo. The emergency path is a temporary enforcement disable instead: `PUT` the ruleset with `"enforcement": "disabled"` (resend the full definition — PUT replaces), push, re-enable. Deliberate, auditable, and not a standing hole. The only bypass actor a ruleset should carry is a dedicated deploy key for automation that must push (Step 4).

**Known trap — do not add GitHub Actions as a bypass actor.** The API rejects integration 15368 for org repos where the Actions app isn't an org installation ("Actor GitHub Actions integration must be part of the ruleset source or owner organization"), and it doesn't appear in the UI bypass picker in such orgs either. If a workflow needs to push to the protected branch, use the deploy key below — don't burn time on the Actions bypass.

## Step 4 — Deploy-key bypass (only if a workflow pushes to the default branch)

Repo-scoped, no PAT, fully automatable:

1. `ssh-keygen -t ed25519 -N "" -C "release@<repo>" -f <scratchpad>/release-deploy-key`
2. Add the public half as a **write** deploy key: `gh api repos/<O>/<R>/keys -X POST -f title="semantic-release (Release workflow push)" -f key="$(cat ...pub)" -F read_only=false`
3. `gh secret set RELEASE_DEPLOY_KEY --repo <O>/<R> < <scratchpad>/release-deploy-key`, then **delete the local private key immediately**.
4. Update the ruleset adding `{"actor_type": "DeployKey", "bypass_mode": "always"}` to `bypass_actors`. Ruleset updates are `PUT` with the **full definition** — it replaces, not merges, so resend everything.
5. In the pushing workflow's checkout step add `ssh-key: ${{ secrets.RELEASE_DEPLOY_KEY }}` (keep `fetch-depth: 0` if the tool needs history). The remote becomes SSH, so pushes authenticate as the deploy key and bypass the ruleset. Keep `GITHUB_TOKEN` for GitHub Release/API calls — only the git push path changes.
6. If the tool reads a `repository` URL from package.json or config, make sure it doesn't force an HTTPS push URL that sidesteps the SSH remote.

## Step 5 — Local pre-commit guard (nice-to-have)

Only if a hook manager already exists (don't introduce one — the ruleset is the enforced gate; this is just faster feedback). For husky, add executable `.husky/pre-commit`:

```sh
#!/usr/bin/env sh
# Block commits that add unresolved merge conflict markers. Mirrors the CI
# check; note GitHub's web "Resolve conflicts" editor bypasses local hooks.
if git diff --cached | grep -nE '^\+(<{7}|>{7}) '; then
  echo "✖ Unresolved merge conflict markers in staged changes." >&2
  exit 1
fi
```

## Step 6 — Verify, don't assume

- `gh api repos/<O>/<R>/rulesets/<id>` — confirm rules and bypass actors are what you intended.
- If Step 4 applied: trigger the pushing workflow and check its log. semantic-release verifies push access on **every** run (even no-release runs) — a green run showing an SSH remote and "Allowed to push to the Git repository" is the proof. Don't force a real release just to test.
- Optionally open a trivial test PR to watch the required checks appear and gate the merge button; close it after.
- Report to the user: which checks are now required, who can bypass and how (deploy key only; admins included, everyone goes through PRs — emergency path is the temporary enforcement disable), behavior changes (bot PRs need "Update branch"; direct pushes now blocked for everyone except the deploy key), how to rotate the deploy key (new keypair → replace deploy key + secret), and anything you couldn't verify.
