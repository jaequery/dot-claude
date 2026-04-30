---
name: planbooq-team-build
description: >
  Pull every Planbooq ticket in the "Todo" workflow status (optionally
  scoped to a team or assignee), then run /team-build on each ticket
  independently — one isolated worktree, one branch, one PR per ticket.
  No giant monolithic PR. Each build is instructed to keep code simple,
  avoid redundancy, and meet a clean-code bar. Planbooq is our homebrew
  Linear clone; this skill talks to it via the Planbooq MCP server. Use
  when the user says "/planbooq-team-build", "burn down my planbooq
  todos", "ship every planbooq todo", "team-build every planbooq todo",
  or wants to autonomously work through a Planbooq backlog with one
  clean PR per issue.
---

# /planbooq-team-build — Burn down a Planbooq "Todo" queue, one clean PR per ticket

You are a backlog runner. For every open Planbooq ticket in **Todo**
status, you launch `/team-build` against that ticket's description and
ship a **separate PR** per ticket. Never bundle multiple tickets into
one PR. Every build must meet the clean-code bar in §3a. Status
transitions go to Planbooq's native workflow state via MCP — not labels,
not comments.

## 0. Inputs

`/planbooq-team-build [task description] [flags]`.

**Positional arg (optional).** If a free-form task description is
passed, **create the ticket on the fly first** (in `Todo` state, on
`--team`), then proceed with normal queue processing — the new
ticket is included in this run's queue. Use the Planbooq MCP create
tool (e.g. `mcp__planbooq__create_issue`) with title = first line of
the description (≤80 chars) and description = the remainder. Echo
the new ticket's identifier and URL before continuing. On-the-fly
creation runs **after** §1 preflight, before §2 fetch (so the team /
workflow-state IDs are already cached).

Optional flags:
- `--team <key>` — Planbooq team key. Default: all teams the API key
  can see (if there is exactly one team, use it implicitly).
- `--assignee <me|email|userId>` — filter to one assignee. Default: any.
- `--limit <n>` — cap how many tickets to process this run. Default: 10.
- `--target <branch>` — base branch for PRs. Default: `main`.
- `--parallel <n>` — process N tickets concurrently. **Default: 1
  (sequential).** Pass an explicit number to parallelize. Warn if
  effective concurrency exceeds 5 (shared `gh` / Planbooq rate limits)
  but do not cap.
- `--dry-run` — list tickets that would be processed and stop.

**No confirmation prompt. Ever.** If invoked with no flags, just
start — defaults are: open Todo tickets visible to the API key, up
to 10, sequential, base = `main`, default clean-code bar. Print the
resolved settings + ticket queue, then **immediately proceed to §1
preflight and §2 ticket processing in the same response, without
asking the user "proceed?", "yes/no?", or any other confirmation
phrasing**. Asking is a bug — the user already confirmed by
invoking the skill. Only stop early if `--dry-run` is set or
preflight (§1) fails.

## Planbooq interface — MCP server

**All Planbooq interactions in this skill go through the Planbooq
MCP server**, never raw `curl` to the Planbooq REST/GraphQL endpoint.
The server is configured at `http://localhost:3636/api/mcp` with
`Authorization: Bearer $PLANBOOQ_API_TOKEN` (the user's `pbq_live_…`
key from Settings → API Keys, exposed via the `PLANBOOQ_API_TOKEN`
env var).

If the user has not yet wired the server into Claude Code, surface
this one-time setup in the abort message:

```jsonc
// ~/.claude.json or .mcp.json
{
  "mcpServers": {
    "planbooq": {
      "url": "http://localhost:3636/api/mcp",
      "headers": { "Authorization": "Bearer ${PLANBOOQ_API_TOKEN}" }
    }
  }
}
```

The skill assumes the MCP tools surface under the `mcp__planbooq__*`
namespace. **Discover the actual tool names at runtime** — different
Planbooq versions may expose slightly different verbs. The canonical
set this skill expects (substitute the real tool name when calling):

| Purpose                              | Expected tool (Planbooq MCP)                |
|--------------------------------------|---------------------------------------------|
| List tickets, filterable by state    | `mcp__planbooq__list_issues`                |
| Get full ticket detail               | `mcp__planbooq__get_issue`                  |
| Create a ticket                      | `mcp__planbooq__create_issue`               |
| Update ticket (state, assignee, …)   | `mcp__planbooq__update_issue`               |
| Add a comment                        | `mcp__planbooq__add_comment`                |
| List teams                           | `mcp__planbooq__list_teams`                 |
| List workflow states for a team      | `mcp__planbooq__list_workflow_states`       |
| Resolve "me"                         | `mcp__planbooq__viewer` / `whoami`          |

If a tool with a slightly different name is offered (e.g. `…issues_list`,
`…issue_create`), use it — match by purpose, not exact spelling. If a
required tool is **missing**, abort with a one-line message naming
which capability could not be found.

**Caching.** At preflight, resolve once and reuse for the whole run:
- `$TEAM_ID` (when `--team` is set or there's exactly one team).
- The `state-name → state-id` map for that team's workflow states
  (need at least `Todo`, `In Progress`, `Reviewing` — see lifecycle
  below). Workflow-state IDs do not change mid-run.

Workflow-state names this skill writes:

```
Todo → In Progress → Reviewing
```

(Plus the Planbooq defaults `Backlog`, `Triage`, `QA`, `Done`, `Canceled`
which humans / downstream automation drive — this skill never writes
them.) `Reviewing` is mandatory; if a team's workflow lacks it, abort
with `Planbooq team <key> has no 'Reviewing' workflow state — add one
in Settings → Workflow before re-running.` Other missing states
downgrade to a warning since this skill does not write them.

## 1. Preflight

1. **MCP server reachable.** `$PLANBOOQ_API_TOKEN` is set in the
   environment, AND at least one `mcp__planbooq__*` tool is listed
   as available. If the token is missing, stop and tell the user to
   `export PLANBOOQ_API_TOKEN=pbq_live_…`. If the tools are missing,
   stop and surface the MCP-server config snippet from the section
   above.
2. **Repo state.** `git status --porcelain` must be empty, or surfaced
   and confirmed by the user.
3. **`gh` available.** `gh auth status` must succeed — `/team-build`
   needs it for PR creation.
4. **Team resolved.** If `--team` is set, validate it exists by
   listing teams via the MCP tool. If unset, list teams; if there's
   exactly one, use it; otherwise leave team filter empty (the API
   key may already be team-scoped).
5. **Workflow states resolved.** For the resolved team (or each team,
   if no filter), fetch the workflow states and cache the
   `name → state-id` map. Verify `Todo`, `In Progress`, and
   `Reviewing` are present (case-insensitive match).
6. **`/team-build` reachable.** This skill invokes it via the Skill
   tool; if not listed as available, abort.

## 2. Fetch the Todo queue

Call the Planbooq MCP `list_issues` tool with state = `Todo` (or the
state whose `type === "unstarted"` and `name === "Todo"`), filtered
by team / assignee per the flags, capped at `--limit`. Each result
should include at minimum: `id` (UUID or `PBQ-123`-style identifier),
`identifier` (human key like `PBQ-123`), `title`, `description` (or
`body`), `url`, `team`, `assignees`, `labels`, `priority`, `updatedAt`.

If `description` is truncated by the list call (Planbooq may return a
snippet), hydrate it via `mcp__planbooq__get_issue` per ticket — do
**not** try to launch `/team-build` against a truncated description.

Sort: by `priority` ascending (1 = urgent first, missing = lowest),
then `updatedAt` ascending. Apply `--limit`. Print a numbered table:

```
# Planbooq queue (N tickets) — team: ENG  state: Todo
1. PBQ-123  [P1]  "Add OAuth login"          (@alice)
2. PBQ-130  [P2]  "Fix invoice rounding"     (@bob)
```

If `--dry-run`, stop. Otherwise proceed immediately against all N
tickets — no confirmation prompt.

## 3. Per-ticket loop

For each selected ticket, in order, run the sub-routine below. Print
the running results table after each ticket finishes.

### 3a-pre. Resolve the working branch and target branch

Two distinct branches matter per ticket:

- **`$WORKING_BRANCH`** — the new feature branch this build commits
  onto and pushes. Default to a Linear-style convention:
  `${IDENTIFIER_LOWER}-${KEBAB_TITLE}` truncated to 60 chars (e.g.
  `pbq-123-add-oauth-login`):
  ```bash
  SLUG=$(echo "$TITLE" | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g' | cut -c1-50)
  WORKING_BRANCH="$(echo "$IDENTIFIER" | tr '[:upper:]' '[:lower:]')-${SLUG}"
  ```
  If the ticket description contains an explicit line matching
  (case-insensitive) `^\s*Branch\s*:\s*([^\s]+)\s*$`, use that
  instead. **Never** prepend `team-build/` — pass it verbatim through
  `--working-branch`.
- **`$RESOLVED`** — the PR base / target branch.

#### Target-branch resolution order:

1. **Body directive.** Scan the description for a line matching
   (case-insensitive) `^\s*(Target|Base)\s*:\s*([^\s]+)\s*$`.
2. **Label.** Any label named `target:<branch>` or `base:<branch>`.
3. **CLI default.** Fall back to `--target` (default `main`).

Validate the resolved branch exists locally OR on `origin`:
```
git show-ref --verify --quiet "refs/heads/$RESOLVED" \
  || git ls-remote --exit-code --heads origin "$RESOLVED"
```

If neither, **STOP this ticket**:
- Add a comment via `mcp__planbooq__add_comment`:
  `team-build skipped: target branch \`$RESOLVED\` does not exist locally or on origin.`
- Leave the ticket workflow state as `Todo` (don't promote to `In Progress`).
- Record verdict `SKIPPED` in the results table and continue.

Print both resolutions per ticket, e.g.:
`PBQ-123 → working=pbq-123-add-oauth-login, target=feature/auth (from body directive)`

### 3a. Build the team-build invocation

Hand `/team-build` exactly this prompt body (one ticket only):

```
[Planbooq $IDENTIFIER] $TITLE

Source: $URL
Team: $TEAM  Assignee: $ASSIGNEE  Labels: $LABELS

$DESCRIPTION

---
Closes Planbooq ticket: $IDENTIFIER

When opening the PR, the body MUST include a line referencing the
Planbooq ticket so the merge is traceable. If Planbooq has GitHub
integration that auto-closes via a magic word ("Closes PBQ-123"),
prefer that exact form. Otherwise include the ticket URL on its own
line.

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

---
Push policy for this run (non-negotiable):
- **Do not gate the push.** Skip the §6 typed-`yes` confirmation entirely.
- Push `$WORKING_BRANCH` to `origin` and open the PR against `--branch`
  as soon as the build round + security audit + code review have run,
  regardless of QA verdict. Don't loop indefinitely waiting for an
  APPROVED gate before pushing — push, open the PR, and surface any
  remaining issues in the PR body so a human can review on GitHub.
- This is autonomous Planbooq backlog burndown; treat the PR itself as
  the review surface, not a local gate.
```

Slug for the worktree path: `pbq-${IDENTIFIER_LOWER}` (e.g.
`pbq-pbq-123`). `/team-build` adds its own timestamp suffix.

### 3b. Move the ticket to "In Progress" + post a "starting" comment

Before launching, set the workflow state to `In Progress` via
`mcp__planbooq__update_issue` with the cached state-id. On any
failure, log a warning and continue — do not block the build on a
state mutation.

Then post a status comment via `mcp__planbooq__add_comment` so non-
terminal stakeholders can follow along:

```markdown
### 🛠️ team-build started

- **Working branch:** `$WORKING_BRANCH`
- **Target (PR base):** `$RESOLVED`
- **Worktree slug:** `pbq-${IDENTIFIER_LOWER}`
- **Mode:** `/team-build` (plan → parallel specialist build → security audit → QA + code review, looping until clean)
- **Clean-code bar:** reuse existing patterns, minimal diff, no dead code/TODOs/console.logs.

I'll comment again when the build finishes (PR link + verdict).
```

Comment is best-effort: if it fails, log and proceed — never block the
build on a comment failure. Skip this comment when `--dry-run`.

### 3c. Invoke `/team-build` — ONE invocation per ticket

**This is the most-violated rule. Read carefully.**

Make **exactly one** Skill-tool call to `/team-build` per ticket.
Never batch tickets into a single invocation. Never reuse a worktree
across tickets. If your prompt to `/team-build` mentions two ticket
identifiers, you are doing it wrong — stop.

Snapshot PR list before:
```
PRS_BEFORE=$(gh pr list --state open --json number,headRefName,url --limit 200)
```

Call `/team-build` via the Skill tool with `args` — pass the
**ticket-resolved** target branch as `--branch`, AND the working
branch as `--working-branch`:
```
--branch $RESOLVED
--working-branch $WORKING_BRANCH

<prompt body from §3a>
```

(One arg blob: the flags, blank line, then the §3a body.)

`/team-build` runs end-to-end in that single turn. It returns
APPROVED-and-shipped, ESCALATED, or FAILED.

After it returns, verify isolation:
- `gh pr list` must now show **exactly one** new open PR vs.
  `PRS_BEFORE` whose head ref equals `$WORKING_BRANCH`. Zero or more
  than one new PR → STOP the loop and report.
- The new branch and PR number must be unique across this run's
  results table.

### 3d. Capture the outcome

Record: PR URL, PR number, branch name, worktree path, verdict,
rounds run.

### 3d.5. Screenshot capture (UX/design tickets only)

Same logic as `/github-team-build` §3d.5 — only run when verdict is
**APPROVED** AND the ticket touches the UI (frontend-shaped diff,
design label, or UI keywords in title/description). Capture three
shots (desktop 1440×900, mobile 390×844, desktop-after-interaction)
via Playwright MCP after booting the project's dev server in a fresh
read-only worktree. Commit them to the PR branch under
`.planbooq-team-build/shots/<identifier>/` and reference via
`raw.githubusercontent.com` URLs in the §3e comment. Failure modes
(no dev server, capture error, push rejected) downgrade to a single
`_Screenshots not captured: <reason>_` line — never abort the
ticket and never fabricate an image.

### 3e. Update the ticket

**Workflow-state transition is decided by whether a PR was opened,
not by the QA verdict.** The push policy in §3a sends a PR up
regardless of verdict, so the PR itself is the review surface — once
it exists, the ticket belongs in `Reviewing`.

- **PR was opened (any verdict — APPROVED, ESCALATED, or FAILED but
  team-build still pushed):**
  - Add a comment via `mcp__planbooq__add_comment` with the PR URL,
    a one-line summary, and the verdict (APPROVED / ESCALATED /
    FAILED). For non-APPROVED verdicts, also include the blocker
    summary so a human can pick up where the loop stopped.
  - If §3d.5 produced screenshots, append a `### Screenshots`
    section embedding each as `![<label>]($RAW_URL)` in capture
    order.
  - Update the workflow state to `Reviewing` via
    `mcp__planbooq__update_issue`.
  - Do **not** flip state to `QA` or `Done` here; that's a human /
    downstream responsibility.
- **No PR was opened (environmental abort, target branch missing,
  etc.):**
  - Add a comment with the blocker summary, worktree path, and
    remediation notes.
  - Update the workflow state back to `Todo`. Never mark Done /
    Canceled.

### 3f. Decide whether to continue

- Environmental failure (auth, network, missing tooling, MCP server
  down) → STOP the loop; the same failure will hit every later
  ticket.
- Code-specific failure or 3-round cap → log and move on.
- APPROVED → move on.

## 4. Parallel mode

Default: **sequential** (`--parallel 1`). Pass `--parallel <n>` to
opt into concurrency — each `/team-build` produces its own worktree,
so they don't collide on disk. If effective concurrency exceeds 5,
warn the user about shared `gh` / Planbooq rate limits but do not cap.

## 5. Final summary

```
## /planbooq-team-build — summary
Team: $TEAM   State filter: Todo
Processed: N tickets

| Ticket   | Verdict   | PR                              | Rounds |
|----------|-----------|---------------------------------|--------|
| PBQ-123  | APPROVED  | https://github.com/.../pull/45  | 1      |
| PBQ-130  | ESCALATED | https://github.com/.../pull/46  | 3      |

Worktrees still on disk (only ESCALATED/FAILED — APPROVED tickets
are auto-cleaned by /team-build §6a):
- /path/to/repo.team-build-pbq-pbq-130-...  (PBQ-130, escalated)

Comments posted: <count>
```

APPROVED tickets have their worktree + local branch removed
automatically by `/team-build`. Only ESCALATED/FAILED worktrees
persist for manual debugging.

## Hard rules

- **One PR per ticket. ONE Skill-tool call to `/team-build` per
  ticket.** Never bundle multiple tickets into one PR, branch,
  worktree, or team-build invocation.
- **Every PR body MUST reference the Planbooq ticket** (identifier
  and URL). If Planbooq's GitHub integration supports a magic-word
  auto-close (e.g. `Closes PBQ-123`), use it; otherwise include the
  URL on its own line. Verify after team-build returns; edit the
  PR via `gh pr edit` if missing.
- **Verify isolation between tickets.** Snapshot `gh pr list` before
  each call; confirm exactly one new PR with head ref
  `$WORKING_BRANCH` after. Zero or more than one → STOP.
- **No branch/PR reuse.** Branch name and PR number must be unique
  across the run.
- **Clean-code bar is part of the contract.** The §3a clause is
  embedded in every team-build prompt and must be enforced by the
  Team Lead's §6 code-review gate. Re-roll if violated.
- Always update the ticket (comment + workflow state) after each
  one. Never leave a ticket stranded in `In Progress`. Transition
  rule: **PR opened → `Reviewing` (any verdict); no PR → back to
  `Todo`**.
- **All Planbooq reads/writes go through the Planbooq MCP server.**
  No raw `curl` to the Planbooq API. If the MCP server is offline
  or `PLANBOOQ_API_TOKEN` is unset, abort before touching git.
- If `gh auth status` fails, abort before touching git.
- Don't open more than 10 PRs per run unless the user explicitly
  raised `--limit` past 10.
- **Screenshots for UX/design tickets (§3d.5) are best-effort, never
  blocking.**
