---
name: worktree-task
description: >
  Execute a task in an isolated git worktree so it doesn't conflict with
  in-flight changes in the main working tree. Use when the user says
  "/worktree-task", "do X in a worktree", "run this in an isolated branch",
  "work on Y without conflicting with my current changes", "spin up a
  worktree for Z", or otherwise wants a side-branch workspace that won't
  disturb their current checkout. Accepts a task description as argument;
  creates a fresh worktree + branch, runs the task there, then offers
  merge/rebase/discard follow-ups.
---

# worktree-task

## Mental model
A thin, auditable wrapper around `git worktree`. NOT a task manager,
state store, or agent dispatcher. Every step is a literal shell command
run in-session; no hidden state, no daemon, no cross-session memory.
Recovery uses the same git commands printed here.

## When NOT to use this skill
Single-session tasks where isolation means "don't stomp on my current
working tree." For long-running parallel tasks across sessions, use a
stateful lifecycle manager. For tasks needing a specialist subagent,
use a delegated-agent skill.

## Agent isolation (and what "isolation" actually means here)
This skill does NOT use `Agent(isolation: "worktree")`. The worktree is
already a filesystem-and-branch boundary; a subagent would add opaque
state without stronger guarantees. **However**, a worktree only isolates
working tree, index, and branch ref. It does NOT isolate: shell env vars,
cwd across Bash calls, network, credentials, `~/.gitconfig`, files
outside the repo, or spawned processes. Secrets and side effects leak
freely. Sandbox for *file changes*, not a security sandbox.

## 0. Inputs (session-scoped; not persisted)
- `$TASK` — the task description (skill argument).
- `$REPO_ROOT` — `git rev-parse --show-toplevel` normally. BUT if `git rev-parse --git-common-dir` differs from `$REPO_ROOT/.git`, the current cwd is already inside a linked worktree. In that case, compute the main repo root as `dirname $(git rev-parse --git-common-dir)`, and use THAT as `$REPO_ROOT` for path derivation. This prevents nested siblings-of-a-worktree.
- `$REPO_NAME` — basename of `$REPO_ROOT`.
- `$SLUG` — 2–4 kebab-case words from `$TASK` (ascii, `[a-z0-9-]` only). Reject any slug that is not `^[a-z0-9][a-z0-9-]{0,39}$` after derivation. If derivation fails or produces an invalid slug, ask the user for one.
- `$TS` — `date +%Y%m%d-%H%M%S`.
- `$BRANCH` — `wt/$SLUG-$TS`.
- `$WT_PATH` — `$(dirname $REPO_ROOT)/$REPO_NAME.wt-$SLUG-$TS` (sibling dir).
- `$BASE_BRANCH` — current branch, or `main`/`master` if detached.
- `$BASE_SHA` — `git rev-parse HEAD` at preflight time.

## 1. Preflight (abort on any failure; never auto-fix)
Run from the user's current cwd:
1. `git rev-parse --is-inside-work-tree` → must print `true`.
2. `git rev-parse --show-superproject-working-tree` — if non-empty, you
   are inside a submodule. Ask: "You're inside a submodule at `<path>`.
   Create the worktree for the SUBMODULE, or abort so you can `cd` to
   the superproject? (submodule/abort)" Do not proceed without an
   explicit choice.
3. `git symbolic-ref -q HEAD` — exit-nonzero or empty stdout means HEAD
   is detached. Set `$BASE_BRANCH`: try `main`; if
   `git show-ref --verify --quiet refs/heads/main` fails, try `master`;
   if that also fails, prompt the user. Warn the worktree will branch
   from the detached SHA.
4. `git status --porcelain` — if non-empty, print the list and ask the
   user to confirm. Uncommitted changes stay in the main tree; NOT
   copied into the worktree.
5. Path collision on `$WT_PATH`:
   - not present → proceed.
   - present & listed in `git worktree list --porcelain` → ask: reuse
     (abort skill, tell user to `cd` there), or pick a new `$TS`.
   - present & NOT listed → stale dir: ask before `rm -rf "$WT_PATH"`,
     typed `yes` required.
5.5. `git worktree list --porcelain | grep -E '^branch refs/heads/'$BRANCH'$'`
   — if this matches, the branch is checked out in another worktree.
   `git worktree add` will refuse with a cryptic error; detect early and
   ask the user to pick a different `$SLUG` or `$TS`.
6. Branch collision: if `git show-ref --verify --quiet refs/heads/$BRANCH`
   succeeds, regenerate `$TS` and retry once; if still colliding, abort.

## 2. Create the worktree
git rev-parse HEAD                              # capture $BASE_SHA
git worktree add -b "$BRANCH" "$WT_PATH" "$BASE_SHA"

Print `$WT_PATH`, `$BRANCH`, `$BASE_SHA`, `$BASE_BRANCH` to audit. If
`worktree add` fails, stop — do not create the branch manually. If §3
task execution later fails mid-flight, the worktree persists unchanged;
§6 read-only commands can inspect it, and the user can resume by
`cd $WT_PATH`.

## 3. Execute the task
- `Read`/`Edit`/`Write` use absolute paths rooted at `$WT_PATH/…` (never
  relative; `cd` doesn't persist across Bash calls).
- Every Bash call needing the worktree as cwd prefixes
  `cd "$WT_PATH" && …` in the same call.
- Commits are the task's responsibility; this skill does not auto-commit.
- If the task installs deps or writes files outside `$WT_PATH`, call it
  out in the Report — those side effects are not isolated.

## 4. Report
cd "$WT_PATH" && git log --oneline "$BASE_SHA"..HEAD
cd "$WT_PATH" && git status

Then print the 5-option menu (section 5) and wait for the user.

## 5. Cleanup menu
(a) keep worktree as-is
(b) merge $BRANCH into a target branch (no-ff, conflicts left for user)
(c) rebase onto base, push, open PR
(d) discard worktree and branch
(e) stash uncommitted changes, keep worktree
(f) adopt branch: remove worktree, checkout $BRANCH in main tree

### 5a. Keep
Print `$WT_PATH` and `cd "$WT_PATH"` so the user can continue manually.

### 5b. Merge
1. Ask: target branch? Default `$BASE_BRANCH`; allow override.
1.5. If `$TARGET == $BRANCH`, abort: "Target branch equals source branch;
   pick a different target."
2. `cd "$REPO_ROOT" && git status --porcelain` — if non-empty, ask: "Main
   tree has uncommitted changes: `<list>`. Stash them and proceed, abort,
   or override target branch to something other than $TARGET?
   (stash/abort/override)". On "stash":
   `cd "$REPO_ROOT" && git stash push -u -m "worktree-task:pre-merge:$BRANCH:$TS"`
   then continue (print the stash ref). On "abort": stop. On "override":
   restart §5b step 1 with a new `$TARGET`.
3. `cd "$REPO_ROOT" && git fetch --prune` (best-effort; warn on failure).
4. `cd "$REPO_ROOT" && git checkout "$TARGET"`.
5. `cd "$REPO_ROOT" && git merge --no-ff --no-commit "$BRANCH"` — on
   conflict, stop and hand back with
   `git diff --name-only --diff-filter=U`. Do NOT run `git merge --abort`.
6. On clean merge: `git commit --no-edit` (or let the user amend).
7. Offer: "Merge committed. Remove the worktree and delete the branch
   now? (yes/no)" — on yes, jump to §5d step 3 (skip the
   discard-confirmation gate since the branch is merged; use
   `git branch -d "$BRANCH"` for safe delete).

### 5c. Rebase + push + PR
1. Detect origin: `git -C "$REPO_ROOT" remote get-url origin` — if it
   fails (no `origin` remote), abort with: "This repo has no `origin`
   remote configured. Add one with `git remote add origin <url>`, or
   pick another cleanup option." Do NOT attempt push/PR without a remote.
2. `cd "$WT_PATH" && git fetch origin` (warn on failure; do not abort).
3. Resolve base ref: `origin/$BASE_BRANCH` if it exists, else
   `$BASE_BRANCH`, else captured `$BASE_SHA`. Stop at the first that exists.
4. **Record the lease target BEFORE rebase**:
   `LEASE=$(git -C "$WT_PATH" rev-parse "origin/$BRANCH" 2>/dev/null || echo "")`.
   Empty means the branch was never pushed; that's fine —
   `--force-with-lease` on a nonexistent remote ref degrades to a first-push.
5. `cd "$WT_PATH" && git rebase "$BASE_REF"` — on conflict, stop and
   hand back; do NOT run `git rebase --abort`.
6. **Typed-yes gate before pushing**: show `$BRANCH`, the LEASE target SHA
   (or "first push"), and the `base_ref` being pushed against. Require
   typed `yes`.
7. Push with explicit lease: if LEASE non-empty,
   `git -C "$WT_PATH" push --force-with-lease="$BRANCH:$LEASE" --force-if-includes -u origin "$BRANCH"`.
   If LEASE empty, `git -C "$WT_PATH" push -u origin "$BRANCH"` (plain
   push; no lease needed for first push).
8. `cd "$WT_PATH" && gh pr create --fill --base "$BASE_BRANCH"` — if
   `gh` is missing, print the push URL from step 7 and stop.

### 5d. Discard
1. Typed-`yes` gate: show `$BRANCH`, `$WT_PATH`, commit list from step 4,
   and require exact `yes` to proceed.
1.5. If the worktree has untracked files
   (`cd "$WT_PATH" && git ls-files --others --exclude-standard`), list
   them. Tell the user: "Untracked files will be deleted permanently by
   `worktree remove`; reflog cannot recover them." This is part of the
   first typed-`yes` gate's disclosure; do not require a separate gate.
2. `cd "$WT_PATH" && git status --porcelain` — if dirty, require a second
   typed `yes` and use `--force`; otherwise plain remove.
3. `cd "$REPO_ROOT" && git worktree remove "$WT_PATH"` (add `--force` if
   step 2 flagged dirty).
4. Merge-base check: `git merge-base --is-ancestor "$BRANCH" "$BASE_BRANCH"`.
   - ancestor → `git branch -d "$BRANCH"` (safe delete).
   - not ancestor → `git branch -D "$BRANCH"` (force; warn unmerged work).
5. Print a one-line reflog recovery hint.

### 5e. Stash and keep
`cd "$WT_PATH" && git stash push -u -m "worktree-task:$BRANCH:$TS"`.
Print the stash ref and the `git stash pop` command.

Note: git's stash list is shared across all worktrees of the same repo
(`refs/stash` lives in the common dir). The message prefix
`worktree-task:$BRANCH:$TS` lets you identify this stash later with
`git stash list | grep worktree-task`. To apply it from this worktree,
`cd "$WT_PATH" && git stash apply <stash-ref>`.

### 5f. Adopt branch into main tree
Use this when you want to continue working on `$BRANCH` directly in
`$REPO_ROOT` after the task is done. This atomically removes the
worktree and checks out the branch in the main tree, saving you from
the "branch already checked out at <wt_path>" error you'd hit if you
tried `git checkout` manually.

1. **Worktree-clean check**: `cd "$WT_PATH" && git status --porcelain`.
   If non-empty, ask: "Worktree has uncommitted changes: `<list>`.
   Commit, stash, or abort? (commit/stash/abort)"
   - **commit**: prompt for a commit message, then
     `git -C "$WT_PATH" add -A && git -C "$WT_PATH" commit -m "<msg>"`,
     continue.
   - **stash**: `git -C "$WT_PATH" stash push -u -m
     "worktree-task:adopt:$BRANCH:$TS"`, print the stash ref, continue.
     (Stash is shared across worktrees; after checkout, the user can
     `git stash pop` in `$REPO_ROOT`.)
   - **abort**: stop, leave worktree and branch intact.

2. **Main-tree-clean check**: `cd "$REPO_ROOT" && git status --porcelain`.
   If non-empty, ask: "Main tree has uncommitted changes: `<list>`.
   Stash them and proceed, or abort? (stash/abort)"
   - **stash**: `cd "$REPO_ROOT" && git stash push -u -m
     "worktree-task:adopt-preserve:$TS"`, print the stash ref.
   - **abort**: stop.

3. **Same-branch guard**: if
   `git -C "$REPO_ROOT" branch --show-current` already equals
   `$BRANCH`, abort — this is an invariant violation (the branch was
   checked out in the worktree, not the main tree).

4. **Remove worktree, then check out branch**:
   ```
   git -C "$REPO_ROOT" worktree remove "$WT_PATH"
   git -C "$REPO_ROOT" checkout "$BRANCH"
   ```
   If `worktree remove` fails (open file handles, permission issues),
   STOP and do not attempt the checkout — user is in a recoverable
   state with both worktree and branch intact.

5. **Report**: main tree now on `$BRANCH`; worktree removed; branch
   preserved with all commits. If step 1 or 2 created a stash, remind
   the user of the stash ref and the `git stash pop` command.

## 6. Failure recovery (read-only reference)
git worktree list --porcelain
git worktree prune --dry-run
git branch --list "wt/*"
git reflog --date=iso

Repair is the user's call; this skill does not auto-heal.
