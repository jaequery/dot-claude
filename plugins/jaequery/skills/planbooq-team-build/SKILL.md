---
name: planbooq-team-build
description: >
  Pull every Planbooq ticket in the "Todo" kanban column (optionally
  scoped to a workspace, project, or assignee), then run /team-build
  on each ticket independently — one isolated worktree, one branch,
  one PR per ticket. No giant monolithic PR. Each build is instructed
  to keep code simple, avoid redundancy, and meet a clean-code bar.
  Planbooq is our homebrew Linear clone; this skill talks to its REST
  API directly. Use when the user says "/planbooq-team-build", "burn
  down my planbooq todos", "ship every planbooq todo", "team-build
  every planbooq todo", or wants to autonomously work through a
  Planbooq backlog with one clean PR per issue.
---

# /planbooq-team-build — Burn down a Planbooq "Todo" queue, one clean PR per ticket

You are a backlog runner. For every open Planbooq ticket whose status
is **Todo**, you launch `/team-build` against that ticket's
description and ship a **separate PR** per ticket. Never bundle
multiple tickets into one PR. Every build must meet the clean-code
bar in §3a. Status transitions go to Planbooq's native kanban column
via the REST API — not labels, not comments.

## 0. Inputs

`/planbooq-team-build [task description] [flags]`.

**Positional arg (optional).** If a free-form task description is
passed, **create the ticket on the fly first** (in `Todo` on the
target project), then proceed with normal queue processing — the new
ticket is included in this run's queue. Title = first line of the
description (≤200 chars per Planbooq limit), description = the
remainder (≤5000 chars). On-the-fly creation runs **after** §1
preflight, before §2 fetch, so workspace / project / status IDs are
already cached.

Optional flags:
- `--workspace <id|slug>` — Planbooq workspace. Default: if the API
  key only has access to one workspace (the common case for
  workspace-scoped keys), use it implicitly; otherwise abort and ask.
- `--project <id|slug>` — scope to one project. Default: all
  projects in the resolved workspace.
- `--assignee <me|email|userId>` — filter to one assignee. Default: any.
- `--limit <n>` — cap how many tickets to process this run. Default: 10.
- `--target <branch>` — base branch for PRs. Default: `main`.
- `--parallel <n>` — process N tickets concurrently. **Default: 1
  (sequential).** Pass an explicit number to parallelize. Warn if
  effective concurrency exceeds 5 but do not cap.
- `--dry-run` — list tickets that would be processed and stop.

**No confirmation prompt. Ever.** If invoked with no flags, just
start — defaults are: open Todo tickets in the resolved workspace,
up to 10, sequential, base = `main`. Print the resolved settings +
ticket queue, then **immediately proceed to §1 preflight and §2
ticket processing in the same response, without asking the user
"proceed?", "yes/no?", or any other confirmation phrasing**. Asking
is a bug — the user already confirmed by invoking the skill. Only
stop early if `--dry-run` is set or preflight (§1) fails.

## Planbooq interface — REST API via `curl`

**All Planbooq interactions in this skill go through the Planbooq
REST API**, called with `curl`. No MCP, no SDK.

- **Base URL.** Read from `$PLANBOOQ_BASE_URL` (sourced from
  `~/.planbooq/.env` like the API key). Default if unset:
  `https://planbooq.vercel.app`. The skill always appends `/api/v1`,
  so the env var should be the host root only (e.g.
  `https://planbooq.vercel.app`, `http://localhost:3636`, or any
  custom deployment). Set once and forget — see §1 step 1.
- **Auth.** `Authorization: Bearer $PLANBOOQ_API_KEY` (a
  `pbq_live_…` key from Settings → API Keys). If unset, **prompt
  the user once via `AskUserQuestion`** for the key, then persist
  it to `~/.planbooq/.env` so future runs (and other Claude Code
  sessions) never re-prompt. See §1 step 1 for the exact
  persistence flow.
- **Headers.** `Content-Type: application/json` on every request.
- **Response envelope.** Every response is
  `{ "ok": true, "data": … }` on success, or
  `{ "ok": false, "error": "…" }` on failure. **Always check `.ok`**
  before reading `.data`.

Wrap requests in a small helper at the top of the run:

```bash
PBQ() {
  local method="$1" path="$2" body="${3:-}"
  if [ -n "$body" ]; then
    curl -fsS -X "$method" \
      -H "Authorization: Bearer $PLANBOOQ_API_KEY" \
      -H "Content-Type: application/json" \
      --data "$body" \
      "${PLANBOOQ_BASE_URL:-https://planbooq.vercel.app}/api/v1$path"
  else
    curl -fsS -X "$method" \
      -H "Authorization: Bearer $PLANBOOQ_API_KEY" \
      "${PLANBOOQ_BASE_URL:-https://planbooq.vercel.app}/api/v1$path"
  fi
}
```

(`-f` makes curl fail on non-2xx so we don't accidentally treat an
error envelope as success; pipe to `jq -e '.ok'` for an explicit
envelope check.)

### Endpoints used by this skill

| Purpose                         | Endpoint                                                         |
|---------------------------------|------------------------------------------------------------------|
| Resolve workspace               | `GET /workspaces`                                                |
| List members (assignee resolve) | `GET /workspaces/{workspaceId}/members`                          |
| List statuses (kanban columns)  | `GET /workspaces/{workspaceId}/statuses`                         |
| List projects                   | `GET /workspaces/{workspaceId}/projects`                         |
| Create project                  | `POST /workspaces/{workspaceId}/projects` — `{ name, color, slug?, description?, repoUrl?, techStack? }` |
| List tickets                    | `GET /tickets?projectId=&statusId=&assigneeId=&includeArchived=&cursor=&limit=` |
| Get ticket                      | `GET /tickets/{ticketId}`                                        |
| Create ticket                   | `POST /tickets` — `{ projectId, statusId, title, description? }` |
| Update ticket                   | `PATCH /tickets/{ticketId}` — any of `{ title, description, priority, assigneeId, dueDate, labelIds }` |
| Move ticket between columns     | `POST /tickets/{ticketId}/move` — `{ toStatusId, beforeTicketId?, afterTicketId? }` |
| Add comment                     | `POST /tickets/{ticketId}/comments` — `{ body }`                 |

### Constraints

- `priority` ∈ `NO_PRIORITY | URGENT | HIGH | MEDIUM | LOW`.
- `color` is `#rrggbb` (6 hex digits, with the `#`).
- `slug` is lowercase alphanumeric + hyphens.
- `title` max 200 chars; `description` max 5000; comment `body` max 10000.
- Always resolve IDs via list endpoints before creating — **never guess**.
- Workspace-scoped API keys 403 on cross-workspace access; surface that
  error verbatim if it occurs.

### Status lifecycle

Planbooq is a kanban board, so "status" is just a column. This skill
expects (and writes to) the following column **names** — the actual
IDs are looked up once at preflight via `GET /workspaces/{id}/statuses`
and cached:

```
Todo → Building → Review
```

Planbooq's default board has five columns:
`Backlog → Todo → Building → Review → Shipping`. Humans drive
`Backlog → Todo` triage and `Review → Shipping` promotion; this
skill picks up from `Todo` and drives `Todo → Building → Review`.
It never writes `Backlog` or `Shipping`.

`Todo` and `Review` are **mandatory**. If the workspace's statuses
list lacks either column (case-insensitive), abort the run with
`Planbooq workspace <slug> has no '<name>' status — add a column
named "<name>" before re-running.` Other missing columns (`QA`,
`Done`) downgrade to a warning since this skill does not write them.

**Caching.** At preflight, resolve once and reuse for the whole run:
- `$WORKSPACE_ID`
- `$PROJECT_ID` (if `--project` is set; else process all projects)
- The `status-name → status-id` map: `$STATUS_TODO_ID`,
  `$STATUS_BUILDING_ID`, `$STATUS_REVIEW_ID`.

## 1. Preflight

1. **Token + base URL resolution.** Sourcing `~/.planbooq/.env` (step
   2 below) populates **both** `PLANBOOQ_API_KEY` and the optional
   `PLANBOOQ_BASE_URL` (host root only — the skill appends `/api/v1`).
   If `PLANBOOQ_BASE_URL` is unset after sourcing, default to
   `https://planbooq.vercel.app`. Resolve `PLANBOOQ_API_KEY` in this
   order — **only prompt if all sources are empty**:
   1. `$PLANBOOQ_API_KEY` already in the current shell env.
   2. **`~/.planbooq/.env`** (preferred location — a plain dotenv
      file). Source it directly:
      ```bash
      if [ -z "$PLANBOOQ_API_KEY" ] && [ -f ~/.planbooq/.env ]; then
        set -a; . ~/.planbooq/.env; set +a
      fi
      ```
   3. **`~/.claude.json` `env` block** (legacy location — older
      installs persisted the key here). Read directly via `jq`:
      ```bash
      if [ -z "$PLANBOOQ_API_KEY" ] && [ -f ~/.claude.json ]; then
        PLANBOOQ_API_KEY=$(jq -r '.env.PLANBOOQ_API_KEY // empty' ~/.claude.json 2>/dev/null)
        export PLANBOOQ_API_KEY
      fi
      ```
   4. `~/.claude.json` `mcpServers.*.env.PLANBOOQ_API_KEY` (oldest
      legacy placement) — same `jq` pattern with
      `.mcpServers // {} | to_entries[] | .value.env.PLANBOOQ_API_KEY // empty`
      and take the first non-empty hit.

   If still empty after all checks, **only then** prompt:
   1. **Prompt once** via `AskUserQuestion` — single free-text question:
      `"Enter your Planbooq API token (pbq_live_… from Settings → API
      Keys). I'll save it to ~/.planbooq/.env so you're never prompted
      again."`
   2. **Validate** the answer is non-empty and starts with `pbq_` (warn
      but accept if the prefix differs — the user may be on a custom
      build). On empty, abort.
   3. **Persist to `~/.planbooq/.env`** (create the directory if
      missing, lock down permissions):
      ```bash
      mkdir -p ~/.planbooq && chmod 700 ~/.planbooq
      umask 077
      printf 'PLANBOOQ_API_KEY=%s\n' "$ANSWERED_TOKEN" > ~/.planbooq/.env
      chmod 600 ~/.planbooq/.env
      ```
      Never echo the token value back to the terminal in plain text
      after saving.
   4. **Export for the current run** so the rest of this skill works
      without a Claude Code restart: `export PLANBOOQ_API_KEY="<key>"`.
   5. Print one line confirming where it was saved
      (`Saved PLANBOOQ_API_KEY to ~/.planbooq/.env. Future sessions
      will pick it up automatically.`) and continue.

   **Server reachable.** Sanity-check Planbooq is reachable with
   `curl -fsS "${PLANBOOQ_BASE_URL:-https://planbooq.vercel.app}/api/v1/workspaces" -H "Authorization: Bearer $PLANBOOQ_API_KEY"`;
   on network failure, abort with `Planbooq (${PLANBOOQ_BASE_URL:-https://planbooq.vercel.app}) is unreachable — check your network (or PLANBOOQ_BASE_URL in ~/.planbooq/.env) and re-run.`
2. **API reachable.** `PBQ GET /workspaces | jq -e '.ok'` must
   succeed. A 401 means the token is wrong; a 403 on a workspace
   means the key is workspace-scoped to a different workspace —
   surface either error and abort.
3. **Workspace resolved.** If `--workspace` is set, validate it
   appears in `GET /workspaces` (match by `id` or `slug`). If unset
   and the list has exactly one workspace, use it; otherwise abort
   with `Multiple workspaces visible to this token — pass --workspace`.
4. **Project resolved (if scoped).** If `--project` is set, validate
   via `GET /workspaces/{id}/projects` (match by `id` or `slug`). If
   no match is found, **auto-create it** rather than aborting:
   1. Resolve a repo name to use as the project name. Prefer the
      current GitHub repo's name from
      `gh repo view --json name -q .name` (run from `$REPO_ROOT`);
      fall back to `basename "$(git -C "$REPO_ROOT" rev-parse --show-toplevel)"`
      if `gh` fails or there is no GitHub remote.
   2. Resolve `repoUrl` from
      `gh repo view --json url -q .url` if available; otherwise omit.
   3. `POST /workspaces/{workspaceId}/projects` with
      `{ name: "<repo-name>", slug: "<kebab-repo-name>", color: "#6366f1", repoUrl?: "<url>" }`.
      Honor Planbooq's constraints (`slug` is lowercase alphanumeric
      + hyphens, `color` is `#rrggbb`).
   4. Cache the new `$PROJECT_ID` and continue. Print one line:
      `Created Planbooq project "<name>" (<id>) in workspace <slug>.`
   If `--project` is **not** set (i.e. process-all-projects mode),
   skip auto-creation entirely — the user did not ask for a specific
   project.
5. **Statuses cached.** `GET /workspaces/{id}/statuses` →
   `name → id` map. Verify `Todo`, `Building`, `Review` are all
   present (case-insensitive). Abort if `Todo` or `Review` is missing
   (`Planbooq workspace <slug> has no '<name>' status — add a column
   named "<name>" before re-running.`).
6. **Repo state.** `git status --porcelain` must be empty, or
   surfaced and confirmed by the user.
7. **`gh` available.** `gh auth status` must succeed — `/team-build`
   needs it for PR creation.
8. **`/team-build` reachable.** This skill invokes it via the Skill
   tool; if not listed as available, abort.

## 2. Fetch the Todo queue

```bash
PBQ GET "/tickets?statusId=$STATUS_TODO_ID&limit=${LIMIT:-10}${PROJECT_ID:+&projectId=$PROJECT_ID}${ASSIGNEE_ID:+&assigneeId=$ASSIGNEE_ID}" \
  | jq '.data'
```

For `--assignee me`, resolve to the caller's userId by calling
`GET /workspaces/{id}/members` and matching by the email on the
authenticated user (or by passing `assigneeId=me` if the API
recognises it — try the literal first, fall back to resolved id).

If the listing endpoint paginates (`cursor`), follow `cursor` until
either `--limit` is hit or there are no more pages.

For each ticket in the list, hydrate the full record via
`GET /tickets/{id}` if the listing returned a truncated `description`
— the §3a prompt to `/team-build` needs the **full** description.

Sort: by `priority` (`URGENT` → `HIGH` → `MEDIUM` → `LOW` →
`NO_PRIORITY`), then `updatedAt` ascending. Apply `--limit`. Print a
numbered table:

```
# Planbooq queue (N tickets) — workspace: $WORKSPACE_SLUG  status: Todo
1. PBQ-123  [HIGH]  "Add OAuth login"          (@alice)  project: web
2. PBQ-130  [MED]   "Fix invoice rounding"     (@bob)    project: billing
```

Use the canonical Planbooq identifier from the API response field
`identifier` (e.g. `FRED-0P7JUB`) for both the leftmost column and
the `$IDENTIFIER` variable used downstream. The Planbooq webhook
expects this exact form (`<PROJECTSLUG[0:4]>-<TICKETID[-6:]>`,
uppercased) in the PR body — anything else (e.g. cuid-prefix like
`pbq-cmomc0af`) breaks PR linking and auto-complete on merge.

If the API response does not include `identifier` (older Planbooq
deployments), fall back to computing it client-side:
```bash
PROJ_PREFIX=$(echo "$PROJECT_SLUG" | cut -c1-4 | tr '[:lower:]' '[:upper:]')
ID_SUFFIX=$(echo "$TICKET_ID" | tail -c 7 | tr '[:lower:]' '[:upper:]')
IDENTIFIER="${PROJ_PREFIX}-${ID_SUFFIX}"
```
Never use `slug`, `number`, or `pbq-<first-8-chars-of-id>` — those
won't match the webhook regex.

If `--dry-run`, stop. Otherwise proceed immediately against all N
tickets — no confirmation prompt.

## 3. Per-ticket loop

For each selected ticket, in order, run the sub-routine below. Print
the running results table after each ticket finishes.

### 3a-pre. Resolve the working branch and target branch

Two distinct branches matter per ticket:

- **`$WORKING_BRANCH`** — the new feature branch this build commits
  onto and pushes. Default to:
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
- Add a comment via
  `PBQ POST /tickets/$TICKET_ID/comments '{"body":"team-build skipped: target branch \`'"$RESOLVED"'\` does not exist locally or on origin."}'`.
- Leave the ticket status as `Todo` (don't promote to `Building`).
- Record verdict `SKIPPED` in the results table and continue.

Print both resolutions per ticket, e.g.:
`PBQ-123 → working=pbq-123-add-oauth-login, target=feature/auth (from body directive)`

### 3a. Build the team-build invocation

Hand `/team-build` exactly this prompt body (one ticket only):

```
[Planbooq $IDENTIFIER] $TITLE

Source: $URL
Workspace: $WORKSPACE_SLUG  Project: $PROJECT_SLUG  Assignee: $ASSIGNEE  Labels: $LABELS

$DESCRIPTION

---
Closes Planbooq ticket: $IDENTIFIER  ($URL)

When opening the PR, the body MUST include the line above so the
merge is traceable. Planbooq does not auto-close from a magic word,
so this is purely a human-readable backlink — but it is required.

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

### 3b. Move the ticket to "Building" + post a "starting" comment

Before launching, move the ticket to `Building`:

```bash
PBQ POST "/tickets/$TICKET_ID/move" \
  "$(jq -nc --arg s "$STATUS_BUILDING_ID" '{toStatusId:$s}')"
```

On any failure, log a warning and continue — do not block the build
on a status mutation.

Then post a status comment so non-terminal stakeholders can follow
along (write the body to a temp file and `jq` it into a JSON string
to handle multi-line markdown safely):

```bash
cat > /tmp/pbq-start-$TICKET_ID.md <<EOF
### 🛠️ team-build started

- **Working branch:** \`$WORKING_BRANCH\`
- **Target (PR base):** \`$RESOLVED\`
- **Worktree slug:** \`pbq-${IDENTIFIER_LOWER}\`
- **Mode:** \`/team-build\` (plan → parallel specialist build → security audit → QA + code review, looping until clean)
- **Clean-code bar:** reuse existing patterns, minimal diff, no dead code/TODOs/console.logs.

I'll comment again when the build finishes (PR link + verdict).
EOF
PBQ POST "/tickets/$TICKET_ID/comments" \
  "$(jq -Rs '{body:.}' < /tmp/pbq-start-$TICKET_ID.md)"
```

Comment is best-effort: if it fails, log and proceed — never block
the build on a comment failure. Skip this comment when `--dry-run`.

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
- **Verify the PR body contains the `Closes Planbooq ticket:` line.**
  If not, edit the PR via `gh pr edit <PR> --body "$(gh pr view <PR>
  --json body -q .body)\n\nCloses Planbooq ticket: $IDENTIFIER ($URL)"`.

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

**Status transition is decided by whether a PR was opened, not by
the QA verdict.** The push policy in §3a sends a PR up regardless of
verdict, so the PR itself is the review surface — once it exists,
the ticket belongs in `Review`.

- **PR was opened (any verdict — APPROVED, ESCALATED, or FAILED but
  team-build still pushed):**
  ```bash
  PBQ POST "/tickets/$TICKET_ID/comments" "$(jq -Rs '{body:.}' < /tmp/pbq-done-$TICKET_ID.md)"
  PBQ POST "/tickets/$TICKET_ID/move" \
    "$(jq -nc --arg s "$STATUS_REVIEW_ID" '{toStatusId:$s}')"
  ```
  Comment body: PR URL + one-line summary + verdict
  (APPROVED / ESCALATED / FAILED). For non-APPROVED verdicts, also
  include the blocker summary so a human can pick up where the loop
  stopped. If §3d.5 produced screenshots, append a `### Screenshots`
  section embedding each as `![<label>]($RAW_URL)` in capture order.
  Do **not** move the ticket to `QA` or `Done` here.
- **No PR was opened (environmental abort, target branch missing,
  etc.):**
  ```bash
  PBQ POST "/tickets/$TICKET_ID/comments" "$(jq -Rs '{body:.}' < /tmp/pbq-done-$TICKET_ID.md)"
  PBQ POST "/tickets/$TICKET_ID/move" \
    "$(jq -nc --arg s "$STATUS_TODO_ID" '{toStatusId:$s}')"
  ```
  Comment body: blocker summary, worktree path, remediation notes.
  Ticket returns to the `Todo` column. Never archive.

### 3f. Decide whether to continue

- Environmental failure (auth, network, missing tooling, Planbooq
  API down) → STOP the loop; the same failure will hit every later
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
Workspace: $WORKSPACE_SLUG   Project filter: ${PROJECT_SLUG:-all}   Status filter: Todo
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
- **Every PR body MUST contain the `Closes Planbooq ticket:` line**
  with the identifier and URL. Verify after team-build returns; edit
  the PR via `gh pr edit` if missing.
- **Verify isolation between tickets.** Snapshot `gh pr list` before
  each call; confirm exactly one new PR with head ref
  `$WORKING_BRANCH` after. Zero or more than one → STOP.
- **No branch/PR reuse.** Branch name and PR number must be unique
  across the run.
- **Clean-code bar is part of the contract.** The §3a clause is
  embedded in every team-build prompt and must be enforced by the
  Team Lead's §6 code-review gate. Re-roll if violated.
- Always update the ticket (comment + status `move`) after each
  one. Never leave a ticket stranded in `Building`. Transition
  rule: **PR opened → `Review` (any verdict); no PR → back to
  `Todo`**.
- **All Planbooq reads/writes go through the REST API at
  `${PLANBOOQ_BASE_URL:-https://planbooq.vercel.app}/api/v1` with
  `Bearer $PLANBOOQ_API_KEY`.** No MCP,
  no SDK, no scraping the web UI. Always check `.ok` on the response
  envelope before reading `.data`.
- Always resolve IDs via list endpoints before creating — never
  guess.
- Honour Planbooq's payload constraints: title ≤200, description
  ≤5000, comment body ≤10000, `priority` ∈ {`NO_PRIORITY`, `URGENT`,
  `HIGH`, `MEDIUM`, `LOW`}, `color` is `#rrggbb`, `slug` is
  lowercase alphanumeric + hyphens.
- If the API returns 401/403, abort the run — every later call will
  fail the same way.
- If `gh auth status` fails, abort before touching git.
- Don't open more than 10 PRs per run unless the user explicitly
  raised `--limit` past 10.
- **Screenshots for UX/design tickets (§3d.5) are best-effort, never
  blocking.**
