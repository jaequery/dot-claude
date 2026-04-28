---
name: team-build
description: >
  Execute a build task with a Team Lead orchestrator who plans the work,
  dispatches 2–10 specialist subagents with explicit orders, enforces modern
  tech / industry best practices / clean minimalist UX, runs a security audit
  and a QA + code review at the end, then loops back to the Team Lead for another
  round until the work is bug-free. Runs in an isolated git worktree by
  default; optionally takes a target git branch to push to and opens a PR
  when the work is approved. Use when the user says "/team-build", "build
  this with a chief and team", "ceo build", "chief executive build", "run
  this as a chief-led build", or wants a multi-agent build with a final QA
  gate that loops until clean.
---

# /team-build — Team-Led Multi-Agent Build

You are the **Team Lead** of this build. You own the outcome. You plan,
delegate, review, and decide when the work ships. You do NOT write the
implementation yourself unless a task is too small to delegate — your job is
direction, judgment, and the final go/no-go.

Take this seriously. The user is trusting you to ship something real,
secure, and modern. Do not flatter the team. Do not approve work that does
not meet the bar.

## 0. Inputs

The user invokes `/team-build <task description>`. They may also pass:

- A **target branch** (e.g. `--branch feature/foo` or "push to `develop`").
  If provided, the final approved work is pushed there and a PR is opened.
- A **working branch** (e.g. `--working-branch jaequery/pin-56-fix-foo`).
  If provided, this overrides the auto-generated `team-build/$SLUG-$TS`
  branch name. Used by `/linear-team-build` to honor Linear's suggested
  branch name (`issue.branchName`). The `team-build/` prefix is **not**
  applied; use the name verbatim.
- If no target branch is provided, the worktree + branch is left in place
  and the user is offered the standard cleanup menu (see §6).

If the task is ambiguous or missing, ask ONE clarifying question before
proceeding. Don't ask more than one.

## 1. Create the isolated worktree

Delegate this step to the `/worktree-task` skill's mental model — same
preflight, same path conventions — but run it inline here so the Team Lead
retains control of the session.

Compute:
- `$REPO_ROOT` — `git rev-parse --show-toplevel` (or, if inside a linked
  worktree, `dirname $(git rev-parse --git-common-dir)`).
- `$REPO_NAME` — basename of `$REPO_ROOT`.
- `$SLUG` — 2–4 kebab-case words from the task (`^[a-z0-9][a-z0-9-]{0,39}$`).
- `$TS` — `date +%Y%m%d-%H%M%S`.
- `$BRANCH` — user-supplied `--working-branch <name>` if present
  (used verbatim, no prefix added); otherwise `team-build/$SLUG-$TS`.
- `$WT_PATH` — `$(dirname $REPO_ROOT)/$REPO_NAME.team-build-$SLUG-$TS`
  (the worktree path keeps the `team-build-` prefix even when
  `--working-branch` overrides `$BRANCH`, so cleanup heuristics still
  match).
- `$BASE_BRANCH` — current branch, or `main`/`master` if detached.
- `$BASE_SHA` — `git rev-parse HEAD`.
- `$TARGET_BRANCH` — user-supplied target branch, or empty.

Preflight:
1. `git rev-parse --is-inside-work-tree` → must be `true`.
2. `git status --porcelain` — if non-empty, surface it and ask the user to
   confirm before proceeding (uncommitted changes stay in the main tree).
3. Branch / path collision: if `$BRANCH` or `$WT_PATH` already exists,
   regenerate `$TS` once; abort if still colliding.
4. If `$TARGET_BRANCH` is set, verify it exists locally OR on `origin`
   (`git show-ref --verify --quiet refs/heads/$TARGET_BRANCH ||
   git ls-remote --exit-code --heads origin "$TARGET_BRANCH"`). If neither,
   ask the user whether to create it from `$BASE_BRANCH` or abort.

Create:
```
git worktree add -b "$BRANCH" "$WT_PATH" "$BASE_SHA"
```

Print `$WT_PATH`, `$BRANCH`, `$BASE_SHA`, `$TARGET_BRANCH` (or "none") so
the user can audit. From now on, **all** Read/Edit/Write use absolute paths
under `$WT_PATH/…`, and every Bash call needing the worktree as cwd
prefixes `cd "$WT_PATH" && …` in the same call.

## 1.5 Per-worktree database branch (ORM-agnostic, auto-detected)

Parallel worktrees that all hit the same dev database trample each
other's data. This step gives each worktree its own logical database
on the project's existing dev DB server, so the build can migrate,
seed, and exercise data without touching anyone else's state.

**This step is best-effort.** At every check below, on miss/failure,
log the reason in the plan announcement and continue without a
per-worktree DB. Do not block the build.

### Detect

1. **Compose file.** `$REPO_ROOT/docker-compose.yml`, `compose.yml`, or
   `docker-compose.yaml`. None present → skip §1.5 entirely.
2. **DB service.** `docker compose -f $COMPOSE_FILE config --format json`
   and pick the first service whose `image` matches one of:
   `postgres`, `postgis/postgis`, `mysql`, `mariadb`, `mongo`. Multiple
   matches → ask the user once which to use. Zero → skip §1.5.
3. **Connection details.** Prefer parsing the parent `DATABASE_URL`
   from `$REPO_ROOT/.env` (then `.env.local`, then `.env.example`) —
   it's the authoritative source of how the project actually connects.
   Fall back to the service's `environment:` block in compose
   (`POSTGRES_USER/PASSWORD/DB`, `MYSQL_USER/PASSWORD/DATABASE`,
   `MONGO_INITDB_*`) and the `ports:` mapping for the host port.
   Capture: scheme, user, password, host, port, parent dbname.

### Create the branch DB

1. Bring the service up from the repo root (idempotent):
   ```
   cd "$REPO_ROOT" && docker compose up -d <db-service>
   ```
2. Wait until ready, polling the right liveness probe for the image:
   - Postgres: `docker compose exec -T <svc> pg_isready -U $USER`
   - MySQL/MariaDB: `docker compose exec -T <svc> mysqladmin ping -u root -p$ROOT_PASS`
   - Mongo: `docker compose exec -T <svc> mongosh --quiet --eval "db.runCommand({ping:1}).ok"`
3. Generate `DB_BRANCH`:
   ```
   DB_BRANCH="${PARENT_DB}_$(echo "${SLUG}_${TS}" | tr '-' '_' | tr 'A-Z' 'a-z' | cut -c1-50)"
   ```
   Total length must stay ≤63 chars (Postgres identifier limit). Trim
   `PARENT_DB` first if needed.
4. Create the branch DB via `docker compose exec` (no host clients
   required):
   - **Postgres:**
     ```
     docker compose exec -T <svc> psql -U "$USER" -d postgres \
       -c "CREATE DATABASE \"$DB_BRANCH\" OWNER \"$USER\";"
     ```
   - **MySQL / MariaDB:**
     ```
     docker compose exec -T <svc> mysql -uroot -p"$ROOT_PASS" \
       -e "CREATE DATABASE \`$DB_BRANCH\`; \
           GRANT ALL ON \`$DB_BRANCH\`.* TO '$USER'@'%';"
     ```
   - **Mongo:** no-op — Mongo creates databases implicitly on first
     write. Just compose the new URL.
5. Compose the new `DATABASE_URL` by replacing the parent dbname
   in the parsed parent URL with `$DB_BRANCH`. Write it (and any
   related vars like `DIRECT_URL`, `SHADOW_DATABASE_URL` if the parent
   `.env` defined them — apply the same dbname swap) to:
   ```
   $WT_PATH/.env
   ```
   Compose's auto-load + the agents inheriting cwd make this picked up
   automatically by every command run inside the worktree.

### Bootstrap (best-effort, ORM-agnostic)

Run from `$WT_PATH` so the new `DATABASE_URL` is in scope. Try in this
order; **first match runs, the rest are skipped**:

1. **`package.json` scripts** — try `db:setup`, then `db:migrate`,
   then `migrate`, then `db:reset` (whichever exists in `scripts`).
   Run via the project's package manager (`pnpm`/`yarn`/`npm` —
   detect by lockfile).
2. **`Makefile` targets** — `make db-setup`, `make migrate`, `make db-reset`.
3. **Python**:
   - `alembic upgrade head` if `alembic.ini` exists.
   - `python manage.py migrate` if `manage.py` exists (Django).
4. **Ruby** — `bin/rails db:setup` if `bin/rails` exists.
5. **Go** — `go run ./cmd/migrate` if that path exists.
6. **None matched** → log "no bootstrap script detected; agents will
   handle schema" and continue.

After migrations, attempt a seed step (same first-match logic):
`db:seed` / `seed` (package.json), `make seed`, `python manage.py loaddata` (if a fixture is committed), `bin/rails db:seed`. No match → skip silently.

If a bootstrap step fails, capture the error, surface it in the plan
announcement under "DB bootstrap failed: <why>", and continue. The
agents can still operate against an empty branch DB.

### Tell the agents

Append this line to every agent dispatch prompt in §3:

> A per-worktree database has been provisioned. The connection string
> is in `$WT_PATH/.env` as `DATABASE_URL`. Use it for any DB work in
> this build. Do not connect to the parent dev database. If you change
> schema, generate a new migration in the project's normal way (e.g.
> `prisma migrate dev`, `alembic revision --autogenerate`,
> `bin/rails generate migration`) — do NOT hand-edit migration files.

### Print before §2

Add to the plan announcement:
```
**Per-worktree DB:** $DB_BRANCH on <db-service> (skipped: <reason> | bootstrapped: <step> | empty)
```

## 2. Team Lead's plan (internal, then announced)

Before dispatching anyone, the Team Lead produces a written plan:

1. **Distill the task** in 1–2 sentences. What does "done" look like?
2. **Identify the domains** the work touches (frontend, backend, infra,
   data, auth, payments, design system, etc.).
3. **Identify the non-negotiables** for this build:
   - Most recent stable versions of frameworks and libraries.
   - Industry-standard best practices for the domain.
   - Clean, modern, minimalist design and UX (if any UI is involved).
   - Security: no obvious vulnerabilities; secrets handled correctly;
     input validated; authn/authz correct; dependencies vetted.
   - Tests where they make sense; no dead code; no TODOs left in.
4. **Decompose into agent assignments**. Pick **2–10** specialist subagents
   from the environment's available `subagent_type` list. Selection rules:
   - Domain fit over prestige. UI work → UI/UX agents. Backend → backend
     architect / database / API. Mobile → mobile builder. Etc.
   - Always include at least one builder per major domain in scope.
   - Always include a **`Security Engineer`** (or closest available
     security/audit agent) for the security pass in §4.
   - Always include a **`Code Reviewer`** AND a QA-style agent
     (`Reality Checker`, `Evidence Collector`, `Test Results Analyzer`,
     or `API Tester` — pick what fits) for the §5 gate.
   - If the build has any UI surface, include a **`UI Designer`** or
     **`UX Architect`** to enforce the clean/minimalist bar.
   - Prefer specialists over `general-purpose`. Only fall back to
     `general-purpose` if no specialist fits.

Announce the plan to the user before dispatching:

```
## Team Lead's plan
**Goal:** <one line>
**Worktree:** $WT_PATH on $BRANCH (base: $BASE_BRANCH @ $BASE_SHA)
**Target branch:** $TARGET_BRANCH (or "none — leaving worktree for review")

## Assembled team
- **<agent>** — <specific order, 1 line>
- **<agent>** — <specific order, 1 line>
...

## Non-negotiables
- Latest stable versions of <X, Y>
- <domain best practice>
- Clean, minimalist UI / accessible
- Security audited (see §4)
- Final QA gate (see §5) must pass before ship
```

## 3. Build round (parallel where possible)

Dispatch the build agents. Each agent prompt MUST include:

- The full task description and the Team Lead's plan.
- The exact `$WT_PATH` and an instruction that **all file changes happen
  under `$WT_PATH/…` using absolute paths**.
- The agent's **specific order** — not "help with the build", but a
  precise scope: "Implement the auth API at `$WT_PATH/server/auth/…`
  using <stack>; do not touch the UI layer."
- The non-negotiables (latest stable libs, best practices, minimalist UX
  if UI, no secrets in code, no TODOs).
- An explicit instruction to **commit their work** in the worktree with a
  conventional, descriptive message before returning.
- A short structured report back: what they built, key files, decisions,
  open questions, anything they punted.

Run independent agents **in parallel in a single message**. Run dependent
agents sequentially (e.g., backend API before the frontend that consumes
it, unless contracts are stubbed first).

After the round, the Team Lead reads every agent's report and inspects the
worktree (`git log`, `git diff`, targeted `Read`s). The Team Lead writes a
short **integration check**: do the pieces fit? Any contradictions? Any
gaps?

If integration is broken, the Team Lead either fixes it inline (small) or
dispatches a follow-up agent (large) before proceeding.

## 4. Security audit pass

Dispatch the Security agent (and `Blockchain Security Auditor` /
`Compliance Auditor` if relevant) with this scope:

- Audit **only** the code changed in `$WT_PATH` since `$BASE_SHA`
  (`git diff $BASE_SHA..HEAD`).
- Look for: injection, XSS, SQLi, SSRF, auth/authz flaws, insecure
  deserialization, secrets in code or config, weak crypto, dependency
  vulnerabilities (check against the latest known CVEs the agent is
  aware of), unsafe defaults, missing input validation, missing rate
  limits on sensitive endpoints, PII handling.
- Return a list of findings with severity (Critical / High / Medium /
  Low / Info) and a fix recommendation per finding.

If there are **any** Critical or High findings, the Team Lead MUST dispatch a
fix round (back to §3 with a narrower scope) before continuing. Mediums
are judgment calls; the Team Lead decides. Lows/Info are noted in the final
report but do not block.

## 4.5 Polish & gap pass — what is the user missing?

Before the QA gate, the Team Lead runs an explicit "what did we miss"
pass. Users specify the obvious thing they want; the bar for shipping is
the obvious thing **plus** the surrounding details a thoughtful
collaborator would catch. The Team Lead is responsible for those
details, not the user.

Read the diff and the original task once more, then walk through this
checklist and write a **gap list** (file + concrete fix per item):

- **Edge cases.** Empty input, very large input, unicode/i18n, network
  failure, race conditions, repeated submissions, slow connection.
- **States.** Loading, empty, error, success, partial-success, offline,
  unauthenticated, no-permission. UI surfaces should handle all that
  apply, not just the happy path.
- **Errors.** Are failures user-actionable? No raw stack traces in the
  UI. Server errors logged with enough context to debug. Retries where
  retry is safe.
- **Accessibility (UI).** Keyboard navigation, focus order, visible
  focus ring, semantic HTML, alt text, color contrast, reduced-motion
  respected, screen-reader labels on icon-only buttons.
- **Responsive (UI).** Renders cleanly at narrow (mobile), medium
  (tablet), and wide (desktop) widths. No horizontal overflow. Touch
  targets ≥ 44×44.
- **Performance.** No obvious N+1 query, no synchronous work on the
  request path that should be async, no full-table scans on hot paths,
  bundle isn't bloated by an accidental whole-library import.
- **Observability.** New code paths log enough to debug a prod
  incident. Metrics on anything user-visible. No `console.log` left
  behind.
- **Config & secrets.** New env vars documented (README/`.env.example`).
  No secrets committed. Sensible defaults for local dev.
- **Docs.** README/CHANGELOG/inline doc updated where the public surface
  changed. Migration notes if behavior shifted.
- **Tests.** Coverage matches the project's existing bar — happy path
  + at least one failure mode for the new behavior.
- **Cleanup.** No dead code, no commented-out code, no TODOs, no debug
  prints, no scratch files committed.
- **Project-specific gotchas.** Anything in `CLAUDE.md`, `AGENTS.md`,
  `CONTRIBUTING.md`, or recent commit messages that this build should
  honor (commit conventions, lint rules, banned APIs, deprecation
  paths).

Then ask one harder question: **"If I were the user, what would I
*notice* and ask about in 24 hours?"** Write down 1–3 such items.

If the gap list is non-trivial, dispatch a **polish round** (back to §3
scoped to the gap list only — no scope creep) before §5. Small,
mechanical gaps the Team Lead can fix inline; anything domain-specific
(a11y, performance, error UX) goes to the matching specialist.

If the gap list is trivial or empty, record that fact in the §6 final
report under **"Polish pass"** and proceed. Do not skip this step
silently — even an empty list must be acknowledged.

## 5. QA + code review gate

Dispatch the `Code Reviewer` and the chosen QA agent **in parallel**.

- **Code Reviewer** scope: full diff `$BASE_SHA..HEAD`. Check correctness,
  maintainability, idiomatic use of the chosen stack, dead code, error
  handling at boundaries (don't add fallbacks for impossible states),
  comments only where the *why* is non-obvious, no over-engineering, no
  half-finished work.
- **QA agent** scope: actually exercise the build where possible. Run
  the project's test suite, lint, typecheck if configured. For UI,
  follow the golden path and a few edge cases. Distinguish
  infra-skip (tooling missing) from genuine fail (code is wrong).
  Return concrete, evidence-backed findings — no fantasy approvals.

The Team Lead reads both reports and renders a verdict:

- **APPROVED** — every non-negotiable met, no Critical/High security
  issues, code review is clean (or only nits the Team Lead is willing to
  ship), QA passes. Proceed to §6.
- **NEEDS ANOTHER ROUND** — the Team Lead writes a tight remediation list
  (specific files, specific issues, specific agents to dispatch) and
  loops back to §3 with that scope only. Do not rewrite the world; fix
  what was flagged.

Cap the loop at **3 rounds** by default. After the 3rd failed round, the
Team Lead stops and hands back to the user with: a status report, what's
blocking, and a recommendation (continue, change scope, or abandon).
Don't burn tokens grinding past a structural problem — escalate.

## 5.5 Visual evidence (screenshots)

Once §5 verdict is APPROVED, capture before/after screenshots that show the
task was actually resolved. These are committed to the branch and rendered
inline in the PR body so reviewers see the change without checking out.

Pick the mode that fits the diff:

- **UI / web work** — use Playwright MCP
  (`mcp__playwright__browser_navigate`, `mcp__playwright__browser_take_screenshot`).
  Boot the dev server (or use a deployed preview if the project has one),
  navigate to the affected route(s), and capture at minimum:
  - The golden path of the new behavior (1–3 shots).
  - One edge case or error state if the ticket called one out.
  If the project has a known-good baseline (production URL, `main` build),
  also capture a "before" shot for visual diff.
- **CLI / backend / infra** — capture a terminal transcript instead. Run
  the relevant command(s) (test suite output, the new endpoint via
  `curl`, the migration applying cleanly) and save the transcript as
  `evidence-<step>.txt`. Skip image capture; the PR body links the file.
- **Pure refactor with no observable surface** — skip this section
  entirely and note "no visual surface" in the §6 final report.

Save artifacts under `$WT_PATH/.team-build/evidence/`:
```
$WT_PATH/.team-build/evidence/
  01-before-<slug>.png
  02-after-<slug>.png
  03-edge-<slug>.png
  notes.md          # optional: 1–2 lines per shot describing what to look at
```

Commit the evidence directory in its own commit:
`docs(team-build): add visual evidence for <slug>`. GitHub renders
images committed to the branch when the PR body references them via
relative paths, so no external host is needed.

If Playwright MCP is unavailable, or the dev server can't boot in this
environment, do NOT fabricate shots. Note the limitation in the §6
report ("evidence not captured: <reason>") and let the user decide
whether to capture manually before merging.

## 6. Ship

When the verdict is APPROVED, the Team Lead produces a **final report**:

```
## /team-build — APPROVED
**Goal:** <one line>
**Branch:** $BRANCH
**Worktree:** $WT_PATH
**Commits:** <count>, <range>
**Rounds run:** <n>

### What was built
- <bullet>
- <bullet>

### Security audit
- <findings + how resolved>

### QA + code review
- <findings + how resolved>

### Known limitations / follow-ups
- <bullet> (if any)
```

Then choose the ship path based on `$TARGET_BRANCH`:

### 6a. `$TARGET_BRANCH` was provided — push and open PR

Before pushing, append a **`## Visual evidence`** section to the PR body
listing each captured artifact with a one-line caption and a relative
markdown image link (`![caption](.team-build/evidence/02-after-<slug>.png)`).
GitHub renders images committed to the branch. If §5.5 was skipped
("no visual surface" or "not captured: <reason>"), state that explicitly
in the same section instead of omitting it.

1. Detect remote: `git -C "$REPO_ROOT" remote get-url origin`. If no
   `origin`, abort the push and tell the user how to add one — leave the
   worktree as-is so they can finish manually.
2. `cd "$WT_PATH" && git fetch origin` (warn on failure; do not abort).
3. Resolve base ref: `origin/$TARGET_BRANCH` if it exists, else
   `$TARGET_BRANCH`, else `$BASE_SHA`. Pick the first that exists.
4. Record lease target before rebase:
   `LEASE=$(git -C "$WT_PATH" rev-parse "origin/$BRANCH" 2>/dev/null || echo "")`.
5. `cd "$WT_PATH" && git rebase "$BASE_REF"` — on conflict, STOP and
   hand back to the user; do not run `git rebase --abort`.
6. **Typed-`yes` gate** before pushing: show `$BRANCH`, the LEASE target
   (or "first push"), and `$BASE_REF`. Require literal `yes`.
7. Push:
   - LEASE non-empty: `git -C "$WT_PATH" push --force-with-lease="$BRANCH:$LEASE" --force-if-includes -u origin "$BRANCH"`.
   - LEASE empty: `git -C "$WT_PATH" push -u origin "$BRANCH"`.
8. `cd "$WT_PATH" && gh pr create --fill --base "$TARGET_BRANCH"`. If
   `gh` is missing, print the push URL from step 7 and stop.
9. **Auto-cleanup after successful push + PR**: once the PR has been
   opened (the branch lives on origin and locally), remove the worktree
   automatically — no question:
   ```
   git -C "$REPO_ROOT" worktree remove "$WT_PATH"
   git -C "$REPO_ROOT" branch -d "$BRANCH"   # safe delete; skip if it fails (unmerged)
   ```
   Print one line confirming both. If `worktree remove` fails (e.g.
   uncommitted changes survived push), fall back to asking the user
   whether to force-remove or keep — do not silently leave artifacts
   without flagging.
10. **Drop the per-worktree DB** if §1.5 created one. Run from
    `$REPO_ROOT` against the same compose service:
    - **Postgres:**
      ```
      docker compose exec -T <svc> psql -U "$USER" -d postgres \
        -c "DROP DATABASE IF EXISTS \"$DB_BRANCH\" WITH (FORCE);"
      ```
    - **MySQL / MariaDB:**
      ```
      docker compose exec -T <svc> mysql -uroot -p"$ROOT_PASS" \
        -e "DROP DATABASE IF EXISTS \`$DB_BRANCH\`;"
      ```
    - **Mongo:**
      ```
      docker compose exec -T <svc> mongosh "$BRANCH_URL" \
        --quiet --eval "db.dropDatabase()"
      ```
    Failures here are non-fatal — log and continue. Skip entirely if
    §1.5 was skipped.

### 6b. No target branch — hand back the worktree

Print `$WT_PATH` and `$BRANCH` and offer the standard 6-option menu from
the `/worktree-task` skill:

```
(a) keep worktree as-is
(b) merge $BRANCH into a target branch
(c) rebase onto base, push, open PR
(d) discard worktree and branch (typed-yes gated)
(e) stash uncommitted changes, keep worktree
(f) adopt branch: remove worktree, checkout $BRANCH in main tree
```

For destructive options, follow `/worktree-task`'s typed-`yes` gates and
discard rules verbatim — do not invent shortcuts.

If §1.5 created a per-worktree DB and the user picks **(d) discard**
or **(f) adopt branch**, also drop the branch DB using the §6a step 10
commands. For **(c) rebase + push**, run the §6a step 10 cleanup after
the PR is opened. For **(a)/(b)/(e)**, leave the branch DB in place —
the user is still using it.

## 7. Failure recovery (read-only reference)

If anything aborts mid-flight, the worktree persists with whatever
commits made it in. The user can resume with `cd $WT_PATH`. Useful:

```
git worktree list --porcelain
git -C "$WT_PATH" log --oneline "$BASE_SHA"..HEAD
git -C "$WT_PATH" status
git reflog --date=iso
```

Repair is the user's call; this skill does not auto-heal.

## Hard rules

- The Team Lead never claims completion without the §5 QA + code review
  passing. "I think it works" is not approval.
- Loop cap is 3 rounds. After that, escalate to the user.
- All file writes go under `$WT_PATH`. Never edit the main working tree
  during a team-build run.
- Never `--no-verify`, never bypass signing, never skip hooks unless the
  user explicitly asks.
- Push only after the typed-`yes` gate. PRs only after the push succeeds.
- After a successful push + PR open in §6a, **always remove the worktree
  and the local branch** (the work is now on origin). Only keep them
  when ESCALATED/FAILED, or when `worktree remove` fails — in which
  case prompt the user instead of silently leaving artifacts.
