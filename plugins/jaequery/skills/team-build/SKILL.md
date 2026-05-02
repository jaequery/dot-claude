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

## 0.5 Discovery — ask everything you need, once, up front

Before touching git or assembling a team, the Team Lead writes a
**fully thought-out plan**. That plan is only as good as the brief.
Treat the user's `<task description>` as the *seed*, not the spec.
You are the senior engineer they hired; ambiguity is your problem to
surface, not theirs to anticipate.

Run a discovery pass:

1. **Read the room first.** Skim the repo (`README`, `CLAUDE.md`,
   manifest, recent `git log`) and the task description. Generate the
   answers you can derive yourself — never ask the user something the
   codebase already tells you.
2. **List every open question** that would change the plan, the
   roster, the diff, or the verification. Group them by category:
   - **Scope & success** — what's in, what's out, how do we know it
     works (acceptance criteria, definition of done).
   - **Users & flows** — who triggers this, what surfaces are
     affected (web, mobile, API, CLI, admin), what edge cases matter.
   - **Data & state** — schemas/migrations, seed data, multi-tenant
     scoping, backwards compatibility for existing rows.
   - **Integrations & secrets** — third parties, webhooks, env vars,
     auth model, rate limits, sandbox vs prod credentials.
   - **Non-functional** — perf budgets, accessibility level,
     observability (logs/metrics/traces), security/PII handling.
   - **Delivery** — target branch, feature flag vs direct ship,
     migration timing, who reviews, deadline.
   - **Constraints & taste** — must-use libs, must-avoid libs, code
     style, design system, UX bar.
3. **Ask them all in a single message** via `AskUserQuestion`. One
   batch, multi-select where useful, with a sane default offered for
   each so the user can speed-run by accepting defaults. Cap at ~6
   questions per batch — if you have more, drop the ones whose
   answer wouldn't actually change the plan. If after the codebase
   pass you genuinely have **zero** load-bearing unknowns, skip the
   ask and proceed.
4. **Echo back the resolved spec** before §1: a short bulleted
   "Brief as understood" the user can correct in one line. Then
   proceed without further confirmation.

Skip the discovery pass when:
- The skill was invoked by another skill (e.g. `/linear-team-build`)
  whose prompt already contains a fully-formed brief — the upstream
  skill owns scoping. Detect this by the prompt explicitly stating
  "[Linear …]" / "do not ask clarifying questions" / supplying
  `--working-branch`.
- The user's prompt itself is exhaustive (acceptance criteria, target
  branch, constraints all present). When in doubt, ask.

Never ask trickle questions across multiple turns — it burns the
user's patience and fragments the plan. One batch, then build.

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

The plan is the contract for everything downstream. A vague plan
produces a vague diff. Before dispatching anyone, the Team Lead
produces a **fully thought-out, explicit, falsifiable** plan grounded
in §0.5 discovery answers and what you read in the codebase.

Build the plan in this order:

1. **Goal & success criteria.** One sentence on what's being built,
   then 3–7 *falsifiable* acceptance criteria — observable behaviors
   a tester could check ("user can submit form X with email Y and
   sees confirmation Z within 2s"), not vibes ("works well").
2. **Out of scope.** Explicit list of things this build will NOT do.
   This is the most-skipped section and the one that prevents drive-by
   refactors and scope creep. If you can't name 2–3 things you're
   deliberately not doing, you haven't bounded the work.
3. **Domains touched.** Frontend / backend / infra / data / auth /
   payments / design system / etc. Used to size the team in step 7.
4. **Architecture sketch.** A short outline naming the *new* and
   *changed* artifacts:
   - Files to create (path → purpose, one line each).
   - Files to modify (path → what changes).
   - Database changes (new tables/columns/indexes/constraints,
     migrations needed yes/no).
   - New routes / endpoints / events / jobs / cron / queues.
   - New env vars / config / secrets.
   - External services touched (with auth model + sandbox vs prod).
   No code yet — this is the map. If you can't draw it, you don't
   understand the task; loop back to §0.5.
5. **Risks & unknowns.** 2–5 bullets naming the ways this could go
   sideways (perf hot path, race condition, migration on a hot
   table, breaking change, third-party flakiness) and the mitigation
   for each. "No known risks" is almost always wrong; push harder.
6. **Verification plan.** How §5 (QA gate) will *prove* each
   acceptance criterion. Map each criterion → the artifact that
   proves it (unit test, integration test, screenshot, transcript,
   manual smoke). The QA agent reads this map; missing entries =
   missing proof = blocked ship.
7. **Roster & orders.** Pick **2–10** specialist subagents from the
   environment's `subagent_type` list. Selection rules:
   - Domain fit over prestige. UI → UI/UX agents. Backend → backend
     architect / database / API. Mobile → mobile builder. Etc.
   - Always include at least one builder per major domain in scope.
   - Always include a **`Security Engineer`** (or closest security
     agent) for the §4 security pass.
   - Always include a **`Code Reviewer`** AND a QA-style agent
     (`Reality Checker`, `Evidence Collector`, `Test Results Analyzer`,
     or `API Tester`) for the §5 gate.
   - If the build has any UI surface, include a **`UI Designer`** or
     **`UX Architect`** to enforce the clean/minimalist bar.
   - Prefer specialists over `general-purpose`. Each agent gets a
     **scoped order** (1–2 sentences) tied to the artifacts in step 4
     — never "make it work", always "create `X` that does `Y`,
     wired into `Z`".
8. **Sequencing.** Identify what must run *before* what (data layer
   before UI, auth before authed endpoints, etc.) and which agents
   can run in parallel. The §3 build round uses this directly.
9. **Non-negotiables.** Latest stable framework versions, project
   conventions reused (don't reinvent existing helpers — name the
   ones you'll lean on), no dead code / TODOs / commented-out code,
   secrets via env, validation at boundaries, accessibility AA where
   UI exists.

Announce the plan to the user before dispatching — full, not
abridged. The user's confirmation here is implicit (the skill is
high-velocity), but this is their last chance to redirect, so make it
legible:

```
## Team Lead's plan

**Goal:** <one line>
**Success criteria (falsifiable):**
1. <criterion>
2. <criterion>
…

**Out of scope:**
- <thing not being done>
- <thing not being done>

**Worktree:** $WT_PATH on $BRANCH (base: $BASE_BRANCH @ $BASE_SHA)
**Target branch:** $TARGET_BRANCH (or "none — leaving worktree for review")
**Per-worktree DB:** <from §1.5>

## Architecture sketch
**New files**
- `path/to/file` — <one-line purpose>

**Modified files**
- `path/to/file` — <what changes>

**Data**
- <migration / schema change / "no DB changes">

**Surfaces**
- Routes: <list> · Jobs: <list> · Events: <list> · Env: <list>

**External services**
- <name> (auth: <model>, env: <sandbox|prod>)

## Risks & mitigations
- <risk> → <mitigation>
- <risk> → <mitigation>

## Verification map
| # | Criterion | Proof artifact |
|---|-----------|----------------|
| 1 | <crit>    | <test / shot / transcript> |

## Assembled team & orders
- **<agent>** — <scoped order tied to specific files/artifacts>
- **<agent>** — <scoped order tied to specific files/artifacts>

## Sequencing
1. <agent(s) running first> — <why first>
2. <agent(s) next, in parallel> — <why parallel>
…

## Non-negotiables
- Latest stable versions of <X, Y>
- Reuse existing helpers: <names>
- Clean, minimalist UI / accessible (where applicable)
- Security audited (§4)
- QA gate (§5) verifies every success criterion above before ship
```

If any section above would be empty or hand-wavy ("TBD", "as
needed"), STOP and either re-derive it from the codebase or add the
missing question to a §0.5 follow-up batch. Do not dispatch on a
plan with holes — those holes become bugs.

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

**Step 1 — UI-diff detection (do this first, before dispatching anyone).**

```bash
UI_DIFF=$(cd "$WT_PATH" && git diff --name-only "$BASE_SHA"..HEAD \
  | grep -iE '\.(tsx|jsx|vue|svelte|astro|html|css|scss|sass|less|stylus)$|/(components|pages|app|views|routes|styles|public)/' \
  | head -1)
```

If `$UI_DIFF` is non-empty → this is UI work. The Team Lead **must**
execute the §5a capture script *inline* (not delegate to QA) before or
in parallel with QA dispatch. Capture is mechanical, not judgment —
the QA agent's job is to render a verdict, not to run shell scripts.

> ## ⛔ The diff regex is the ONLY test for "is this UI work?"
>
> If `$UI_DIFF` is non-empty, capture is mandatory. You do NOT get to
> override this with a self-judged "no UI surface mutation" / "pure
> label gate" / "backend-driven label fix" / "no new component" /
> "covered by unit tests" rationale. **All of the following count as
> UI mutations and require a walkthrough:**
>
> - **Conditional-render gates.** Changing whether or when an existing
>   element appears (`{cond && <Pill/>}`, ternary class swaps,
>   `display: none` toggles, `visibility` flips). The pixels the user
>   sees change → it's a UI change. PIN-88 (newpintask, May 2026) is
>   the canonical failure: a one-line edit to a render condition
>   shipped without a walkthrough because the agent ruled "no UI
>   surface mutation"; reviewer had no visual proof the fix worked.
> - **Pill / badge / chip / banner / toast / status-label rendering
>   conditions.** Even if no JSX node was added, gating which one
>   renders or which copy/color is shown is a UI change.
> - **Variant gating** (loading vs. empty vs. error vs. success vs.
>   permission-denied state selection).
> - **Class-string changes** (color, size, layout, spacing,
>   visibility, focus, hover, disabled).
> - **Copy / label / icon swaps** in any rendered surface.
> - **Helper functions consumed by JSX** (e.g. `isMatchTerminallyExhausted`,
>   `getStatusColor`, `formatLabel`) — even if the helper itself
>   lives in a non-UI file, if its callers are in `.tsx`/JSX render
>   paths, the diff regex catches the callers and the rule applies.
>
> The ONLY waivers are:
> 1. The diff regex genuinely matched only non-render files (test
>    fixtures, `.d.ts` types, storybook stories with no production
>    callers, build/config touching `app/` paths).
> 2. The capture script *itself* failed (boot error, no E2E config,
>    auth wall the synthetic flow can't pass). In that case follow
>    §5a's "capture failed" path — surface the reason loudly, do
>    not silently skip.
>
> Phrases that have shipped past this gate before and must NOT — if
> you find yourself writing any of these in the §5/§6 report, STOP
> and run capture instead:
> - "_Walkthrough not captured: no UI surface mutation_"
> - "_Backend-driven label bug — pure logic change_"
> - "_The change is verified by unit tests; no walkthrough needed_"
> - "_No new component was added; visual capture N/A_"
>
> Unit tests verify *logic correctness*. Walkthroughs verify *what
> the user sees*. They are not substitutes. Both are required when
> `$UI_DIFF` matches.

**Step 2 — dispatch `Code Reviewer` and the chosen QA agent in parallel.**

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

**Step 3 — APPROVED precondition (hard gate).**

When `$UI_DIFF` is non-empty, the Team Lead **CANNOT** output APPROVED
unless `$WT_PATH/.team-build/evidence/00-walkthrough.{webm,mp4}` exists
on disk and is ≥50KB. No exceptions, no waivers, no "I checked it
manually". If the file is missing or undersized:
- Re-run the §5a capture script inline once more with verbose logging.
- If still missing, the verdict is **NEEDS ANOTHER ROUND** with the
  specific remediation "fix capture: <error from script>". Hand the
  failure to the relevant specialist (Frontend Developer if the dev
  server won't boot; DevOps if Playwright config is broken; etc.).
- Three failed capture rounds → **ESCALATED** to the user. Do not
  silently ship UI work without a walkthrough.

This rule exists because past runs shipped UI changes claiming "QA
passed" with no actual visual proof, and the user couldn't tell
whether the build worked until they pulled and ran it themselves.

## 5a. Capture script (Team Lead runs this inline when `$UI_DIFF` is non-empty)

When `$UI_DIFF` from §5 is non-empty, the **Team Lead executes this
script inline** (do not delegate to the QA agent — its dispatch prompt
won't carry the script verbatim, and past runs have silently skipped
capture as a result). The artifact at
`$WT_PATH/.team-build/evidence/00-walkthrough.{webm,mp4}` is a hard
APPROVED precondition per §5 step 3. This replaces the post-APPROVED
§3d.5 boot in `/linear-team-build` and the §5.5 still-only flow.

**Capture-script resolution order** (first that exists wins):

1. **Existing E2E tests** (preferred). If the repo has Playwright or
   Cypress configured, run those tests with video recording on — they
   already know how to boot the server, log in, seed data, and
   navigate the real flows. This is the highest-fidelity capture
   because it shows the actual feature being exercised, not a synthetic
   scroll.

   **Playwright** (detected by any `playwright.config.{ts,js,mjs}`
   under the repo, or `@playwright/test` in any `package.json`).
   Resolve the config path (often in a workspace package, not the
   repo root):
   ```bash
   PW_CFG=$(find "$WT_PATH" -maxdepth 4 -name 'playwright.config.*' \
     -not -path '*/node_modules/*' | head -1)
   PW_DIR=$(dirname "$PW_CFG")   # cwd for the test run
   ```

   **Prefer the most-specific UI script.** Look in `package.json` (or
   the workspace `package.json` colocated with the config) for these
   scripts in order: `test:e2e:ui` → `test:e2e` → fall back to bare
   `npx playwright test`. UI-scoped scripts run faster and avoid the
   API-only suite.

   **Force video on without mutating the tracked config.** Write a
   temp override config that extends the project's, then pass it via
   `--config`. There are four load-bearing details — every one of
   them has shipped a broken capture run before.
   ```bash
   EVID="$WT_PATH/.team-build/evidence"
   mkdir -p "$EVID"
   # Strip the trailing ".ts"/".js"/".mjs" — TS module imports use the
   # bare specifier, and Playwright's loader resolves it.
   PW_CFG_BARE="${PW_CFG%.*}"
   # The override MUST be a .ts file (NOT .mjs). Reason: when the
   # project's config is `playwright.config.ts`, Node's ESM loader
   # cannot import a .ts file directly, and a .mjs override that
   # imports the .ts config fails with `SyntaxError: Cannot use import
   # statement outside a module`. A .ts override is loaded by
   # Playwright's own TS-aware module loader, which handles both.
   cat > /tmp/tb-pw-override-$$.config.ts <<EOF
   import base from "$PW_CFG_BARE";
   const cfg: any = (base as any).default ?? base;
   const FORCED_USE = {
     video: "on" as const,
     screenshot: "on" as const,
     trace: "on" as const,
     // Force headless — QA runs in background and must never spawn
     // a visible browser window.
     headless: true,
     launchOptions: { ...(cfg.use?.launchOptions ?? {}), headless: true },
   };
   export default {
     ...cfg,
     // Top-level use is layered FIRST in Playwright config; projects[].use
     // overrides it. So we must apply FORCED_USE to BOTH levels — otherwise
     // \`video: "on"\` is silently overridden by any project that sets its
     // own \`use\` block (very common — \`...devices["Desktop Chrome"]\`).
     use: { ...(cfg.use ?? {}), ...FORCED_USE },
     projects: (cfg.projects ?? []).map((p: any) => ({
       ...p,
       use: { ...(p.use ?? {}), ...FORCED_USE },
     })),
     // webServer.cwd defaults to the directory the config file lives in.
     // Our override is in /tmp, so without an explicit cwd, \`pnpm exec\`
     // commands fail with ERR_PNPM_RECURSIVE_EXEC_NO_PACKAGE because /tmp
     // isn't a workspace. Pin cwd back to the project's package directory.
     webServer: cfg.webServer ? {
       ...cfg.webServer,
       cwd: "$PW_DIR",
     } : undefined,
     reporter: [
       ["list"],
       ["html", { outputFolder: "$EVID/playwright-report", open: "never" }],
     ],
     outputDir: "$EVID/playwright-output",
   };
   EOF
   ```

   **Run, scoped to the diff.** Pass `--grep` based on changed files
   (e.g. diff touches `components/Login.tsx` → `--grep login`); if no
   spec matches, run the full UI suite. Use the project's package
   manager from `corepack`:
   ```bash
   ( cd "$PW_DIR" && \
     pnpm exec playwright test \
       --config="/tmp/tb-pw-override-$$.config.ts" \
       ${GREP:+--grep "$GREP"} \
       || echo "playwright tests failed" )
   ```

   **⚠️ Manually-created browser contexts bypass `video: "on"`.**
   Playwright's config-level `video` only applies to contexts the
   test runner creates automatically. If the project has an E2E
   fixture that does `await browser.newContext()` (no options) — a
   common pattern for custom auth flows like better-auth's `authAs`
   helper — the video config does NOT propagate, and no `.webm` is
   produced even when the run is otherwise healthy. Symptoms: traces
   and `test-finished-1.png` appear in `playwright-output/` but no
   `.webm` files exist. Three options, in order of preference:

   1. **Detect early and add explicit screenshots to the spec.** The
      §5.5 visual evidence accepts step screenshots in lieu of a
      walkthrough video (see §5.5 "CLI / backend / infra" exception
      for cases where video can't be produced). Add 3-5
      `await page.screenshot({ path: ... })` calls at key states.
      Path: write to `$EVID` directly so they land alongside the
      override's `outputDir`.
   2. **Modify the fixture once.** Pass `recordVideo: { dir, size }`
      into `browser.newContext()` so the project's auth-aware
      contexts record. This is a one-line shared-test-infra change
      and the right long-term fix; only do it if the user authorizes
      touching shared test code.
   3. **Synthetic fallback.** Drop to the synthetic walkthrough
      below (option 4), which records its own context and bypasses
      the project's fixture entirely. Skips real auth — useful for
      pages that work logged-out, useless for protected routes.

   Detection heuristic: after the run, if `playwright-output/` has
   PNGs and `trace.zip` but zero `.webm` files, the project's
   fixtures bypassed video — fall through to option 1.

   **Harvest.** Every test now records a `.webm` and screenshots
   (because `video: "on"` + `screenshot: "on"`). Extract just the
   inline-renderable assets — Linear can't render the HTML report bundle:
   ```bash
   # Primary walkthrough: the most-recent (or longest) video.
   WEBM=$(find "$EVID/playwright-output" -name '*.webm' -print0 \
     | xargs -0 ls -t 2>/dev/null | head -1)
   [ -n "$WEBM" ] && cp "$WEBM" "$EVID/00-walkthrough.webm"

   # Up to 3 screenshots from the test run (Playwright names them by
   # test/step). Numbered for stable ordering in the comment.
   i=1
   find "$EVID/playwright-output" -name '*.png' -print0 \
     | xargs -0 ls -t 2>/dev/null | head -3 \
     | while read -r SHOT; do
         cp "$SHOT" "$EVID/0${i}-step.png"
         i=$((i+1))
       done
   ```

   Also zip the HTML report so it can be attached to the Linear
   comment as a download (Linear can't render the bundle inline, but
   reviewers without the repo checked out can grab it from the
   ticket):
   ```bash
   ( cd "$EVID" && zip -qr playwright-report.zip playwright-report )
   ```
   The unzipped report stays in place and gets committed to the
   branch by §5.5 — reviewers with the repo run
   `npx playwright show-report .team-build/evidence/playwright-report`.

   If `pnpm exec playwright` isn't available (no monorepo workspace
   resolution), fall through to `npx --yes playwright@<version-from-lockfile>`.

   **Cypress** (detected by `cypress.config.{ts,js}` or `cypress` in
   `package.json`):
   ```bash
   npx cypress run \
     --config video=true,videosFolder="$WT_PATH/.team-build/evidence/cypress" \
     || echo "cypress tests failed"
   find "$WT_PATH/.team-build/evidence/cypress" -name '*.mp4' \
     -print0 | xargs -0 ls -t | head -1 \
     | xargs -I{} cp {} "$WT_PATH/.team-build/evidence/00-walkthrough.mp4"
   ```
   Cypress emits `.mp4`; the upload path in §3d.5 / §5.5 should set
   `$CT=video/mp4` accordingly. Linear renders both inline.

   **Test selection.** If the diff touches specific files, prefer the
   E2E spec whose name or grep pattern matches the changed component
   (e.g. diff includes `components/Login.tsx` → run `--grep login` or
   `cypress run --spec '**/login*'`). Falls back to the full UI suite
   if no match.

   **Canonical reference setup** (newpintask pattern, applies to most
   pnpm/Next.js monorepos here):
   - `apps/<pkg>/playwright.config.ts` with its own `webServer` block
     that does `next build && next start` on a dedicated port.
   - `globalSetup` + `.env.test` + a separate `_e2e` Postgres database.
   - Scripts: `test:e2e` (all), `test:e2e:ui` (UI specs only),
     `test:e2e:api` (API specs only). HTML reporter writes to
     `e2e/.report/`.
   - Default `use.video: "retain-on-failure"`. The override-config
     above flips this to `"on"` for the QA run without modifying the
     tracked file.
   No extra dev-server boot or migrate/seed needed — the Playwright
   `webServer` block handles it.

2. `$WT_PATH/.team-build/capture.sh` — repo-owned hook. Receives env
   vars `WALK_OUT` and `WALK_URL` and is responsible for the entire
   boot → record → teardown cycle. Use this when the repo has no E2E
   tests but needs custom auth/migrations/preview-URL handling.

3. `package.json` field `team-build.capture` — same contract.

4. **Default convention** — if `pnpm-lock.yaml` exists and
   `package.json` defines `db:migrate`, `db:seed`, and `dev` scripts:
   ```bash
   pnpm install --frozen-lockfile
   pnpm db:migrate
   pnpm db:seed
   pnpm dev &   # background; capture the printed URL
   ```
   Then run the synthetic walkthrough script below. Falls back to
   legacy detection (npm/yarn/bun `dev`, `bin/dev`, etc.) if pnpm
   conditions don't match.

**Synthetic fallback walkthrough** (only when steps 1–4 don't cover
it). Playwright MCP does not expose `recordVideo`, so shell out to
`npx playwright`:

```bash
mkdir -p "$WT_PATH/.team-build/evidence"
cat > /tmp/tb-walk-$$.mjs <<'EOF'
import { chromium } from 'playwright';
const url = process.env.WALK_URL;
const out = process.env.WALK_OUT;
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: out, size: { width: 1440, height: 900 } },
});
const page = await ctx.newPage();
await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(800);
for (let i = 0; i < 4; i++) {
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(700);
}
await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
await page.waitForTimeout(900);
const focusable = await page.$('button, a, input, [role=button]');
if (focusable) { await focusable.hover(); await page.waitForTimeout(500); }
await ctx.close();
await browser.close();
EOF
WALK_URL="$URL" WALK_OUT="$WT_PATH/.team-build/evidence" \
  timeout 45s npx --yes -p playwright@latest node /tmp/tb-walk-$$.mjs \
  || echo "video capture failed"
WEBM=$(ls -1t "$WT_PATH/.team-build/evidence"/*.webm 2>/dev/null | head -1)
[ -n "$WEBM" ] && mv "$WEBM" "$WT_PATH/.team-build/evidence/00-walkthrough.webm"
```

PNG stills (`01-desktop.png`, `02-mobile.png`, `03-state.png`) are
still captured via Playwright MCP as a fallback if the `.webm` is
missing or <50KB.

**Failure semantics.**
- Capture script exits non-zero, server doesn't answer, or video file
  is missing/<50KB → QA agent reports "capture failed: <reason>" as a
  finding. Team Lead decides whether this blocks APPROVED:
  - If the diff is genuinely UI-bearing, capture failure = NEEDS
    ANOTHER ROUND (or ESCALATED if the failure is structural, e.g.
    missing `.team-build/capture.sh` for an auth-walled app).
  - If the diff is UI-adjacent but the user can verify another way
    (Storybook, test snapshot), Team Lead may waive and proceed.
- This is the only place capture failure is allowed to surface as a
  blocker. §5.5 and `/linear-team-build` §3d.5 reuse the artifact
  produced here; they do not re-boot the server.

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

## 5.5 Visual evidence (verify on disk — do NOT commit)

For UI work, the walkthrough video and stills already exist under
`$WT_PATH/.team-build/evidence/` from §5a (captured during QA, not
after). **Evidence artifacts are NOT committed to the repo.** They
are uploaded to Linear / posted as a GitHub PR comment by the
orchestrator (e.g. `/linear-team-build` §3d.5), so committing them
would only bloat the diff and pollute reviewers' `Files changed`
view.

This section just verifies the artifacts are on disk and ready for
upload — no `git add`, no `git commit`.

- **UI work** — confirm `00-walkthrough.webm` (or `.mp4`, or the
  `0[1-3]-step.png` still set) exists under
  `$WT_PATH/.team-build/evidence/`. Record the filenames in the §6
  final report so the orchestrator (or the user, in standalone mode)
  knows what to upload.
- **CLI / backend / infra** — capture a terminal transcript instead.
  Save it to `$WT_PATH/.team-build/evidence/evidence-<step>.txt`.
  Same rule: do not commit; the orchestrator uploads or links it.
- **Pure refactor with no observable surface** — skip this section
  entirely and note "no visual surface" in the §6 final report.

If §5a flagged "capture failed" and the Team Lead chose to waive
(non-critical UI surface), record "evidence not captured: <reason>"
in the §6 report. Do not fabricate shots.

> **Why not commit?** Evidence is QA artifact, not source. It belongs
> on the ticket (Linear) or the PR conversation (GitHub PR comment),
> not in `git log`. Committing it forces every future clone, blame,
> bisect, and `git log -- <path>` to drag binary screenshots through
> history forever, and shows up under `Files changed` where it has
> no business being.

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

**Do NOT append a `## Visual evidence` section that links into
`.team-build/evidence/...`.** Evidence is not committed (per §5.5),
so relative-path image links would 404 on GitHub. Instead, append a
short **`## Walkthrough`** section that names the local artifacts:

```markdown
## Walkthrough

QA captured a walkthrough video and step screenshots; they are
attached to the Linear ticket (and/or as a follow-up PR comment) —
not committed to the branch.

- Walkthrough: `00-walkthrough.webm` (~<n>s)
- Steps: `01-step.png`, `02-step.png`, `03-step.png`
```

If §5.5 was skipped ("no visual surface" or "not captured: <reason>"),
state that explicitly in the same section instead of omitting it. The
orchestrator (`/linear-team-build` §3d.5, or a human running standalone)
is responsible for uploading the actual files to Linear / a PR comment.

1. Detect remote: `git -C "$REPO_ROOT" remote get-url origin`. If no
   `origin`, abort the push and tell the user how to add one — leave the
   worktree as-is so they can finish manually.
2. `cd "$WT_PATH" && git fetch origin` (warn on failure; do not abort).
3. Resolve base ref: `origin/$TARGET_BRANCH` if it exists, else
   `$TARGET_BRANCH`, else `$BASE_SHA`. Pick the first that exists.
4. Record lease target before rebase:
   `LEASE=$(git -C "$WT_PATH" rev-parse "origin/$BRANCH" 2>/dev/null || echo "")`.
5. **Merge-conflict preflight.** Probe whether `$BRANCH` merges cleanly
   into `$BASE_REF` before touching the index:
   `git -C "$WT_PATH" merge-tree --write-tree --name-only --no-messages "$BASE_REF" "$BRANCH"`.
   If the output contains any filenames (conflicting paths), STOP and
   list them to the user — do not proceed to step 6.
6. `cd "$WT_PATH" && git rebase "$BASE_REF"` — on conflict, STOP and
   hand back to the user; do not run `git rebase --abort`. The user
   resolves locally (`git add` + `git rebase --continue`) and re-runs.
7. **Post-rebase conflict guard.** Before pushing, verify the working
   tree is clean and no conflict markers survived:
   - `git -C "$WT_PATH" status --porcelain` must be empty.
   - `git -C "$WT_PATH" ls-files -u` must be empty (no unmerged entries).
   - `git -C "$WT_PATH" grep -nE '^(<{7}|={7}|>{7}) ' -- ':!*.md'` must
     return nothing (no leftover `<<<<<<<` / `=======` / `>>>>>>>` markers).
   Any check failing → STOP and report to the user. Do not push.
8. **Typed-`yes` gate** before pushing: show `$BRANCH`, the LEASE target
   (or "first push"), and `$BASE_REF`. Require literal `yes`.
9. Push:
   - LEASE non-empty: `git -C "$WT_PATH" push --force-with-lease="$BRANCH:$LEASE" --force-if-includes -u origin "$BRANCH"`.
   - LEASE empty: `git -C "$WT_PATH" push -u origin "$BRANCH"`.
10. `cd "$WT_PATH" && gh pr create --fill --base "$TARGET_BRANCH"`. If
    `gh` is missing, print the push URL from step 9 and stop.
11. **Auto-cleanup after successful push + PR**: once the PR has been
   opened (the branch lives on origin and locally), remove the worktree
   automatically — UNLESS an orchestrator has asked you to defer.

   **Defer signal.** If the invoking prompt body contains the literal
   string `DEFER_WORKTREE_CLEANUP=1` (set by `/linear-team-build` so
   §3d.5 can read evidence files off disk), SKIP this step entirely.
   Print: `worktree retained for orchestrator: $WT_PATH`. The
   orchestrator owns cleanup after it's done with the artifacts.

   Otherwise, clean up now:
   ```
   # Evidence is no longer committed (per §5.5), so nothing under
   # $WT_PATH/.team-build/evidence/ lives on origin. The whole tree is
   # ephemeral — sweep it before `worktree remove`, since the dir is
   # untracked and would block removal.
   rm -rf "$WT_PATH/.team-build/evidence" 2>/dev/null
   git -C "$REPO_ROOT" worktree remove "$WT_PATH"
   git -C "$REPO_ROOT" branch -d "$BRANCH"   # safe delete; skip if it fails (unmerged)
   ```
   Print one line confirming both. If `worktree remove` STILL fails
   after the sweep (means real uncommitted changes survived push), fall
   back to asking the user whether to force-remove or keep — do not
   silently leave artifacts without flagging. In autonomous-push mode
   without the defer signal, force-remove is the right call after the
   sweep — log the reason but don't block on it.
12. **Drop the per-worktree DB** if §1.5 created one. Run from
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
