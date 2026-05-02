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

### 3d.5. Visual asset reuse (UX/design tickets only)

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
HDR_ARGS=(); while IFS= read -r row; do
  HDR_ARGS+=(-H "$(jq -r '.key' <<<"$row"): $(jq -r '.value' <<<"$row")")
done < <(echo "$RESP" | jq -c '.data.fileUpload.uploadFile.headers[]')
curl -sS -X PUT "$UPLOAD_URL" "${HDR_ARGS[@]}" --data-binary "@$SHOT"
```
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
