---
name: linear-design
description: >
  Create a Linear ticket for a design task, run /team-design to produce
  divergent variants in parallel, and post each variant's screenshots
  back to the Linear ticket as a comment as it completes — so the
  ticket itself becomes the picker for stakeholders who don't live in
  the terminal. Use when the user says "/linear-design", "design this
  in linear", "linear ticket with variants", "post design variants to
  linear", or wants a Linear-tracked parallel design exploration.
---

# /linear-design — Linear-tracked parallel design variants

You wrap `/team-design` with Linear bookkeeping. The Linear ticket is
the public artifact: brief in the description, one comment per variant
with screenshots inline, final verdict comment summarizing the picker.
The terminal flow is identical to `/team-design`; everything extra
happens through the `linear` CLI / Linear API.

## 0. Inputs

`/linear-design <task description> [flags]`

Passthrough to `/team-design` (forward verbatim):
- `--variants <N>` (2–10, default 4)
- `--target-branch <branch>`
- `--branch-prefix <prefix>`
- `--reference <url|path>` (repeatable)

Linear-specific:
- `--team <key>` — Linear team key for the new issue (e.g. `ENG`,
  `DSGN`). **Required** unless the workspace has a single team.
- `--priority <0-4>` — 0 no priority, 1 urgent … 4 low. Default `3`.
- `--label <name>` — repeatable; applied to the new issue.
- `--assignee <me|email|userId>` — default unassigned.
- `--project <name|id>` — optional Linear project to file under.
- `--existing <IDENT>` — skip creation; attach to an existing ticket
  (e.g. `--existing DSGN-42`). When set, do not modify the ticket's
  description; only post comments.

If invoked with only a task description and no `--team` and no
`--existing`, ask **one** question: which team key to file under.
One question, one shot.

## 1. Preflight

1. `command -v linear` — install hint:
   `npm i -g @schpet/linear-cli` (or `brew install schpet/tap/linear-cli`).
2. `linear auth token` — must succeed; otherwise tell the user to run
   `linear auth login`.
3. `command -v jq` — required for parsing JSON responses.
4. `command -v curl` — required for the file-upload PUT.
5. `/team-design` reachable via the Skill tool — abort if not.
6. `git status --porcelain` — surface uncommitted changes per
   `/team-design` §2 rules.

## 2. Create (or resolve) the Linear ticket

If `--existing $IDENT` was supplied, skip creation. Verify with
`linear issue view "$IDENT" --json` and capture `id`, `identifier`,
`url`, `team.id`. Otherwise:

### 2a. Compose the ticket body

Title: `[Design] <one-line summary of the task>` (≤ 80 chars).

Description (markdown, write to `/tmp/linear-design-desc-$$.md`):

```
## Brief

<full task description verbatim>

## References

- <each --reference URL or path on its own line; "(none)" if omitted>

## Variants requested

`/team-design` will produce **N** divergent directions in parallel,
each on its own worktree and branch (`team-design/<slug>-<variant>`),
with desktop + mobile + interactive screenshots committed inline.

Each variant will be posted as a comment on this ticket as it lands,
with its hero shots embedded. The final comment summarizes the
picker (PASS / REDO / KILL per variant) and links to each branch.

_Filed automatically by `/linear-design`._
```

### 2b. Create via `linear` CLI; fall back to `linear api`

Try the structured CLI first:

```bash
linear issue create \
  --team "$TEAM" \
  --title "$TITLE" \
  --description-file /tmp/linear-design-desc-$$.md \
  ${PRIORITY:+--priority "$PRIORITY"} \
  ${ASSIGNEE:+--assignee "$ASSIGNEE"} \
  ${PROJECT:+--project "$PROJECT"} \
  ${LABELS:+$(printf -- '--label %q ' "${LABELS[@]}")} \
  --json
```

Capture `identifier`, `id`, `url` from the JSON. If the CLI version
in this environment lacks `issue create`, fall back to `linear api`
with the `issueCreate` mutation:

```bash
linear api '
mutation($input: IssueCreateInput!) {
  issueCreate(input: $input) {
    success
    issue { id identifier url team { id } }
  }
}' --variables "$(jq -n \
    --arg team "$TEAM_ID" \
    --arg title "$TITLE" \
    --rawfile desc /tmp/linear-design-desc-$$.md \
    --argjson priority "${PRIORITY:-3}" \
    '{input: {teamId: $team, title: $title, description: $desc, priority: $priority}}')"
```

(Resolve `$TEAM_ID` from the team key with
`linear api 'query($k:String!){team(id:$k){id}}'` if needed; many
deployments accept the key directly.)

Set:
- `$IDENT` — e.g. `DSGN-87`
- `$ISSUE_ID` — UUID
- `$TEAM_ID` — UUID (needed for fileUpload)
- `$ISSUE_URL`

Print: `📋 Linear ticket created: $IDENT — $ISSUE_URL`

## 3. Run `/team-design` — one Skill-tool call

Invoke `/team-design` exactly once via the Skill tool. Forward all
passthrough flags and the task description verbatim. Append one line
to the task body so the Design Lead knows the ticket exists:

```
<original task description>

[Linked Linear ticket: $IDENT — $ISSUE_URL]
```

`/team-design` runs end-to-end (worktrees, parallel build, screenshot
capture, Lead's critique). When it returns, capture from its output:
- The variant table: for each variant — name, branch, worktree path,
  verdict (PASS/REDO/KILL), critique scores.
- The screenshot paths under each variant's
  `$WT_V/.team-design/shots/`.

If `/team-design` aborts before producing variants (thin brief, etc.),
post a single comment on `$IDENT` explaining the abort, leave the
ticket in its current state, and stop.

## 4. Post one comment per variant

For each variant the Lead produced (PASS or REDO; KILLed variants get
one consolidated kill comment in §5), build a markdown comment with
the screenshots embedded as Linear-hosted assets.

### 4a. Upload screenshots to Linear

Linear comments don't render `file://` paths. Each screenshot must be
uploaded via Linear's `fileUpload` mutation (signed URL → PUT bytes →
use `assetUrl` in markdown). The CLI doesn't expose this directly;
use `linear api`.

For each PNG under `$WT_V/.team-design/shots/`:

```bash
SIZE=$(wc -c < "$SHOT")
NAME=$(basename "$SHOT")
RESP=$(linear api '
mutation($filename:String!,$contentType:String!,$size:Int!){
  fileUpload(filename:$filename, contentType:$contentType, size:$size, makePublic:false){
    success
    uploadFile { uploadUrl assetUrl filename contentType size
                 headers { key value } }
  }
}' --variables "$(jq -n --arg f "$NAME" --arg ct image/png --argjson s "$SIZE" \
    '{filename:$f, contentType:$ct, size:$s}')")

UPLOAD_URL=$(echo "$RESP" | jq -r '.data.fileUpload.uploadFile.uploadUrl')
ASSET_URL=$(echo "$RESP" | jq -r '.data.fileUpload.uploadFile.assetUrl')

# Build curl headers from the headers array (must include Content-Type and any auth headers Linear returns)
HDR_ARGS=()
while IFS= read -r row; do
  k=$(echo "$row" | jq -r '.key')
  v=$(echo "$row" | jq -r '.value')
  HDR_ARGS+=(-H "$k: $v")
done < <(echo "$RESP" | jq -c '.data.fileUpload.uploadFile.headers[]')

curl -sS -X PUT "$UPLOAD_URL" "${HDR_ARGS[@]}" --data-binary "@$SHOT"
```

Record `$ASSET_URL` per shot. If the upload returns `success:false`
or curl fails (non-2xx), fall back to embedding the shot path in
the comment as plain text (`shots/01-hero-desktop.png — upload failed`)
and continue. Never block the loop on a single upload failure.

### 4b. Compose and post the comment

Write to `/tmp/linear-design-comment-$IDENT-$VARIANT.md`:

```
## Variant: <variant-name> — <PASS|REDO|KILL>

**Thesis.** <one-paragraph thesis from the Lead's brief>

**Branch.** `team-design/<slug>-<variant>`
**Worktree.** `<path>`
**Lead scores.** thesis fidelity <x>/10 · craft <y>/10 · differentiation <z>/10

### Screenshots

![Desktop hero]($ASSET_URL_01)

![Mobile hero]($ASSET_URL_02)

![<state name>]($ASSET_URL_03)

### Lead's critique

**What works**
- <bullet>
- <bullet>

**What fails**
- <bullet>
- <bullet>

---
_Posted by `/linear-design` after the Lead's critique. Branch is
checked out at the worktree above; `cd` in to preview locally._
```

Post:

```bash
linear issue comment add "$IDENT" \
  --body-file /tmp/linear-design-comment-$IDENT-$VARIANT.md
```

**Order matters.** Post comments in the order variants finish (or in
the brief's listed order if they finished simultaneously) so the
ticket's timeline reads as a coherent walkthrough. After each post,
print to the terminal: `✓ posted $VARIANT to $IDENT`.

If a variant's PASS verdict came without screenshots (which
`/team-design` forbids — but guard anyway), do NOT post a fake
preview. Post the comment with a `_Screenshots not captured: <reason
from /team-design>_` line in place of the embeds.

## 5. Final summary comment

After every per-variant comment is posted, post one final summary
comment to `$IDENT` (`--body-file /tmp/linear-design-summary-$IDENT.md`):

```
## /team-design picker — N variants ready

| # | Variant            | Verdict | Branch                              |
|---|--------------------|---------|-------------------------------------|
| 1 | brutalist          | PASS    | team-design/landing-brutalist       |
| 2 | editorial-serif    | PASS    | team-design/landing-editorial-serif |
| 3 | playful-collage    | KILL    | (dropped — see note)                |

**Killed variants (consolidated):**
- `playful-collage` — <one-line reason from Lead>

**Next steps.** Reviewers: comment with the preferred variant name.
Operator: in the terminal, run `/team-design` picker actions
(`(s)hip <#>`, `(a)dopt <#>`, `(k)ill <#>`) — `/linear-design` does
NOT auto-ship from Linear comments.

_Filed by `/linear-design`. Lead's full brief is in the ticket
description._
```

Then **leave the ticket in its current workflow state** — do not
auto-transition. Human picks the direction; ship is a separate action.

## 6. Print the local picker

After Linear is updated, print the same picker UI `/team-design`
prints (§7 of that skill) so the operator can act locally without
re-reading the ticket. The picker actions remain local-only — Linear
comments are the visible record, not a remote control.

## Hard rules

- **One Linear ticket per `/linear-design` run.** Never reuse a
  ticket across runs unless `--existing` was passed.
- **One comment per variant**, posted after that variant's critique
  is finalized. Never batch all variants into a single comment.
- **Use the `linear` CLI for every Linear read/write.** `linear api`
  is the escape hatch *only* for `fileUpload` and `issueCreate`
  fields not exposed by structured subcommands. Never `curl
  https://api.linear.app/graphql` directly.
- **Every PASS/REDO comment must include uploaded screenshots** (or
  an explicit "shots not captured" note). Markdown without images
  defeats the point of putting design in the ticket.
- **Never auto-transition** the ticket workflow state. The human
  picks; this skill is read+write *content*, not state.
- **Never auto-ship** based on Linear comments. Shipping happens
  through `/team-design`'s local picker (`(s)`, `(a)`).
- **Preflight aborts before §2.** If Linear auth is bad, do not
  create worktrees; if `/team-design` is unreachable, do not create
  a Linear ticket.
- Fall back gracefully on upload failures (text reference instead of
  embed) — never block the comment loop on a single bad asset.
- Forward `/team-design` flags verbatim; do not silently change
  defaults. The Design Lead's bar and loop caps are owned by
  `/team-design`.
