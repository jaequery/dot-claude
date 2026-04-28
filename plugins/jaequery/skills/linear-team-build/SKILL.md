---
name: linear-team-build
description: >
  Pull every Linear ticket in the "Todo" workflow status (optionally scoped
  to a team or assignee), then run /team-build on each ticket independently
  — one isolated worktree, one branch, one PR per ticket. No giant
  monolithic PR. Use when the user says "/linear-team-build", "burn down my
  linear todos", "ship every linear todo", "build every linear ticket",
  "team-build every linear todo", or wants to autonomously work through a
  Linear backlog with one PR per issue.
---

# /linear-team-build — Burn down a Linear "Todo" queue, one PR per ticket

You are a backlog runner. For every open Linear ticket in **Todo** status,
you launch `/team-build` against that ticket's description and ship a
**separate PR** per ticket. Never bundle multiple tickets into one PR.

## 0. Inputs

`/linear-team-build [flags]`. Optional flags:
- `--team <key>` — Linear team key (e.g. `ENG`). Default: all teams the
  API key can see.
- `--assignee <me|email|userId>` — filter to one assignee. Default: any.
- `--limit <n>` — cap how many tickets to process this run. Default: 10.
- `--target <branch>` — base branch for PRs. Default: `main`.
- `--parallel <n>` — process N tickets concurrently. Default: 1
  (sequential). Higher values mean N worktrees + teams running at once;
  warn the user if `--parallel > 3`.
- `--dry-run` — list tickets that would be processed and stop.

If the task is invoked with no flags, ask ONE question: "Process up to
N tickets, sequentially, base = main — proceed?" Default to those
values if the user just confirms.

## 1. Preflight

1. **Linear auth.** Require `LINEAR_API_KEY` in the environment.
   - Test: `curl -s -X POST https://api.linear.app/graphql -H
     "Authorization: $LINEAR_API_KEY" -H "Content-Type: application/json"
     -d '{"query":"{ viewer { id name email } }"}'`
   - If the call fails or `errors` is non-empty, stop and tell the user
     to set `LINEAR_API_KEY` (Settings → API → Personal API keys).
2. **Repo state.** Must be a git repo with a clean working tree (or the
   user has confirmed dirty state). `git status --porcelain` empty, or
   surfaced + confirmed.
3. **`gh` available.** `gh auth status` must succeed — `/team-build`
   relies on it for PR creation.
4. **`/team-build` reachable.** This skill invokes it via the Skill
   tool; if not listed as available, abort with a clear error.

## 2. Fetch the Todo queue

Linear's "Todo" is a `WorkflowState` of type `unstarted` with name
`Todo` (case-insensitive). A team can rename it; match on the type
first, then prefer the one literally named "Todo" if multiple exist.

GraphQL query (adjust filters to flags). Run it with `curl` against
`https://api.linear.app/graphql`:

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
      id
      identifier        # e.g. "ENG-123"
      title
      description       # markdown body
      url
      priority
      assignee { name email }
      team { key name }
      labels { nodes { name } }
    }
  }
}
```

Drop unset filters from the query rather than passing nulls. Resolve
`--assignee me` via the `viewer` query first.

Sort the result deterministically: by `priority` ascending (urgent
first, where 1=urgent, 2=high, 3=medium, 4=low, 0=no priority — push 0
to the end), then by `updatedAt` ascending.

Apply `--limit`. Print a numbered table to the user:

```
# Linear Todo queue (N tickets)
1. ENG-123  [P1]  "Add OAuth login"          (alice@…)
2. ENG-130  [P2]  "Fix invoice rounding"     (bob@…)
...
```

If `--dry-run`, stop here. Otherwise ask for confirmation: "Run
team-build against all N tickets? (yes / no / pick a subset like
'1,3,5')". Default subset = all.

## 3. Per-ticket loop

For each selected ticket, in order, run the following sub-routine.
Maintain a results table that you print after each ticket finishes.

### 3a. Build the team-build invocation

The task description handed to `/team-build` is:

```
[Linear $IDENT] $TITLE

Source: $URL
Priority: $PRIORITY  Assignee: $ASSIGNEE  Labels: $LABELS

$DESCRIPTION
```

Where `$IDENT` = `ENG-123`, etc. If `description` is empty, note that in
the invocation and instruct team-build to scope conservatively (only
what the title implies).

Pick a slug for the worktree: derive from `$IDENT` lowercased, e.g.
`eng-123`. `/team-build` already adds its own timestamp suffix.

### 3b. Move the ticket to "In Progress"

Before launching team-build, transition the ticket to the team's "In
Progress" workflow state via Linear's `issueUpdate` mutation. Find the
state ID by querying `team.states` for type `started` (prefer name
"In Progress"). On failure, log a warning and continue — the build
should still proceed.

### 3c. Invoke `/team-build` — ONE invocation per ticket

**This is the most-violated rule of this skill. Read it carefully.**

For each ticket you make **exactly one separate Skill-tool call** to
`/team-build`. Never batch multiple tickets into a single invocation.
Never pass a list of tickets. Never let one team-build's worktree be
"reused" for the next ticket. The whole point of this skill is one
worktree → one branch → one PR per ticket.

Before each invocation, snapshot the latest PR list so you can verify
a new PR appears after team-build returns:

```
PRS_BEFORE=$(gh pr list --state open --json number,headRefName,url \
  --limit 200)
```

Call `/team-build` via the Skill tool with `args`:

```
--branch $TARGET

[Linear $IDENT] $TITLE
Source: $URL
Priority: $PRIORITY  Assignee: $ASSIGNEE  Labels: $LABELS

$DESCRIPTION
```

(One arg blob — the `--branch` flag, then a blank line, then the task
body from §3a.)

`/team-build` runs end-to-end in that single turn: worktree, plan,
team spawn, build/security/QA loop, push, PR. When it returns it must
have produced a **new** branch matching `tb/<ticket-slug>-*` and a
**new** PR URL. It returns when the work is APPROVED-and-shipped,
NEEDS-USER (escalation), or FAILED.

After it returns, **immediately tear down its team and worktree
context before starting the next ticket** so nothing leaks across:
- Confirm `gh pr list` now shows one additional open PR vs.
  `PRS_BEFORE` whose head ref is `tb/<this-ticket-slug>-*`. If not,
  STOP the loop — something is wrong (likely team-build was reused or
  the push failed silently). Do not proceed to the next ticket.
- Confirm the team for this ticket (`tb-<ticket-slug>-*`) is gone
  (`ls ~/.claude/teams/` — should not list it). If still present,
  shut it down before continuing.

### 3d. Capture the outcome

From team-build's final report, record:
- PR URL (parse from `gh pr create` output AND verify it's the new
  entry from the §3c diff)
- PR number
- Branch name (must start with `tb/` and be unique across the run)
- Worktree path
- Verdict (APPROVED / ESCALATED / FAILED)
- Rounds run

Cross-check uniqueness against previous tickets in this run: branch
name and PR number must not match any earlier ticket's. If they do,
the loop has malfunctioned — STOP and report.

### 3e. Update Linear

- **APPROVED + PR opened:** post a comment on the ticket with the PR
  URL. Move the ticket to **"In Review"** (workflow state type
  `started` named "In Review") if that state exists for the team;
  otherwise leave in "In Progress" and just comment.
- **ESCALATED or FAILED:** post a comment summarizing what blocked,
  the worktree path, and any remediation notes. Move back to **Todo**
  so it's not lost. Do NOT mark the issue done.

Mutations to use: `commentCreate { issueId, body }` and
`issueUpdate { id, input: { stateId } }`.

### 3f. Decide whether to continue

- If the ticket FAILED for an environmental reason (auth, network,
  missing tooling), STOP the loop and hand back to the user — the same
  failure will hit every subsequent ticket.
- If it FAILED for a code-specific reason or hit the 3-round cap, log
  it and move on to the next ticket. The user can retry individually
  later.
- If APPROVED, move on.

## 4. Parallel mode (optional)

When `--parallel N > 1`:
- Run N ticket subroutines concurrently. Each `/team-build` creates its
  own worktree (`tb/...`) and team (`tb-...-$TS`), so they don't
  collide as long as `$TS` resolution is per-second-or-better.
- Cap at N=5 even if the user asks for more — beyond that the
  cognitive load on the orchestrator and the disk pressure of N
  worktrees + N teams isn't worth it.
- Warn explicitly: parallel runs share the same `gh` auth and may hit
  GitHub rate limits if many PRs open in quick succession.

If unsure, prefer sequential. The user can always raise `--parallel`
on the next run.

## 5. Final summary

After the loop ends, print a table:

```
## /linear-team-build — summary
Processed: N tickets

| Ticket   | Verdict   | PR                              | Rounds |
|----------|-----------|---------------------------------|--------|
| ENG-123  | APPROVED  | https://github.com/.../pull/45  | 1      |
| ENG-130  | ESCALATED | (no PR — see worktree)          | 3      |
| ENG-131  | APPROVED  | https://github.com/.../pull/46  | 2      |

Worktrees still on disk:
- /path/to/repo.tb-eng-130-...  (ENG-130, escalated)

Linear updates posted: <count>
```

Offer cleanup: "Remove kept worktrees for APPROVED tickets? (yes/no)".
Default: keep them (they're cheap and the user may want to inspect).

## Hard rules

- **One PR per ticket. ONE Skill-tool call to `/team-build` per
  ticket.** Never bundle multiple Linear tickets into one PR, one
  branch, one worktree, or one team-build invocation. If you find
  yourself writing a single team-build prompt that mentions two
  ticket IDs, stop — you're doing it wrong.
- **Verify isolation between tickets.** After each `/team-build`
  returns, snapshot `gh pr list` and confirm exactly one new PR
  appeared whose head ref starts with `tb/<this-ticket-slug>-`. If
  zero or more than one new PR appeared, STOP the loop.
- **No branch reuse.** Branch name and PR number must be unique
  across the run. Cross-check against the running results table
  before starting the next ticket.
- Each ticket gets its own `/team-build` invocation, its own worktree,
  its own team, its own branch (`tb/<slug>-<ts>`), its own PR against
  `$TARGET`.
- Always update Linear (comment + state transition) after each ticket,
  win or lose. Don't silently leave tickets in "In Progress" if the
  build failed.
- Never reuse a branch name across tickets — `/team-build`'s timestamp
  suffix handles uniqueness; don't override it.
- If `LINEAR_API_KEY` is missing or invalid, abort before touching git.
- If `gh` isn't authed, abort before touching Linear (don't move
  tickets you can't ship).
- Don't open more than 10 PRs in a single run unless the user
  explicitly raised `--limit` past 10 — protect against runaway loops
  on misconfigured queues.
