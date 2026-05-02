---
name: linear-merge-all
description: >
  Merge every Linear ticket sitting in "In Review" (or equivalent) one by one
  by finding each ticket's linked GitHub PR and running `gh pr merge` against
  it sequentially. On merge conflicts, fetch the PR branch into a throwaway
  worktree, rebase against the target, resolve conflicts in place, force-push,
  and retry the merge. After each successful merge, move the Linear ticket to
  the first `completed`-type state (Done/Merged/Shipped) and pull main fresh so
  the next PR in the queue rebases against the just-merged change. Use when
  the user says "/linear-merge-all", "merge all my linear PRs", "merge every
  ticket in review", "burn down my review queue", or wants to ship a stack of
  human-reviewed tickets in one pass.
---

# /linear-merge-all — Burn down the Linear "In Review" queue, one PR at a time

You are a merge runner. For every Linear ticket sitting in **In Review** (or
the team's equivalent), find its linked GitHub PR and merge it. Sequentially.
On conflicts, resolve them in an isolated worktree and retry. After each
successful merge, transition the ticket to a `completed`-type state, refresh
local `main`, and move on.

**This skill is the human-equivalent merge action.** Unlike `/linear-team-build`
(where the bot must stop at `In Review` because moving past it would silently
ship unreviewed code), `/linear-merge-all` is invoked by a human who has
already reviewed the work and is explicitly asking to ship it. Moving the
Linear ticket to a `completed`-type state after merge is correct here — the
human's invocation IS the authorization.

## 0. Inputs

`/linear-merge-all [flags]`.

Optional flags:
- `--team <key>` — Linear team key (e.g. `ENG`). Default: all teams the API
  key can see.
- `--assignee <me|email|userId>` — filter to one assignee. Default: any.
- `--limit <n>` — cap how many tickets to process this run. Default: 50
  (high enough to clear most review queues; pass an explicit number for tighter
  scope).
- `--target <branch>` — only merge PRs whose **base** is this branch. Default:
  the repo's default branch (read from `gh repo view --json defaultBranchRef`).
  Use this to scope to e.g. `main` and skip stacked PRs targeting feature
  branches.
- `--method <squash|merge|rebase>` — merge strategy passed to `gh pr merge`.
  Default: `squash` (cleanest history; one ticket = one commit on the target).
- `--admin` — pass `--admin` to `gh pr merge` to bypass branch protection
  (requires admin on the repo). Off by default.
- `--state <name>` — explicit Linear state name to consume. Default: auto-detect
  the team's `In Review`-flavored `started` state (see §1.5).
- `--state-after <name>` — explicit Linear state name to transition to after
  merge. Default: auto-detect the team's first `completed`-type state matching
  `Done|Merged|Shipped|Released|Completed` (see §1.5).
- `--no-state-update` — leave the Linear ticket in its current state after
  merge; only post the comment. Useful when downstream automation owns the
  state transition (e.g. a deploy bot flipping to `Shipped` post-deploy).
- `--skip-conflicts` — on the first PR with merge conflicts, skip rather than
  attempt resolution. Records `CONFLICTED` in the summary table and continues
  with the next ticket. Off by default — by default, conflicts are resolved.
- `--dry-run` — list tickets that would be merged (with their PR URLs and
  mergeable state) and stop.

**No confirmation prompt.** If invoked with no flags, just start — defaults
are: every In Review ticket the API key can see (cap 50), squash-merge against
the default branch, transition to first `completed`-type state. Print the
resolved settings + ticket queue + per-PR mergeable status, then **immediately
proceed to §3 in the same response**. Asking "proceed?" after the queue is
printed is a bug — the user already confirmed by invoking the skill. Only stop
early if `--dry-run` is set or preflight (§1) fails.

## Linear interface — `@schpet/linear-cli`

All Linear interactions go through the `linear` CLI
([`@schpet/linear-cli`](https://github.com/schpet/linear-cli)), not raw
GraphQL. Auth via stored credentials (`linear auth login`), so
`LINEAR_API_KEY` is not required directly.

Commands used:
- `linear auth token` — verify a credential is configured.
- `linear issue query --state started --json [--team K] [--assignee U] [--limit N]`
  — fetch issues in the `started` group, filter by `state.name` in JSON.
- `linear issue view <ID> --json` — fetch full fields including
  `attachments.nodes` (where GitHub PR URLs live).
- `linear issue update <ID> --state "<name>"` — transition workflow state.
- `linear issue comment add <ID> --body-file <path>` — post merge result.
- `linear api '<graphql>'` — only as escape hatch for fields no subcommand
  exposes (e.g. fetching a team's full `WorkflowState` list).

**Never** call `curl https://api.linear.app/graphql` directly.

## 1. Preflight

1. **`linear` CLI available.** `command -v linear` must succeed.
   - On failure, stop and tell the user to install it:
     `npm i -g @schpet/linear-cli` (or `brew install schpet/tap/linear-cli`).
2. **Linear auth.** `linear auth token` must print a token.
   - On failure, tell the user to run `linear auth login`, pick a workspace,
     and re-run.
3. **`gh` available + authed.** `gh auth status` must succeed.
4. **`jq` available.** `command -v jq` must succeed.
5. **Repo state.** `git status --porcelain` must be empty. If dirty, abort
   and tell the user to commit/stash — this skill pulls `main` between merges
   and force-pushes PR branches during conflict resolution; both can clobber
   uncommitted local work.
6. **In a git repo with a `gh` remote.** `gh repo view --json nameWithOwner,defaultBranchRef`
   must succeed and the result is captured as `$REPO_NWO` and `$DEFAULT_BRANCH`.
7. **Capture run-level state.** Cache directory + Linear token (reused for
   any per-PR work):
   ```bash
   LINEAR_TOKEN=$(linear auth token 2>/dev/null)
   LMA_CACHE_DIR=/tmp/lma-cache-$$
   mkdir -p "$LMA_CACHE_DIR"
   ```
   The cache dir is removed at the end of §5.

## 1.5. Resolve target Linear states

Before fetching the queue, resolve two state names per team that ends up in
the queue: the **input state** (what we consider "In Review") and the
**output state** (what we move to after merge). State resolution must filter
by `WorkflowState.type` so we never accidentally fuzzy-match into the wrong
group.

For the **input state** (read in §2):
- If `--state` was passed, use that exact name.
- Otherwise, per team, fetch the team's `WorkflowState` list once (cache to
  `$LMA_CACHE_DIR/states-<TEAM_KEY>.json`) and pick the first match in:
  ```
  type=="started" AND name matches ^(In Review|Code Review|Reviewing|PR Review|Ready for Review)$ (case-insensitive)
  ```
  If none match, pick the first `type=="started"` state whose name contains
  `review` (case-insensitive). If that still fails, log a warning for that
  team and skip it.

For the **output state** (written in §4e):
- If `--state-after` was passed, use that exact name.
- Otherwise, per team, pick the first match in the cached state list:
  ```
  type=="completed" AND name matches ^(Done|Merged|Shipped|Released|Completed)$ (case-insensitive)
  ```
  If none match, pick the first `type=="completed"` state. If the team has
  *no* `completed` states (extremely unusual), log a warning and leave the
  ticket in its current state for that team — never fall through to a
  `started` or `unstarted` state, which would look like a regression.

Helper to fetch + cache a team's state list (used here and in §4e):

```bash
fetch_team_states() {
  local team_key=$1
  local out="$LMA_CACHE_DIR/states-$team_key.json"
  if [ ! -f "$out" ]; then
    linear api '
      query($key:String!){ team(id:$key){ states{ nodes{ id name type } } } }
    ' --variables "$(jq -nc --arg key "$team_key" '{key:$key}')" \
      > "$out"
  fi
  cat "$out"
}
```

## 2. Fetch the In Review queue

```bash
linear issue query \
  --state started \
  --json \
  --limit "${LIMIT:-50}" \
  ${TEAM:+--team "$TEAM"} \
  ${ASSIGNEE:+--assignee "$ASSIGNEE"}
```

In the JSON output, keep only nodes whose `state.name` matches the per-team
input state resolved in §1.5 (case-insensitive). Hydrate any node missing
`attachments` with `linear issue view <ID> --json` and persist each ticket's
final JSON to `$LMA_CACHE_DIR/issue-<IDENT>.json` — that file is the
canonical read source for §3 and §4.

Sort: `priority` ascending (1=urgent first, 0=no-priority last), then
`updatedAt` ascending (oldest review first → land long-pending PRs before
new ones that may build on them). Apply `--limit`.

## 3. Resolve each ticket's GitHub PR

For each ticket, find the linked PR by scanning `attachments.nodes[]` in the
cached issue JSON. Linear's GitHub integration auto-creates an attachment
when a PR references the ticket (via `MAGIC-123` in the PR title/body, the
`Magic Branch Name`, or a manual link). Resolution order:

1. **Attachment with PR-shaped URL.** Look for entries whose `url` matches
   `^https://github\.com/[^/]+/[^/]+/pull/\d+$`. If multiple, prefer the
   newest by `createdAt`. Read from cache:
   ```bash
   PR_URL=$(jq -r '
     [.attachments.nodes[]?
      | select(.url | test("^https://github\\.com/[^/]+/[^/]+/pull/[0-9]+$"))]
     | sort_by(.createdAt) | reverse | .[0].url // empty
   ' "$LMA_CACHE_DIR/issue-$IDENT.json")
   ```
2. **`gh pr list --search`.** If no attachment matched, search GitHub for an
   open PR mentioning the Linear identifier in title or body:
   ```bash
   PR_URL=$(gh pr list --state open --search "$IDENT in:title,body" \
     --json url --limit 1 --jq '.[0].url // empty')
   ```
3. **No PR found.** Record verdict `NO_PR` in the results table, post a
   comment to the Linear ticket noting "no linked GitHub PR found — leaving
   in current state", and continue to the next ticket. Do **not** transition
   the state — the human needs to either link the PR manually or move the
   ticket back to In Progress themselves.

For each PR found, capture its number, head/base refs, and current
mergeable status with one `gh` call:

```bash
PR_INFO=$(gh pr view "$PR_URL" --json number,headRefName,baseRefName,mergeable,mergeStateStatus,state,isDraft,title,url)
```

Print a per-ticket summary line, e.g.:
```
ENG-123  PR #45  base=main  status=CLEAN     → ready to merge
ENG-130  PR #51  base=main  status=DIRTY     → conflicts (will resolve)
ENG-141  PR #58  base=main  status=BLOCKED   → required reviews missing → SKIP
ENG-150  (no PR)                              → SKIP, comment to ticket
```

If `--target` was passed, also drop tickets whose PR base ≠ `--target`,
recording `WRONG_BASE` in the summary.

If `--dry-run`, print the queue with statuses and stop.

## 4. Per-PR merge loop

Process tickets **sequentially**. Parallel merging is not supported here —
landing PR N+1 may need to rebase against the result of PR N, and merge
queues for that workflow belong to GitHub-side tooling, not this skill.

For each ticket in queue order:

### 4a. Re-check PR state (right before merging)

The §3 snapshot may be stale if earlier PRs in this run already changed
`main`. Re-fetch:

```bash
PR_INFO=$(gh pr view "$PR_URL" --json number,headRefName,baseRefName,mergeable,mergeStateStatus,state,isDraft)
PR_NUMBER=$(echo "$PR_INFO" | jq -r '.number')
HEAD_REF=$(echo "$PR_INFO" | jq -r '.headRefName')
BASE_REF=$(echo "$PR_INFO" | jq -r '.baseRefName')
PR_STATE=$(echo "$PR_INFO" | jq -r '.state')             # OPEN/CLOSED/MERGED
MERGEABLE=$(echo "$PR_INFO" | jq -r '.mergeable')        # MERGEABLE/CONFLICTING/UNKNOWN
MERGE_STATUS=$(echo "$PR_INFO" | jq -r '.mergeStateStatus') # CLEAN/DIRTY/BEHIND/BLOCKED/UNSTABLE/HAS_HOOKS/UNKNOWN
IS_DRAFT=$(echo "$PR_INFO" | jq -r '.isDraft')
```

Branch by status (first match wins):

- **`PR_STATE != "OPEN"`** → already MERGED or CLOSED. If MERGED, treat as
  success: post a "PR was already merged" comment to Linear and proceed to
  §4e to transition the ticket. If CLOSED-not-merged, record `ALREADY_CLOSED`
  and skip.
- **`IS_DRAFT == true`** → skip with `DRAFT`. Post a comment noting the PR
  is still a draft.
- **`MERGE_STATUS == "BLOCKED"`** → required reviews missing or branch
  protection blocking. If `--admin` is set, attempt the merge anyway (`gh
  pr merge --admin` will override). Otherwise skip with `BLOCKED` and post
  a comment listing what's blocking (parse from `gh pr view --json
  reviewDecision,statusCheckRollup`).
- **`MERGE_STATUS == "BEHIND"`** → branch is behind base; needs an update.
  Try `gh pr update-branch "$PR_URL"` first (uses GitHub's "Update branch"
  API; preserves the PR branch's commits). If that fails (e.g. produces
  conflicts), fall through to §4d (conflict resolution).
- **`MERGEABLE == "CONFLICTING"` or `MERGE_STATUS == "DIRTY"`** → conflicts.
  If `--skip-conflicts` is set, record `CONFLICTED` and skip. Otherwise
  proceed to §4d.
- **`MERGE_STATUS == "UNSTABLE"`** → non-required checks failing. Log a
  warning and proceed to §4c — UNSTABLE means the merge is technically
  allowed, just that some optional CI is red.
- **`MERGE_STATUS == "UNKNOWN"`** → GitHub hasn't computed mergeability yet.
  Wait 5 seconds, re-fetch up to 3 times. If still UNKNOWN, skip with
  `UNKNOWN_STATUS`.
- **`MERGE_STATUS == "CLEAN"` or `MERGE_STATUS == "HAS_HOOKS"`** → green
  light, proceed to §4c.

### 4c. Merge the PR

```bash
gh pr merge "$PR_URL" \
  --"${METHOD:-squash}" \
  --delete-branch \
  ${ADMIN:+--admin}
```

If the command fails, capture stderr. Common failure modes and handling:

- `is not mergeable` — GitHub now says conflicts (race with §4a). Fall
  through to §4d.
- `Required status check ... is expected` — checks not yet complete. Wait
  30 seconds, retry once. If still failing, skip with `CHECKS_PENDING`.
- `Pull request is not mergeable: the base branch policy prohibits the
  merge` — branch protection. If `--admin` was not set, skip with `BLOCKED`
  and tell the user to re-run with `--admin`. If `--admin` was set and
  still failing, the user lacks admin rights — surface the error verbatim.
- Any other failure — surface the stderr and skip with `MERGE_FAILED`.

On success, capture the merge SHA from the merge commit (parse from `gh pr
view "$PR_URL" --json mergeCommit --jq '.mergeCommit.oid'`) and proceed to
§4e.

### 4d. Conflict resolution path

When a PR has conflicts (§4a or §4c), resolve them in a throwaway worktree.
**Never resolve conflicts in the main working tree** — that risks losing
in-flight work and pollutes the user's checkout.

1. **Set up a worktree** named after the PR:
   ```bash
   WT_DIR="../$(basename "$PWD").lma-pr-$PR_NUMBER"
   git fetch origin "$HEAD_REF:$HEAD_REF" --update-head-ok 2>/dev/null \
     || git fetch origin "$HEAD_REF" --update-head-ok
   git fetch origin "$BASE_REF" --update-head-ok
   git worktree add "$WT_DIR" "$HEAD_REF"
   pushd "$WT_DIR" >/dev/null
   ```

2. **Attempt rebase against the latest base.** Rebase (not merge) keeps
   the PR's history linear, which matches squash-merge defaults best:
   ```bash
   git rebase "origin/$BASE_REF"
   ```

3. **If rebase has conflicts, resolve them.** This is the AI judgment step
   — read each conflicted file, understand both sides semantically, and
   write the merged result. Guidelines:

   - **Use the Read tool** to view each conflicted file's full content
     including the markers (`<<<<<<<`, `=======`, `>>>>>>>`). Conflict
     markers themselves are valid file content for Read.
   - **Use the Edit tool** to write the resolved version, replacing the
     entire conflict block (markers + both sides + separator) with the
     final code. After editing, the file must contain **zero** conflict
     markers — verify with `grep -E '^(<<<<<<<|=======|>>>>>>>)' "$file"`
     before staging.
   - **Resolve simple cases automatically:**
     - Both sides add the same line → keep one copy.
     - Both sides delete the same line → leave deleted.
     - Whitespace/formatting differences only → prefer the side that
       matches the rest of the file's style.
     - Import/use statement collisions → merge both, sort if the file's
       conventions sort imports.
     - Lockfile/`package-lock.json`/`yarn.lock`/`pnpm-lock.yaml` → delete
       and regenerate using the project's package manager (`npm install`,
       `yarn`, `pnpm install`, etc.); commit the regenerated lockfile.
       Do **not** hand-merge lockfiles — it's almost always wrong.
   - **Escalate semantic conflicts to ESCALATE.** If both sides modify
     the same logic in incompatible ways (e.g. one side renames a
     function, the other side adds a call to the old name; both sides
     change the same business rule differently), do NOT guess. Abort
     the rebase, post a Linear comment summarizing the conflict, leave
     the worktree in place for the human, and record `ESCALATED` in
     the results table:
     ```bash
     git rebase --abort
     popd >/dev/null
     # Worktree stays — human will work in it
     ```
     The Linear comment must include: the conflicted file path(s), a
     short description of *why* it's semantic (not mechanical), the
     worktree path, and a one-line revert command
     (`git worktree remove --force "$WT_DIR"`) so the human can clean
     up after they're done.
   - **Stage + continue per file** as you resolve:
     ```bash
     git add "$file"
     git rebase --continue
     ```
   - If a single conflict cycle resolves more than 5 files OR the rebase
     spans more than 10 commits, that's a signal the PR is too divergent
     — escalate rather than power through.

4. **Run project sanity checks** (best-effort, never block on missing):
   - `git status --porcelain` must be empty after rebase completes.
   - If `package.json` exists with a `lint` script: `npm run lint`
     (timeout 120s). On failure, surface but do not auto-fix — escalate
     so the human can decide.
   - If `tsconfig.json` exists: `npx tsc --noEmit` (timeout 180s). Same
     handling: surface, do not fix, escalate on real type errors.
   - These checks catch the most common conflict-resolution mistakes
     (broken imports, syntax errors, type mismatches) before force-push.

5. **Force-push the rebased branch:**
   ```bash
   git push --force-with-lease origin "$HEAD_REF"
   ```
   `--force-with-lease` (not `--force`) so the push refuses if someone
   else pushed to the PR branch while we were rebasing. On rejection,
   abort, post a "branch moved during conflict resolution — re-run after
   the human stabilizes the PR" comment, and record `RACED`.

6. **Tear down the worktree** (success path only — failed/escalated
   worktrees stay so the human can debug):
   ```bash
   popd >/dev/null
   git worktree remove "$WT_DIR"
   ```

7. **Re-attempt the merge** (jump back to §4c). If it fails again with
   conflicts, escalate — two passes is the cap; three suggests a moving
   target the bot can't catch up to.

### 4e. Update Linear

After a successful merge:

1. **Post a merge comment** via `--body-file`:
   ```markdown
   ### ✅ merged by /linear-merge-all

   - **PR:** $PR_URL (#$PR_NUMBER)
   - **Method:** $METHOD
   - **Merge commit:** $MERGE_SHA
   - **Base:** $BASE_REF
   $CONFLICT_NOTE  <!-- e.g. "- **Conflicts:** auto-resolved 3 files (lockfile regenerated, 2 hand-merged hunks)" -->
   ```
   The `$CONFLICT_NOTE` line is included only if §4d ran for this PR. If
   the PR went straight through §4c with no conflicts, omit the line
   entirely.

2. **Transition the ticket** to the per-team output state resolved in §1.5,
   unless `--no-state-update` was passed:
   ```bash
   if [ -n "$STATE_AFTER" ] && [ -z "$NO_STATE_UPDATE" ]; then
     linear issue update "$IDENT" --state "$STATE_AFTER"
   fi
   ```
   The `$STATE_AFTER` value comes from §1.5's per-team resolution, which
   already filtered to `type=="completed"` — never pass a `started`-type
   name through this command.

For ESCALATED tickets (semantic conflicts, raced pushes, failed checks
post-merge):
- Post the diagnostic comment described in the relevant §4d/§4c branch.
- Do **not** transition the state. The ticket stays in `In Review` so the
  human knows it still needs attention.

For NO_PR / DRAFT / BLOCKED / WRONG_BASE / UNKNOWN_STATUS:
- Post a one-paragraph comment explaining why the skill skipped the
  ticket and what the human can do (link the PR, mark non-draft, request
  reviews, etc.).
- Do not transition the state.

### 4f. Refresh `main` (or whatever `--target` was)

After a successful merge, pull the merged change into the local default
branch so the **next** PR in the queue gets a fresh base for §4a's
`MERGE_STATUS` re-check (and for §4d's `git fetch origin "$BASE_REF"` if
conflicts arise):

```bash
# Don't switch the user's branch — just update the ref tracking origin.
git fetch origin "$BASE_REF"
```

If the user happens to be checked out *on* `$BASE_REF`, also fast-forward
the local checkout (only safe if the working tree is clean, which §1
already verified):

```bash
if [ "$(git symbolic-ref --short HEAD 2>/dev/null)" = "$BASE_REF" ]; then
  git pull --ff-only origin "$BASE_REF"
fi
```

Never `git pull` on the user's checked-out feature branch — that would
inject merge commits the user didn't ask for.

### 4g. Decide whether to continue

- **Environmental failure** (Linear auth lost, `gh` rate-limited, network
  down) → STOP the loop; the same failure will hit every later ticket.
  Print the partial summary and exit.
- **Per-PR failure** (BLOCKED, DIRTY-unresolvable, ESCALATED, MERGE_FAILED)
  → log and move on. One stuck PR doesn't block the rest.
- **Successful merge** → continue to next ticket.

## 5. Final summary

After the loop completes (or stops on environmental failure), print a
results table and clean up the cache directory.

```
## /linear-merge-all — summary
Processed: N tickets

| Ticket   | PR        | Verdict        | Notes                                          |
|----------|-----------|----------------|------------------------------------------------|
| ENG-123  | #45       | MERGED         | squash, no conflicts                           |
| ENG-130  | #51       | MERGED         | squash, auto-resolved 3 conflicts              |
| ENG-141  | #58       | BLOCKED        | required reviews missing — re-run with --admin |
| ENG-150  | (no PR)   | NO_PR          | link a GitHub PR to ENG-150 and re-run         |
| ENG-160  | #62       | ESCALATED      | semantic conflict in src/billing/charge.ts     |
| ENG-170  | #63       | DRAFT          | mark PR ready and re-run                       |

Merged: 2 / 6
Skipped: 4 (1 NO_PR, 1 BLOCKED, 1 ESCALATED, 1 DRAFT)

Worktrees still on disk (ESCALATED — left for human debug):
- ../<repo>.lma-pr-62  (ENG-160)
  Clean up after resolving: git worktree remove --force ../<repo>.lma-pr-62
```

Cleanup:
```bash
rm -rf "$LMA_CACHE_DIR"
```

Do not remove ESCALATED worktrees automatically — those are the human's
working surface for finishing the conflict resolution.

## Hard rules

- **Never push to `main` directly.** All merges go through `gh pr merge`,
  which uses GitHub's merge API.
- **Never `git push --force` (without `--with-lease`)** — `--force-with-lease`
  catches concurrent updates to the PR branch.
- **Never `--no-verify`** on commits made during conflict resolution.
- **Never resolve conflicts in the main working tree** — always in a
  throwaway worktree (§4d step 1).
- **Never transition a Linear ticket to a non-`completed`-type state** as
  the post-merge transition. The §1.5 resolver guarantees `$STATE_AFTER`
  is `type=="completed"`; do not bypass it.
- **Never proceed past a failed sanity check** in §4d step 4. A green
  rebase that produces a broken build is worse than an aborted rebase that
  asks the human for help — surfacing means the human catches it before
  the merge lands; ignoring means it lands and breaks `main` for everyone.
- **Sequential only.** Do not parallelize the per-PR loop. PR N+1 may
  rebase cleanly only because PR N landed first; parallelism would race
  on `main` updates and undo the conflict-avoidance benefit of running
  the queue in priority order.
- **Don't ask "proceed?".** If preflight (§1) and queue fetch (§2) both
  succeed, just run §3 → §4 → §5 in the same response. The user already
  confirmed by invoking the skill.
