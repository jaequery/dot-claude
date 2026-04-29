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
- `--parallel <n>` — process N tickets concurrently. **Default: 1
  (sequential).** Pass an explicit number to parallelize. Warn if
  effective concurrency exceeds 5 (shared `gh`/Linear rate limits)
  but do not cap.
- `--dry-run` — list tickets that would be processed and stop.

**No confirmation prompt. Ever.** If invoked with no flags, just
start — defaults are: up to 10 tickets, sequential, base = `main`,
default clean-code bar. Print the resolved settings + ticket queue,
then **immediately proceed to §1 preflight and §2 ticket processing
in the same response, without asking the user "proceed?", "yes/no?",
or any other confirmation phrasing**. Asking is a bug — the user
already confirmed by invoking the skill. Only stop early if
`--dry-run` is set or preflight (§1) fails.

## Linear interface — `@schpet/linear-cli`

**All Linear interactions in this skill go through the `linear` CLI
([`@schpet/linear-cli`](https://github.com/schpet/linear-cli)), not
raw GraphQL.** The CLI handles auth via stored workspace credentials
(`linear auth login`), so `LINEAR_API_KEY` is not required directly.

Canonical commands used below:
- `linear auth token` — verifies a credential is configured.
- `linear issue query --state unstarted --json [--team K] [--assignee U] [--limit N]`
  — fetch issues. Filter to "Todo" by `state.name` in the JSON output.
- `linear issue update <ID> --state "<name>"` — transition workflow state
  by name (e.g. `"In Progress"`, `"In Review"`, `"Todo"`).
- `linear issue comment add <ID> --body-file <path>` — post a comment
  (use `--body-file` for any multi-line markdown).
- `linear issue view <ID> --json` — fetch a single issue with full
  fields (description, attachments, labels) when needed.

Only fall back to `linear api '<graphql>'` (the CLI's raw-API escape
hatch) if a needed field is not exposed by a structured subcommand.
**Never** call `curl https://api.linear.app/graphql` directly.

## 1. Preflight

1. **`linear` CLI available.** `command -v linear` must succeed.
   - On failure, stop and tell the user to install it:
     `npm i -g @schpet/linear-cli` (or `brew install schpet/tap/linear-cli`).
2. **Linear auth.** `linear auth token` must print a token.
   - On failure, tell the user to run `linear auth login` and pick a
     workspace, then re-run the skill.
3. **Repo state.** `git status --porcelain` must be empty, or surfaced
   and confirmed by the user.
4. **`gh` available.** `gh auth status` must succeed — `/team-build`
   needs it for PR creation.
5. **`/team-build` reachable.** This skill invokes it via the Skill
   tool; if not listed as available, abort.

## 2. Fetch the Todo queue

Linear's "Todo" is a `WorkflowState` of type `unstarted` named `Todo`
(case-insensitive). Use the CLI's structured query, then post-filter
the JSON output by state name.

```bash
linear issue query \
  --state unstarted \
  --json \
  --limit "${LIMIT:-10}" \
  ${TEAM:+--team "$TEAM"} \
  ${ASSIGNEE:+--assignee "$ASSIGNEE"}
```

For `--assignee me`, pass `self` (the CLI resolves it). Then in the
JSON, keep only nodes whose `state.name` matches `Todo`
(case-insensitive); if a team has no exact `Todo` state, fall back to
all `unstarted` results for that team and note the substitution in
the printed table.

If a returned issue is missing `description`, `attachments`, or
`labels`, hydrate it with `linear issue view <ID> --json`.

Sort: `priority` ascending (1=urgent first; 0=no-priority last), then
`updatedAt` ascending. Apply `--limit`. Print a numbered table:

```
# Linear Todo queue (N tickets)
1. ENG-123  [P1]  "Add OAuth login"          (alice@…)
2. ENG-130  [P2]  "Fix invoice rounding"     (bob@…)
```

If `--dry-run`, stop. Otherwise proceed immediately against all N
tickets — no confirmation prompt.

## 3. Per-ticket loop

For each selected ticket, in order, run the sub-routine below. Print
the running results table after each ticket finishes.

### 3a-pre. Resolve the working branch and target branch for this ticket

Two distinct branches matter per ticket:

- **`$WORKING_BRANCH`** — the new feature branch this build commits onto
  and pushes. **Default to Linear's suggested branch name**
  (`issue.branchName`, e.g. `jaequery/pin-56-bug-...`) — fetch it
  alongside the issue:
  ```bash
  linear issue view "$IDENT" --json | jq -r '.branchName'
  ```
  If `branchName` is missing or empty, fall back to letting `/team-build`
  generate its default `team-build/<slug>-<ts>`. **Never** prepend
  `team-build/` to Linear's suggested name — pass it verbatim through
  `--working-branch`.
- **`$RESOLVED`** — the PR base / target branch (where the PR merges
  into). Resolve in the order below; first match wins.

#### Target-branch resolution order:

1. **Description directive.** Scan `$DESCRIPTION` for a line matching
   (case-insensitive) `^\s*(Target|Branch|Base)\s*:\s*([^\s]+)\s*$`.
   Capture group 2 is the branch name.
2. **Label.** Any label named `target:<branch>` or `base:<branch>`.
   Strip the prefix, the rest is the branch name.
3. **Linked branch attachment.** Check `attachments.nodes` for an entry
   with `sourceType` of `gitBranch` / `github` / `gitlab`. If the URL
   resolves to a branch (e.g. `…/tree/<branch>` or
   `…/-/tree/<branch>`), use that branch.
4. **CLI default.** Fall back to the `--target` flag (default `main`).

Validate the resolved branch exists locally OR on `origin`:
```
git show-ref --verify --quiet "refs/heads/$RESOLVED" \
  || git ls-remote --exit-code --heads origin "$RESOLVED"
```

If neither, **STOP this ticket** (do not silently fall back to `main`):
- Comment on the Linear ticket via
  `linear issue comment add $IDENT --body "team-build skipped: target branch \`$RESOLVED\` does not exist locally or on origin."`
- Move the ticket back to **Todo** via
  `linear issue update $IDENT --state Todo`.
- Record verdict `SKIPPED` in the results table and continue to the
  next ticket.

Print both resolutions per ticket, e.g.:
`ENG-123 → working=jaequery/eng-123-add-oauth-login (from Linear branchName), target=feature/auth (from description directive)`

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

---
Push policy for this run (non-negotiable):
- **Do not gate the push.** Skip the §6 typed-`yes` confirmation entirely.
- Push `$WORKING_BRANCH` to `origin` and open the PR against `--branch`
  as soon as the build round + security audit + code review have run,
  regardless of QA verdict. Don't loop indefinitely waiting for an
  APPROVED gate before pushing — push, open the PR, and surface any
  remaining issues in the PR body so a human can review on GitHub.
- This is autonomous Linear backlog burndown; treat the PR itself as
  the review surface, not a local gate.
```

Slug for the worktree path: `$IDENT` lowercased (e.g. `eng-123`).
`/team-build` adds its own timestamp suffix to the worktree directory
even when `--working-branch` overrides the branch name.

### 3b. Move the ticket to "In Progress" + post a "starting" comment

Before launching, transition the ticket:
```bash
linear issue update "$IDENT" --state "In Progress"
```
The CLI matches state name on the issue's team. If the team has no
state named "In Progress" but has another `started`-type state, retry
with that name. On any failure, log a warning and continue —
do not block the build on Linear state.

Then post a status comment so non-terminal stakeholders can follow
along. Write to a temp file and use `--body-file`:

```markdown
### 🛠️ team-build started

- **Working branch:** `$WORKING_BRANCH`
- **Target (PR base):** `$RESOLVED`
- **Worktree slug:** `$IDENT_LOWER`
- **Mode:** `/team-build` (plan → parallel specialist build → security audit → QA + code review, looping until clean)
- **Clean-code bar:** reuse existing patterns, minimal diff, no dead code/TODOs/console.logs.

I'll comment again when the build finishes (APPROVED → PR link + screenshots if UX, ESCALATED/FAILED → blocker summary).
```

```bash
linear issue comment add "$IDENT" --body-file /tmp/ltb-start-$IDENT.md
```

Comment is best-effort: if it fails, log and proceed — never block the
build on a comment failure. Skip this comment when `--dry-run`.

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

Call `/team-build` via the Skill tool with `args` — pass the
**ticket-resolved** target branch from §3a-pre as `--branch`, AND
Linear's suggested working branch (when present) as `--working-branch`:
```
--branch $RESOLVED
--working-branch $WORKING_BRANCH    # omit this line entirely if branchName was empty

<prompt body from §3a>
```

(One arg blob: the flags, blank line, then the §3a body.)

`/team-build` runs end-to-end in that single turn (worktree, plan,
build, security, QA, push, PR). It returns APPROVED-and-shipped,
ESCALATED, or FAILED.

After it returns, verify isolation:
- `gh pr list` must now show **exactly one** new open PR vs.
  `PRS_BEFORE` whose head ref equals `$WORKING_BRANCH` (when supplied)
  or starts with `team-build/<ticket-slug>-` (fallback). Zero or more
  than one new PR → STOP the loop and report.
- The new branch and PR number must be unique across this run's
  results table.

### 3d. Capture the outcome

Record: PR URL, PR number, branch name (Linear's `branchName` when
supplied, else the `team-build/...` default), worktree path, verdict,
rounds run. Also capture `$ISSUE_ID` (UUID) and `$TEAM_ID` (UUID) from
`linear issue view "$IDENT" --json` — needed by §3d.5 for `fileUpload`.

### 3d.5. Screenshot capture (UX/design tickets only)

Only runs when verdict is **APPROVED** AND the ticket touches the UI.
Otherwise skip this section entirely.

**Detection (any one fires):**
1. The PR diff contains frontend-shaped files. From the merged worktree
   or via `gh`:
   ```bash
   gh pr diff "$PR_NUMBER" --name-only \
     | grep -E '\.(tsx|jsx|vue|svelte|astro|html|css|scss|sass|less|stylus)$|/(components|pages|app|views|routes|styles|public)/' \
     | head -1
   ```
2. The Linear ticket has a label matching `^(ui|ux|design|frontend|web|mobile)$` (case-insensitive).
3. The title or description contains any of: `UI`, `UX`, design,
   layout, style, visual, page, screen, component, button, form,
   modal, theme, responsive, dark mode (case-insensitive whole-word).

If none fire → skip §3d.5 and proceed to §3e with no shots.

**Capture (best-effort; never block the loop):**

Work inside `$WT` (the worktree `/team-build` produced for this
ticket). If `/team-build` already cleaned the worktree on APPROVED
(per its §6a), re-create one read-only checkout for screenshotting:
```bash
SHOT_WT="$(dirname $REPO_ROOT)/$REPO_NAME.shot-$IDENT-$$"
git worktree add --detach "$SHOT_WT" "$WORKING_BRANCH"
```
(Mark this worktree for cleanup at the end of the ticket regardless
of outcome.)

Boot the project's dev server with the conventional command for the
detected stack — try in order, first that exists wins, run in the
background, capture the URL:
- `package.json` script `dev` → `npm run dev` (or `pnpm dev` / `yarn dev` / `bun dev` matching the lockfile).
- `package.json` script `start` → `npm start`.
- `bin/dev`, `bin/rails server`, `php artisan serve`, `python manage.py runserver`, `go run .` — only if they're already wired in this repo.

Wait up to 30s for the server to respond on its printed URL (or the
conventional default: `http://localhost:3000`, `:5173`, `:4321`,
`:8000`, `:8080` — try in that order). If nothing answers, abort §3d.5,
note `screenshots not captured: dev server did not boot` and proceed
to §3e without images.

Pick the URL to shoot:
- If the ticket description contains a line `Screenshot: <path>` or
  `Preview: <path>`, append that path to the base URL.
- Else default to `/`.

Capture three shots via Playwright MCP (`mcp__playwright__*`):
1. Desktop, viewport `1440x900` — save as `01-desktop.png`.
2. Mobile, viewport `390x844` — save as `02-mobile.png`.
3. Same desktop URL after one interaction (scroll one viewport, or
   focus the first interactive element) — `03-state.png`.

Save under `$SHOT_WT/.linear-team-build/shots/$IDENT/`. Tear down the
dev server (kill the background PID) before continuing. If any
individual shot fails, keep the ones that succeeded; do not retry.

**Upload to Linear** (mirrors `/linear-design` §4a). For each PNG:
```bash
SIZE=$(wc -c < "$SHOT")
NAME=$(basename "$SHOT")
RESP=$(linear api '
mutation($filename:String!,$contentType:String!,$size:Int!){
  fileUpload(filename:$filename, contentType:$contentType, size:$size, makePublic:false){
    success
    uploadFile { uploadUrl assetUrl headers { key value } }
  }
}' --variables "$(jq -n --arg f "$NAME" --arg ct image/png --argjson s "$SIZE" \
    '{filename:$f, contentType:$ct, size:$s}')")
UPLOAD_URL=$(echo "$RESP" | jq -r '.data.fileUpload.uploadFile.uploadUrl')
ASSET_URL=$(echo "$RESP"  | jq -r '.data.fileUpload.uploadFile.assetUrl')
HDR_ARGS=(); while IFS= read -r row; do
  HDR_ARGS+=(-H "$(jq -r '.key' <<<"$row"): $(jq -r '.value' <<<"$row")")
done < <(echo "$RESP" | jq -c '.data.fileUpload.uploadFile.headers[]')
curl -sS -X PUT "$UPLOAD_URL" "${HDR_ARGS[@]}" --data-binary "@$SHOT"
```
Record each `$ASSET_URL`. If `success:false` or curl is non-2xx for a
shot, drop just that shot and continue — never block §3e on an upload
failure.

Clean up `$SHOT_WT` (`git worktree remove --force "$SHOT_WT"`) before
returning to §3e.

### 3e. Update Linear

Use the CLI for both the comment and the state transition. Always
write the comment body to a temp file and pass `--body-file` so
multi-line markdown survives shell quoting.

- **APPROVED + PR opened:**
  ```bash
  linear issue comment add "$IDENT" --body-file /tmp/dda-comment-$IDENT.md
  linear issue update  "$IDENT" --state "In Review"   # falls back to leaving in "In Progress" if not present
  ```
  Comment body: the PR URL plus a one-line summary. **If §3d.5
  produced any uploaded screenshots, append a `### Screenshots` section
  embedding each as `![<label>]($ASSET_URL)` in capture order
  (desktop → mobile → state).** If §3d.5 ran but captured nothing
  (server didn't boot, etc.), append a single line:
  `_Screenshots not captured: <reason>_`. If §3d.5 was skipped (not a
  UX/design ticket), omit the section entirely.
- **ESCALATED or FAILED:**
  ```bash
  linear issue comment add "$IDENT" --body-file /tmp/dda-comment-$IDENT.md
  linear issue update  "$IDENT" --state "Todo"
  ```
  Comment body: blocker summary, worktree path, and remediation notes.
  Never mark done.

If `linear issue update --state "In Review"` fails because the team
lacks that state, leave the ticket in "In Progress" and note it in
the results table.

### 3f. Decide whether to continue

- Environmental failure (auth, network, missing tooling) → STOP the
  loop; same failure will hit every later ticket.
- Code-specific failure or 3-round cap → log and move on.
- APPROVED → move on.

## 4. Parallel mode

Default: **sequential** (`--parallel 1`). Tickets run one at a time so
output stays readable and rate limits don't bite. Pass `--parallel
<n>` to opt into concurrency — each `/team-build` produces its own
worktree (`team-build/...`), so they don't collide on disk. If
effective concurrency exceeds 5, warn the user about shared
`gh`/Linear rate limits but do not cap — the user asked for it.

## 5. Final summary

```
## /linear-team-build — summary
Processed: N tickets

| Ticket   | Verdict   | PR                              | Rounds |
|----------|-----------|---------------------------------|--------|
| ENG-123  | APPROVED  | https://github.com/.../pull/45  | 1      |
| ENG-130  | ESCALATED | (no PR — see worktree)          | 3      |

Worktrees still on disk (only ESCALATED/FAILED — APPROVED tickets are
auto-cleaned by /team-build §6a):
- /path/to/repo.team-build-eng-130-...  (ENG-130, escalated)

Linear updates posted: <count>
```

APPROVED tickets have their worktree + local branch removed
automatically by `/team-build`. Only ESCALATED/FAILED worktrees
persist for manual debugging. Do not prompt to clean up APPROVED
worktrees here — they are already gone.

## Hard rules

- **One PR per ticket. ONE Skill-tool call to `/team-build` per
  ticket.** Never bundle multiple tickets into one PR, branch,
  worktree, or team-build invocation.
- **Verify isolation between tickets.** Snapshot `gh pr list` before
  each call; confirm exactly one new PR with head ref
  `team-build/<ticket-slug>-*` after. Zero or more than one → STOP.
- **No branch/PR reuse.** Branch name and PR number must be unique
  across the run.
- **Clean-code bar is part of the contract.** The §3a clause is
  embedded in every team-build prompt and must be enforced by the
  Team Lead's §6 code-review gate. Re-roll if violated.
- Always update Linear (comment + state) after each ticket. Never
  leave a ticket stranded in "In Progress" on failure.
- **Use the `linear` CLI (`@schpet/linear-cli`) for every Linear
  read/write.** No raw `curl` to the Linear GraphQL endpoint, no
  bespoke API key plumbing. Fall back to `linear api` only when no
  structured subcommand exposes a needed field.
- If `linear auth token` fails, abort before touching git. If `gh`
  isn't authed, abort before touching Linear.
- Don't open more than 10 PRs per run unless the user explicitly
  raised `--limit` past 10.
- **Screenshots for UX/design tickets (§3d.5) are best-effort, never
  blocking.** Detection is by frontend-shaped diff, design label, or
  UI keywords in the ticket. Capture with Playwright after a local
  dev-server boot, upload via Linear's `fileUpload` mutation, and
  embed in the APPROVED comment. Failure modes (no dev server,
  capture error, upload non-2xx) downgrade to a `_Screenshots not
  captured: <reason>_` line — never abort the ticket and never
  fabricate an image.
