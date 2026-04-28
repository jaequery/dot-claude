---
name: linear-team-build
description: >
  Pull every Linear ticket in the "Todo" workflow status (optionally scoped
  to a team or assignee), then run /team-build on each ticket
  independently — one isolated worktree, one branch, one PR per ticket.
  No giant monolithic PR. Each build is instructed to keep code simple,
  avoid redundancy, and meet a clean-code bar. Use when the user says
  "/linear-team-build", "burn down my linear todos", "ship every linear
  todo", "team-build every linear todo", or wants to autonomously work
  through a Linear backlog with one clean PR per issue.
---

# /linear-team-build — Burn down a Linear "Todo" queue, one clean PR per ticket

You are a backlog runner. For every open Linear ticket in **Todo** status,
you launch `/team-build` against that ticket's description and ship a
**separate PR** per ticket. Never bundle multiple tickets into one PR.
Every build must meet the clean-code bar in §3a.

## 0. Inputs

`/linear-team-build [flags]`. Optional flags:
- `--team <key>` — Linear team key (e.g. `ENG`). Default: all teams the
  API key can see.
- `--assignee <me|email|userId>` — filter to one assignee. Default: any.
- `--limit <n>` — cap how many tickets to process this run. Default: 10.
- `--target <branch>` — base branch for PRs. Default: `main`.
- `--parallel <n>` — process N tickets concurrently. Default: 1
  (sequential). Cap at 5; warn if `--parallel > 3`.
- `--dry-run` — list tickets that would be processed and stop.

If invoked with no flags, ask ONE question: "Process up to 10 tickets,
sequentially, base = main, default clean-code bar — proceed?" Default
to those values on a plain "yes".

## 1. Preflight

1. **Linear auth.** Require `LINEAR_API_KEY` in the environment.
   - Test: `curl -s -X POST https://api.linear.app/graphql -H
     "Authorization: $LINEAR_API_KEY" -H "Content-Type: application/json"
     -d '{"query":"{ viewer { id name email } }"}'`
   - On failure, stop and tell the user to set `LINEAR_API_KEY`
     (Settings → API → Personal API keys).
2. **Repo state.** `git status --porcelain` must be empty, or surfaced
   and confirmed by the user.
3. **`gh` available.** `gh auth status` must succeed — `/team-build`
   needs it for PR creation.
4. **`/team-build` reachable.** This skill invokes it via the Skill
   tool; if not listed as available, abort.

## 2. Fetch the Todo queue

Linear's "Todo" is a `WorkflowState` of type `unstarted` named `Todo`
(case-insensitive). Match on type first, prefer the one literally named
"Todo" if multiple exist.

GraphQL query (drop unset filters; resolve `--assignee me` via `viewer`
first):

```graphql
query Todos($teamKey: String, $assigneeId: String, $first: Int!) {
  issues(
    first: $first
    filter: {
      state: { type: { eq: "unstarted" }, name: { eqIgnoreCase: "Todo" } }
      team: { key: { eq: $teamKey } }
      assignee: { id: { eq: $assigneeId } }
    }
    orderBy: updatedAt
  ) {
    nodes {
      id identifier title description url priority
      assignee { name email }
      team { key name }
      labels { nodes { name } }
    }
  }
}
```

Sort: `priority` ascending (1=urgent first; 0=no-priority last), then
`updatedAt` ascending. Apply `--limit`. Print a numbered table:

```
# Linear Todo queue (N tickets)
1. ENG-123  [P1]  "Add OAuth login"          (alice@…)
2. ENG-130  [P2]  "Fix invoice rounding"     (bob@…)
```

If `--dry-run`, stop. Otherwise: "Run team-build against all N
tickets? (yes / no / subset like '1,3,5')". Default = all.

## 3. Per-ticket loop

For each selected ticket, in order, run the sub-routine below. Print
the running results table after each ticket finishes.

### 3a. Build the team-build invocation

Hand `/team-build` exactly this prompt body (one ticket only):

```
[Linear $IDENT] $TITLE

Source: $URL
Priority: $PRIORITY  Assignee: $ASSIGNEE  Labels: $LABELS

$DESCRIPTION

---
Clean-code bar for this build (non-negotiable, enforce in the §5 code review):
- Reuse existing patterns and helpers; do not duplicate logic that already
  lives in this codebase. Grep before writing.
- Keep the diff minimal — only what the ticket requires. No drive-by
  refactors, no unrelated cleanup, no speculative abstractions.
- No dead code, no commented-out code, no TODOs, no console.logs.
- Names communicate intent. Functions do one thing. Early returns over
  nesting. No comments that restate the code.
- Validate at boundaries only; trust internal callers.
- Tests where they make sense and the project already has a test setup;
  do not introduce a new test framework just for this ticket.
```

Slug for the worktree: `$IDENT` lowercased (e.g. `eng-123`).
`/team-build` adds its own timestamp suffix.

### 3b. Move the ticket to "In Progress"

Before launching, transition the ticket via Linear's `issueUpdate`. Find
the state ID by querying `team.states` for type `started` (prefer name
"In Progress"). On failure, log a warning and continue.

### 3c. Invoke `/team-build` — ONE invocation per ticket

**This is the most-violated rule. Read carefully.**

Make **exactly one** Skill-tool call to `/team-build` per ticket. Never
batch tickets into a single invocation. Never reuse a worktree across
tickets. If your prompt to `/team-build` mentions two ticket IDs, you
are doing it wrong — stop.

Snapshot PR list before:
```
PRS_BEFORE=$(gh pr list --state open --json number,headRefName,url --limit 200)
```

Call `/team-build` via the Skill tool with `args`:
```
--branch $TARGET

<prompt body from §3a>
```

(One arg blob: the `--branch` flag, blank line, then the §3a body.)

`/team-build` runs end-to-end in that single turn (worktree, plan,
build, security, QA, push, PR). It returns APPROVED-and-shipped,
ESCALATED, or FAILED.

After it returns, verify isolation:
- `gh pr list` must now show **exactly one** new open PR vs.
  `PRS_BEFORE` whose head ref starts with `tb/<ticket-slug>-`.
  Zero or more than one new PR → STOP the loop and report.
- The new branch and PR number must be unique across this run's
  results table.

### 3d. Capture the outcome

Record: PR URL, PR number, branch name (must start with `tb/`),
worktree path, verdict, rounds run.

### 3e. Update Linear

- **APPROVED + PR opened:** comment the PR URL on the ticket; move to
  **"In Review"** (state type `started` named "In Review") if it
  exists, else leave in "In Progress".
- **ESCALATED or FAILED:** comment the blocker summary, worktree path,
  and remediation notes; move back to **Todo**. Never mark done.

Mutations: `commentCreate { issueId, body }` and
`issueUpdate { id, input: { stateId } }`.

### 3f. Decide whether to continue

- Environmental failure (auth, network, missing tooling) → STOP the
  loop; same failure will hit every later ticket.
- Code-specific failure or 3-round cap → log and move on.
- APPROVED → move on.

## 4. Parallel mode (optional)

`--parallel N > 1`:
- N ticket subroutines run concurrently. Each `/team-build` produces
  its own worktree (`tb/...`), so they don't collide.
- Cap at N=5 regardless of user request.
- Warn: shared `gh` auth may hit GitHub rate limits with many quick
  PRs.

If unsure, prefer sequential.

## 5. Final summary

```
## /linear-team-build — summary
Processed: N tickets

| Ticket   | Verdict   | PR                              | Rounds |
|----------|-----------|---------------------------------|--------|
| ENG-123  | APPROVED  | https://github.com/.../pull/45  | 1      |
| ENG-130  | ESCALATED | (no PR — see worktree)          | 3      |

Worktrees still on disk:
- /path/to/repo.tb-eng-130-...  (ENG-130, escalated)

Linear updates posted: <count>
```

Offer cleanup: "Remove kept worktrees for APPROVED tickets? (yes/no)".
Default: keep.

## Hard rules

- **One PR per ticket. ONE Skill-tool call to `/team-build` per
  ticket.** Never bundle multiple tickets into one PR, branch,
  worktree, or team-build invocation.
- **Verify isolation between tickets.** Snapshot `gh pr list` before
  each call; confirm exactly one new PR with head ref
  `tb/<ticket-slug>-*` after. Zero or more than one → STOP.
- **No branch/PR reuse.** Branch name and PR number must be unique
  across the run.
- **Clean-code bar is part of the contract.** The §3a clause is
  embedded in every team-build prompt and must be enforced by the
  Team Lead's §6 code-review gate. Re-roll if violated.
- Always update Linear (comment + state) after each ticket. Never
  leave a ticket stranded in "In Progress" on failure.
- If `LINEAR_API_KEY` is missing/invalid, abort before touching git.
  If `gh` isn't authed, abort before touching Linear.
- Don't open more than 10 PRs per run unless the user explicitly
  raised `--limit` past 10.
