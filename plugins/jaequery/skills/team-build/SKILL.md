---
name: team-build
description: >
  Execute a build task with a Team Lead orchestrator who spawns a persistent
  Claude Code team (via TeamCreate) of 2–10 specialist teammates that share a
  task list, coordinate via SendMessage, and work in parallel until the build
  is bug-free. Like /chief-build but uses Claude Code's native team feature
  (TeamCreate/SendMessage/TaskList) instead of one-shot Agent dispatches —
  teammates persist across rounds, claim tasks from a shared queue, and DM
  each other to resolve handoffs. Enforces modern tech / industry best
  practices / clean minimalist UX, runs a security audit and a QA + code
  review at the end, then loops back to the Lead for another round until
  approved. Runs in an isolated git worktree by default; optionally takes a
  target git branch to push to and opens a PR. Use when the user says
  "/team-build", "build this with a team", "team-build", "claude team build",
  or wants a multi-agent build using persistent team agents with a final QA
  gate that loops until clean.
---

# /team-build — Team-Lead Multi-Agent Build (Claude Code Teams)

You are the **Team Lead** of this build. You own the outcome. You plan,
spawn the team, assign tasks, review, and decide when the work ships. You
do NOT write the implementation yourself unless a task is too small to
delegate — your job is direction, judgment, coordination, and the final
go/no-go.

This skill is the team-native cousin of `/chief-build`. The structural
difference: instead of one-shot `Agent` dispatches, you spawn a **persistent
team** with `TeamCreate`, add teammates via the `Agent` tool with
`team_name` + `name` parameters, drive work through a **shared task list**
(`TaskCreate`/`TaskUpdate`), and coordinate via `SendMessage`. Teammates go
idle between turns and wake when you message them or assign a task.

Take this seriously. Do not flatter teammates. Do not approve work that
does not meet the bar.

## 0. Inputs

The user invokes `/team-build <task description>`. They may also pass:

- A **target branch** (e.g. `--branch feature/foo` or "push to `develop`").
  If provided, the final approved work is pushed there and a PR is opened.
- If no target branch is provided, the worktree + branch is left in place
  and the user is offered the standard cleanup menu (see §7).

If the task is ambiguous, ask ONE clarifying question before proceeding.

## 1. Create the isolated worktree

Same preflight as `/chief-build` §1. Compute:

- `$REPO_ROOT`, `$REPO_NAME`, `$SLUG` (2–4 kebab-case words, regex
  `^[a-z0-9][a-z0-9-]{0,39}$`), `$TS` (`date +%Y%m%d-%H%M%S`).
- `$BRANCH` — `tb/$SLUG-$TS` (`tb` = team-build).
- `$WT_PATH` — `$(dirname $REPO_ROOT)/$REPO_NAME.tb-$SLUG-$TS`.
- `$BASE_BRANCH`, `$BASE_SHA`, `$TARGET_BRANCH` (or empty).
- `$TEAM_NAME` — `tb-$SLUG-$TS` (must be unique; regenerate `$TS` on
  collision with `~/.claude/teams/$TEAM_NAME/`).

Preflight:
1. `git rev-parse --is-inside-work-tree` → `true`.
2. `git status --porcelain` — non-empty → surface and confirm.
3. Branch / path / team-name collision: regenerate `$TS` once; abort if
   still colliding.
4. If `$TARGET_BRANCH` is set, verify it exists locally or on `origin`;
   otherwise ask whether to create from `$BASE_BRANCH` or abort.

Create the worktree:
```
git worktree add -b "$BRANCH" "$WT_PATH" "$BASE_SHA"
```

Print `$WT_PATH`, `$BRANCH`, `$BASE_SHA`, `$TARGET_BRANCH`, `$TEAM_NAME`.
From now on, **all** Read/Edit/Write use absolute paths under `$WT_PATH/…`,
and every Bash call needing the worktree as cwd prefixes `cd "$WT_PATH" && …`.

## 2. Lead's plan (internal, then announced)

Before spawning anyone, the Lead writes the plan:

1. **Distill the task** in 1–2 sentences. What does "done" look like?
2. **Identify domains** in scope (frontend, backend, infra, data, auth,
   payments, design system, mobile, etc.).
3. **Non-negotiables** for this build:
   - Most recent stable versions of frameworks and libraries.
   - Industry-standard best practices for the domain.
   - Clean, modern, minimalist design and UX (if any UI is involved).
   - Security: no obvious vulns; secrets handled correctly; input
     validated; authn/authz correct; dependencies vetted.
   - Tests where they make sense; no dead code; no TODOs left in.
4. **Assemble the roster** — pick **2–10** specialist `subagent_type`s
   from the available list. Same selection rules as `/chief-build`:
   - Domain fit over prestige.
   - At least one builder per major domain.
   - Always include a **`Security Engineer`** (or closest available) for §5.
   - Always include a **`Code Reviewer`** AND a QA-style agent
     (`Reality Checker`, `Evidence Collector`, `Test Results Analyzer`,
     or `API Tester`) for the §6 gate.
   - If UI is in scope, include a **`UI Designer`** or **`UX Architect`**.
   - Prefer specialists over `general-purpose`.

Announce the plan to the user before spawning:

```
## Team Lead's plan
**Goal:** <one line>
**Worktree:** $WT_PATH on $BRANCH (base: $BASE_BRANCH @ $BASE_SHA)
**Team:** $TEAM_NAME
**Target branch:** $TARGET_BRANCH (or "none — leaving worktree for review")

## Roster
- **<teammate-name>** (`subagent_type`) — <one-line role>
- ...

## Non-negotiables
- Latest stable versions of <X, Y>
- <domain best practice>
- Clean, minimalist UI / accessible
- Security audited (see §5)
- Final QA gate (see §6) must pass before ship
```

## 3. Spin up the team

Call `TeamCreate`:

```
TeamCreate({
  team_name: "$TEAM_NAME",
  agent_type: "team-lead",
  description: "team-build: <one-line goal>"
})
```

Then seed the shared task list — for each domain assignment, create a task
with `TaskCreate` (clear title, acceptance criteria in the description,
dependencies set via `blocked_by` if one task must precede another). Do
NOT pre-assign owners yet; teammates will claim tasks.

Spawn teammates by calling the `Agent` tool with `team_name: "$TEAM_NAME"`
and a stable `name` (kebab-case, e.g. `backend-architect`, `ui-designer`,
`security-engineer`, `code-reviewer`, `qa`). Use the matching
`subagent_type`. **Spawn independent teammates in parallel in a single
message.**

Each teammate's spawn prompt MUST include:
- Their **role** and the **team name** so they can read
  `~/.claude/teams/$TEAM_NAME/config.json` to discover peers.
- The full task description and the Lead's plan.
- The exact `$WT_PATH` and the rule that **all file changes happen under
  `$WT_PATH/…` using absolute paths**.
- The non-negotiables (latest stable libs, best practices, minimalist UX
  if UI, no secrets in code, no TODOs).
- Workflow rules:
  - Check `TaskList` after each task; claim the lowest-ID unblocked
    unassigned task with `TaskUpdate { owner: <your-name> }`.
  - Mark tasks complete with `TaskUpdate` when done.
  - Commit work in the worktree with conventional, descriptive messages
    before marking a task complete.
  - DM peers via `SendMessage` for handoffs (e.g., backend → frontend
    once an API contract is ready). Refer to peers by **name**.
  - Going idle between turns is normal — wait for the Lead or a peer to
    wake you with a message or task assignment.
  - When all assigned work is done, send the Lead a short structured
    report (plain text, not JSON): what you built, key files, decisions,
    open questions, anything punted.

## 4. Build round (parallel via the shared queue)

The Lead drives the round by:
- Watching `TaskList` and idle notifications.
- Routing handoffs (e.g., poke `frontend-developer` when the API task is
  done) via `SendMessage`.
- Resolving blockers — if a teammate flags an ambiguity, the Lead
  decides quickly and replies.
- Spawning an extra teammate mid-round if a gap appears.

When all build tasks are marked complete, the Lead inspects the worktree
(`git log`, `git diff $BASE_SHA..HEAD`, targeted `Read`s) and writes a
short **integration check**: do the pieces fit? Any contradictions? Gaps?

If integration is broken, the Lead either fixes it inline (small) or
creates a follow-up task and assigns it to the right teammate (large)
before proceeding.

## 5. Security audit pass

Create a security task and assign it to `security-engineer` (and a
compliance/blockchain auditor if relevant). Scope:

- Audit **only** the diff `git diff $BASE_SHA..HEAD` under `$WT_PATH`.
- Look for: injection, XSS, SQLi, SSRF, auth/authz flaws, insecure
  deserialization, secrets in code/config, weak crypto, dependency
  CVEs, unsafe defaults, missing input validation, missing rate limits
  on sensitive endpoints, PII handling.
- Return findings with severity (Critical / High / Medium / Low / Info)
  and a fix recommendation per finding (post in their report DM).

If there are **any** Critical or High findings, the Lead creates fix
tasks and routes them back through §4 (narrow scope only). Mediums are
judgment calls; the Lead decides. Lows/Info are noted in the final
report but do not block.

## 6. QA + code review gate

Create two parallel tasks and assign them to `code-reviewer` and `qa`:

- **`code-reviewer`** — full diff `$BASE_SHA..HEAD`. Check correctness,
  maintainability, idiomatic stack use, dead code, error handling at
  boundaries (no fallbacks for impossible states), comments only where
  the *why* is non-obvious, no over-engineering, no half-finished work.
- **`qa`** — actually exercise the build where possible. Run the
  project's test suite, lint, typecheck if configured. For UI, follow
  the golden path and edge cases. Distinguish infra-skip (tooling
  missing) from genuine fail. Evidence-backed findings only — no
  fantasy approvals.

The Lead reads both reports and renders a verdict:

- **APPROVED** — every non-negotiable met, no Critical/High security
  issues, code review clean (or only nits worth shipping), QA passes.
  Proceed to §7.
- **NEEDS ANOTHER ROUND** — the Lead writes a tight remediation list as
  new tasks (specific files, specific issues, specific owners) and
  loops back through §4 with that scope only. Do not rewrite the
  world; fix what was flagged.

Cap the loop at **3 rounds** by default. After the 3rd failed round,
the Lead stops and hands back to the user with: a status report,
what's blocking, and a recommendation (continue, change scope, or
abandon). Don't grind past a structural problem — escalate.

## 7. Ship

When the verdict is APPROVED, the Lead produces a **final report**:

```
## /team-build — APPROVED
**Goal:** <one line>
**Branch:** $BRANCH
**Worktree:** $WT_PATH
**Team:** $TEAM_NAME (<n> teammates)
**Commits:** <count>, <range>
**Rounds run:** <n>

### What was built
- <bullet>

### Security audit
- <findings + how resolved>

### QA + code review
- <findings + how resolved>

### Known limitations / follow-ups
- <bullet> (if any)
```

Then choose the ship path based on `$TARGET_BRANCH`:

### 7a. `$TARGET_BRANCH` was provided — push and open PR

1. Detect remote: `git -C "$REPO_ROOT" remote get-url origin`. If no
   `origin`, abort the push and tell the user how to add one — leave
   the worktree as-is.
2. `cd "$WT_PATH" && git fetch origin` (warn on failure; do not abort).
3. Resolve base ref: `origin/$TARGET_BRANCH` if it exists, else
   `$TARGET_BRANCH`, else `$BASE_SHA`. Pick the first that exists.
4. Record lease target before rebase:
   `LEASE=$(git -C "$WT_PATH" rev-parse "origin/$BRANCH" 2>/dev/null || echo "")`.
5. `cd "$WT_PATH" && git rebase "$BASE_REF"` — on conflict, STOP and
   hand back; do not run `git rebase --abort`.
6. **Typed-`yes` gate** before pushing: show `$BRANCH`, the LEASE
   target (or "first push"), and `$BASE_REF`. Require literal `yes`.
7. Push:
   - LEASE non-empty: `git -C "$WT_PATH" push --force-with-lease="$BRANCH:$LEASE" --force-if-includes -u origin "$BRANCH"`.
   - LEASE empty: `git -C "$WT_PATH" push -u origin "$BRANCH"`.
8. `cd "$WT_PATH" && gh pr create --fill --base "$TARGET_BRANCH"`. If
   `gh` is missing, print the push URL and stop.
9. **Team teardown**: shut down each teammate by sending
   `SendMessage({to: <name>, message: {type: "shutdown_request",
   reason: "build approved and shipped"}})`. Wait for shutdown
   responses. When all are down, call `TeamDelete`.
10. **Worktree cleanup**: ask the user whether to remove the worktree
    now (default: keep). If remove:
    `git -C "$REPO_ROOT" worktree remove "$WT_PATH"` and a safe
    `git branch -d "$BRANCH"` (force only if user confirms).

### 7b. No target branch — hand back the worktree

Print `$WT_PATH`, `$BRANCH`, `$TEAM_NAME`. Offer the standard 6-option
menu from `/worktree-task`:

```
(a) keep worktree as-is
(b) merge $BRANCH into a target branch
(c) rebase onto base, push, open PR
(d) discard worktree and branch (typed-yes gated)
(e) stash uncommitted changes, keep worktree
(f) adopt branch: remove worktree, checkout $BRANCH in main tree
```

For destructive options, follow `/worktree-task`'s typed-`yes` gates
verbatim. After the user picks, perform team teardown (shutdown each
teammate, then `TeamDelete`) regardless of the worktree choice — the
team's job is done.

## 8. Failure recovery (read-only reference)

If anything aborts mid-flight, the worktree and team persist. Resume
with:

```
git worktree list --porcelain
git -C "$WT_PATH" log --oneline "$BASE_SHA"..HEAD
git -C "$WT_PATH" status
cat ~/.claude/teams/$TEAM_NAME/config.json
ls ~/.claude/tasks/$TEAM_NAME/
```

To force-clean a stuck team: shut down any live teammates via
`SendMessage` shutdown_request, then `TeamDelete`. The worktree is
independent and can be cleaned via `/worktree-task`'s menu.

## Hard rules

- The Lead never claims completion without the §6 QA + code review
  passing. "I think it works" is not approval.
- Loop cap is 3 rounds. After that, escalate to the user.
- All file writes go under `$WT_PATH`. Never edit the main working tree
  during a team-build run.
- Always refer to teammates by **name** (not UUID) in `SendMessage` and
  `TaskUpdate { owner }`.
- Don't send structured JSON status messages between teammates — use
  `TaskUpdate` for state and plain-text `SendMessage` for talk.
- Never `--no-verify`, never bypass signing, never skip hooks unless
  the user explicitly asks.
- Push only after the typed-`yes` gate. PRs only after the push
  succeeds.
- Always tear down the team (`SendMessage` shutdown → `TeamDelete`)
  before ending the session. Don't leave orphan teams in
  `~/.claude/teams/`.
- Don't auto-discard the worktree after shipping unless the user says so.
