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

`/linear-team-build [task description] [flags]`.

**Positional arg (optional).** If a free-form task description is
passed, **create the ticket on the fly first** (in Todo state, on
`--team`), then proceed with normal queue processing — the new
ticket is included in this run's queue. Use:

```bash
linear issue create \
  --title "<first line of description, ≤80 chars>" \
  --description-file /tmp/ltb-new-$$.md \
  --state Todo \
  ${TEAM:+--team "$TEAM"} \
  ${ASSIGNEE:+--assignee "$ASSIGNEE"} \
  --json
```

The remainder of the description goes in `--description-file`. If
`--team` is unset and the workspace has multiple teams, abort with
a message asking the user to pass `--team`. Echo the new ticket's
identifier and URL before continuing.

Optional flags:
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

### 3-route. Decide the path: design exploration vs. direct build

Before any branch resolution or dispatch, route the ticket. There
are three possible outcomes per ticket; pick the first that matches:

1. **AWAITING_HUMAN** — ticket has the label `Choose Design` (any
   case) **AND does NOT have `design-selected`**. A previous
   `/linear-team-build` run already produced variants and the
   human hasn't signaled a pick yet. Skip this ticket entirely:
   do **not** transition state, do **not** post a comment, do
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
     step 5 once variants have been posted; it survives across
     runs as a structural "this ticket already went through the
     design loop" marker).

   When this path matches, run §3-design and continue the queue —
   do NOT run the §3a-pre…§3f build path for this ticket.

   **Why a label, not a comment marker?** Labels are returned by
   the same `linear issue view --json` call that fetches the
   ticket, so detection is one read. A comment-body marker would
   require a second `comments{nodes{body}}` query and grep — more
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
`ENG-123 → route=DESIGN_EXPLORATION (label "needs-design")`.

### 3-announce. Post a "picked up" comment BEFORE any work

For every ticket whose route is **BUILD** or **DESIGN_EXPLORATION**
(i.e. anything except AWAITING_HUMAN), post a Linear comment
immediately — before §3-design step 1, before §3a-pre, before any
state mutation, before any long-running operation. Stakeholders
watching the ticket in Linear should see "the robot is on it" the
moment we commit to doing real work, not 5 minutes later when the
first phase comment lands.

```markdown
### 🤖 picked up by /linear-team-build

- **Route:** `$ROUTE` (`DESIGN_EXPLORATION` → variants first, then human picks; `BUILD` → straight to /team-build)
- **Why this route:** $ROUTE_REASON   <!-- e.g. "label `needs-design`", "keyword `modal` in title", "design-selected label present, going straight to build" -->
- **Position in queue:** $POS / $TOTAL

Next steps I'll narrate as I go — every state change, label change,
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

Linear labels are managed via the `linear` CLI when supported, else
via `linear api`. The CLI's `issue update` accepts `--label <name>`
to add and `--remove-label <name>` to drop, but flag names vary by
version — if `linear issue update --help` doesn't list them, fall
back to `linear api` with `issueUpdate { labelIds }` after fetching
the team's label list (`team(id:$key){ labels{ nodes{ id name } } }`),
creating the label via `issueLabelCreate` if it doesn't exist on
the team yet, and writing the merged `labelIds` set. Labels created
by this skill: `Designing`, `Choose Design`, `design-explored`,
`design-selected`, `Building`, `Testing`. Label add/remove is
best-effort — log a warning on failure and continue; never block
dispatch on a label mutation.

**Exception to "best-effort":** `design-explored` MUST stick. If
adding it in §3-design step 5 fails, retry once via the `linear
api` fallback before giving up. Without it, the next run can't tell
the ticket already went through the design loop and will route it
back through `/linear-design` — wasted variants, duplicate noise on
the ticket. If both attempts fail, surface a loud warning in the
final summary and append a `_design-explored label could not be
written — manual cleanup required_` line to the "variants ready"
comment so the human knows.

### 3-design. Design exploration path (route = DESIGN_EXPLORATION)

The ticket needs divergent variants before anyone writes code. We
hand it to `/linear-design` (which wraps `/team-design`), let it
post variant screenshots back to the ticket, then return the
ticket to **Todo** with `Choose Design` + `design-explored` labels
so a human can pick. The next `/linear-team-build` run will see
the `design-explored` label (or `design-selected` once the human
picks) and skip straight to BUILD.

1. **Move state → In Progress** (same logic as §3b — resolve the
   team's actual `started`-type "In Progress"-flavored state; never
   blind-pass `--state "In Progress"`).
2. **Add label `Designing`.** Remove `needs-design` if present.
3. **Post the "starting design" comment** via `--body-file`:
   ```markdown
   ### 🎨 design exploration started

   Routing through `/linear-design` because this ticket looks
   design-flavored (UI label or UX keywords in title/description).

   - `/linear-design --existing $IDENT` is producing N divergent
     variants in parallel via `/team-design`.
   - Each variant will land as its own comment on this ticket
     with screenshots and a per-variant git branch
     (`team-design/<slug>-<variant>`).
   - When done, I'll move this ticket back to **Todo** with the
     **`Choose Design`** label. Pick a variant by leaving a
     comment, then add the **`design-selected`** label (or just
     remove `Choose Design`) and re-run `/linear-team-build` —
     the next run will skip design and go straight to
     `/team-build` with the chosen direction in context.
   ```
4. **Hydrate description images first**, then **invoke
   `/linear-design`**:
   - Run §3a-img inline (same recipe, same auth-token download
     loop, same 8-image cap) to populate `/tmp/ltb-img-$IDENT-N.<ext>`.
     §3a-img is documented later in the BUILD path but the recipe
     is path-agnostic — it only needs `$IDENT`, `$DESCRIPTION`,
     and the issue JSON, all of which are available here.
   - Build a `--reference` flag list from the manifest:
     ```bash
     REF_ARGS=()
     while IFS=$'  ' read -r local_path orig_url; do
       REF_ARGS+=(--reference "$local_path")
     done < /tmp/ltb-img-$IDENT-manifest.txt 2>/dev/null
     ```
     If hydration produced no files, `REF_ARGS` is empty — that's
     fine, `/linear-design` handles zero references.
   - Make exactly one Skill-tool call to `/linear-design`. Pass
     `--existing $IDENT` so it attaches to this ticket (don't
     create a duplicate), `--variants 4` (unless the description
     specifies a count), the `REF_ARGS`, and the ticket title +
     description as the brief. Without `--reference`, the variant
     teams design blind — every hydrated image must be forwarded.
5. **After it returns** (success path only — failure handling at
   the end of §3-design):
   - **Add label `design-explored`** (per the label helper's
     exception clause: this label MUST stick — retry once on
     failure, surface loudly if it can't be written).
   - Remove label `Designing`. Add label `Choose Design`.
   - Move state → **Todo**. Resolve explicitly:
     ```bash
     TODO_STATE=$(echo "$STATES_JSON" \
       | jq -r '[.data.team.states.nodes[]
                 | select(.type=="unstarted")
                 | select(.name | test("^(Todo|To Do)$"; "i"))]
                 | .[0].name // empty')
     ```
     If empty, **abort the state transition with a loud warning
     and post a follow-up comment**: `"⚠️ Could not return ticket
     to Todo — team has no Todo-flavored unstarted state. Manual
     move required."` Do NOT fuzzy-match into Backlog,
     Triage, or any other unstarted state — §2's queue filter
     keys on `state.name == "Todo"`, so a misnamed fallback would
     silently strand the ticket out of the next run's queue.
   - Post the "variants ready" comment via `--body-file`:
     ```markdown
     ### 🎨 variants ready — please pick one

     `/linear-design` finished. Each variant is a comment above
     this one with screenshots and a per-variant git branch
     (`team-design/<slug>-<variant>`) you can check out locally
     to compare.

     **To proceed:**
     1. Decide which variant to ship.
     2. Either add the **`design-selected`** label, or remove
        the **`Choose Design`** label (either signals "pick
        recorded" — both work).
     3. Re-run `/linear-team-build` — this ticket will route
        straight to `/team-build` and the build team will see
        the chosen direction in the comment history above.

     The `design-explored` label on this ticket is the structural
     marker that prevents the next run from re-routing through
     `/linear-design` — leave it attached.
     ```
6. Record verdict `DESIGN_HANDOFF` in the results table. Note the
   per-variant `team-design/...` branches in the row's "Next step"
   cell so they appear in §5's summary. Continue to the next
   ticket. Do NOT run §3a-pre…§3f for this ticket.

**Final consistency sweep at the end of §3-design** (success path):
re-fetch the ticket and confirm the label set matches expectations
(`design-explored` ✓, `Choose Design` ✓, `Designing` ✗, state =
`Todo`). If any label or state is inconsistent (e.g., `Designing`
still attached because removal failed earlier), retry the failing
mutation once. This catches the partial-failure case where step 5
half-completed.

**Failure path:** If `/linear-design` itself escalates or fails,
treat it like a BUILD failure: comment the blocker, move state
back to **Todo** (using the same explicit Todo-only resolution as
above), remove `Designing`, do NOT add `Choose Design` or
`design-explored` (nothing to choose, didn't actually explore),
record verdict `DESIGN_FAILED`.

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

### 3a-img. Hydrate description images so the team can actually see them

Linear stores embedded images as `![alt](https://uploads.linear.app/...)`
URLs in `description` and as entries under `attachments.nodes[]`. These
URLs are **auth-gated** — passing the URL through as text gives the
Team Lead nothing useful. Fetch the bytes locally so Claude's `Read`
tool can vision them.

**Pre-step comment (only when images were detected — count > 0):**
post a brief comment to Linear *before* the download loop runs, so the
human knows what's happening and isn't left staring at a quiet ticket
while curl chews through several MB:

```markdown
### 📥 fetching reference images

Found $N image(s) in the description / attachments. Downloading them
locally so the build team can actually see what was attached (Linear's
`uploads.linear.app` URLs are auth-gated; the agent can't render them
in-place). I'll start work as soon as this finishes.
```

If $N is 0, skip the comment (and skip §3a-img entirely).

1. **Get the auth token.** `linear auth token` prints the OAuth token
   for the default workspace (or the one passed via `--workspace`):
   ```bash
   LINEAR_TOKEN=$(linear auth token --workspace "$WORKSPACE" 2>/dev/null \
     || linear auth token 2>/dev/null)
   ```
   If empty, log a warning, skip image hydration, and continue —
   never block the build on a missing token.
2. **Extract URLs.** Two sources, dedup the union:
   - From `$DESCRIPTION`: every `https://uploads.linear.app/...` URL
     inside `![…](…)` markdown image syntax.
     ```bash
     IMG_URLS=$(printf '%s' "$DESCRIPTION" \
       | grep -oE '!\[[^]]*\]\(https://uploads\.linear\.app/[^)]+\)' \
       | grep -oE 'https://uploads\.linear\.app/[^)]+')
     ```
   - From the issue JSON's `attachments.nodes[].url` entries whose URL
     host is `uploads.linear.app` OR whose `metadata.contentType`
     starts with `image/`.
3. **Download.** For each URL, `curl -fsSL -H "Authorization:
   $LINEAR_TOKEN" -o /tmp/ltb-img-$IDENT-<n>.<ext>` where `<ext>` is
   guessed from the `Content-Type` response header (default `.png`).
   NOTE: `uploads.linear.app` requires the raw token with **no `Bearer`
   prefix** — using `Bearer` returns 401. This differs from the GraphQL
   API endpoint, which does accept `Bearer`.
   On 4xx/5xx, log the failure for that URL and continue with the
   rest — partial coverage beats none. Cap at 8 images per ticket to
   keep the prompt manageable.
4. **Record a manifest.** Write `/tmp/ltb-img-$IDENT-manifest.txt`
   with one line per successful download: `<local-path>  <original-url>`.
   This lets the Team Lead correlate the downloaded file with the
   reference in `$DESCRIPTION`.

Pass the resulting `IMAGES_BLOCK` into the §3a prompt body — see the
`Reference images` section in the template.

### 3a. Build the team-build invocation

Hand `/team-build` exactly this prompt body (one ticket only):

```
[Linear $IDENT] $TITLE

Source: $URL
Priority: $PRIORITY  Assignee: $ASSIGNEE  Labels: $LABELS

$DESCRIPTION

$IMAGES_BLOCK
# When images were hydrated in §3a-img, $IMAGES_BLOCK expands to:
#
# ---
# Reference images (downloaded from the Linear ticket — Read these
# files with the Read tool before designing the change; they are
# what the requester actually showed):
# - /tmp/ltb-img-$IDENT-1.png  (originally: <linear-upload-url>)
# - /tmp/ltb-img-$IDENT-2.png  (originally: <linear-upload-url>)
# ...
#
# When no images were attached or hydration failed, $IMAGES_BLOCK is
# empty (no header line).

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
- **Evidence capture is NOT skipped.** The push-policy override only
  waives the typed-`yes` gate and the APPROVED-loop. You MUST still
  execute the §5a capture script inline (Playwright/Cypress E2E with
  `video: "on"` if configured, else the synthetic walkthrough) for
  any UI-bearing diff and commit the resulting
  `$WT_PATH/.team-build/evidence/` directory before pushing. If
  capture fails (no E2E config AND synthetic boot fails), surface the
  reason in the PR body and the §3e Linear comment as
  `_Walkthrough not captured: <reason>_` — never silently omit it.
  Linear-team-build's §3d.5 step depends on these artifacts existing
  on disk.
```

Slug for the worktree path: `$IDENT` lowercased (e.g. `eng-123`).
`/team-build` adds its own timestamp suffix to the worktree directory
even when `--working-branch` overrides the branch name.

### 3b. Move the ticket to "In Progress" + post a "starting" comment

Before launching, transition the ticket. **Resolve the target state
explicitly — never pass `--state "In Progress"` blindly.** The CLI
fuzzy-matches and on a team without an exact "In Progress" can land
in something downstream like "In Review" or worse. Mirror the §3e
pattern, scoped to the `started` type group:

```bash
TEAM_KEY=$(linear issue view "$IDENT" --json | jq -r '.team.key')
STATES_JSON=$(linear api '
  query($key:String!){ team(id:$key){ states{ nodes{ id name type } } } }
' --variables "$(jq -nc --arg key "$TEAM_KEY" '{key:$key}')")

# Pick the first In-Progress-flavored started state. NEVER cross into
# `completed` (Done, Ready for Deployment, Shipped) or `unstarted`.
PROGRESS_STATE=$(echo "$STATES_JSON" \
  | jq -r '[.data.team.states.nodes[]
            | select(.type=="started")
            | select(.name | test("^(In Progress|Building|In Development|Started|Doing)$"; "i"))]
            | .[0].name // empty')

if [ -n "$PROGRESS_STATE" ]; then
  linear issue update "$IDENT" --state "$PROGRESS_STATE" \
    || echo "warning: failed to move $IDENT to $PROGRESS_STATE; continuing"
else
  echo "warning: team $TEAM_KEY has no In-Progress-style started state; leaving $IDENT in Todo"
fi
```

The `select(.type=="started")` filter is load-bearing — it prevents
the CLI from ever fuzzy-matching into a `completed` or `unstarted`
state. On any failure, log a warning and continue — do not block the
build on Linear state.

Then **add the `Building` label** (best-effort, per the label
helper). If the route was DESIGN_EXPLORATION → BUILD on this
re-run, the ticket may also carry `design-selected` and/or
`Choose Design` — leave `design-selected` in place (it's a
historical record) and remove `Choose Design` if it's still
present (the human signaled by re-running this skill).

Then post a status comment so non-terminal stakeholders can follow
along. Write to a temp file and use `--body-file`:

```markdown
### 🛠️ team-build started

- **Label:** `Building`
- **Working branch:** `$WORKING_BRANCH`
- **Target (PR base):** `$RESOLVED`
- **Worktree slug:** `$IDENT_LOWER`
- **Mode:** `/team-build` (plan → parallel specialist build → security audit → QA + code review, looping until clean)
- **Clean-code bar:** reuse existing patterns, minimal diff, no dead code/TODOs/console.logs.

Next stops: `Testing` label during QA capture, then PR open + state → `In Review`.
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

> ## ⛔ STOP — post-dispatch checklist (read every time `/team-build` returns)
>
> The single most common failure mode of this skill is the outer
> runner treating an APPROVED return as "ticket done" and writing a
> closing summary right here. **APPROVED from `/team-build` means
> "build shipped, now publish the result back to Linear" — not "we're
> done."** The inner skill's APPROVED applies to *its* contract; the
> outer ticket isn't closed until §3d → §3d.5 → §3e have all run.
>
> Before writing ANY user-facing text after `/team-build` returns,
> mentally tick this checklist for the ticket you just dispatched:
>
> 1. [ ] §3c isolation check ran (`gh pr list` shows exactly one new
>        PR with the right head ref).
> 2. [ ] §3d outcome captured (PR URL, PR number, branch, worktree,
>        verdict, rounds, `$ISSUE_ID`, `$TEAM_ID`).
> 3. [ ] §3d.5 ran for any UI-bearing diff: artifacts located OR
>        captured inline, then uploaded to Linear via `fileUpload`
>        (asset URLs recorded). For non-UI diffs, explicitly noted
>        "no UI surface" instead of skipping silently.
> 4. [ ] §3e Linear comment posted (URL captured) AND state
>        transitioned (`In Review` for APPROVED, `Todo` for
>        ESCALATED/FAILED). Phase labels (`Building`, `Testing`)
>        cleaned up.
>
> If ANY box is unticked, you are not allowed to:
> - Move to the next ticket in the queue.
> - Write the §5 final summary.
> - Write any "## /team-build — APPROVED" / "wrap up" message.
>
> Do the missing step first, then resume. Writing a closing summary
> with unticked boxes is the bug this checklist exists to prevent.
> Past failures: an APPROVED build whose Linear ticket got no comment,
> no screenshots, and stayed stuck in "In Progress" because the outer
> runner jumped straight to summary. Don't be that run.

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

### 3d.5. Visual asset reuse (UX/design tickets only)

**Before locating/capturing, swap labels: remove `Building`, add
`Testing`** (best-effort, per the label helper). Post a one-line
comment so observers see the phase change:

```markdown
### 🧪 QA capture in progress

Build round complete. Capturing walkthrough video + screenshots for
the PR description and this ticket. Label moved `Building` → `Testing`.
```

**Capture happens during QA in `/team-build` §5a.** This section
locates the artifacts that QA produced and uploads them to Linear.
If they aren't on disk (autonomous push-policy mode skipped capture,
or capture genuinely failed), this section runs the §5a capture
script itself before uploading — UI tickets without a walkthrough
are not acceptable.

Runs when **any** of: ticket touches the UI (per detection rules
below), verdict is APPROVED, or verdict is ESCALATED but a PR was
opened. The only skip condition is "no UI surface in the diff."

**Detection (any one fires):**
1. The PR diff contains frontend-shaped files (`gh pr diff "$PR_NUMBER" --name-only`
   matching `\.(tsx|jsx|vue|svelte|astro|html|css|scss|sass|less|stylus)$` or
   `/(components|pages|app|views|routes|styles|public)/`).
2. The Linear ticket has a label matching `^(ui|ux|design|frontend|web|mobile)$`
   (case-insensitive).
3. Title/description contains any of: `UI`, `UX`, design, layout, style,
   visual, page, screen, component, button, form, modal, theme,
   responsive, dark mode (case-insensitive whole-word).

If none fire → skip §3d.5, proceed to §3e with no assets.

**Locate artifacts:**
```bash
EVID="$WT/.team-build/evidence"
VIDEO="$EVID/00-walkthrough.webm"   # or .mp4 if produced by Cypress
[ -f "$EVID/00-walkthrough.mp4" ] && VIDEO="$EVID/00-walkthrough.mp4"
# Step screenshots (from Playwright test run) or synthetic-fallback shots.
PNGS=( "$EVID"/01-step.png "$EVID"/02-step.png "$EVID"/03-step.png \
       "$EVID"/01-desktop.png "$EVID"/02-mobile.png "$EVID"/03-state.png )
# Filter to existing files only.
# When uploading, set $CT by extension: video/webm, video/mp4,
# image/png, application/zip.
REPORT_ZIP="$EVID/playwright-report.zip"   # full Playwright HTML report
# The zip is uploaded to Linear as a download attachment (Linear can't
# render multi-file HTML bundles inline). Reviewers download, unzip,
# and run `npx playwright show-report <unzipped-dir>`.
```

If `$WT` was cleaned by `/team-build` §6a, re-create a read-only
worktree at `$WORKING_BRANCH` to access the committed evidence
(`docs(team-build): add visual evidence for <slug>` commit). The
artifacts are committed to the branch by §5.5, so they're guaranteed
to exist on disk if §5a succeeded.

**If artifacts are missing — run capture here, do not skip.**

When `$WEBM` and all `$PNGS` are missing, do NOT silently waive.
The autonomous push-policy block in §3a explicitly forbids skipping
capture, so missing artifacts mean either /team-build skipped §5a
(bug — surface it) or the worktree was already cleaned. Recover:

1. **Re-materialize the worktree if needed.** If `$WT` no longer
   exists (cleaned by /team-build §6a after PR open), create a
   read-only worktree at `$WORKING_BRANCH`:
   ```bash
   SHOT_WT="$(dirname $REPO_ROOT)/$REPO_NAME.ltb-evidence-$IDENT_LOWER-$$"
   git -C "$REPO_ROOT" worktree add --detach "$SHOT_WT" "origin/$WORKING_BRANCH"
   WT="$SHOT_WT"  # rebind for the rest of §3d.5
   ```
   If §5.5 already committed evidence to the branch, it'll appear
   under `$WT/.team-build/evidence/` and you can skip to upload.
2. **Run the §5a capture script inline from this skill.** Read
   `/team-build` §5a, follow its capture-resolution order
   (Playwright with override config → Cypress → repo
   `.team-build/capture.sh` → `package.json` `team-build.capture` →
   `pnpm install && pnpm db:migrate && pnpm db:seed && pnpm dev` +
   synthetic walkthrough). Use the same `$EVID` path. Cap total
   capture time at 5 minutes; on hard timeout, give up and proceed
   to step 3.
3. **If still nothing:** post the §3e comment with
   `_Walkthrough not captured: <one-line reason>_` AND open a
   follow-up TODO comment on the Linear ticket explaining what
   needs to be set up (Playwright config? `.team-build/capture.sh`?)
   so the next run captures cleanly. This is the only path that
   ships UI work without a walkthrough — and it must be loud.

Some assets missing (e.g. `.webm` exists but PNGs don't, or vice
versa) → upload what exists. Do not re-run capture for partial
results.

Clean up the temp worktree at the end of §3d.5 if step 1 created
one: `git worktree remove --force "$SHOT_WT"`.

**Upload to Linear** (mirrors `/linear-design` §4a). For each asset
(`.webm` first if present, else the PNGs in numeric order), set
`$CT` to `video/webm` for the walkthrough or `image/png` for stills:
```bash
SIZE=$(wc -c < "$SHOT")
NAME=$(basename "$SHOT")
RESP=$(linear api '
mutation($filename:String!,$contentType:String!,$size:Int!){
  fileUpload(filename:$filename, contentType:$contentType, size:$size, makePublic:false){
    success
    uploadFile { uploadUrl assetUrl headers { key value } }
  }
}' --variables "$(jq -n --arg f "$NAME" --arg ct "$CT" --argjson s "$SIZE" \
    '{filename:$f, contentType:$ct, size:$s}')")
UPLOAD_URL=$(echo "$RESP" | jq -r '.data.fileUpload.uploadFile.uploadUrl')
ASSET_URL=$(echo "$RESP"  | jq -r '.data.fileUpload.uploadFile.assetUrl')
HDR_ARGS=(-H "Content-Type: $CT"); while IFS= read -r row; do
  HDR_ARGS+=(-H "$(jq -r '.key' <<<"$row"): $(jq -r '.value' <<<"$row")")
done < <(echo "$RESP" | jq -c '.data.fileUpload.uploadFile.headers[]')
curl -sS -X PUT "$UPLOAD_URL" "${HDR_ARGS[@]}" --data-binary "@$SHOT"
```

> **`Content-Type: $CT` MUST be the first `-H` arg.** Linear's
> `fileUpload` mutation signs the GCS PUT URL against the exact
> `contentType` you passed in (`image/png`, `video/webm`,
> `application/zip`). If you omit the header, curl auto-sets
> `application/x-www-form-urlencoded` (because `--data-binary` is a
> body upload), GCS sees the mismatch against the signed URL, and
> rejects with **403 SignatureDoesNotMatch** — silently, since we
> don't `--fail` here. The `headers[]` array Linear returns does
> NOT include `Content-Type` — you must add it yourself. Observed
> in production: an APPROVED ticket whose screenshot upload 403'd
> and the missing image was only noticed when the human opened the
> Linear ticket and saw a broken `![](…)` reference.
Record each `$ASSET_URL`. If `success:false` or curl is non-2xx for a
shot, drop just that shot and continue — never block §3e on an upload
failure.

If you re-created a read-only worktree to access committed evidence,
clean it up (`git worktree remove --force "$SHOT_WT"`) before
returning to §3e.

### 3e. Update Linear

Use the CLI for both the comment and the state transition. Always
write the comment body to a temp file and pass `--body-file` so
multi-line markdown survives shell quoting.

- **APPROVED + PR opened:**
  **First, clean up phase labels** (best-effort): remove `Testing`
  and remove `Building` if it's still attached. Do not add a new
  phase label here — the workflow state (`In Review`, set below)
  is the signal for this stage.
  ```bash
  linear issue comment add "$IDENT" --body-file /tmp/dda-comment-$IDENT.md
  ```
  **State transition — must land on "In Review", never anything
  downstream of human review.** Do NOT pass `--state "In Review"`
  blindly; the CLI fuzzy-matches and has been observed landing on
  `"Ready for Deployment"` or other post-review states when the team
  lacks an exact `"In Review"`. That's wrong — `Ready for Deployment`
  is a *human* signal that a reviewer approved the PR, not a robot
  signal that a PR exists. Resolve explicitly:

  ```bash
  # Pull the team's actual state list (states are team-scoped).
  TEAM_KEY=$(linear issue view "$IDENT" --json | jq -r '.team.key')
  STATES_JSON=$(linear api '
    query($key:String!){ team(id:$key){ states{ nodes{ id name type } } } }
  ' --variables "$(jq -nc --arg key "$TEAM_KEY" '{key:$key}')")

  # Pick the first match in priority order from the `started` group only —
  # never cross into `completed` (Done, Ready for Deployment, Shipped, Merged).
  TARGET_STATE=$(echo "$STATES_JSON" \
    | jq -r '[.data.team.states.nodes[]
              | select(.type=="started")
              | select(.name | test("^(In Review|Code Review|Reviewing|PR Review)$"; "i"))]
              | .[0].name // empty')

  if [ -n "$TARGET_STATE" ]; then
    linear issue update "$IDENT" --state "$TARGET_STATE"
  else
    # No review-flavored started state exists. Stay in "In Progress" and
    # surface it — DO NOT fall through to a completed-type state.
    echo "Linear team $TEAM_KEY has no In-Review-style state; leaving $IDENT in In Progress."
  fi
  ```

  The `select(.type=="started")` filter is the load-bearing line: it
  prevents the script from ever picking `Ready for Deployment`,
  `Shipped`, `Done`, or any other `completed`-type state, regardless
  of how the team named it. Robots only move tickets through
  `unstarted → started`; humans move them out of `started`.
  Comment body: the PR URL plus a one-line summary. **If §3d.5
  produced uploaded assets, append a `### Walkthrough` section.** If a
  `.webm` or `.mp4` walkthrough was uploaded, embed it first as
  `![walkthrough]($ASSET_URL)` (Linear renders both inline as a player).
  Then list any step / still PNGs as `![<label>]($ASSET_URL)` in
  capture order. Video-only / stills-only / any combination is fine.
  If `playwright-report.zip` was uploaded, append:
  `[Full Playwright report (zip)]($ASSET_URL)` — reviewers download,
  unzip, and run `npx playwright show-report <dir>` for every spec's
  video, trace, and screenshot. If §3d.5 ran but captured nothing, append
  a single line `_Walkthrough not captured: <reason>_`. If §3d.5 was
  skipped (not a UX/design ticket), omit the section entirely.
- **ESCALATED or FAILED:**
  Remove `Testing` and `Building` labels first (best-effort).
  ```bash
  linear issue comment add "$IDENT" --body-file /tmp/dda-comment-$IDENT.md
  linear issue update  "$IDENT" --state "Todo"
  ```
  Comment body: blocker summary, worktree path, and remediation notes.
  Never mark done.

If no review-flavored `started` state exists on the team (per the
APPROVED block above), leave the ticket in "In Progress" and note
it in the results table. Never let the ticket land in a
`completed`-type state from this skill — that's a human's call.

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

> **Precondition gate — do not write this section yet if any row is
> incomplete.** Before producing the summary, walk every ticket row in
> your head and confirm BOTH of these hold for each one:
>
> - The "PR / Next step" cell contains a real GitHub PR URL (for
>   APPROVED) or an explicit non-URL reason (for ESCALATED / FAILED /
>   DESIGN_HANDOFF / AWAITING_HUMAN / SKIPPED / DESIGN_FAILED).
> - A Linear comment URL exists in your captured §3e output for that
>   ticket (the `linear issue comment add` call printed
>   `https://linear.app/.../comment-XXXXX`). If you can't point to
>   that URL right now, §3e didn't run for that ticket.
>
> If either is missing for any row, STOP and finish §3d.5 + §3e for
> the offending ticket(s) FIRST, then come back and write the summary.
> A summary written with missing Linear comments is the same bug as
> "skipping §3e because /team-build returned APPROVED" — the §3c
> post-dispatch checklist exists to prevent it; this gate is the
> backstop.

```
## /linear-team-build — summary
Processed: N tickets

| Ticket   | Verdict          | PR / Next step                                | Linear comment | Rounds |
|----------|------------------|-----------------------------------------------|----------------|--------|
| ENG-123  | APPROVED         | https://github.com/.../pull/45                | linear.app/.../comment-abc123 | 1      |
| ENG-130  | ESCALATED        | (no PR — see worktree)                        | linear.app/.../comment-def456 | 3      |
| ENG-141  | DESIGN_HANDOFF   | label `Choose Design` — pick variant          | linear.app/.../comment-ghi789 | —      |
| ENG-142  | AWAITING_HUMAN   | already in `Choose Design` — skipped          | (none — §3-route skip) | —      |
| ENG-150  | DESIGN_FAILED    | /linear-design errored — see ticket comment   | linear.app/.../comment-jkl012 | —      |

Worktrees still on disk:
- ESCALATED/FAILED build worktrees (APPROVED are auto-cleaned by /team-build §6a):
  - /path/to/repo.team-build-eng-130-...  (ENG-130, escalated)
- DESIGN_HANDOFF variant worktrees (left intentionally so the human can
  diff/check out variants before picking — clean up after the pick):
  - /path/to/repo.team-design-eng-141-variant-a/  branch `team-design/eng-141-variant-a`
  - /path/to/repo.team-design-eng-141-variant-b/  branch `team-design/eng-141-variant-b`
  - …

Linear updates posted: <count>
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
  determines whether this ticket goes through `/linear-design`
  (DESIGN_EXPLORATION), is skipped entirely (AWAITING_HUMAN), or
  proceeds through the normal `/team-build` path (BUILD). Never
  dispatch `/team-build` against a ticket carrying the
  `Choose Design` label — that ticket is waiting on a human and
  must be left untouched.
- **Phase labels mirror the workflow.** During a single
  `/linear-team-build` run, a ticket on the BUILD path moves
  through: (start) → `Building` (§3b) → `Testing` (§3d.5) →
  (cleared at PR open, state = `In Review`, §3e). On the
  DESIGN_EXPLORATION path: (start) → `Designing` (§3-design step
  2) → `Choose Design` + `design-explored` (§3-design step 5,
  state back to `Todo`). Most label transitions are best-effort,
  but **`design-explored` MUST stick** — it's the structural
  signal §3-route uses to detect "design already done" and skip
  re-exploration. Retry once on failure; surface loudly if it
  can't be written. All other label add/remove failures: log a
  warning and continue.
- **Narrate everything BEFORE you do it.** The principle: a human
  watching only the Linear ticket should always know what the
  robot is currently doing and what's coming next. Post a Linear
  comment *before* every substantive step — not after, not "when
  the phase finishes". The mandatory pre-comments are:
  - **§3-announce** — a "picked up by /linear-team-build" comment
    is the FIRST thing that lands on any active ticket, naming
    the route and reason. Posted before any state/label change.
  - **§3a-img** — a "fetching reference images" comment when the
    description contains auth-gated `uploads.linear.app` images,
    posted before the download loop.
  - **§3-design step 3** — "design exploration started" comment
    posted before invoking `/linear-design`.
  - **§3b** — "team-build started" comment posted before
    invoking `/team-build`.
  - **§3d.5** — "QA capture in progress" comment posted before
    the capture script runs.
  - **§3e** — PR-open / escalation / failure comment posted as
    the final phase signal, with the resolved state and any
    walkthrough/screenshot embeds.

  Posts are best-effort (a Linear API hiccup must not abort the
  build) but expected. If a comment fails to post, log a warning
  and continue — never retry inline (would block the build) and
  never silently skip without logging. **AWAITING_HUMAN is the
  only carve-out:** that path posts nothing and mutates nothing
  (the ticket is already in the state the human needs it in —
  re-commenting on every run would spam the ticket).
  Silent gaps between these comments are bugs — when in doubt,
  add another pre-step comment rather than fewer.
- **§3b runs BEFORE any dispatch skill, no matter which one.** The
  ticket must show "In Progress" (or the team's equivalent
  `started`-type state) the entire time the build is running, so
  human observers in Linear can see something is happening. This
  applies to `/team-build`, `/team-design`, or any other dispatch
  skill — moving the ticket is a precondition of dispatch, not
  something delegated to the dispatched skill. If §3b is silently
  skipped because the skill jumped straight to dispatch, that's the
  bug to fix — re-read §3b and run it.
- **One PR per ticket. ONE Skill-tool call to the dispatch skill
  per ticket** (typically `/team-build`; `/team-design` is allowed
  for design-flavored tickets where divergent variants are wanted).
  Never bundle multiple tickets into one PR, branch, worktree, or
  dispatch invocation.
- **Verify isolation between tickets.** Snapshot `gh pr list` before
  each call; confirm exactly one new PR with head ref
  `team-build/<ticket-slug>-*` after. Zero or more than one → STOP.
- **APPROVED from `/team-build` is NOT terminal.** When the inner
  skill returns APPROVED, the outer `/linear-team-build` MUST still
  run §3d → §3d.5 (upload screenshots/walkthrough to Linear) → §3e
  (post APPROVED comment with PR link + assets, transition state →
  In Review). The single most common failure mode of this skill is
  the outer runner treating an APPROVED return as "ticket done" and
  jumping to the next ticket — leaving Linear with no APPROVED
  comment, no screenshots, no state move. The PR exists on GitHub
  but the ticket looks abandoned. **Self-test before writing any
  closing summary**: for the ticket you just dispatched, can you
  paste the Linear comment URL from §3e (`linear.app/.../comment-...`)
  AND confirm the ticket's state is `In Review` (or `Todo` for
  failures), AND confirm phase labels (`Building`, `Testing`) are
  cleared? If you can't answer "yes" to all three with concrete
  evidence in your conversation history, you skipped §3d.5/§3e —
  STOP and run them now. The §3c post-dispatch checklist and the §5
  precondition gate exist specifically to prevent this; if you find
  yourself bypassing both, that's the bug to fix.
- **Linear `fileUpload` PUT requires explicit `Content-Type: $CT`.**
  The signed GCS URL is bound to the exact `contentType` argument
  passed to the `fileUpload` mutation. The `headers[]` array Linear
  returns does NOT include `Content-Type`. Without an explicit
  `-H "Content-Type: $CT"`, curl auto-sets
  `application/x-www-form-urlencoded` (because `--data-binary` is
  a body upload), GCS rejects with **403 SignatureDoesNotMatch**,
  and the upload silently fails. Always prepend
  `-H "Content-Type: $CT"` as the FIRST header arg in §3d.5.
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
- **§3d.5 is mandatory for any UI-bearing ticket.** Detection is by
  frontend-shaped diff, design label, or UI keywords. The
  walkthrough+stills must be captured (preferring the project's
  Playwright/Cypress E2E with `video: "on"` via override config,
  falling back to repo `.team-build/capture.sh`, falling back to the
  synthetic Playwright walkthrough) and uploaded via Linear's
  `fileUpload` mutation. If `/team-build` skipped capture under the
  autonomous push-policy, §3d.5 itself runs the capture script — do
  not waive silently. The only acceptable miss is a hard structural
  failure (no E2E config, dev server won't boot after 5min); in that
  case post `_Walkthrough not captured: <reason>_` AND a follow-up
  TODO comment naming what setup is needed. Never fabricate an image.
