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
| Update ticket                   | `PATCH /tickets/{ticketId}` — any of `{ title, description, priority, assigneeId, dueDate, labelIds, prUrl }` |
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

### 3-route. Decide the path: design exploration vs. direct build

Before any branch resolution or dispatch, route the ticket. There
are three possible outcomes per ticket; pick the first that matches:

1. **AWAITING_HUMAN** — ticket has the label `Choose Design` (any
   case) **AND does NOT have `design-selected`**. A previous
   `/planbooq-team-build` run already produced variants and the
   human hasn't signaled a pick yet. Skip this ticket entirely:
   do **not** transition status, do **not** post a comment, do
   **not** dispatch. Record verdict `AWAITING_HUMAN` in the
   results table and continue to the next ticket.

   The `AND NOT design-selected` clause matters: a human who adds
   `design-selected` *without* removing `Choose Design` (a common,
   forgivable slip) would otherwise be stuck here forever. The
   `design-selected` label is the stronger signal — if it's
   present, the human has picked, period.

2. **DESIGN_EXPLORATION** — UI heuristic fires (label or keyword
   rules below) **AND** the ticket has no signal that design has
   already been chosen. Signals that design is done (any one ⇒
   skip this path and fall through to BUILD):
   - label `design-selected` is present, OR
   - label `design-explored` is present (we write this in §3-design
     step 4 once variants have been posted; it survives across
     runs as a structural "this ticket already went through the
     design loop" marker).

   When this path matches, run §3-design and continue the queue —
   do NOT run the §3a-pre…§3f build path for this ticket.

   **Why a label, not a comment marker?** Labels are returned by
   the same `GET /tickets/{id}` call that fetches the ticket, so
   detection is one read. A comment-body marker would require a
   second `GET /tickets/{id}/comments` query and grep — more
   moving parts, more failure modes.

3. **BUILD** — everything else. Proceed to §3a-pre and run the
   normal `/team-build` path through §3f.

UI heuristic for path 2 (any one fires):
- Label match: `^(ui|ux|design|frontend|web|mobile|needs-design)$`
  case-insensitive.
- Keyword match in title or description (case-insensitive,
  whole-word): `UI`, `UX`, design, layout, style, visual, page,
  screen, component, button, form, modal, theme, responsive,
  `dark mode`.

Print the route decision per ticket, e.g.
`PBQ-123 → route=DESIGN_EXPLORATION (label "needs-design")`.

### 3-state. Move status to "Building" FIRST — before any comment

**Status change is the very first mutation on the ticket.** The
moment §3-route says we're going to do real work (route is BUILD
or DESIGN_EXPLORATION), transition the ticket to `Building`
*before* posting the §3-announce comment, before resolving
branches, before any long-running step. The Planbooq board must
reflect "the robot is working on this right now" the instant any
external observer opens the board — not 30 seconds later when the
announce comment lands, never. A ticket sitting in "Todo" while
the bot has already committed to working on it is the bug this
section exists to prevent.

Skip this section only when route is **AWAITING_HUMAN** — those
tickets are already in the column the human needs them in, and
mutating them would be wrong.

```bash
PBQ POST "/tickets/$TICKET_ID/move" \
  "$(jq -nc --arg s "$STATUS_BUILDING_ID" '{toStatusId:$s}')" \
  || echo "warning: failed to move $TICKET_ID to Building; continuing"
```

On any failure, log a warning and continue — do not block the
build on a status mutation, but the §3-announce comment that
follows must still describe the ticket as "in progress" (the
status move is best-effort but always *attempted* first, so the
comment narrative reflects intended state).

Print the transition per ticket, e.g.
`PBQ-123 → status=Building (was Todo)`.

### 3-announce. Post a "picked up" comment AFTER the status move

For every ticket whose route is **BUILD** or **DESIGN_EXPLORATION**
(i.e. anything except AWAITING_HUMAN), post a Planbooq comment
immediately after §3-state — before §3a-pre, before any long-running
operation. Stakeholders watching the ticket in Planbooq should see
"the robot is on it" the moment we commit to doing real work, not
5 minutes later when the first phase comment lands. By the time
this comment renders, the ticket already shows "Building" in the
kanban (per §3-state), so the announce comment reinforces what the
status already says rather than racing it.

```markdown
### 🤖 picked up by /planbooq-team-build

- **Route:** `$ROUTE` (`DESIGN_EXPLORATION` → variants first, then human picks; `BUILD` → straight to /team-build)
- **Why this route:** $ROUTE_REASON   <!-- e.g. "label `needs-design`", "keyword `modal` in title", "design-selected label present, going straight to build" -->
- **Position in queue:** $POS / $TOTAL

Next steps I'll narrate as I go — every status change, label change,
and dispatch will land here as a comment so you don't have to watch
the terminal. If something blocks, the blocker comment is the last
one before silence.
```

This is the FIRST comment on every active ticket, even before the
phase-specific "design exploration started" / "team-build started"
comments. The phase comments still post — this one is additive,
not a replacement. AWAITING_HUMAN never gets this comment (it's
the only carve-out from the "narrate everything" rule).

### Label helper (used throughout §3)

Planbooq labels are managed via `PATCH /tickets/{id}` with the
`labelIds` array. To add or remove labels by name:

1. Resolve label IDs from the workspace: try `GET /workspaces/{id}/labels`
   first; if that endpoint returns 404 on a given deployment, fall back
   to reading labels off the ticket's existing `.labels[]` field
   (`GET /tickets/{id}`) and building a `name → id` map from what's
   already in use.
2. If a needed label doesn't exist yet, attempt to create via
   `POST /workspaces/{id}/labels` with `{ name, color }`. If that
   endpoint is also unavailable on the deployment, log a warning and
   skip the label op for this run (the kanban status is still the
   primary signal).
3. Compute the merged label-id set (current + added − removed) and
   send `PATCH /tickets/{id}` with `{ labelIds: [...] }`.

Labels created by this skill: `Designing`, `Choose Design`,
`design-explored`, `design-selected`, `Building`, `Testing`. Label
add/remove is best-effort — log a warning on failure and continue;
never block dispatch on a label mutation.

**Exception to "best-effort":** `design-explored` MUST stick. If
adding it in §3-design step 4 fails, retry once before giving up.
Without it, the next run can't tell the ticket already went through
the design loop and will route it back through `/team-design` —
wasted variants, duplicate noise on the ticket. If both attempts
fail, surface a loud warning in the final summary and append a
`_design-explored label could not be written — manual cleanup
required_` line to the "variants ready" comment so the human knows.

### 3-design. Design exploration path (route = DESIGN_EXPLORATION)

The ticket needs divergent variants before anyone writes code. We
hand it to `/team-design` (Planbooq has no `/planbooq-design`
wrapper — `/team-design` is invoked directly), let it produce
variant branches with screenshots, then return the ticket to
**Todo** with `Choose Design` + `design-explored` labels so a
human can pick. The next `/planbooq-team-build` run will see the
`design-explored` label (or `design-selected` once the human
picks) and skip straight to BUILD.

Status is already "Building" — §3-state moved it before §3-announce.

1. **Add label `Designing`.** Remove `needs-design` if present.
2. **Post the "starting design" comment**:
   ```markdown
   ### 🎨 design exploration started

   Routing through `/team-design` because this ticket looks
   design-flavored (UI label or UX keywords in title/description).

   - `/team-design` is producing N divergent variants in parallel,
     each on its own branch (`team-design/<slug>-<variant>`).
   - When done, I'll post one comment per variant on this ticket
     with the variant's branch link and screenshots committed to
     that branch (referenced via `raw.githubusercontent.com`).
   - This ticket then moves back to **Todo** with the
     **`Choose Design`** label. Pick a variant by leaving a
     comment, then add the **`design-selected`** label (or just
     remove `Choose Design`) and re-run `/planbooq-team-build` —
     the next run will skip design and go straight to
     `/team-build` with the chosen direction in context.
   ```
3. **Invoke `/team-design`.** Make exactly one Skill-tool call
   with `--variants 4` (unless the description specifies a count)
   and the ticket title + description as the brief. Use a slug
   based on the ticket identifier so each variant lands on
   `team-design/<identifier-lower>-<variant-name>`.
4. **After it returns** (success path only — failure handling at
   the end of §3-design):
   - **Add label `design-explored`** (per the label helper's
     exception clause: this label MUST stick — retry once on
     failure, surface loudly if it can't be written).
   - Remove label `Designing`. Add label `Choose Design`.
   - Move status → **Todo**:
     ```bash
     PBQ POST "/tickets/$TICKET_ID/move" \
       "$(jq -nc --arg s "$STATUS_TODO_ID" '{toStatusId:$s}')"
     ```
   - For each variant branch produced by `/team-design`, post a
     per-variant comment on the ticket. Each comment includes:
     - Variant name and branch link:
       `https://github.com/$REPO_FULL/tree/$VARIANT_BRANCH`
     - Embedded screenshots from the variant branch (committed
       under `.team-design/<variant>/screenshots/*.png` by
       default). Reference each via
       `https://raw.githubusercontent.com/$REPO_FULL/$VARIANT_BRANCH/.team-design/<variant>/screenshots/<file>`.
       If `/team-design` writes screenshots elsewhere, locate
       them by `git ls-tree -r origin/$VARIANT_BRANCH | grep -E '\.(png|jpg|jpeg|webp)$'`
       under any `team-design` or `.team-design` directory.
   - Post the "variants ready" comment as the final comment in
     the batch:
     ```markdown
     ### 🎨 variants ready — please pick one

     `/team-design` finished. Each variant is a comment above this
     one with its branch + screenshots. Check out a branch locally
     to compare interactively.

     **To proceed:**
     1. Decide which variant to ship.
     2. Either add the **`design-selected`** label, or remove the
        **`Choose Design`** label (either signals "pick recorded"
        — both work).
     3. Re-run `/planbooq-team-build` — this ticket will route
        straight to `/team-build` and the build team will see the
        chosen direction in the comment history above.

     The `design-explored` label on this ticket is the structural
     marker that prevents the next run from re-routing through
     `/team-design` — leave it attached.
     ```
5. Record verdict `DESIGN_HANDOFF` in the results table. Note the
   per-variant `team-design/...` branches in the row's "Next step"
   cell so they appear in §5's summary. Continue to the next
   ticket. Do NOT run §3a-pre…§3f for this ticket.

**Final consistency sweep at the end of §3-design** (success path):
re-fetch the ticket and confirm the label set matches expectations
(`design-explored` ✓, `Choose Design` ✓, `Designing` ✗, status =
`Todo`). If any label or status is inconsistent (e.g., `Designing`
still attached because removal failed earlier), retry the failing
mutation once. This catches the partial-failure case where step 4
half-completed.

**Failure path:** If `/team-design` itself escalates or fails,
treat it like a BUILD failure: comment the blocker, move status
back to **Todo**, remove `Designing`, do NOT add `Choose Design`
or `design-explored` (nothing to choose, didn't actually explore),
record verdict `DESIGN_FAILED`.

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
Verification bar for this build (non-negotiable — the ticket is not
done until you've proven the change does what was asked):
- **Restate the ticket's acceptance criteria in your own words before
  coding.** If the ticket has no explicit criteria, derive 1–5
  falsifiable checks from the title + description and write them into
  the PR body under a `## Verification` section. Each check is a
  concrete observable behavior, not a vague "it works".
- **Map every check to evidence.** For each acceptance check, record
  HOW you confirmed it: a unit/integration test name, a curl/CLI
  command + expected output, a screenshot, a log line, or an
  end-to-end click-through. "Looks right" is not evidence.
- **Run the verification before requesting review.** Execute the
  tests/commands you listed; paste the actual output (or a trimmed
  excerpt) into the PR body next to each check. If a check fails,
  fix the code — do not reword the check.
- **For UI tickets**, the §3d.5 screenshots/walkthrough are part of
  the evidence, not a substitute for it. Still list the user-visible
  behavior change in the PR body and confirm it via the screenshots.
- **For bug fixes**, add a regression test that fails on `main` and
  passes on this branch, OR document why a test isn't feasible
  (e.g. external system, race condition) and replace it with a
  manual repro + fix-confirmed transcript.
- **If you cannot verify a check** (missing test setup, no staging
  env, requires production data), say so explicitly in the PR body
  under `## Verification — unverified` with the reason. Never
  silently skip.

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
- **Evidence capture is NOT skipped.** The push-policy override only
  waives the typed-`yes` gate and the APPROVED-loop. You MUST still
  execute the §5a capture script inline (Playwright/Cypress E2E with
  `video: "on"` if configured, else the synthetic walkthrough) for
  any UI-bearing diff and commit the resulting
  `$WT_PATH/.team-build/evidence/` directory before pushing. If
  capture fails (no E2E config AND synthetic boot fails), surface the
  reason in the PR body and the §3e Planbooq comment as
  `_Walkthrough not captured: <reason>_` — never silently omit it.
  Planbooq-team-build's §3d.5 step depends on these artifacts existing
  on disk.
- **"No UI surface mutation" is NOT a valid waiver reason.** The
  capture trigger is the §5 step-1 diff regex, not the agent's
  judgment about whether the change "feels visual." Conditional
  render gates, pill/badge/chip/banner gating, helper functions
  consumed by JSX, copy swaps, and class-string changes ALL count as
  UI mutations even when no new component is added. If the regex
  matches, capture. The only acceptable "not captured" reasons are
  infrastructural failures (no E2E config AND synthetic boot failed
  AND repo `.team-build/capture.sh` absent) — and those must include
  the specific failure mode, not a self-judged rationale. See
  `/team-build` §5 step 1 for the full list of banned waiver phrases.
```

Slug for the worktree path: `pbq-${IDENTIFIER_LOWER}` (e.g.
`pbq-pbq-123`). `/team-build` adds its own timestamp suffix.

### 3b. Add the `Building` label + post a "starting" comment

Status is already `Building` — §3-state moved it before §3-announce.
This section only handles the BUILD-specific label and the
"team-build started" status comment; do NOT re-issue the status
transition here (it's redundant and could fight a human who manually
nudged the status in the meantime).

**Add the `Building` label** (best-effort, per the label helper).
If the route was DESIGN_EXPLORATION → BUILD on this re-run, the
ticket may also carry `design-selected` and/or `Choose Design` —
leave `design-selected` in place (it's a historical record) and
remove `Choose Design` if it's still present (the human signaled
by re-running this skill).

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

`/team-build` runs end-to-end in that single turn (worktree, plan,
build, security, QA, push, PR). It returns APPROVED-and-shipped,
ESCALATED, or FAILED.

> ## ⛔ STOP — post-dispatch checklist (read every time `/team-build` returns)
>
> The single most common failure mode of this skill is the outer
> runner treating an APPROVED return as "ticket done" and writing a
> closing summary right here. **APPROVED from `/team-build` means
> "build shipped, now publish the result back to Planbooq" — not
> "we're done."** The inner skill's APPROVED applies to *its*
> contract; the outer ticket isn't closed until §3d → §3d.5 → §3e
> have all run.
>
> Before writing ANY user-facing text after `/team-build` returns,
> mentally tick this checklist for the ticket you just dispatched:
>
> 1. [ ] §3c isolation check ran (`gh pr list` shows exactly one new
>        PR with the right head ref).
> 2. [ ] §3d outcome captured (PR URL, PR number, branch, worktree,
>        verdict, rounds, `$TICKET_ID`, `$IDENTIFIER`).
> 3. [ ] §3d.5 ran for any UI-bearing diff: artifacts located OR
>        captured inline, then committed to the PR branch and pushed
>        (raw URL recorded). For non-UI diffs, explicitly noted "no
>        UI surface" instead of skipping silently.
> 4. [ ] §3e Planbooq comment posted AND status transitioned
>        (`Review` for any verdict where a PR was opened, `Todo` for
>        no-PR aborts). Phase labels (`Building`, `Testing`) cleaned
>        up. `prUrl` patched onto the ticket.
>
> If ANY box is unticked, you are not allowed to:
> - Move to the next ticket in the queue.
> - Write the §5 final summary.
> - Write any "## /team-build — APPROVED" / "wrap up" message.
>
> Do the missing step first, then resume. Writing a closing summary
> with unticked boxes is the bug this checklist exists to prevent.

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
rounds run, `$TICKET_ID`, `$IDENTIFIER`, `$REPO_FULL` (from
`gh repo view --json nameWithOwner -q .nameWithOwner`) — needed by
§3d.5 for committing the report zip and constructing the raw URL.

### 3d.5. Visual asset reuse (UX/design tickets only)

**Before locating/capturing, swap labels: remove `Building`, add
`Testing`** (best-effort, per the label helper). Post a one-line
comment so observers see the phase change:

```markdown
### 🧪 QA capture in progress

Build round complete. Locating the Playwright report (screenshots,
traces, video — all in one zip) and committing it to the PR branch
for upload-free review. Label moved `Building` → `Testing`.
```

**Capture happens during QA in `/team-build` §5a.** This section
locates the artifacts that QA produced and commits them to the PR
branch as a single `playwright-report.zip` referenced from the §3e
comment via `raw.githubusercontent.com`. If they aren't on disk
(autonomous push-policy mode skipped capture, or capture genuinely
failed), this section runs the §5a capture script itself before
zipping — UI tickets without a walkthrough are not acceptable.

Runs when **any** of: ticket touches the UI (per detection rules
below), verdict is APPROVED, or verdict is ESCALATED but a PR was
opened. The only skip condition is "no UI surface in the diff."

**Detection (any one fires):**
1. The PR diff contains frontend-shaped files (`gh pr diff "$PR_NUMBER" --name-only`
   matching `\.(tsx|jsx|vue|svelte|astro|html|css|scss|sass|less|stylus)$` or
   `/(components|pages|app|views|routes|styles|public)/`).
2. The Planbooq ticket has a label matching `^(ui|ux|design|frontend|web|mobile)$`
   (case-insensitive).
3. Title/description contains any of: `UI`, `UX`, design, layout, style,
   visual, page, screen, component, button, form, modal, theme,
   responsive, dark mode (case-insensitive whole-word).

If none fire → skip §3d.5, proceed to §3e with no assets.

**Locate or build the Playwright report zip.** The Playwright HTML
report already contains every screenshot, trace, and video the run
produced — committing it as a single zip to the PR branch is
dramatically simpler than extracting individual assets and embedding
them inline. One file, one commit, one link in the comment.

```bash
EVID="$WT/.team-build/evidence"
REPORT_DIR="$EVID/playwright-report"      # default Playwright output dir
REPORT_ZIP="$EVID/playwright-report.zip"
```

Resolution order:
1. **Pre-built zip** — if `$REPORT_ZIP` already exists (§5.5 may have
   zipped and committed it), use it as-is.
2. **Pre-built report dir** — if `$REPORT_DIR` exists but no zip,
   build one: `(cd "$EVID" && zip -rq playwright-report.zip playwright-report)`.
3. **No artifacts on disk** — re-materialize the worktree if §6a
   cleaned it (see fallback below), then re-run the Playwright capture
   inline (mirrors `/team-build` §5a's capture-resolution order:
   Playwright with override config → Cypress → repo
   `.team-build/capture.sh` → `package.json` `team-build.capture` →
   `pnpm install && pnpm db:migrate && pnpm db:seed && pnpm dev` +
   synthetic walkthrough). Cap total time at 5 minutes. After the
   run, zip whatever Playwright wrote into `$REPORT_DIR`.
4. **Still nothing** — post the §3e comment with
   `_Playwright report not captured: <one-line reason>_` AND open a
   follow-up TODO comment naming what setup is missing (Playwright
   config? `.team-build/capture.sh`?) so the next run captures
   cleanly. This is the only path that ships UI work without a
   report — and it must be loud.

**Worktree-cleanup fallback.** If `$WT` no longer exists (cleaned by
`/team-build` §6a after PR open), create a read-only worktree at
`$WORKING_BRANCH` to access the committed report:
```bash
SHOT_WT="$(dirname $REPO_ROOT)/$REPO_NAME.pbq-evidence-$IDENTIFIER_LOWER-$$"
git -C "$REPOROOT" worktree add --detach "$SHOT_WT" "origin/$WORKING_BRANCH"
WT="$SHOT_WT"  # rebind for the rest of §3d.5
```
Clean up at the end of §3d.5: `git worktree remove --force "$SHOT_WT"`.

**Commit the zip to the PR branch and push.** Planbooq has no
equivalent of Linear's `fileUpload` mutation, so the zip lives on
the PR branch under `.planbooq-team-build/shots/<identifier>/` and
the §3e comment links it via `raw.githubusercontent.com`:

```bash
DEST_DIR="$WT/.planbooq-team-build/shots/$IDENTIFIER_LOWER"
mkdir -p "$DEST_DIR"
cp "$REPORT_ZIP" "$DEST_DIR/playwright-report.zip"

git -C "$WT" add ".planbooq-team-build/shots/$IDENTIFIER_LOWER/playwright-report.zip"
git -C "$WT" -c user.name="planbooq-team-build" \
            -c user.email="planbooq-team-build@local" \
  commit -m "playwright report for $IDENTIFIER" \
  || echo "nothing to commit"

git -C "$WT" push origin "$WORKING_BRANCH" \
  || { echo "warning: report push rejected; will surface in §3e comment"; PUSH_FAILED=1; }

REPO_FULL=$(gh repo view --json nameWithOwner -q .nameWithOwner)
REPORT_URL="https://raw.githubusercontent.com/$REPO_FULL/$WORKING_BRANCH/.planbooq-team-build/shots/$IDENTIFIER_LOWER/playwright-report.zip"
```

> **Why `raw.githubusercontent.com`, not the GitHub blob view URL?**
> The blob URL (`github.com/.../blob/...`) renders the file in
> GitHub's UI; reviewers click it and get a "view raw" page, not a
> download. The raw URL streams the zip directly so a single click
> from the Planbooq comment downloads the file. Always use
> `raw.githubusercontent.com`.

Record `$REPORT_URL`. If push failed (`$PUSH_FAILED=1`) or the
commit produced no changes to push, log the failure and proceed to
§3e — surface it there as `_Playwright report push rejected:
<reason>_` or `_Playwright report not committed: <reason>_`, never
block §3e.

If you re-created a read-only worktree to access committed evidence,
clean it up (`git worktree remove --force "$SHOT_WT"`) before
returning to §3e.

### 3e. Update the ticket

**Status transition is decided by whether a PR was opened, not by
the QA verdict.** The push policy in §3a sends a PR up regardless of
verdict, so the PR itself is the review surface — once it exists,
the ticket belongs in `Review`.

- **PR was opened (any verdict — APPROVED, ESCALATED, or FAILED but
  team-build still pushed):**
  **First, clean up phase labels** (best-effort, per the label
  helper): remove `Testing` and remove `Building` if it's still
  attached. Do not add a new phase label here — the kanban status
  (`Review`, set below) is the signal for this stage.

  ```bash
  PBQ POST "/tickets/$TICKET_ID/comments" "$(jq -Rs '{body:.}' < /tmp/pbq-done-$TICKET_ID.md)"
  PBQ PATCH "/tickets/$TICKET_ID" \
    "$(jq -nc --arg u "$PR_URL" '{prUrl:$u}')"
  PBQ POST "/tickets/$TICKET_ID/move" \
    "$(jq -nc --arg s "$STATUS_REVIEW_ID" '{toStatusId:$s}')"
  ```

  The `PATCH` call sets the ticket's native `prUrl` field so the PR
  shows up in the ticket's "Add PR link…" slot in the UI — not just
  buried in the comment thread. **This is required**, not optional;
  the comment alone does not link the ticket to the PR. Best-effort:
  on failure, log a warning and continue (the comment already
  contains the URL as a fallback).

  Comment body: PR URL + one-line summary + verdict (APPROVED /
  ESCALATED / FAILED). For non-APPROVED verdicts, also include the
  blocker summary so a human can pick up where the loop stopped.
  **Always append a `### Verification` section** mirroring the PR
  body's verification checks: each acceptance check on its own
  bullet with the evidence (test name, command output excerpt,
  screenshot ref, or `unverified — <reason>`). This is how the
  human reviewer in the `Review` column knows what was actually
  confirmed vs. assumed.

  **If §3d.5 committed a Playwright report zip, append a
  `### Playwright report` section with a single link:**
  ```markdown
  ### Playwright report

  [playwright-report.zip]($REPORT_URL)

  Download, unzip, then run `npx playwright show-report <unzipped-dir>`
  to view every spec's screenshots, traces, and video.
  ```
  If §3d.5 ran but the push failed, append
  `_Playwright report push rejected: <reason>_`. If §3d.5 captured
  nothing, append `_Playwright report not captured: <reason>_`. If
  §3d.5 was skipped (not a UX/design ticket), omit the section
  entirely.

  Do **not** move the ticket to `QA` or `Done` here.
- **No PR was opened (environmental abort, target branch missing,
  etc.):**
  Remove `Testing` and `Building` labels first (best-effort).
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

> **Precondition gate — do not write this section yet if any row is
> incomplete.** Before producing the summary, walk every ticket row in
> your head and confirm BOTH of these hold for each one:
>
> - The "PR / Next step" cell contains a real GitHub PR URL (for
>   APPROVED) or an explicit non-URL reason (for ESCALATED / FAILED /
>   DESIGN_HANDOFF / AWAITING_HUMAN / SKIPPED / DESIGN_FAILED).
> - A Planbooq comment was posted in §3e for that ticket. If you
>   can't point to it right now, §3e didn't run for that ticket.
>
> If either is missing for any row, STOP and finish §3d.5 + §3e for
> the offending ticket(s) FIRST, then come back and write the summary.
> A summary written with missing Planbooq comments is the same bug as
> "skipping §3e because /team-build returned APPROVED" — the §3c
> post-dispatch checklist exists to prevent it; this gate is the
> backstop.

```
## /planbooq-team-build — summary
Workspace: $WORKSPACE_SLUG   Project filter: ${PROJECT_SLUG:-all}   Status filter: Todo
Processed: N tickets

| Ticket   | Verdict          | PR / Next step                                | Rounds |
|----------|------------------|-----------------------------------------------|--------|
| PBQ-123  | APPROVED         | https://github.com/.../pull/45                | 1      |
| PBQ-130  | ESCALATED        | https://github.com/.../pull/46                | 3      |
| PBQ-141  | DESIGN_HANDOFF   | label `Choose Design` — pick variant          | —      |
| PBQ-142  | AWAITING_HUMAN   | already in `Choose Design` — skipped          | —      |
| PBQ-150  | DESIGN_FAILED    | /team-design errored — see ticket comment     | —      |

Worktrees still on disk:
- ESCALATED/FAILED build worktrees (APPROVED are auto-cleaned by /team-build §6a):
  - /path/to/repo.team-build-pbq-pbq-130-...  (PBQ-130, escalated)
- DESIGN_HANDOFF variant worktrees (left intentionally so the human can
  diff/check out variants before picking — clean up after the pick):
  - /path/to/repo.team-design-pbq-141-variant-a/  branch `team-design/pbq-141-variant-a`
  - /path/to/repo.team-design-pbq-141-variant-b/  branch `team-design/pbq-141-variant-b`
  - …

Comments posted: <count>
```

APPROVED tickets have their build worktree + local branch removed
automatically by `/team-build`. ESCALATED/FAILED build worktrees and
all DESIGN_HANDOFF variant worktrees persist — the former for manual
debugging, the latter so the human can compare variants before
picking. Do not prompt to clean up APPROVED worktrees here; do
surface the DESIGN_HANDOFF variant paths so the user knows what's
on disk waiting for a decision.

## Hard rules

- **§3-route runs FIRST, before §3a-pre.** The route decision
  determines whether this ticket goes through `/team-design`
  (DESIGN_EXPLORATION), is skipped entirely (AWAITING_HUMAN), or
  proceeds through the normal `/team-build` path (BUILD). Never
  dispatch `/team-build` against a ticket carrying the
  `Choose Design` label — that ticket is waiting on a human and
  must be left untouched.
- **Status change is the FIRST mutation, before any comment.** The
  moment §3-route decides BUILD or DESIGN_EXPLORATION, run §3-state
  to transition the ticket to `Building` *before* posting the
  §3-announce comment, *before* any long-running step. A human
  watching the Planbooq board must never see "Todo" while the bot
  has already committed to working on the ticket — the kanban
  column is the strongest "the robot is on it" signal Planbooq
  surfaces. Comments reinforce status; they never lead it. If you
  find yourself posting any comment on a ticket whose column still
  says "Todo," that's the bug §3-state exists to prevent.
  (AWAITING_HUMAN is the only carve-out — that path mutates
  nothing.)
- **Phase labels mirror the workflow.** During a single
  `/planbooq-team-build` run, a ticket on the BUILD path moves
  through: status → `Building` (§3-state) → `Building` label (§3b)
  → `Testing` label (§3d.5) → (cleared at PR open, status =
  `Review`, §3e). On the DESIGN_EXPLORATION path: status →
  `Building` (§3-state) → `Designing` (§3-design step 1) →
  `Choose Design` + `design-explored` (§3-design step 4, status
  back to `Todo`). Most label transitions are best-effort, but
  **`design-explored` MUST stick** — it's the structural signal
  §3-route uses to detect "design already done" and skip
  re-exploration. Retry once on failure; surface loudly if it
  can't be written. All other label add/remove failures: log a
  warning and continue.
- **Narrate everything BEFORE you do it.** The principle: a human
  watching only the Planbooq ticket should always know what the
  robot is currently doing and what's coming next. Post a Planbooq
  comment *before* every substantive step — not after, not "when
  the phase finishes". The mandatory pre-comments are:
  - **§3-announce** — a "picked up by /planbooq-team-build" comment
    is the FIRST comment that lands on any active ticket, naming
    the route and reason. Posted *after* §3-state has moved the
    status to `Building` but *before* any other label change or
    long-running operation, so the comment lands against an
    already-correct kanban column.
  - **§3-design step 2** — "design exploration started" comment
    posted before invoking `/team-design`.
  - **§3b** — "team-build started" comment posted before
    invoking `/team-build`.
  - **§3d.5** — "QA capture in progress" comment posted before
    the capture script runs / the report zip is committed.
  - **§3e** — PR-open / escalation / failure comment posted as
    the final phase signal, with the resolved status and any
    Playwright report link.

  Posts are best-effort (a Planbooq API hiccup must not abort the
  build) but expected. If a comment fails to post, log a warning
  and continue — never retry inline (would block the build) and
  never silently skip without logging. **AWAITING_HUMAN is the
  only carve-out:** that path posts nothing and mutates nothing
  (the ticket is already in the column the human needs it in —
  re-commenting on every run would spam the ticket).
- **§3-state runs BEFORE any dispatch skill, no matter which one.**
  The ticket must show `Building` the entire time any work is
  being done on it, so human observers in Planbooq can see
  something is happening. This applies to `/team-build`,
  `/team-design`, or any other dispatch skill — moving the ticket
  is a precondition of dispatch, not something delegated to the
  dispatched skill. §3-state is the single point that does this
  transition; §3b and §3-design no longer re-issue it. If §3-state
  is silently skipped because the skill jumped straight to
  §3-announce or §3a-pre, that's the bug to fix — re-read §3-state
  and run it.
- **One PR per ticket. ONE Skill-tool call to the dispatch skill
  per ticket** (typically `/team-build`; `/team-design` is allowed
  for design-flavored tickets where divergent variants are wanted).
  Never bundle multiple tickets into one PR, branch, worktree, or
  dispatch invocation.
- **Every PR body MUST contain the `Closes Planbooq ticket:` line**
  with the identifier and URL. Verify after team-build returns; edit
  the PR via `gh pr edit` if missing.
- **Verify isolation between tickets.** Snapshot `gh pr list` before
  each call; confirm exactly one new PR with head ref
  `$WORKING_BRANCH` after. Zero or more than one → STOP.
- **APPROVED from `/team-build` is NOT terminal.** When the inner
  skill returns APPROVED, the outer `/planbooq-team-build` MUST
  still run §3d → §3d.5 (commit + push the Playwright report zip
  to the PR branch) → §3e (post APPROVED comment with PR link +
  report URL, transition status → `Review`, PATCH `prUrl`). The
  single most common failure mode of this skill is the outer runner
  treating an APPROVED return as "ticket done" and jumping to the
  next ticket — leaving Planbooq with no APPROVED comment, no
  report link, no status move. The PR exists on GitHub but the
  ticket looks abandoned. **Self-test before writing any closing
  summary**: for the ticket you just dispatched, can you confirm a
  Planbooq comment was posted from §3e AND the ticket's status is
  `Review` (or `Todo` for failures), AND phase labels (`Building`,
  `Testing`) are cleared? If you can't answer "yes" to all three
  with concrete evidence in your conversation history, you skipped
  §3d.5/§3e — STOP and run them now. The §3c post-dispatch
  checklist and the §5 precondition gate exist specifically to
  prevent this.
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
  `Bearer $PLANBOOQ_API_KEY`.** No MCP, no SDK, no scraping the
  web UI. Always check `.ok` on the response envelope before
  reading `.data`.
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
- **§3d.5 is mandatory for any UI-bearing ticket.** Detection is by
  frontend-shaped diff, design label, or UI keywords. The
  Playwright report zip must be located (preferring the project's
  Playwright/Cypress E2E with `video: "on"` via override config,
  falling back to repo `.team-build/capture.sh`, falling back to
  the synthetic Playwright walkthrough), committed to the PR
  branch under `.planbooq-team-build/shots/<identifier>/`, and
  pushed. The §3e comment links it via `raw.githubusercontent.com`.
  If `/team-build` skipped capture under the autonomous push-policy,
  §3d.5 itself runs the capture script — do not waive silently.
  **"No UI surface mutation" is NOT a valid waiver reason** — the
  capture trigger is the §3d.5 detection regex, not the agent's
  judgment about whether the change "feels visual." The only
  acceptable miss is a hard structural failure (no E2E config, dev
  server won't boot after 5min); in that case post
  `_Playwright report not captured: <reason>_` AND a follow-up
  TODO comment naming what setup is needed. Never fabricate an
  image.
