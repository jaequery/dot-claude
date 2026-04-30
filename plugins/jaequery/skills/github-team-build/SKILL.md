---
name: github-team-build
description: >
  Pull every issue in the "Todo" column of a GitHub Project (v2)
  kanban board, then run /team-build on each issue independently —
  one isolated worktree, one branch, one PR per issue. No giant
  monolithic PR. Auto-creates the project + status options if they
  don't exist. Each build is instructed to keep code simple, avoid
  redundancy, and meet a clean-code bar. Use when the user says
  "/github-team-build", "burn down my github project", "ship every
  github todo", "team-build my github board", or wants to
  autonomously work through a GitHub Projects v2 backlog with one
  clean PR per issue.
---

# /github-team-build — Burn down a GitHub Projects v2 "Todo" column, one clean PR per issue

You are a backlog runner. For every issue in the **Todo** status of
the configured GitHub Project (v2), you launch `/team-build` against
that issue's body and ship a **separate PR** per issue. Never bundle
multiple issues into one PR. Every build must meet the clean-code
bar in §3a. The PR is auto-linked to the issue via a `Closes #<n>`
reference so merge closes the issue cleanly. State transitions are
written to the project's native Status field — not labels.

## 0. Inputs

`/github-team-build [task description] [flags]`.

**Positional arg (optional).** If a free-form task description is
passed, **create the issue on the fly first**, add it to the
project, set its Status to `Todo`, then proceed with normal queue
processing — the new issue is included in this run's queue. Use:

```bash
NEW_URL=$(gh issue create \
  --repo "$REPO" \
  --title "<first line of description, ≤80 chars>" \
  --body-file /tmp/gtb-new-$$.md \
  ${ASSIGNEE:+--assignee "$ASSIGNEE"})
NEW_ITEM_ID=$(gh project item-add "$PROJECT_NUMBER" \
  --owner "$OWNER" --url "$NEW_URL" --format json | jq -r .id)
gh project item-edit \
  --id "$NEW_ITEM_ID" \
  --project-id "$PROJECT_ID" \
  --field-id "$STATUS_FIELD_ID" \
  --single-select-option-id "$OPT_TODO"
```

The full description (everything after the first line) goes in
`--body-file`. Echo the new issue number and URL before continuing.
This requires the project + Status field to be resolved, so on-the-fly
creation runs **after** §1 preflight, before §2 fetch.

Optional flags:
- `--repo <owner/name>` — target repo. Default: the current
  directory's `gh repo view --json nameWithOwner`.
- `--project <number|title>` — project to read from. Accepts a
  numeric project number or a title (case-insensitive). Default:
  resolve the **first project linked to `--repo`**; if none exists,
  auto-create one titled `<repo-name>` (e.g. for `myorg/myapp`,
  the project title is `myapp`) and link it.
- `--owner <login>` — owner of the project (user or org). Default:
  the owner segment of `--repo`.
- `--assignee <@me|login>` — filter to one assignee. Default: any.
- `--limit <n>` — cap how many issues to process this run. Default: 10.
- `--target <branch>` — base branch for PRs. Default: repo's default
  branch (`gh repo view --json defaultBranchRef`).
- `--parallel <n>` — process N issues concurrently. **Default: 1
  (sequential).** Pass an explicit number to parallelize. Warn if
  effective concurrency exceeds 5 (shared `gh` rate limits) but do
  not cap.
- `--dry-run` — list issues that would be processed and stop.

**No confirmation prompt. Ever.** If invoked with no flags, just
start — defaults are: open issues in the **Todo** status of the
default project for the current repo, up to 10, sequential, base =
repo default branch, default clean-code bar. Print the resolved
settings + issue queue, then **immediately proceed to §1 preflight
and §2 issue processing in the same response, without asking the
user "proceed?", "yes/no?", or any other confirmation phrasing**.
Asking is a bug — the user already confirmed by invoking the skill.
Only stop early if `--dry-run` is set or preflight (§1) fails.

## GitHub interface — `gh` CLI

**All GitHub interactions in this skill go through the `gh` CLI**,
never raw REST/GraphQL `curl`. The CLI handles auth via `gh auth
login`, so no token plumbing. Project (v2) operations require the
`project` and `read:project` / `write:project` scopes — verify with
`gh auth status` and refresh with `gh auth refresh -s project` if
the scope is missing.

Canonical commands used below:
- `gh auth status` — verifies credential + scopes.
- `gh project list --owner <owner> --format json` — list v2 projects.
- `gh project create --owner <owner> --title "<title>" --format json`
  — create a project; returns `{ id, number, url, ... }`.
- `gh project link <number> --owner <owner> --repo <owner/repo>` —
  link the project to the repo (so `gh issue list` can later filter
  by project membership).
- `gh project field-list <number> --owner <owner> --format json` —
  enumerate fields; the `Status` field (a `ProjectV2SingleSelectField`)
  has an `id` and `options[]` with `id` + `name` per option.
- `gh project field-create <number> --owner <owner> --name Status \
   --data-type SINGLE_SELECT --single-select-options "Backlog,Planning,Todo,In Progress,In Review,QA,Completed"`
  — only used if the project lacks a Status field (rare; v2 default
  templates ship with Status pre-populated to Todo / In Progress /
  Done). To extend the default, use `gh project field-edit` to add
  the missing options.
- `gh project item-list <number> --owner <owner> --format json --limit 200`
  — list items + their custom field values, including each item's
  current `Status`.
- `gh project item-add <number> --owner <owner> --url <issue-url>`
  — add an issue to the project; returns the item's project-item ID.
- `gh project item-edit --id <item-id> --project-id <project-id> \
   --field-id <field-id> --single-select-option-id <option-id>` —
  set an item's Status to a specific option.
- `gh issue view <N> --json …` — hydrate issue body, labels,
  assignees.
- `gh issue comment <N> --body-file <path>` — post a comment (use
  `--body-file` for any multi-line markdown).
- `gh pr list --state open --json …` — snapshot open PRs to verify
  isolation between iterations.

Workflow state is the project's **native Status field**. The full
lifecycle this skill expects:

```
Backlog → Planning → Todo → In Progress → In Review → QA → Completed
```

Humans drive the ends; this skill drives the middle:
- `Backlog` — raw / untriaged. Humans only.
- `Planning` — being scoped. Humans only.
- `Todo` — **input queue this skill consumes**.
- `In Progress` — set when team-build starts on an issue.
- `In Review` — set when team-build opens a PR (APPROVED outcome).
- `QA` — set after merge; humans (or downstream automation) drive.
- `Completed` — final state; humans (or PR merge) drive.

This skill only mutates `Todo` → `In Progress` → `In Review` (or
back to `Todo` on failure). It never writes `Backlog`, `Planning`,
`QA`, or `Completed`.

**Caching.** Resolve `$PROJECT_ID`, `$STATUS_FIELD_ID`, and the
`name → option-id` map for Status options **once at preflight** and
reuse for every transition — these never change mid-run.

## 1. Preflight

1. **`gh` available + authed.** `gh auth status` must succeed —
   this skill, and `/team-build` for PR creation, both need it.
2. **Repo resolved.** If `--repo` is unset, run
   `gh repo view --json nameWithOwner -q .nameWithOwner` from the
   working directory. Abort if not in a repo and no `--repo`.
3. **Default branch resolved.** If `--target` is unset, run
   `gh repo view --json defaultBranchRef -q .defaultBranchRef.name`
   for the resolved repo.
4. **Repo state.** `git status --porcelain` must be empty, or
   surfaced and confirmed by the user.
5. **Project resolved (or created).**
   a. If `--project` is a number, validate it exists with
      `gh project view <num> --owner $OWNER --format json`.
   b. If `--project` is a title, list projects via
      `gh project list --owner $OWNER --format json` and match by
      `title` (case-insensitive).
   c. If `--project` is unset, list projects and pick the **first
      project linked to `--repo`** (filter `items[]` whose
      `closed=false`; cross-check `gh project view` shows the repo
      in `linkedRepositories`). If none, **auto-create**:
      ```bash
      gh project create --owner "$OWNER" --title "$REPO_NAME" --format json
      gh project link "$NEW_NUMBER" --owner "$OWNER" --repo "$REPO"
      ```
   Cache `$PROJECT_NUMBER`, `$PROJECT_ID` (the GraphQL node id), and
   `$PROJECT_URL`.
6. **Status field resolved (or extended).** Run
   `gh project field-list "$PROJECT_NUMBER" --owner "$OWNER" --format json`.
   Find the field where `name == "Status"` and `dataType ==
   "SINGLE_SELECT"`. Cache `$STATUS_FIELD_ID` and the
   `name → option-id` map. Required option names: `Backlog`,
   `Planning`, `Todo`, `In Progress`, `In Review`, `QA`,
   `Completed`. For each missing option, extend the field via
   `gh project field-edit` (or, if the project has no Status field
   at all — uncommon — create it via `gh project field-create
   --data-type SINGLE_SELECT --single-select-options "..."`).
   Best-effort: if extension fails, log a warning and proceed —
   transitions for any missing target option will be skipped with
   a note in the results table.
7. **`/team-build` reachable.** This skill invokes it via the Skill
   tool; if not listed as available, abort.

## 2. Fetch the queue

Pull every project item, filter to issues whose Status is `Todo`:

```bash
gh project item-list "$PROJECT_NUMBER" --owner "$OWNER" \
  --format json --limit 200 \
  | jq --arg s "Todo" '
      .items
      | map(select(.content.type == "Issue"))
      | map(select(.status == $s))
    '
```

`gh project item-list` returns each item with a flattened view of
the project's custom fields keyed by field name; `.status` is the
Status field value as a string. Each item also includes
`.content.number`, `.content.title`, `.content.body`,
`.content.url`, `.content.repository`, plus the project-item
`.id` (needed later to update status). If `--repo` was specified,
post-filter to only issues whose `content.repository` matches.

For any item missing `body` (Projects v2 sometimes returns a
truncated body), hydrate it with
`gh issue view <N> --json number,title,body,labels,assignees,url --repo $REPO`.

If `--assignee` was specified, post-filter to issues whose
`assignees` includes the login.

Sort: issues with a `priority:*` label first (P0/P1/P2/P3
ascending, treat numeric value in label name as priority; missing =
lowest), then `updatedAt` ascending. Apply `--limit`. Print a
numbered table:

```
# GitHub Project queue (N issues) — project: $PROJECT_URL  status: Todo
1. owner/repo#123  [P1]  "Add OAuth login"          (@alice)
2. owner/repo#130  [P2]  "Fix invoice rounding"     (@bob)
```

If `--dry-run`, stop. Otherwise proceed immediately against all N
issues — no confirmation prompt.

## 3. Per-issue loop

For each selected issue, in order, run the sub-routine below. Print
the running results table after each issue finishes.

### 3a-pre. Resolve the working branch and target branch for this issue

Two distinct branches matter per issue:

- **`$WORKING_BRANCH`** — the new feature branch this build commits
  onto and pushes. **Default to GitHub's "Create branch" convention**
  (`<number>-<kebab-title>`, truncated to 60 chars):
  ```bash
  SLUG=$(echo "$TITLE" | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g' | cut -c1-50)
  WORKING_BRANCH="${NUMBER}-${SLUG}"
  ```
  If the issue body contains an explicit line matching
  (case-insensitive) `^\s*Branch\s*:\s*([^\s]+)\s*$`, use that
  instead. **Never** prepend `team-build/` — pass it verbatim
  through `--working-branch`.
- **`$RESOLVED`** — the PR base / target branch (where the PR
  merges into). Resolve in the order below; first match wins.

#### Target-branch resolution order:

1. **Body directive.** Scan `$BODY` for a line matching
   (case-insensitive) `^\s*(Target|Base)\s*:\s*([^\s]+)\s*$`.
   Capture group 2 is the branch name.
2. **Label.** Any label named `target:<branch>` or `base:<branch>`.
   Strip the prefix, the rest is the branch name.
3. **CLI default.** Fall back to the `--target` flag (default: repo's
   default branch).

Validate the resolved branch exists locally OR on `origin`:
```
git show-ref --verify --quiet "refs/heads/$RESOLVED" \
  || git ls-remote --exit-code --heads origin "$RESOLVED"
```

If neither, **STOP this issue** (do not silently fall back to the
default branch):
- Comment on the issue via
  `gh issue comment $NUMBER --body "team-build skipped: target branch \`$RESOLVED\` does not exist locally or on origin." --repo $REPO`
- Leave the project Status as `Todo` (don't promote to `In Progress`).
- Record verdict `SKIPPED` in the results table and continue to the
  next issue.

Print both resolutions per issue, e.g.:
`#123 → working=123-add-oauth-login, target=feature/auth (from body directive)`

### 3a. Build the team-build invocation

Hand `/team-build` exactly this prompt body (one issue only):

```
[GitHub #$NUMBER] $TITLE

Source: $URL
Repo: $REPO  Assignee: $ASSIGNEE  Labels: $LABELS

$BODY

---
Closes #$NUMBER

When opening the PR, the body MUST include the line `Closes #$NUMBER`
on its own line so merging the PR auto-closes the issue.

---
Clean-code bar for this build (non-negotiable, enforce in the §5 code review):
- Reuse existing patterns and helpers; do not duplicate logic that already
  lives in this codebase. Grep before writing.
- Keep the diff minimal — only what the issue requires. No drive-by
  refactors, no unrelated cleanup, no speculative abstractions.
- No dead code, no commented-out code, no TODOs, no console.logs.
- Names communicate intent. Functions do one thing. Early returns over
  nesting. No comments that restate the code.
- Validate at boundaries only; trust internal callers.
- Tests where they make sense and the project already has a test setup;
  do not introduce a new test framework just for this issue.

---
Push policy for this run (non-negotiable):
- **Do not gate the push.** Skip the §6 typed-`yes` confirmation entirely.
- Push `$WORKING_BRANCH` to `origin` and open the PR against `--branch`
  as soon as the build round + security audit + code review have run,
  regardless of QA verdict. Don't loop indefinitely waiting for an
  APPROVED gate before pushing — push, open the PR, and surface any
  remaining issues in the PR body so a human can review on GitHub.
- This is autonomous GitHub backlog burndown; treat the PR itself as
  the review surface, not a local gate.
```

Slug for the worktree path: `gh-$NUMBER` (e.g. `gh-123`).
`/team-build` adds its own timestamp suffix to the worktree directory
even when `--working-branch` overrides the branch name.

### 3b. Move the issue to "In Progress" + post a "starting" comment

Before launching, set the project Status to `In Progress`. The item
ID is on the project item from §2; the option ID came from the
preflight cache:
```bash
gh project item-edit \
  --id "$ITEM_ID" \
  --project-id "$PROJECT_ID" \
  --field-id "$STATUS_FIELD_ID" \
  --single-select-option-id "$OPT_IN_PROGRESS"
```
On any failure, log a warning and continue — do not block the build
on a Status mutation.

Then post a status comment so non-terminal stakeholders can follow
along. Write to a temp file and use `--body-file`:

```markdown
### 🛠️ team-build started

- **Working branch:** `$WORKING_BRANCH`
- **Target (PR base):** `$RESOLVED`
- **Worktree slug:** `gh-$NUMBER`
- **Mode:** `/team-build` (plan → parallel specialist build → security audit → QA + code review, looping until clean)
- **Clean-code bar:** reuse existing patterns, minimal diff, no dead code/TODOs/console.logs.

I'll comment again when the build finishes (APPROVED → PR link + screenshots if UX, ESCALATED/FAILED → blocker summary).
```

```bash
gh issue comment "$NUMBER" --repo "$REPO" --body-file /tmp/gtb-start-$NUMBER.md
```

Comment is best-effort: if it fails, log and proceed — never block the
build on a comment failure. Skip this comment when `--dry-run`.

### 3c. Invoke `/team-build` — ONE invocation per issue

**This is the most-violated rule. Read carefully.**

Make **exactly one** Skill-tool call to `/team-build` per issue.
Never batch issues into a single invocation. Never reuse a worktree
across issues. If your prompt to `/team-build` mentions two issue
numbers, you are doing it wrong — stop.

Snapshot PR list before:
```
PRS_BEFORE=$(gh pr list --repo "$REPO" --state open --json number,headRefName,url --limit 200)
```

Call `/team-build` via the Skill tool with `args` — pass the
**issue-resolved** target branch from §3a-pre as `--branch`, AND
the working branch as `--working-branch`:
```
--branch $RESOLVED
--working-branch $WORKING_BRANCH

<prompt body from §3a>
```

(One arg blob: the flags, blank line, then the §3a body.)

`/team-build` runs end-to-end in that single turn (worktree, plan,
build, security, QA, push, PR). It returns APPROVED-and-shipped,
ESCALATED, or FAILED.

After it returns, verify isolation:
- `gh pr list` must now show **exactly one** new open PR vs.
  `PRS_BEFORE` whose head ref equals `$WORKING_BRANCH`. Zero or more
  than one new PR → STOP the loop and report.
- The new branch and PR number must be unique across this run's
  results table.
- **Verify the PR body contains `Closes #$NUMBER`.** If not, edit
  the PR to append it:
  `gh pr edit <PR> --repo $REPO --body "$(gh pr view <PR> --repo $REPO --json body -q .body)\n\nCloses #$NUMBER"`.

### 3d. Capture the outcome

Record: PR URL, PR number, branch name, worktree path, verdict,
rounds run.

### 3d.5. Screenshot capture (UX/design issues only)

Only runs when verdict is **APPROVED** AND the issue touches the UI.
Otherwise skip this section entirely.

**Detection (any one fires):**
1. The PR diff contains frontend-shaped files. From the merged worktree
   or via `gh`:
   ```bash
   gh pr diff "$PR_NUMBER" --repo "$REPO" --name-only \
     | grep -E '\.(tsx|jsx|vue|svelte|astro|html|css|scss|sass|less|stylus)$|/(components|pages|app|views|routes|styles|public)/' \
     | head -1
   ```
2. The issue has a label matching `^(ui|ux|design|frontend|web|mobile)$` (case-insensitive).
3. The title or body contains any of: `UI`, `UX`, design, layout,
   style, visual, page, screen, component, button, form, modal,
   theme, responsive, dark mode (case-insensitive whole-word).

If none fire → skip §3d.5 and proceed to §3e with no shots.

**Capture (best-effort; never block the loop):**

Work inside a fresh read-only checkout of `$WORKING_BRANCH` (the
team-build worktree may have been auto-cleaned on APPROVED):
```bash
SHOT_WT="$(dirname $REPO_ROOT)/$REPO_NAME.shot-gh-$NUMBER-$$"
git worktree add --detach "$SHOT_WT" "$WORKING_BRANCH"
```
(Mark this worktree for cleanup at the end of the issue regardless
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
- If the issue body contains a line `Screenshot: <path>` or
  `Preview: <path>`, append that path to the base URL.
- Else default to `/`.

Capture three shots via Playwright MCP (`mcp__playwright__*`):
1. Desktop, viewport `1440x900` — save as `01-desktop.png`.
2. Mobile, viewport `390x844` — save as `02-mobile.png`.
3. Same desktop URL after one interaction (scroll one viewport, or
   focus the first interactive element) — `03-state.png`.

Save under `$SHOT_WT/.github-team-build/shots/$NUMBER/`. Tear down
the dev server (kill the background PID) before continuing. If any
individual shot fails, keep the ones that succeeded; do not retry.

**Embed in the issue comment (§3e).** GitHub issue comments accept
inline images via markdown `![alt](url)` — but to host images we
need a stable URL. Two options:

1. **Preferred — attach to the PR** by uploading via `gh` is not
   directly supported. Instead, commit the screenshots to the PR's
   branch under `.github-team-build/shots/<n>/` (a single follow-up
   commit `chore: screenshots for #$NUMBER`), then reference them by
   their `raw.githubusercontent.com` URL on `$WORKING_BRANCH`:
   ```
   https://raw.githubusercontent.com/$REPO/$WORKING_BRANCH/.github-team-build/shots/$NUMBER/01-desktop.png
   ```
   This survives PR rebases as long as the branch exists.
2. **Fallback** — if the PR is already merged or the branch was
   deleted, drop the embed and append a single line to the comment:
   `_Screenshots not captured: PR branch unavailable._`

If commit+push fails (protected branch, conflict, etc.), drop just
the screenshots — never block the §3e comment.

Clean up `$SHOT_WT` (`git worktree remove --force "$SHOT_WT"`) before
returning to §3e.

### 3e. Update the issue

Use `gh` for the comment and `gh project item-edit` for the Status
transition. Always write the comment body to a temp file and pass
`--body-file` so multi-line markdown survives shell quoting.

- **APPROVED + PR opened:**
  ```bash
  gh issue comment "$NUMBER" --repo "$REPO" --body-file /tmp/gtb-comment-$NUMBER.md
  gh project item-edit \
    --id "$ITEM_ID" \
    --project-id "$PROJECT_ID" \
    --field-id "$STATUS_FIELD_ID" \
    --single-select-option-id "$OPT_IN_REVIEW"
  ```
  Comment body: the PR URL plus a one-line summary. **If §3d.5
  produced any uploaded screenshots, append a `### Screenshots`
  section embedding each as `![<label>]($RAW_URL)` in capture order
  (desktop → mobile → state).** If §3d.5 ran but captured nothing,
  append a single line:
  `_Screenshots not captured: <reason>_`. If §3d.5 was skipped (not
  a UX/design issue), omit the section entirely. Do not close the
  issue manually — the PR's `Closes #$NUMBER` will close it on
  merge. Do **not** flip the project Status to `QA` or `Completed`
  here; that's a human / downstream responsibility.
- **ESCALATED or FAILED:**
  ```bash
  gh issue comment "$NUMBER" --repo "$REPO" --body-file /tmp/gtb-comment-$NUMBER.md
  gh project item-edit \
    --id "$ITEM_ID" \
    --project-id "$PROJECT_ID" \
    --field-id "$STATUS_FIELD_ID" \
    --single-select-option-id "$OPT_TODO"
  ```
  Comment body: blocker summary, worktree path, and remediation notes.
  Issue returns to the `Todo` column. Never mark closed.

### 3f. Decide whether to continue

- Environmental failure (auth, network, missing tooling) → STOP the
  loop; same failure will hit every later issue.
- Code-specific failure or 3-round cap → log and move on.
- APPROVED → move on.

## 4. Parallel mode

Default: **sequential** (`--parallel 1`). Issues run one at a time
so output stays readable and rate limits don't bite. Pass
`--parallel <n>` to opt into concurrency — each `/team-build`
produces its own worktree, so they don't collide on disk. If
effective concurrency exceeds 5, warn the user about shared `gh`
rate limits but do not cap — the user asked for it.

## 5. Final summary

```
## /github-team-build — summary
Repo: $REPO   Project: $PROJECT_URL   Status filter: Todo
Processed: N issues

| Issue   | Verdict   | PR                              | Rounds |
|---------|-----------|---------------------------------|--------|
| #123    | APPROVED  | https://github.com/.../pull/45  | 1      |
| #130    | ESCALATED | (no PR — see worktree)          | 3      |

Worktrees still on disk (only ESCALATED/FAILED — APPROVED issues
are auto-cleaned by /team-build §6a):
- /path/to/repo.team-build-gh-130-...  (#130, escalated)

Issue comments posted: <count>
```

APPROVED issues have their worktree + local branch removed
automatically by `/team-build`. Only ESCALATED/FAILED worktrees
persist for manual debugging. Do not prompt to clean up APPROVED
worktrees here — they are already gone.

## Hard rules

- **One PR per issue. ONE Skill-tool call to `/team-build` per
  issue.** Never bundle multiple issues into one PR, branch,
  worktree, or team-build invocation.
- **Every PR body MUST contain `Closes #<n>`.** This is what links
  the PR to the issue and auto-closes on merge. Verify after
  team-build returns; edit the PR if missing.
- **Verify isolation between issues.** Snapshot `gh pr list` before
  each call; confirm exactly one new PR with head ref
  `$WORKING_BRANCH` after. Zero or more than one → STOP.
- **No branch/PR reuse.** Branch name and PR number must be unique
  across the run.
- **Clean-code bar is part of the contract.** The §3a clause is
  embedded in every team-build prompt and must be enforced by the
  Team Lead's §6 code-review gate. Re-roll if violated.
- Always update the issue (comment + project Status) after each
  issue. Never leave an issue stranded in `In Progress` on failure
  — on ESCALATED/FAILED, flip Status back to `Todo`.
- **Use the `gh` CLI for every GitHub read/write.** No raw `curl`
  to api.github.com. Fall back to `gh api` only when no structured
  subcommand exposes a needed field.
- If `gh auth status` fails, abort before touching git.
- Don't open more than 10 PRs per run unless the user explicitly
  raised `--limit` past 10.
- **Screenshots for UX/design issues (§3d.5) are best-effort, never
  blocking.** Detection is by frontend-shaped diff, design label,
  or UI keywords in the issue. Capture with Playwright after a
  local dev-server boot, commit to the PR branch under
  `.github-team-build/shots/<n>/`, and embed via
  `raw.githubusercontent.com` URLs in the APPROVED comment.
  Failure modes (no dev server, capture error, push rejected)
  downgrade to a `_Screenshots not captured: <reason>_` line —
  never abort the issue and never fabricate an image.
