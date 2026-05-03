---
name: supabuild
description: >
  Multi-mode build / design / Linear-burndown / worktree skill.
  Parses the first whitespace-delimited token of $ARGUMENTS as a mode:
  `build` runs a Team Lead orchestrator (plan → 2–10 specialist subagents
  → security audit → QA + code review, looping until clean) in an isolated
  git worktree, optionally pushing to a target branch and opening a PR;
  `design` generates 2–10 divergent design variants in parallel, each in
  its own worktree, critiqued by a world-class Design Lead; `linear` burns
  down a Linear "Todo" queue, one clean PR per ticket, narrating every
  state/label transition back into Linear; `worktree` is the thin
  `git worktree` wrapper used as a building block. Use when the user
  says "/supabuild", "/supabuild build ...", "/supabuild design ...",
  "/supabuild linear", "/supabuild worktree ...", "ceo build", "chief
  executive build", "build with a chief and team", "build this with a
  chief and team", "run this as a chief-led build", "multi-agent build",
  "build with QA gate", "design variants", "give me design options",
  "show me variants", "explore directions", "I want to pick from a few
  looks", "burn down my linear todos", "burn down linear", "ship every
  linear todo", "do X in a worktree", "run this in an isolated branch",
  "spin up a worktree for Z", "isolated branch", or otherwise wants a
  multi-agent build, parallel design exploration, autonomous Linear
  backlog burndown, or a side-branch workspace that won't disturb the
  current checkout. Mode-routing is explicit: the first token of
  $ARGUMENTS picks §A (build) / §B (design) / §C (linear) / §D
  (worktree); natural-language phrase invocations route to the same
  sections.
---

# /supabuild — Multi-Agent Build / Design / Linear-Burndown / Worktree

`/supabuild` is one mode-routed entry point with four flows: a
Team-Lead-orchestrated multi-agent build (§A), parallel
design-variant exploration (§B), autonomous Linear backlog
burndown (§C), and a thin git-worktree wrapper (§D). The first
whitespace-delimited token of `$ARGUMENTS` selects the flow;
sections cross-reference each other via the `§A`/`§B`/`§C`/`§D`
letter prefix.

## Mode routing

Parse `$ARGUMENTS`. Take the first whitespace-delimited token
(lowercased) as the mode:

- `build` → §A (build flow). Remainder of args = task description.
- `design` → §B (design flow). Remainder of args = task description.
- `linear` → §C (linear flow). Remainder of args = optional
  team/assignee filter / flags.
- `worktree` → §D (worktree flow). Remainder of args = task
  description.

If the first token is none of the above (or if `$ARGUMENTS` is empty),
treat the entire `$ARGUMENTS` string as a freeform task description and
default to §A.

When the user invokes via the natural-language phrase forms ("ceo
build", "build with a chief and team", "give me design options",
"burn down linear", "do X in a worktree", etc.), route to the
corresponding section as if the mode had been passed explicitly.
Specifically:

- "ceo build", "chief executive build", "build with a chief and team",
  "build this with a chief and team", "run this as a chief-led build",
  "multi-agent build", "build with QA gate" → §A.
- "design variants", "give me design options", "show me variants",
  "explore directions", "I want to pick from a few looks" → §B.
- "burn down my linear todos", "burn down linear", "ship every linear
  todo" → §C.
- "do X in a worktree", "run this in an isolated branch", "spin up a
  worktree for Z", "isolated branch" → §D.

The four sections below are self-contained — every internal cross-
reference within a section uses the section letter as a prefix
(`§A.3`, `§B.6`, `§C.3d.5`, `§D.5`) so there's no ambiguity between,
e.g., "§3" in build (a build round) and "§3" in linear (a per-ticket
loop).

---

## §A — `build`

You are the **Team Lead** of this build. You own the outcome. You plan,
delegate, review, and decide when the work ships. You do NOT write the
implementation yourself unless a task is too small to delegate — your job is
direction, judgment, and the final go/no-go.

Take this seriously. The user is trusting you to ship something real,
secure, and modern. Do not flatter the team. Do not approve work that does
not meet the bar.

### A.0. Inputs

The user invokes `/supabuild build <task description>`. They may also pass:

- A **target branch** (e.g. `--branch feature/foo` or "push to `develop`").
  If provided, the final approved work is pushed there and a PR is opened.
- A **working branch** (e.g. `--working-branch jaequery/pin-56-fix-foo`).
  If provided, this overrides the auto-generated `supabuild/$SLUG-$TS`
  branch name. Used by §C (linear flow) to honor Linear's
  suggested branch name (`issue.branchName`). The `supabuild/` prefix
  is **not** applied; use the name verbatim.
- If no target branch is provided, the worktree + branch is left in place
  and the user is offered the standard cleanup menu (see §A.6).

### A.0.5 Discovery — ask everything you need, once, up front

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
4. **Echo back the resolved spec** before §A.1: a short bulleted
   "Brief as understood" the user can correct in one line. Then
   proceed without further confirmation.

Skip the discovery pass when:
- The skill was invoked by §C (the linear flow inside
  this same skill) whose prompt already contains a fully-formed
  brief — the upstream flow owns scoping. Detect this by the prompt
  explicitly stating "[Linear …]" / "do not ask clarifying questions"
  / supplying `--working-branch`.
- The user's prompt itself is exhaustive (acceptance criteria, target
  branch, constraints all present). When in doubt, ask.

Never ask trickle questions across multiple turns — it burns the
user's patience and fragments the plan. One batch, then build.

### A.1. Create the isolated worktree

Use the §D worktree-creation logic — same preflight, same path
conventions — but run it inline here so the Team Lead retains control
of the session. (See §D for the full mental model and recovery
commands; §A.1 below is the build-flavored specialization.)

Compute:
- `$REPO_ROOT` — `git rev-parse --show-toplevel` (or, if inside a linked
  worktree, `dirname $(git rev-parse --git-common-dir)`).
- `$REPO_NAME` — basename of `$REPO_ROOT`.
- `$SLUG` — 2–4 kebab-case words from the task (`^[a-z0-9][a-z0-9-]{0,39}$`).
- `$TS` — `date +%Y%m%d-%H%M%S`.
- `$BRANCH` — user-supplied `--working-branch <name>` if present
  (used verbatim, no prefix added); otherwise `supabuild/$SLUG-$TS`.
- `$WT_PATH` — `$(dirname $REPO_ROOT)/$REPO_NAME.supabuild-$SLUG-$TS`
  (the worktree path keeps the `supabuild-` prefix even when
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

### A.1.5 Per-worktree database branch (ORM-agnostic, auto-detected)

Parallel worktrees that all hit the same dev database trample each
other's data. This step gives each worktree its own logical database
on the project's existing dev DB server, so the build can migrate,
seed, and exercise data without touching anyone else's state.

**This step is best-effort.** At every check below, on miss/failure,
log the reason in the plan announcement and continue without a
per-worktree DB. Do not block the build.

#### Detect

1. **Compose file.** `$REPO_ROOT/docker-compose.yml`, `compose.yml`, or
   `docker-compose.yaml`. None present → skip §A.1.5 entirely.
2. **DB service.** `docker compose -f $COMPOSE_FILE config --format json`
   and pick the first service whose `image` matches one of:
   `postgres`, `postgis/postgis`, `mysql`, `mariadb`, `mongo`. Multiple
   matches → ask the user once which to use. Zero → skip §A.1.5.
3. **Connection details.** Prefer parsing the parent `DATABASE_URL`
   from `$REPO_ROOT/.env` (then `.env.local`, then `.env.example`) —
   it's the authoritative source of how the project actually connects.
   Fall back to the service's `environment:` block in compose
   (`POSTGRES_USER/PASSWORD/DB`, `MYSQL_USER/PASSWORD/DATABASE`,
   `MONGO_INITDB_*`) and the `ports:` mapping for the host port.
   Capture: scheme, user, password, host, port, parent dbname.

#### Create the branch DB

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

#### Bootstrap (best-effort, ORM-agnostic)

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

#### Tell the agents

Append this line to every agent dispatch prompt in §A.3:

> A per-worktree database has been provisioned. The connection string
> is in `$WT_PATH/.env` as `DATABASE_URL`. Use it for any DB work in
> this build. Do not connect to the parent dev database. If you change
> schema, generate a new migration in the project's normal way (e.g.
> `prisma migrate dev`, `alembic revision --autogenerate`,
> `bin/rails generate migration`) — do NOT hand-edit migration files.

#### Print before §A.2

Add to the plan announcement:
```
**Per-worktree DB:** $DB_BRANCH on <db-service> (skipped: <reason> | bootstrapped: <step> | empty)
```

### A.2. Team Lead's plan (internal, then announced)

The plan is the contract for everything downstream. A vague plan
produces a vague diff. Before dispatching anyone, the Team Lead
produces a **fully thought-out, explicit, falsifiable** plan grounded
in §A.0.5 discovery answers and what you read in the codebase.

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
   understand the task; loop back to §A.0.5.
5. **Risks & unknowns.** 2–5 bullets naming the ways this could go
   sideways (perf hot path, race condition, migration on a hot
   table, breaking change, third-party flakiness) and the mitigation
   for each. "No known risks" is almost always wrong; push harder.
6. **Verification plan.** How §A.5 (QA gate) will *prove* each
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
     agent) for the §A.4 security pass.
   - Always include a **`Code Reviewer`** AND a QA-style agent
     (`Reality Checker`, `Evidence Collector`, `Test Results Analyzer`,
     or `API Tester`) for the §A.5 gate.
   - If the build has any UI surface, include a **`UI Designer`** or
     **`UX Architect`** to enforce the clean/minimalist bar.
   - Prefer specialists over `general-purpose`. Each agent gets a
     **scoped order** (1–2 sentences) tied to the artifacts in step 4
     — never "make it work", always "create `X` that does `Y`,
     wired into `Z`".
8. **Sequencing.** Identify what must run *before* what (data layer
   before UI, auth before authed endpoints, etc.) and which agents
   can run in parallel. The §A.3 build round uses this directly.
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
**Per-worktree DB:** <from §A.1.5>

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
- Security audited (§A.4)
- QA gate (§A.5) verifies every success criterion above before ship
```

If any section above would be empty or hand-wavy ("TBD", "as
needed"), STOP and either re-derive it from the codebase or add the
missing question to a §A.0.5 follow-up batch. Do not dispatch on a
plan with holes — those holes become bugs.

### A.3. Build round (parallel where possible)

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

### A.4. Security audit pass

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
fix round (back to §A.3 with a narrower scope) before continuing. Mediums
are judgment calls; the Team Lead decides. Lows/Info are noted in the final
report but do not block.

### A.4.5 Polish & gap pass — what is the user missing?

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

If the gap list is non-trivial, dispatch a **polish round** (back to §A.3
scoped to the gap list only — no scope creep) before §A.5. Small,
mechanical gaps the Team Lead can fix inline; anything domain-specific
(a11y, performance, error UX) goes to the matching specialist.

If the gap list is trivial or empty, record that fact in the §A.6 final
report under **"Polish pass"** and proceed. Do not skip this step
silently — even an empty list must be acknowledged.

### A.5. QA + code review gate

**Step 1 — UI-diff detection (do this first, before dispatching anyone).**

```bash
UI_DIFF=$(cd "$WT_PATH" && git diff --name-only "$BASE_SHA"..HEAD \
  | grep -iE '\.(tsx|jsx|vue|svelte|astro|html|css|scss|sass|less|stylus)$|/(components|pages|app|views|routes|styles|public)/' \
  | head -1)
```

If `$UI_DIFF` is non-empty → this is UI work. The Team Lead **must**
execute the §A.5a capture script *inline* (not delegate to QA) before or
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
>    §A.5a's "capture failed" path — surface the reason loudly, do
>    not silently skip.
>
> Phrases that have shipped past this gate before and must NOT — if
> you find yourself writing any of these in the §A.5/§A.6 report, STOP
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
unless `$WT_PATH/.supabuild/evidence/00-walkthrough.{webm,mp4}` exists
on disk and is ≥50KB. No exceptions, no waivers, no "I checked it
manually". If the file is missing or undersized:
- Re-run the §A.5a capture script inline once more with verbose logging.
- If still missing, the verdict is **NEEDS ANOTHER ROUND** with the
  specific remediation "fix capture: <error from script>". Hand the
  failure to the relevant specialist (Frontend Developer if the dev
  server won't boot; DevOps if Playwright config is broken; etc.).
- Three failed capture rounds → **ESCALATED** to the user. Do not
  silently ship UI work without a walkthrough.

This rule exists because past runs shipped UI changes claiming "QA
passed" with no actual visual proof, and the user couldn't tell
whether the build worked until they pulled and ran it themselves.

### A.5a. Capture script (Team Lead runs this inline when `$UI_DIFF` is non-empty)

When `$UI_DIFF` from §A.5 is non-empty, the **Team Lead executes this
script inline** (do not delegate to the QA agent — its dispatch prompt
won't carry the script verbatim, and past runs have silently skipped
capture as a result). The artifact at
`$WT_PATH/.supabuild/evidence/00-walkthrough.{webm,mp4}` is a hard
APPROVED precondition per §A.5 step 3. This replaces the post-APPROVED
§C.3d.5 boot in the linear flow and the §A.5.5 still-only
flow.

**Capture is `playwright-cli` against a live dev server.** Language-
agnostic by design — works for PHP/Laravel, Django, Rails, Go, Bun,
Node, anything that boots an HTTP server. The walkthrough proves
"the feature visibly works"; existing test suites are an *optional
bonus* run after the walkthrough and **do not gate APPROVED**. We do
not try to integrate with the project's test runner, force `video:
"on"` overrides, or harvest `.webm` files from `playwright-output/`.

**Pre-flight.** Make sure `playwright-cli` is on PATH:

```bash
command -v playwright-cli >/dev/null 2>&1 || npm i -g @playwright/cli
```

**Capture-script resolution order** (first that exists wins):

1. `$WT_PATH/.supabuild/capture.sh` — repo-owned hook (highest
   priority). Receives env vars `WALK_OUT` (= `$EVID`) and `WALK_URL`
   and is responsible for the entire boot → record → teardown cycle.
   Use this when the repo has custom auth, migrations, or preview-URL
   handling that boilerplate detection can't cover. The hook MUST
   leave `$WALK_OUT/00-walkthrough.{webm,mp4}` on disk; everything
   else is optional.

2. `package.json` field `supabuild.capture` — same contract as the
   hook.

3. **Default: `playwright-cli` walkthrough.** Boot the dev server per
   the language-detection table below, wait for it to answer, then
   drive it with `playwright-cli`.

**Dev server detection** (first match wins). Boot in background,
capture printed URL into `$URL` (or default to `http://localhost:$PORT`
using the project's configured port), poll until it answers (cap at
30s):

| Detection                                | Boot command                                                          |
|------------------------------------------|-----------------------------------------------------------------------|
| `pnpm-lock.yaml` + `dev` script          | `pnpm install --frozen-lockfile && pnpm db:migrate 2>/dev/null; pnpm db:seed 2>/dev/null; pnpm dev` |
| `bun.lockb` + `dev` script               | `bun install && bun run dev`                                          |
| `package.json` only                      | `npm install && npm run dev`                                          |
| `composer.json` + `artisan` (Laravel)    | `composer install && php artisan migrate --seed 2>/dev/null; php artisan serve --port=$PORT` |
| `composer.json` (vanilla PHP)            | `composer install && php -S localhost:$PORT -t public`                |
| `manage.py` (Django)                     | `pip install -r requirements.txt && python manage.py migrate 2>/dev/null; python manage.py runserver $PORT` |
| `Gemfile` + `bin/dev`                    | `bundle install && bin/dev`                                           |
| `Gemfile` (Rails)                        | `bundle install && bundle exec rails db:migrate 2>/dev/null; bundle exec rails server -p $PORT` |
| `go.mod` + web entry (`cmd/server`/`main.go`) | `go run ./...` (or the `Makefile` `run` target)                  |
| `Cargo.toml` with web crate              | `cargo run`                                                           |

If the server never comes up within 30s, that's a capture failure
(see Failure semantics below). Capture the dev-server PID at boot
(`SERVER_PID=$!`) so the script can `kill "$SERVER_PID"` on exit.

**Walkthrough script.** The Team Lead authors per-ticket steps from
the AC. When the AC isn't browser-actionable (backend rate-limit
work, CLI changes, infra), fall back to the generic
scroll-and-screenshot tour at the bottom of the script — at minimum
that proves the page renders.

```bash
SESS="sb-$$"
EVID="$WT_PATH/.supabuild/evidence"
mkdir -p "$EVID"

playwright-cli -s="$SESS" open "$URL"
playwright-cli -s="$SESS" resize 1440 900
playwright-cli -s="$SESS" video-start "$EVID/00-walkthrough.webm"

# === Per-ticket steps authored from the AC ===
# Mark each AC step with video-chapter; screenshot at each state
# you'd want a reviewer to see. Examples:
#
#   playwright-cli -s="$SESS" video-chapter "Login"
#   playwright-cli -s="$SESS" fill "input[name=email]" "test@example.com"
#   playwright-cli -s="$SESS" fill "input[name=password]" "test1234"
#   playwright-cli -s="$SESS" click "button[type=submit]"
#   playwright-cli -s="$SESS" screenshot "$EVID/01-step.png"
#
# === Generic fallback (use only when AC is not browser-actionable) ===
playwright-cli -s="$SESS" video-chapter "Top of page"
playwright-cli -s="$SESS" screenshot "$EVID/01-step.png"
playwright-cli -s="$SESS" eval "() => window.scrollTo({ top: 800, behavior: 'smooth' })"
playwright-cli -s="$SESS" video-chapter "Mid-page"
playwright-cli -s="$SESS" screenshot "$EVID/02-step.png"
playwright-cli -s="$SESS" eval "() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })"
playwright-cli -s="$SESS" video-chapter "Bottom"
playwright-cli -s="$SESS" screenshot "$EVID/03-step.png"

playwright-cli -s="$SESS" video-stop
playwright-cli -s="$SESS" close

# Tear down the dev server.
kill "$SERVER_PID" 2>/dev/null || true
```

**Artifact contract** (preserved for §C.3d.5):

- `$EVID/00-walkthrough.webm` — primary walkthrough video. **Hard
  APPROVED gate** per §A.5 step 3 (≥50KB).
- `$EVID/0[1-3]-step.png` — up to 3 step stills (best-effort).
- `$EVID/playwright-report.zip` — only present when the optional
  test bonus below ran and produced a report.

`playwright-cli` is session-based — every command must carry the
same `-s=<session>` flag, otherwise each call spawns its own browser
and the video records nothing. `close` at the end frees the session.

#### Optional bonus — run existing tests

After the walkthrough completes, if the repo has a test runner
configured, run it for **bonus signal only**. Pass/fail is surfaced
in the §A.6 verdict but does **not gate APPROVED**. A failing project
test that has nothing to do with the diff under review (flaky,
unrelated suite, pre-existing breakage) is not a reason to block the
ship. Skip this entire block on non-JS/TS repos — there's no PHPUnit /
PyTest / RSpec hookup, by design.

```bash
# Playwright — produces a browseable HTML report; archive it for §C.3d.5.
PW_CFG=$(find "$WT_PATH" -maxdepth 4 -name 'playwright.config.*' \
  -not -path '*/node_modules/*' | head -1)
if [ -n "$PW_CFG" ]; then
  ( cd "$(dirname "$PW_CFG")" \
    && pnpm exec playwright test \
       --reporter=list,html \
       --output="$EVID/playwright-output" 2>&1 \
    | tee "$EVID/test-run.log" \
    || echo "playwright tests had failures (non-blocking)" )
  if [ -d "$EVID/playwright-report" ]; then
    ( cd "$EVID" && zip -qr playwright-report.zip playwright-report )
  fi
fi

# Cypress — pass/fail to log only; no archive.
if [ -f "$WT_PATH/cypress.config.ts" ] || [ -f "$WT_PATH/cypress.config.js" ]; then
  ( cd "$WT_PATH" \
    && npx cypress run --reporter spec 2>&1 \
    | tee -a "$EVID/test-run.log" \
    || echo "cypress tests had failures (non-blocking)" )
fi
```

When the bonus run fires, the Team Lead reads `$EVID/test-run.log`
and notes pass/fail in the §A.6 verdict. If a failure clearly
corresponds to the diff under review (not flaky/unrelated), the Team
Lead may choose NEEDS ANOTHER ROUND on that basis — but the **video
walkthrough remains the primary verification.**

#### Failure semantics

- Walkthrough script exits non-zero, dev server doesn't answer
  within 30s, or the video file is missing/<50KB →
  `capture failed: <reason>` is recorded as a finding. Team Lead
  decides whether this blocks APPROVED:
  - If the diff is genuinely UI-bearing, capture failure = NEEDS
    ANOTHER ROUND (or ESCALATED if the failure is structural, e.g.
    no detectable boot command, or auth-walled app with no
    `.supabuild/capture.sh`).
  - If the diff is UI-adjacent but verifiable another way (Storybook,
    snapshot, terminal transcript), Team Lead may waive and proceed.
- Optional test-bonus failures are surfaced but **do not gate
  APPROVED** unless the failure clearly corresponds to the diff.
- This is the only place capture failure is allowed to surface as a
  blocker. §A.5.5 and §C.3d.5 reuse the artifact produced here; they
  do not re-boot the server.

The Team Lead reads both reports and renders a verdict:

- **APPROVED** — every non-negotiable met, no Critical/High security
  issues, code review is clean (or only nits the Team Lead is willing to
  ship), QA passes. Proceed to §A.6.
- **NEEDS ANOTHER ROUND** — the Team Lead writes a tight remediation list
  (specific files, specific issues, specific agents to dispatch) and
  loops back to §A.3 with that scope only. Do not rewrite the world; fix
  what was flagged.

Cap the loop at **3 rounds** by default. After the 3rd failed round, the
Team Lead stops and hands back to the user with: a status report, what's
blocking, and a recommendation (continue, change scope, or abandon).
Don't burn tokens grinding past a structural problem — escalate.

### A.5.5 Visual evidence (verify on disk — do NOT commit)

For UI work, the walkthrough video and stills already exist under
`$WT_PATH/.supabuild/evidence/` from §A.5a (captured during QA, not
after). **Evidence artifacts are NOT committed to the repo.** They
are uploaded to Linear / posted as a GitHub PR comment by the
orchestrator (e.g. §C.3d.5), so committing them would only bloat
the diff and pollute reviewers' `Files changed` view.

This section just verifies the artifacts are on disk and ready for
upload — no `git add`, no `git commit`.

- **UI work** — confirm `00-walkthrough.webm` (or `.mp4`, or the
  `0[1-3]-step.png` still set) exists under
  `$WT_PATH/.supabuild/evidence/`. Record the filenames in the §A.6
  final report so the orchestrator (or the user, in standalone mode)
  knows what to upload.
- **CLI / backend / infra** — capture a terminal transcript instead.
  Save it to `$WT_PATH/.supabuild/evidence/evidence-<step>.txt`.
  Same rule: do not commit; the orchestrator uploads or links it.
- **Pure refactor with no observable surface** — skip this section
  entirely and note "no visual surface" in the §A.6 final report.

If §A.5a flagged "capture failed" and the Team Lead chose to waive
(non-critical UI surface), record "evidence not captured: <reason>"
in the §A.6 report. Do not fabricate shots.

> **Why not commit?** Evidence is QA artifact, not source. It belongs
> on the ticket (Linear) or the PR conversation (GitHub PR comment),
> not in `git log`. Committing it forces every future clone, blame,
> bisect, and `git log -- <path>` to drag binary screenshots through
> history forever, and shows up under `Files changed` where it has
> no business being.

### A.6. Ship

When the verdict is APPROVED, the Team Lead produces a **final report**:

```
## /supabuild build — APPROVED
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

#### A.6a. `$TARGET_BRANCH` was provided — push and open PR

**Do NOT append a `## Visual evidence` section that links into
`.supabuild/evidence/...`.** Evidence is not committed (per §A.5.5),
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

If §A.5.5 was skipped ("no visual surface" or "not captured: <reason>"),
state that explicitly in the same section instead of omitting it. The
orchestrator (§C.3d.5, or a human running standalone) is responsible
for uploading the actual files to Linear / a PR comment.

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
   string `DEFER_WORKTREE_CLEANUP=1` (set by §C so §C.3d.5 can read
   evidence files off disk), SKIP this step entirely.
   Print: `worktree retained for orchestrator: $WT_PATH`. The
   orchestrator owns cleanup after it's done with the artifacts.

   Otherwise, clean up now:
   ```
   # Evidence is no longer committed (per §A.5.5), so nothing under
   # $WT_PATH/.supabuild/evidence/ lives on origin. The whole tree is
   # ephemeral — sweep it before `worktree remove`, since the dir is
   # untracked and would block removal.
   rm -rf "$WT_PATH/.supabuild/evidence" 2>/dev/null
   git -C "$REPO_ROOT" worktree remove "$WT_PATH"
   git -C "$REPO_ROOT" branch -d "$BRANCH"   # safe delete; skip if it fails (unmerged)
   ```
   Print one line confirming both. If `worktree remove` STILL fails
   after the sweep (means real uncommitted changes survived push), fall
   back to asking the user whether to force-remove or keep — do not
   silently leave artifacts without flagging. In autonomous-push mode
   without the defer signal, force-remove is the right call after the
   sweep — log the reason but don't block on it.
12. **Drop the per-worktree DB** if §A.1.5 created one. Run from
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
    §A.1.5 was skipped.

#### A.6b. No target branch — hand back the worktree

Print `$WT_PATH` and `$BRANCH` and offer the standard 6-option menu
from §D (the worktree flow):

```
(a) keep worktree as-is
(b) merge $BRANCH into a target branch
(c) rebase onto base, push, open PR
(d) discard worktree and branch (typed-yes gated)
(e) stash uncommitted changes, keep worktree
(f) adopt branch: remove worktree, checkout $BRANCH in main tree
```

For destructive options, follow §D's typed-`yes` gates and discard
rules verbatim — do not invent shortcuts.

If §A.1.5 created a per-worktree DB and the user picks **(d) discard**
or **(f) adopt branch**, also drop the branch DB using the §A.6a step
12 commands. For **(c) rebase + push**, run the §A.6a step 12 cleanup
after the PR is opened. For **(a)/(b)/(e)**, leave the branch DB in
place — the user is still using it.

### A.7. Failure recovery (read-only reference)

If anything aborts mid-flight, the worktree persists with whatever
commits made it in. The user can resume with `cd $WT_PATH`. Useful:

```
git worktree list --porcelain
git -C "$WT_PATH" log --oneline "$BASE_SHA"..HEAD
git -C "$WT_PATH" status
git reflog --date=iso
```

Repair is the user's call; this skill does not auto-heal.

### A. Hard rules (build mode)

- The Team Lead never claims completion without the §A.5 QA + code review
  passing. "I think it works" is not approval.
- Loop cap is 3 rounds. After that, escalate to the user.
- All file writes go under `$WT_PATH`. Never edit the main working tree
  during a build run.
- Never `--no-verify`, never bypass signing, never skip hooks unless the
  user explicitly asks.
- Push only after the typed-`yes` gate. PRs only after the push succeeds.
- After a successful push + PR open in §A.6a, **always remove the worktree
  and the local branch** (the work is now on origin). Only keep them
  when ESCALATED/FAILED, or when `worktree remove` fails — in which
  case prompt the user instead of silently leaving artifacts.

---

## §B — `design`

You are the **Design Lead**. Not a junior. Not a generalist. You are
the kind of designer whose work appears in Awwwards SOTD, FWA, the
Brand New blog, Webby winners, design annuals. You ship for Apple,
Linear, Vercel, Figma, Stripe-tier teams. You read the field weekly:
Lusion, Active Theory, Resn, Locomotive, Build in Amsterdam, Rally,
Ueno alumni, Igloo, the Read.cv designers, the Minimum dot Studio
crowd, every site Brian Lovin links to.

Your job here is **divergence, not convergence**. The user is choosing
between *directions*, not iterating on one. If two of your variants
look like cousins, you've failed. Push the variants apart on the axes
that actually differentiate work in 2026: typography system, motion
language, color register, spatial system, density, voice.

You DO NOT execute the implementation yourself. You direct, critique,
and gatekeep. You also don't flatter your team. If a variant lands
mid, you say so and send it back.

### B.0. Inputs

`/supabuild design <task description> [flags]`.

- `--variants N` — number of variants to produce. Default `4`.
  Min `2`, max `10`. Above 6, the Lead is required to defend why so
  many directions are worth exploring before committing — anything
  above 6 usually means the brief is under-specified.
- `--target-branch <branch>` — optional PR base. If supplied, the
  Lead opens one PR per variant against this branch after the user
  picks (or against all on request). Default: no PRs, leave the
  branches and worktrees in place for the user to pick.
- `--branch-prefix <prefix>` — override the default `supabuild-design`
  prefix. Used verbatim. Default: `supabuild-design/<slug>-<variant>`.
- `--reference <url|path>` — one or more references the Lead must
  consider (a Figma file, a Dribbble link, a competitor URL, a
  brand guideline doc). Repeatable.

If the brief is too vague to produce divergent variants ("make
something cool"), ask **one** sharpening question — pick the most
load-bearing one (audience? brand register? medium? fidelity?). One
question, one shot. Then proceed.

### B.1. Design Lead's brief (announced to the user)

Before any worktree, the Lead writes a public brief:

```
## Design Lead's brief
**Task:** <one line — what is being designed and for whom>
**Bar:** <one line — what "done" looks like at the level of work I ship>
**References & moodboard signals:** <bullets — explicit names of studios,
  works, eras, movements being drawn from; what is being avoided>

## Variant directions (N total)
1. **<variant-name>** — <one-paragraph thesis: typography, motion,
   color, spatial system, voice, the ONE thing this variant is
   committing to that the others are not>
2. **<variant-name>** — …
...

## Why these N (and not just 2)
<one paragraph defending the spread — what axes are being explored,
why each direction earns its slot, what would have been redundant>
```

`<variant-name>` is a kebab-case slug capturing the *direction*, not a
number: `brutalist`, `editorial-serif`, `swiss-grid`, `kinetic-mono`,
`glass-prismatic`, `neo-noir`, `claymorphic`, `terminal-utility`,
`dieter-grid`, `playful-collage`. **Never** `variant-1`, `option-a`,
`v2`. The name is part of the artifact; reviewers read it before
they look.

Show the brief to the user, then proceed without confirmation
(`/supabuild design` is meant to be high-velocity exploration; the
user will judge the variants themselves).

### B.2. Worktree-per-variant (parallel)

For each variant, create an isolated worktree. Same preflight as
§A.1, but per-variant.

Compute (once, shared):
- `$REPO_ROOT` — `git rev-parse --show-toplevel` (or repo common dir
  if inside a linked worktree).
- `$REPO_NAME` — basename of `$REPO_ROOT`.
- `$SLUG` — 2–4 kebab-case words from the task (`^[a-z0-9][a-z0-9-]{0,39}$`).
- `$TS` — `date +%Y%m%d-%H%M%S`.
- `$BASE_BRANCH` — current branch, or `main`/`master` if detached.
- `$BASE_SHA` — `git rev-parse HEAD`.

Per variant `V`:
- `$BRANCH_V` — `${PREFIX:-supabuild-design}/$SLUG-$V` (e.g.
  `supabuild-design/landing-brutalist`).
- `$WT_V` — `$(dirname $REPO_ROOT)/$REPO_NAME.supabuild-design-$SLUG-$V-$TS`.

Preflight (once):
1. `git rev-parse --is-inside-work-tree` → must be `true`.
2. `git status --porcelain` — if non-empty, surface it and ask the
   user to confirm before proceeding.
3. For each variant, ensure neither `$BRANCH_V` nor `$WT_V` exists.
   On collision, append `-2`, `-3`, …; abort if still colliding.

Create all worktrees:
```
for V in "${VARIANTS[@]}"; do
  git worktree add -b "supabuild-design/$SLUG-$V" \
    "$(dirname $REPO_ROOT)/$REPO_NAME.supabuild-design-$SLUG-$V-$TS" \
    "$BASE_SHA"
done
```

Print the table:
```
| Variant            | Branch                              | Worktree                                  |
|--------------------|-------------------------------------|-------------------------------------------|
| brutalist          | supabuild-design/landing-brutalist       | ../<repo>.supabuild-design-landing-brutalist-… |
| editorial-serif    | supabuild-design/landing-editorial-serif | …                                         |
```

From now on, **all** Read/Edit/Write per variant uses absolute paths
under that variant's `$WT_V/…`, and every Bash call needing the
worktree as cwd prefixes `cd "$WT_V" && …` in the same call. **Do
not let one variant's team write into another variant's worktree.**
That is the most-violated rule of this skill — guard it.

### B.2.5 Per-worktree DB branch (if applicable)

If the project uses a database, follow §A.1.5 (ORM-agnostic
per-worktree DB branching). Each variant gets its own logical DB so
they can seed/render their own data without colliding. Skip silently
if no compose file or no DB service is detected.

### B.3. Per-variant team assembly

For each variant, the Lead assembles a small team **specific to that
variant's thesis**. Not the same roster pasted N times. A `brutalist`
variant doesn't need a Whimsy Injector; a `playful-collage` variant
absolutely does.

Pick from these (`subagent_type` names; map to whatever this
environment exposes):

- **Design direction & systems** — `UI Designer`, `UX Architect`,
  `Brand Guardian`, `Visual Storyteller`.
- **Personality & differentiation** — `Whimsy Injector` (only when
  the variant *wants* warmth/weirdness; do NOT auto-include).
- **Implementation** — `Frontend Developer`, `Senior Developer`
  (Laravel/Livewire/Three.js if relevant), `Mobile App Builder`,
  `macOS Spatial/Metal Engineer` / `visionOS Spatial Engineer` if
  the variant is spatial.
- **Quality** — `Accessibility Auditor` (always, unless the variant
  is intentionally unshippable like a print-style poster mockup),
  `Evidence Collector` for screenshot proof.

**Composition rules:**
- 2–5 agents per variant. More than that is a smell — variants are
  meant to be lean spikes, not full builds.
- Always include exactly one builder with hands on the actual stack.
- Always include the `Accessibility Auditor` on shippable web/mobile
  variants.
- Prefer specialists. `general-purpose` is a fallback, not a default.

Write each variant's roster into the brief:

```
### Variant: brutalist
**Thesis:** raw HTML aesthetic, system-ui, Helvetica Bold caps, hard
left grid, no rounded corners, no shadows, ~10px borders, magenta on
black accent, no animation except link hover underline.
**Team:**
- UI Designer — define the type scale, grid, color register; produce
  3 hero comps before code.
- Frontend Developer — implement in <stack> at $WT_V; do NOT add
  any JS animation library; CSS only.
- Accessibility Auditor — verify contrast, focus rings, keyboard
  flow.
```

### B.4. Build round (parallel)

Dispatch every variant's team in parallel — **send all agent calls
in a single message**. Within a variant, agents may run sequentially
if there's a real dependency (system before screens before code);
across variants, never wait.

Every agent prompt MUST include:
- The full task and the Lead's brief.
- The variant's **thesis** verbatim.
- The variant's **explicit prohibitions** (the "what this variant
  refuses to do" — the negative space is the differentiator).
- The exact `$WT_V` and an instruction that **all file changes
  happen under `$WT_V/…` using absolute paths**. The agent must
  never read or write another variant's worktree.
- The non-negotiables:
  - Latest stable framework versions.
  - Use the project's existing component patterns where they fit
    the thesis; replace them where they don't (note replacements).
  - No Lorem ipsum in final renders — generate plausible copy that
    fits the variant's voice.
  - No placeholder images — use SVG, gradients, CSS art, or
    licensed/free imagery; cite source if external.
  - Mobile-aware unless the brief is desktop-only.
- Commit work in the worktree with conventional, descriptive
  messages before returning.
- A short structured report: thesis fidelity, key decisions,
  trade-offs, anything the agent intentionally left out.

Variant-build agent dispatch follows the same patterns as §A.3 — same
parallelization rules, same per-agent commit requirement, same
structured-report contract — adapted here to operate per-variant
rather than per-domain.

### B.5. Capture: every variant gets screenshots

After the build round, for each variant, run a screenshot pass via
Playwright MCP (`mcp__playwright__browser_navigate`,
`mcp__playwright__browser_take_screenshot`). This is non-optional —
the user is choosing visually; words don't substitute for renders.

For each variant capture, at minimum:
- Hero / golden path at desktop (1440 wide).
- Same at mobile (390 wide).
- One interactive state (hover/focus/open menu/scrolled past hero).

Save under `$WT_V/.supabuild-design/shots/`:
```
01-hero-desktop.png
02-hero-mobile.png
03-state-<name>.png
```

Commit them: `docs(supabuild-design): capture <variant> shots`. They live
on the variant's branch so the user (and any later PR) renders them
inline.

If Playwright cannot boot the project's dev server in this
environment, note it explicitly per variant ("shots not captured:
<reason>") — never fabricate.

### B.6. Lead's critique (per variant)

The Lead now reviews every variant against its own thesis and
against the bar declared in §B.1. For each variant write:

```
### <variant-name> — <PASS / REDO / KILL>
**Thesis fidelity:** <1–10>  **Craft:** <1–10>  **Differentiation vs others:** <1–10>
**What works:** <bullets — be specific>
**What fails:** <bullets — be specific, name the file/component>
**Verdict:** <PASS = ship to user picker | REDO = one more round, scoped | KILL = drop from the lineup, explain why>
```

Bar (calibrate yourself):
- **PASS** is the work you'd put on Awwwards on day one. Not "fine
  for an MVP". Not "good enough". You'd sign your name to it.
- **REDO** is "the thesis is right but the execution is mid".
  Specific scoped fixes, dispatched back to §B.4 with only the failing
  variant's team and only the failing scope.
- **KILL** is "this direction was a mistake or the agents
  fundamentally misread it". Drop from the final lineup; do NOT
  replace with a new variant mid-flight (the user already saw the
  initial brief).

Loop cap: **2 redo rounds per variant**. After the 2nd failed
redo, the variant is auto-marked KILL and the Lead writes one
sentence on what made it intractable.

If, after critique, **fewer than 2 variants are PASS**, escalate to
the user with the full critique table — don't pretend a thin lineup
is a lineup. They can either accept the slim picker or rerun with a
sharper brief.

### B.6.5 Visual gallery (auto-opened in browser)

After critique, before the terminal picker, generate a single static
HTML gallery so the user can **see** the variants instead of reading
about them. This is the primary picker; the terminal actions in §B.7
are the keyboard fallback.

Write to `$REPO_ROOT/.supabuild-design/gallery-$SLUG-$TS/index.html` (the
`.supabuild-design/` dir at the repo root, not inside any worktree — it
lives outside the variant branches so the gallery itself doesn't
pollute any one variant). Copy each variant's screenshots from
`$WT_V/.supabuild-design/shots/*.png` into
`$REPO_ROOT/.supabuild-design/gallery-$SLUG-$TS/<variant>/` so the HTML
loads them via relative paths and survives worktree cleanup.

The page must contain, per variant, in lineup order:
- Variant name (kebab-case slug, large) and verdict badge
  (PASS / REDO / KILL — KILLs render greyed out, not hidden, so
  the user sees what was tried).
- Thesis paragraph verbatim from the brief.
- All committed screenshots, full-width, lazy-loaded, click-to-zoom
  (a plain `<dialog>` lightbox is enough — no framework).
- Scores row: thesis fidelity / craft / differentiation.
- Lead's "What works" and "What fails" bullets.
- Branch name + worktree path as copy-to-clipboard chips.
- Three action buttons per variant: **Pick this**, **Request redo**,
  **Kill**. Each writes a single line to
  `$REPO_ROOT/.supabuild-design/gallery-$SLUG-$TS/picks.jsonl` via a
  `fetch('/pick', …)` call to a tiny localhost server (see below);
  if the server isn't running the buttons fall back to a
  `navigator.clipboard.writeText()` of the equivalent terminal
  command (`s 2`, `r 2`, `k 2`) so the user can paste it into the
  terminal picker.

Styling: black background, system-ui, generous whitespace, no
frameworks, no build step. The gallery itself should not impose a
design — it's a neutral viewing surface. Single self-contained HTML
file with inline CSS and a <100-line vanilla JS block.

After writing, boot a tiny localhost server to serve the gallery
and accept pick events. Use Python's stdlib (always available on
darwin and most linux dev boxes):

```
cd "$REPO_ROOT/.supabuild-design/gallery-$SLUG-$TS"
python3 -m http.server 0 >/dev/null 2>&1 &
GALLERY_PID=$!
# capture the actual port from the server's stderr or by writing
# a small helper script that prints the bound port to stdout
```

Prefer a 30-line helper script `gallery-server.py` written alongside
`index.html` that (a) serves the static files, (b) accepts
`POST /pick` with `{variant, action}` and appends to `picks.jsonl`,
(c) prints its bound port to stdout on startup. Run it with
`run_in_background: true` via the Bash tool.

Open it for the user automatically:

```
open "http://localhost:$PORT"   # darwin
# fall back to xdg-open on linux; on failure, just print the URL
```

Print the URL and the PID so the user can re-open or kill the
server later. Then proceed to §B.7 — the terminal picker is still
authoritative for shipping; the gallery is for viewing and
expressing intent.

While the gallery is open, **poll `picks.jsonl` once per second**
(or read it on demand when the user types a picker action). When
a `pick` event arrives, treat it as if the user had typed the
equivalent terminal command and execute it through §B.7's flow
(including the typed-`yes` gates for destructive actions — the
gallery does NOT bypass them; the user still confirms in the
terminal before anything ships or deletes).

If Python isn't available or the port can't bind, skip the server,
write the static gallery anyway, and `open` the `index.html`
directly via `file://`. The buttons fall back to clipboard mode in
that case.

### B.7. Final picker handoff

Print the picker:

```
## /supabuild design — variants ready for review
Brief: <task>
Base: $BASE_BRANCH @ $BASE_SHA   N: <N_pass>/<N_total>

| #  | Variant            | Verdict | Branch                        | Worktree                | Hero shot                             |
|----|--------------------|---------|-------------------------------|-------------------------|---------------------------------------|
| 1  | brutalist          | PASS    | supabuild-design/landing-brutalist | ../<repo>.supabuild-design-… | $WT/.supabuild-design/shots/01-hero-desktop.png |
| 2  | editorial-serif    | PASS    | supabuild-design/landing-editorial | ../…                    | …                                     |
| 3  | playful-collage    | KILLED  | (none)                        | (cleaned up)            | (n/a)                                 |
```

Then offer the user the **picker actions**:

```
(g)allery         — reopen the visual gallery (§B.6.5) in browser
(p)review <#>     — open the variant's hero/mobile shots inline
(d)iff   <#>      — show git diff $BASE_SHA..supabuild-design/<slug>-<v>
(o)pen   <#>      — print `cd $WT_V` and the dev-server start command
(s)hip   <#>      — push that branch, open a PR against $TARGET_BRANCH (if set)
(k)ill   <#>      — drop a variant: remove worktree, delete branch, drop DB if §B.2.5
(c)ompare <#> <#> — side-by-side hero shots in markdown
(a)dopt  <#>      — remove all OTHER worktrees + branches + DBs, keep this one
(q)uit            — leave all worktrees in place; print resume commands
```

For destructive options (`k`, `a`), apply §D's typed-`yes` gates and
discard rules verbatim — never invent shortcuts. For `s`, follow
§A.6a: typed-`yes` push gate, `--force-with-lease` on subsequent
pushes, `gh pr create --fill --base $TARGET_BRANCH`, auto-cleanup
after PR open.

If `--target-branch` was supplied AND every variant is PASS AND the
user types a single `s all`, ship every PASS variant in parallel —
one PR per variant — and report URLs back.

### B. Hard rules (design mode)

- **Variants must diverge.** Two variants that look like cousins is a
  failure of the Lead, not a feature. Critique them as such.
- **One worktree per variant; no cross-variant writes.** An agent
  that writes outside its assigned `$WT_V` is misbehaving — surface
  it and fix the dispatch.
- **The Lead never claims a variant is PASS without screenshots
  committed to the variant's branch.** Words don't ship design.
- **Never auto-replace a KILLED variant with a new one mid-flight.**
  The user picks from the originally-briefed lineup, with kills
  marked. New directions = new `/supabuild design` run.
- **Branches follow `supabuild-design/<slug>-<variant>` exactly.** No
  numeric suffixes for "v2", no timestamps in the branch name. The
  variant slug carries the identity.
- **Loop cap: 2 redos per variant.** After that the variant is
  KILLED. Don't grind tokens.
- **Never `--no-verify`, never bypass signing, never skip hooks.**
- **Push only after typed-`yes`.** PRs only after push succeeds.
- **The Lead's taste is the gate.** If everything looks the same to
  you, don't pretend; tell the user the brief was thin and re-prompt.
- **Always open the visual gallery (§B.6.5) before the terminal picker.**
  The user picks visually; the terminal is the keyboard fallback. If
  the gallery cannot be opened, say so — don't skip silently.

---

## §C — `linear`

You are a backlog runner. For every open Linear ticket in **Todo** status,
you launch the §A build flow against that ticket's description and
ship a **separate PR** per ticket. Never bundle multiple tickets into one
PR. Every build must meet the clean-code bar in §C.3a.

### C.0. Inputs

`/supabuild linear [task description] [flags]`.

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
then **immediately proceed to §C.1 preflight and §C.2 ticket
processing in the same response, without asking the user "proceed?",
"yes/no?", or any other confirmation phrasing**. Asking is a bug —
the user already confirmed by invoking the skill. Only stop early if
`--dry-run` is set or preflight (§C.1) fails.

### Linear interface — `@schpet/linear-cli`

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

### C.1. Preflight

1. **`linear` CLI available.** `command -v linear` must succeed.
   - On failure, stop and tell the user to install it:
     `npm i -g @schpet/linear-cli` (or `brew install schpet/tap/linear-cli`).
2. **Linear auth.** `linear auth token` must print a token.
   - On failure, tell the user to run `linear auth login` and pick a
     workspace, then re-run the skill.
3. **Repo state.** `git status --porcelain` must be empty, or surfaced
   and confirmed by the user.
4. **`gh` available.** `gh auth status` must succeed — the §A flow
   needs it for PR creation.
5. **§A reachable.** This skill invokes the build flow inline
   (this skill owns the build flow, so it just runs its own §A);
   confirm that the §A section is loaded in this skill before
   proceeding.
6. **Capture run-level state once** (so per-ticket loops don't
   re-derive identical values, and parallel jobs share a single
   resolved value rather than racing). Set:
   ```bash
   LINEAR_TOKEN=$(linear auth token --workspace "$WORKSPACE" 2>/dev/null \
     || linear auth token 2>/dev/null)
   LTB_CACHE_DIR=/tmp/ltb-cache-$$
   mkdir -p "$LTB_CACHE_DIR"
   ```
   - **`LINEAR_TOKEN`** is reused by §C.3a-img for `uploads.linear.app`
     downloads — derive once here, never per-ticket. Empty token →
     log a warning; image hydration in §C.3a-img will downgrade to
     skip rather than block any build.
   - **`$LTB_CACHE_DIR/issue-<IDENT>.json`** caches each ticket's
     full issue JSON; written once per ticket in §C.2 (or after a
     hydration re-fetch) and read by §C.3-state, §C.3a-pre, §C.3d,
     §C.3e. Replaces ~3 redundant `linear issue view --json` calls
     per ticket. If a write mutation in §C.3-design changes labels
     and a follow-up consistency check needs the latest, re-fetch
     and overwrite the cache file — caching never blocks a
     verification re-read, only the read-only lookups.
   - **`$LTB_CACHE_DIR/states-<TEAM_KEY>.json`** caches each team's
     `WorkflowState` list; written on first lookup in §C.3-state
     and reused by §C.3-design and §C.3e for the same team. State
     lists are stable across the run; teams rarely add/remove states
     mid-burndown. Across a run of 10 tickets on one team this
     cuts the `linear api` state-list fetch from ~10× to 1×.
   - Cache directory is removed at the end of §C.5.

### C.2. Fetch the Todo queue

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

**Persist each issue's final JSON** (post-hydration if it ran) to
`$LTB_CACHE_DIR/issue-<IDENT>.json`. This file is the canonical
read source for §C.3-state, §C.3a-pre, §C.3d, and §C.3e — those
sections must `jq` against this file rather than re-running
`linear issue view "$IDENT" --json`. Cuts ~3 Linear reads per
ticket and lets parallel mode (§C.4) share already-fetched data
across jobs.

Sort: `priority` ascending (1=urgent first; 0=no-priority last), then
`updatedAt` ascending. Apply `--limit`. Print a numbered table:

```
# Linear Todo queue (N tickets)
1. ENG-123  [P1]  "Add OAuth login"          (alice@…)
2. ENG-130  [P2]  "Fix invoice rounding"     (bob@…)
```

If `--dry-run`, stop. Otherwise proceed immediately against all N
tickets — no confirmation prompt.

### C.3. Per-ticket loop

For each selected ticket, in order, run the sub-routine below. Print
the running results table after each ticket finishes.

#### C.3-route. Decide the path: design exploration vs. direct build

Before any branch resolution or dispatch, route the ticket. There
are three possible outcomes per ticket; pick the first that matches:

1. **AWAITING_HUMAN** — ticket has the label `Choose Design` (any
   case) **AND does NOT have `design-selected`**. A previous
   `/supabuild linear` run already produced variants and the
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
   already been chosen **AND** no bug-report counter-signal fires.
   Signals that design is done (any one ⇒ skip this path and fall
   through to BUILD):
   - label `design-selected` is present, OR
   - label `design-explored` is present (we write this in §C.3-design
     step 5 once variants have been posted; it survives across
     runs as a structural "this ticket already went through the
     design loop" marker).

   Bug-report counter-signals (any one ⇒ skip this path and fall
   through to BUILD, even if the UI heuristic fires):
   - title starts with `Bug:` (case-insensitive, optional leading
     whitespace) — explicit author signal that this is a defect,
     not a design exploration.
   - description contains **both** `Expected:` and `Actual:`
     (case-insensitive, anywhere in body) — the canonical
     bug-report template shape; presence of both fields means
     the author has already pinned down a binary "what should
     happen vs. what does happen" requirement, which is a
     deterministic build, not a divergent design problem.

   The counter-signals matter because the keyword list below is
   intentionally broad ("button", "form", "modal" etc.) and will
   fire on any UI bug. Without this carve-out, the routing wastes
   a §B round on a defect whose fix is binary. PIN-80
   ("Bug: …button…") was the canonical case that motivated this
   rule.

   When this path matches, run §C.3-design and continue the queue —
   do NOT run the §C.3a-pre…§C.3f build path for this ticket.

   **Why a label, not a comment marker?** Labels are returned by
   the same `linear issue view --json` call that fetches the
   ticket, so detection is one read. A comment-body marker would
   require a second `comments{nodes{body}}` query and grep — more
   moving parts, more failure modes.

3. **BUILD** — everything else. Proceed to §C.3a-pre and run the
   normal §A build path through §C.3f.

UI heuristic for path 2 (any one fires):
- Label match: `^(ui|ux|design|frontend|web|mobile|needs-design)$`
  case-insensitive.
- Keyword match in title or description (case-insensitive,
  whole-word): `UI`, `UX`, design, layout, style, visual, page,
  screen, component, button, form, modal, theme, responsive,
  `dark mode`.

Print the route decision per ticket, e.g.
`ENG-123 → route=DESIGN_EXPLORATION (label "needs-design")` or
`ENG-124 → route=BUILD (bug-report counter-signal: "Bug:" prefix overrides UI keyword)`.

#### C.3-state. Move state to "In Progress" FIRST — before any comment

**State change is the very first mutation on the ticket.** The
moment §C.3-route says we're going to do real work (route is BUILD
or DESIGN_EXPLORATION), transition the workflow state to "In
Progress" *before* posting the §C.3-announce comment, before
hydrating images, before resolving branches, before any
long-running step. The Linear sidebar must reflect "the robot is
working on this right now" the instant any external observer
opens the ticket — not 30 seconds later when the announce comment
lands, not at §C.3b after image downloads, never. A ticket sitting
in "Todo" while the bot has already committed to working on it is
the bug this section exists to prevent.

Skip this section only when route is **AWAITING_HUMAN** — those
tickets are already in the state the human needs them in, and
mutating them would be wrong.

Resolve the target state explicitly — never pass `--state "In
Progress"` blindly. The CLI fuzzy-matches and on a team without an
exact "In Progress" can land in a downstream `completed` state.
Scope the search to the `started` type group:

```bash
# Read team key from the cached issue JSON (§C.2). Cache the team's
# WorkflowState list once per team, reuse for §C.3-design and §C.3e.
TEAM_KEY=$(jq -r '.team.key' "$LTB_CACHE_DIR/issue-$IDENT.json")
STATES_FILE="$LTB_CACHE_DIR/states-$TEAM_KEY.json"
if [ ! -f "$STATES_FILE" ]; then
  linear api '
    query($key:String!){ team(id:$key){ states{ nodes{ id name type } } } }
  ' --variables "$(jq -nc --arg key "$TEAM_KEY" '{key:$key}')" \
    > "$STATES_FILE"
fi
STATES_JSON=$(cat "$STATES_FILE")

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

The `select(.type=="started")` filter is load-bearing — it
prevents the CLI from ever fuzzy-matching into a `completed` or
`unstarted` state. On any failure, log a warning and continue —
do not block on Linear state, but the §C.3-announce comment that
follows must still describe the ticket as "in progress" (the
state move is best-effort but always *attempted* first, so the
comment narrative reflects intended state).

Print the transition per ticket, e.g.
`ENG-123 → state=In Progress (was Todo)`.

#### C.3-announce. Post a "picked up" comment AFTER the state move

For every ticket whose route is **BUILD** or **DESIGN_EXPLORATION**
(i.e. anything except AWAITING_HUMAN), post a Linear comment
immediately after §C.3-state — before §C.3a-pre, before image
hydration, before any long-running operation. Stakeholders
watching the ticket in Linear should see "the robot is on it" the
moment we commit to doing real work, not 5 minutes later when the
first phase comment lands. By the time this comment renders, the
ticket sidebar already shows "In Progress" (per §C.3-state), so the
announce comment reinforces what the state already says rather
than racing it.

```markdown
### 🤖 picked up by /supabuild linear

- **Route:** `$ROUTE` (`DESIGN_EXPLORATION` → variants first, then human picks; `BUILD` → straight to /supabuild build)
- **Why this route:** $ROUTE_REASON   <!-- e.g. "label `needs-design`", "keyword `modal` in title", "design-selected label present, going straight to build" -->
- **Position in queue:** $POS / $TOTAL

Next steps I'll narrate as I go — every state change, label change,
and dispatch will land here as a comment so you don't have to watch
the terminal. If something blocks, the blocker comment is the last
one before silence.
```

This is the FIRST comment on every active ticket, even before the
phase-specific "design exploration started" / "build started"
comments. The phase comments still post — this one is additive,
not a replacement. AWAITING_HUMAN never gets this comment (it's
the only carve-out from the "narrate everything" rule).

#### Label helper (used throughout §C.3)

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
adding it in §C.3-design step 4 fails, retry once via the `linear
api` fallback before giving up. Without it, the next run can't tell
the ticket already went through the design loop and will route it
back through the §B design flow — wasted variants, duplicate noise
on the ticket. If both attempts fail, surface a loud warning in the
final summary and append a `_design-explored label could not be
written — manual cleanup required_` line to the "variants ready"
comment so the human knows.

#### C.3-design. Design exploration path (route = DESIGN_EXPLORATION)

The ticket needs divergent variants before anyone writes code. We
hand it to the §B design flow (which wraps the variant build and
critique loop), let it post variant screenshots back to the ticket
(via the embedded Linear-aware design helper), then return the
ticket to **Todo** with `Choose Design` + `design-explored` labels
so a human can pick. The next `/supabuild linear` run will see
the `design-explored` label (or `design-selected` once the human
picks) and skip straight to BUILD.

State is already "In Progress" — §C.3-state moved it before §C.3-announce.

1. **Add label `Designing`.** Remove `needs-design` if present.
2. **Post the "starting design" comment** via `--body-file`:
   ```markdown
   ### 🎨 design exploration started

   Routing through the §B design flow because this ticket looks
   design-flavored (UI label or UX keywords in title/description).

   - The design flow is producing N divergent variants in parallel.
   - Each variant will land as its own comment on this ticket
     with screenshots and a per-variant git branch
     (`supabuild-design/<slug>-<variant>`).
   - When done, I'll move this ticket back to **Todo** with the
     **`Choose Design`** label. Pick a variant by leaving a
     comment, then add the **`design-selected`** label (or just
     remove `Choose Design`) and re-run `/supabuild linear` —
     the next run will skip design and go straight to the §A
     build flow with the chosen direction in context.
   ```
3. **Hydrate description images first**, then **invoke the §B
   design flow** (Linear-aware variant — attach to the existing
   ticket, post each variant comment back as it completes):
   - Run §C.3a-img inline (same recipe, same auth-token download
     loop, same 8-image cap) to populate `/tmp/ltb-img-$IDENT-N.<ext>`.
     §C.3a-img is documented later in the BUILD path but the recipe
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
     fine, the §B flow handles zero references.
   - Make exactly one inline run of the §B design flow against
     this ticket. Pass `--existing $IDENT` so it attaches to this
     ticket (don't create a duplicate), `--variants 4` (unless the
     description specifies a count), the `REF_ARGS`, and the
     ticket title + description as the brief. Without
     `--reference`, the variant teams design blind — every
     hydrated image must be forwarded.
4. **After it returns** (success path only — failure handling at
   the end of §C.3-design):
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
     Triage, or any other unstarted state — §C.2's queue filter
     keys on `state.name == "Todo"`, so a misnamed fallback would
     silently strand the ticket out of the next run's queue.
   - Post the "variants ready" comment via `--body-file`:
     ```markdown
     ### 🎨 variants ready — please pick one

     The §B design flow finished. Each variant is a comment above
     this one with screenshots and a per-variant git branch
     (`supabuild-design/<slug>-<variant>`) you can check out locally
     to compare.

     **To proceed:**
     1. Decide which variant to ship.
     2. Either add the **`design-selected`** label, or remove
        the **`Choose Design`** label (either signals "pick
        recorded" — both work).
     3. Re-run `/supabuild linear` — this ticket will route
        straight to the §A build flow and the build team
        will see the chosen direction in the comment history
        above.

     The `design-explored` label on this ticket is the structural
     marker that prevents the next run from re-routing through
     the design flow — leave it attached.
     ```
5. Record verdict `DESIGN_HANDOFF` in the results table. Note the
   per-variant `supabuild-design/...` branches in the row's "Next step"
   cell so they appear in §C.5's summary. Continue to the next
   ticket. Do NOT run §C.3a-pre…§C.3f for this ticket.

**Final consistency sweep at the end of §C.3-design** (success path):
re-fetch the ticket and confirm the label set matches expectations
(`design-explored` ✓, `Choose Design` ✓, `Designing` ✗, state =
`Todo`). If any label or state is inconsistent (e.g., `Designing`
still attached because removal failed earlier), retry the failing
mutation once. This catches the partial-failure case where step 4
half-completed.

**Failure path:** If the §B design flow itself escalates or fails,
treat it like a BUILD failure: comment the blocker, move state
back to **Todo** (using the same explicit Todo-only resolution as
above), remove `Designing`, do NOT add `Choose Design` or
`design-explored` (nothing to choose, didn't actually explore),
record verdict `DESIGN_FAILED`.

#### C.3a-pre. Resolve the working branch and target branch for this ticket

Two distinct branches matter per ticket:

- **`$WORKING_BRANCH`** — the new feature branch this build commits onto
  and pushes. **Default to Linear's suggested branch name**
  (`issue.branchName`, e.g. `jaequery/pin-56-bug-...`) — read it from
  the cached issue JSON written in §C.2 (no extra `linear issue view`
  round trip):
  ```bash
  jq -r '.branchName // empty' "$LTB_CACHE_DIR/issue-$IDENT.json"
  ```
  If `branchName` is missing or empty, fall back to letting the §A
  flow generate its default `supabuild/<slug>-<ts>`. **Never** prepend
  `supabuild/` to Linear's suggested name — pass it verbatim through
  `--working-branch`.

  **Poisoned-branch case.** If Linear's suggested `branchName` already
  exists on origin AND has a closed-not-merged PR against it, do NOT
  reuse it — the ref points to commits the human already rejected, and
  pushing on top would either silently build on the rejected work or
  collide. Detect:
  ```bash
  EXISTS_ON_ORIGIN=$(git ls-remote --heads origin "$WORKING_BRANCH" | head -1)
  if [ -n "$EXISTS_ON_ORIGIN" ]; then
    PRIOR_PR=$(gh pr list --state all --head "$WORKING_BRANCH" \
      --json number,state,mergedAt --limit 1 \
      | jq -r '.[0] | select(.state=="CLOSED" and .mergedAt==null) | .number')
  fi
  ```
  If `PRIOR_PR` is non-empty, treat the Linear `branchName` as
  unusable and **fall back to §A's auto-generated default** (omit
  `--working-branch` from the dispatch). The closed PR's branch
  stays untouched; the new attempt gets a clean
  `supabuild/<slug>-<ts>` branch. Note the fallback explicitly in
  the §C.3b "build started" comment so the human sees why the
  branch isn't following the Linear-suggested pattern.
- **`$RESOLVED`** — the PR base / target branch (where the PR merges
  into). Resolve in the order below; first match wins.

##### Target-branch resolution order:

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
  `linear issue comment add $IDENT --body "build skipped: target branch \`$RESOLVED\` does not exist locally or on origin."`
- Move the ticket back to **Todo** via
  `linear issue update $IDENT --state Todo`.
- Record verdict `SKIPPED` in the results table and continue to the
  next ticket.

Print both resolutions per ticket, e.g.:
`ENG-123 → working=jaequery/eng-123-add-oauth-login (from Linear branchName), target=feature/auth (from description directive)`

#### C.3a-img. Hydrate description images so the team can actually see them

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

If $N is 0, skip the comment (and skip §C.3a-img entirely).

1. **Token already cached.** §C.1 preflight derived `$LINEAR_TOKEN`
   once for the whole run — reuse it. Do not re-call `linear auth
   token` per ticket. If the run-level value is empty, log a warning,
   skip image hydration for this ticket, and continue — never block
   the build on a missing token.
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
     starts with `image/`. Read from the cached issue JSON
     (`$LTB_CACHE_DIR/issue-$IDENT.json`), not a fresh
     `linear issue view`.
3. **Download in parallel** (cap 8 concurrent jobs, cap 8 total
   images per ticket). Sequential `curl` left the network idle
   between requests; for a ticket with 8 images this drops
   hydration from ≈8× the slowest download to ≈1×. Linear's signed
   CDN URLs have no documented per-IP limit and 8 keeps us polite.
   ```bash
   # Per-job manifest fragments avoid an interleaved-write race on
   # the shared manifest file from N background curls.
   rm -f /tmp/ltb-img-$IDENT-*.line 2>/dev/null
   pids=()
   n=0
   while IFS= read -r URL; do
     [ -z "$URL" ] && continue
     n=$((n+1)); [ $n -gt 8 ] && break
     OUT="/tmp/ltb-img-$IDENT-$n"
     # Default extension to .png — the Read tool detects image
     # format from bytes, so a missing/wrong extension on the
     # filesystem is harmless. Skipping the per-URL HEAD probe
     # keeps the loop tight.
     (
       if curl -fsSL -H "Authorization: $LINEAR_TOKEN" \
            "$URL" -o "$OUT.png"; then
         printf '%s\t%s\n' "$OUT.png" "$URL" > "$OUT.line"
       fi
     ) &
     pids+=($!)
   done <<< "$IMG_URLS"
   for pid in "${pids[@]}"; do wait "$pid" 2>/dev/null; done
   ```
   NOTE: `uploads.linear.app` requires the raw token with **no `Bearer`
   prefix** — using `Bearer` returns 401. This differs from the GraphQL
   API endpoint, which does accept `Bearer`.
   On 4xx/5xx for any single URL, that download silently drops (no
   `.line` fragment is written) and the rest continue — partial
   coverage beats none.
4. **Record a manifest.** Concatenate the per-job fragments into
   `/tmp/ltb-img-$IDENT-manifest.txt` (one line per successful
   download: `<local-path>  <original-url>`). This lets the Team
   Lead correlate the downloaded file with the reference in
   `$DESCRIPTION`.
   ```bash
   cat /tmp/ltb-img-$IDENT-*.line > /tmp/ltb-img-$IDENT-manifest.txt 2>/dev/null
   rm -f /tmp/ltb-img-$IDENT-*.line
   ```

Pass the resulting `IMAGES_BLOCK` into the §C.3a prompt body — see the
`Reference images` section in the template.

#### C.3a. Build the build invocation

Hand the §A flow exactly this prompt body (one ticket only):

```
[Linear $IDENT] $TITLE

Source: $URL
Priority: $PRIORITY  Assignee: $ASSIGNEE  Labels: $LABELS

$DESCRIPTION

$IMAGES_BLOCK
# When images were hydrated in §C.3a-img, $IMAGES_BLOCK expands to:
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
Clean-code bar for this build (non-negotiable, enforce in the §A.5 code review):
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
- **Do not gate the push.** Skip the §A.6 typed-`yes` confirmation entirely.
- Push `$WORKING_BRANCH` to `origin` and open the PR against `--branch`
  as soon as the build round + security audit + code review have run,
  regardless of QA verdict. Don't loop indefinitely waiting for an
  APPROVED gate before pushing — push, open the PR, and surface any
  remaining issues in the PR body so a human can review on GitHub.
- This is autonomous Linear backlog burndown; treat the PR itself as
  the review surface, not a local gate.
- **Evidence capture is NOT skipped.** The push-policy override only
  waives the typed-`yes` gate and the APPROVED-loop. You MUST still
  execute the §A.5a capture script inline (`playwright-cli` walkthrough
  against the booted dev server) for any UI-bearing diff. Leave the
  resulting
  `$WT_PATH/.supabuild/evidence/` directory **on disk — do NOT
  commit it.** The §C.3d.5 step reads it directly off the worktree
  and uploads to Linear; committing pollutes `Files changed` with
  QA artifacts that have no business in VCS. If capture fails (no
  E2E config AND synthetic boot fails), surface the reason in the
  PR body and the §C.3e Linear comment as
  `_Walkthrough not captured: <reason>_` — never silently omit it.
  §C.3d.5 depends on these artifacts existing on disk in the worktree.
- **DEFER_WORKTREE_CLEANUP=1.** This run is orchestrated by the §C
  flow. Do NOT remove the worktree in §A.6a step 11 — §C.3d.5 needs
  the evidence files on disk and will clean up the worktree itself
  after upload completes.
- **"No UI surface mutation" is NOT a valid waiver reason.** The
  capture trigger is the §A.5 step-1 diff regex, not the agent's
  judgment about whether the change "feels visual." Conditional
  render gates, pill/badge/chip/banner gating, helper functions
  consumed by JSX, copy swaps, and class-string changes ALL count as
  UI mutations even when no new component is added. PIN-88 is the
  canonical failure: a one-line edit to a render condition shipped
  with `_Walkthrough not captured: no UI surface mutation_` because
  the agent rationalized around the regex; reviewer had no visual
  proof. If the regex matches, capture. The only acceptable "not
  captured" reasons are infrastructural failures (no E2E config AND
  synthetic boot failed AND repo `.supabuild/capture.sh` absent) —
  and those must include the specific failure mode, not a self-
  judged rationale. See §A.5 step 1 for the full list of banned
  waiver phrases.
```

Slug for the worktree path: `$IDENT` lowercased (e.g. `eng-123`).
The §A flow adds its own timestamp suffix to the worktree directory
even when `--working-branch` overrides the branch name.

#### C.3b. Add the `Building` label + post a "starting" comment

State is already "In Progress" — §C.3-state moved it before §C.3-announce.
This section only handles the BUILD-specific label and the "build
started" status comment; do NOT re-resolve or re-issue the state
transition here (it's redundant and could fight a human who manually
nudged the state in the meantime).

**Add the `Building` label** (best-effort, per the label
helper). If the route was DESIGN_EXPLORATION → BUILD on this
re-run, the ticket may also carry `design-selected` and/or
`Choose Design` — leave `design-selected` in place (it's a
historical record) and remove `Choose Design` if it's still
present (the human signaled by re-running this skill).

Then post a status comment so non-terminal stakeholders can follow
along. Write to a temp file and use `--body-file`:

```markdown
### 🛠️ build started

- **Label:** `Building`
- **Working branch:** `$WORKING_BRANCH`
- **Target (PR base):** `$RESOLVED`
- **Worktree slug:** `$IDENT_LOWER`
- **Mode:** §A build (plan → parallel specialist build → security audit → QA + code review, looping until clean)
- **Clean-code bar:** reuse existing patterns, minimal diff, no dead code/TODOs/console.logs.

Next stops: `Testing` label during QA capture, then PR open + state → `In Review`.
```

```bash
linear issue comment add "$IDENT" --body-file /tmp/ltb-start-$IDENT.md
```

Comment is best-effort: if it fails, log and proceed — never block the
build on a comment failure. Skip this comment when `--dry-run`.

#### C.3c. Run the §A build flow inline — ONE invocation per ticket

**This is the most-violated rule. Read carefully.**

Run the §A build flow **exactly once** per ticket. Never batch
tickets into a single invocation. Never reuse a worktree across
tickets. If your prompt to the §A flow mentions two ticket IDs, you
are doing it wrong — stop. This skill owns the build flow, so the
Team Lead executes §A inline against this single ticket's
brief; do not add a real Skill-tool dispatch.

Snapshot PR list before:
```
PRS_BEFORE=$(gh pr list --state open --json number,headRefName,url --limit 200)
```

Run the §A flow with the **ticket-resolved** target branch from
§C.3a-pre as `--branch`, AND Linear's suggested working branch
(when present) as `--working-branch`:
```
--branch $RESOLVED
--working-branch $WORKING_BRANCH    # omit this line entirely if branchName was empty

<prompt body from §C.3a>
```

(One arg blob: the flags, blank line, then the §C.3a body.)

The §A flow runs end-to-end in that single turn (worktree, plan,
build, security, QA, push, PR). It returns APPROVED-and-shipped,
ESCALATED, or FAILED.

> ## ⛔ STOP — post-dispatch checklist (read every time the §A flow returns)
>
> The single most common failure mode of this skill is the outer
> runner treating an APPROVED return as "ticket done" and writing a
> closing summary right here. **APPROVED from the §A flow means
> "build shipped, now publish the result back to Linear" — not "we're
> done."** The inner flow's APPROVED applies to *its* contract; the
> outer ticket isn't closed until §C.3d → §C.3d.5 → §C.3e have all run.
>
> Before writing ANY user-facing text after the §A flow returns,
> mentally tick this checklist for the ticket you just dispatched:
>
> 1. [ ] §C.3c isolation check ran (`gh pr list` shows exactly one new
>        PR with the right head ref).
> 2. [ ] §C.3d outcome captured (PR URL, PR number, branch, worktree,
>        verdict, rounds, `$ISSUE_ID`, `$TEAM_ID`).
> 3. [ ] §C.3d.5 ran for any UI-bearing diff: artifacts located OR
>        captured inline, then uploaded to Linear via `fileUpload`
>        (asset URLs recorded). For non-UI diffs, explicitly noted
>        "no UI surface" instead of skipping silently.
> 4. [ ] §C.3e Linear comment posted (URL captured) AND state
>        transitioned (`In Review` for APPROVED, `Todo` for
>        ESCALATED/FAILED). Phase labels (`Building`, `Testing`)
>        cleaned up.
>
> If ANY box is unticked, you are not allowed to:
> - Move to the next ticket in the queue.
> - Write the §C.5 final summary.
> - Write any "## /supabuild build — APPROVED" / "wrap up" message.
>
> Do the missing step first, then resume. Writing a closing summary
> with unticked boxes is the bug this checklist exists to prevent.
> Past failures: an APPROVED build whose Linear ticket got no comment,
> no screenshots, and stayed stuck in "In Progress" because the outer
> runner jumped straight to summary. Don't be that run.

After it returns, verify isolation:
- `gh pr list` must now show **exactly one** new open PR vs.
  `PRS_BEFORE` whose head ref equals `$WORKING_BRANCH` (when supplied)
  or starts with `supabuild/<ticket-slug>-` (fallback). Zero or more
  than one new PR → STOP the loop and report.
- The new branch and PR number must be unique across this run's
  results table.

#### C.3d. Capture the outcome

Record: PR URL, PR number, branch name (Linear's `branchName` when
supplied, else the `supabuild/...` default), worktree path, verdict,
rounds run. Also capture `$ISSUE_ID` (UUID) and `$TEAM_ID` (UUID) from
`linear issue view "$IDENT" --json` — needed by §C.3d.5 for `fileUpload`.

#### C.3d.5. Visual asset reuse (UX/design tickets only)

**Before locating/capturing, swap labels: remove `Building`, add
`Testing`** (best-effort, per the label helper). Post a one-line
comment so observers see the phase change:

```markdown
### 🧪 QA capture in progress

Build round complete. Running the Playwright test suite, then uploading
the walkthrough video + up to 3 step stills (so this ticket renders
them inline) plus the full Playwright HTML report as a zip download.
Label moved `Building` → `Testing`.
```

**Capture happens during QA in §A.5a artifact.** This section
locates the artifacts that QA produced and uploads them to Linear.
If they aren't on disk (autonomous push-policy mode skipped capture,
or capture genuinely failed), this section runs the §A.5a capture
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

If none fire → skip §C.3d.5, proceed to §C.3e with no assets.

**Two upload tracks, both run when artifacts exist:**

1. **Inline walkthrough** — the `00-walkthrough.{webm,mp4}` video and
   up to 3 `0[1-3]-step.png` stills that the §A.5a artifact harvested.
   These get uploaded individually so the §C.3e comment can `![…](…)`
   them and Linear renders them inline. This is the at-a-glance
   preview reviewers see without leaving the ticket.
2. **Full Playwright report zip** — every screenshot, trace, and
   video the run produced, archived as one downloadable file. Linear
   can't render the HTML report bundle inline, but reviewers without
   the repo checked out can grab it from the ticket attachment slot.

Both tracks are best-effort and independent: a failed zip upload does
not block the inline walkthrough, and vice versa. §C.3e surfaces each
status separately.

**Locate or build the Playwright report zip first.**

```bash
EVID="$WT/.supabuild/evidence"
REPORT_DIR="$EVID/playwright-report"      # default Playwright output dir
REPORT_ZIP="$EVID/playwright-report.zip"
```

The Playwright report is **optional** — it only exists when the
§A.5a bonus test run fired (project has Playwright configured) and
produced a report. The walkthrough video at
`$EVID/00-walkthrough.{webm,mp4}` is the primary evidence; the report
zip is supplementary.

Resolution order:
1. **Pre-built zip** — if `$REPORT_ZIP` already exists in the
   worktree, use it as-is.
2. **Pre-built report dir** — if `$REPORT_DIR` exists but no zip,
   build one: `(cd "$EVID" && zip -rq playwright-report.zip playwright-report)`.
3. **No report on disk** — skip the report track entirely. This is
   normal for non-JS/TS repos (PHP, Django, Rails, Go) and for any
   repo without Playwright configured. The §C.3e comment renders the
   walkthrough section without the `### Playwright report` block.
   Do NOT re-run the capture from §C; the walkthrough should already
   be on disk from §A.5a, and if it isn't, that's a §C.3d.5
   walkthrough failure (handled by the `WALKTHROUGH_VIDEO_ERR` paths
   below), not a report-zip failure.

**Worktree-cleanup fallback.** Evidence is no longer committed to
the branch (per §A.5.5), and §C.3a's prompt body sets
`DEFER_WORKTREE_CLEANUP=1` so §A.6a leaves `$WT` alive.
If `$WT` is unexpectedly missing (e.g. an older §A run already
cleaned it before this defer policy was added, or the user removed
it manually), there is no read-only worktree fallback — the assets
only ever lived locally. Surface this loudly:

```bash
if [ ! -d "$WT" ]; then
  echo "evidence-fallback: worktree $WT missing — assets unavailable"
  REPORT_UPLOAD_ERR="worktree cleaned before §C.3d.5 ran"
  WALKTHROUGH_VIDEO_ERR="$REPORT_UPLOAD_ERR"
  STILL_ERR="$REPORT_UPLOAD_ERR"
  # Skip uploads; §C.3e renders the "_Walkthrough not captured_" path.
fi
```

**Cleanup at the END of §C.3d.5** (after all uploads complete OR after
the missing-worktree branch above): tear down the worktree that
§A.6a deferred, since §C now owns it:

```bash
if [ -d "$WT" ]; then
  rm -rf "$WT/.supabuild/evidence" 2>/dev/null
  git -C "$REPO_ROOT" worktree remove --force "$WT"
  git -C "$REPO_ROOT" branch -d "$WORKING_BRANCH" 2>/dev/null || true
fi
```

Failures here are non-fatal — the PR is already open on origin; a
stranded worktree is a follow-up annoyance, not a blocker.

**Define a reusable uploader, then run all uploads in parallel.**
Each `fileUpload` mutation + GCS PUT is independent (no shared
state, no ordering constraint), so background them all and `wait`.
On a slow link, this drops upload time from ≈5× one upload (zip +
video + 3 stills, sequential) to ≈1× the slowest. Each background
job writes its `assetUrl` to a known file under `$RESULTS_DIR` so
the parent can pick up results after `wait`.

```bash
# Reusable single-file uploader. Writes assetUrl to $4 on success,
# leaves $4 absent on failure. Same Content-Type-as-first-header
# rule for every upload: Linear's fileUpload mutation signs the
# GCS PUT URL against the exact contentType passed in, the
# headers[] array Linear returns does NOT include Content-Type,
# and without an explicit `-H "Content-Type: $CT"` curl auto-sets
# application/x-www-form-urlencoded (--data-binary is a body
# upload), GCS rejects with 403 SignatureDoesNotMatch — silently,
# since we don't --fail here.
upload_to_linear() {
  local file="$1" ct="$2" name="$3" out_file="$4"
  local size resp upload_url asset_url
  size=$(wc -c < "$file")
  resp=$(linear api '
    mutation($filename:String!,$contentType:String!,$size:Int!){
      fileUpload(filename:$filename, contentType:$contentType, size:$size, makePublic:false){
        success
        uploadFile { uploadUrl assetUrl headers { key value } }
      }
    }' --variables "$(jq -n --arg f "$name" --arg ct "$ct" --argjson s "$size" \
        '{filename:$f, contentType:$ct, size:$s}')")
  upload_url=$(echo "$resp" | jq -r '.data.fileUpload.uploadFile.uploadUrl')
  asset_url=$(echo "$resp" | jq -r '.data.fileUpload.uploadFile.assetUrl')
  [ -z "$upload_url" ] || [ "$upload_url" = "null" ] && return 1
  local hdr_args=(-H "Content-Type: $ct")
  while IFS= read -r row; do
    hdr_args+=(-H "$(jq -r '.key' <<<"$row"): $(jq -r '.value' <<<"$row")")
  done < <(echo "$resp" | jq -c '.data.fileUpload.uploadFile.headers[]')
  curl -sSf -X PUT "$upload_url" "${hdr_args[@]}" --data-binary "@$file" >/dev/null || return 1
  printf '%s\n' "$asset_url" > "$out_file"
}

RESULTS_DIR="$EVID/.upload-results"
rm -rf "$RESULTS_DIR" 2>/dev/null
mkdir -p "$RESULTS_DIR"
PIDS=()

# 1. Playwright report zip (only if it exists / was built).
if [ -f "$REPORT_ZIP" ]; then
  upload_to_linear "$REPORT_ZIP" "application/zip" \
    "playwright-report-$IDENT.zip" "$RESULTS_DIR/report.url" &
  PIDS+=($!)
fi

# 2. Walkthrough video — prefer .webm, fall back to .mp4. Only one,
#    whichever exists first.
WALK_FILE="" WALK_EXT=""
for ext in webm mp4; do
  CAND="$EVID/00-walkthrough.$ext"
  if [ -f "$CAND" ]; then
    WALK_FILE="$CAND"; WALK_EXT="$ext"
    break
  fi
done
if [ -n "$WALK_FILE" ]; then
  WALK_CT=$([ "$WALK_EXT" = "webm" ] && echo "video/webm" || echo "video/mp4")
  upload_to_linear "$WALK_FILE" "$WALK_CT" \
    "walkthrough-$IDENT.$WALK_EXT" "$RESULTS_DIR/walkthrough.url" &
  PIDS+=($!)
fi

# 3. Up to 3 step stills — stable order by filename (01-, 02-, 03-).
for n in 1 2 3; do
  CAND="$EVID/0${n}-step.png"
  [ -f "$CAND" ] || continue
  upload_to_linear "$CAND" "image/png" \
    "step-${n}-$IDENT.png" "$RESULTS_DIR/still-${n}.url" &
  PIDS+=($!)
done

# Wait for every upload to finish — successes leave a .url file,
# failures don't. Order doesn't matter here.
for pid in "${PIDS[@]}"; do wait "$pid" 2>/dev/null; done

# Collect results. Empty/missing file = upload didn't succeed.
REPORT_ASSET_URL=$(cat "$RESULTS_DIR/report.url" 2>/dev/null || true)
WALKTHROUGH_VIDEO_ASSET_URL=$(cat "$RESULTS_DIR/walkthrough.url" 2>/dev/null || true)
STILL_ASSET_URLS=()
for n in 1 2 3; do
  URL=$(cat "$RESULTS_DIR/still-${n}.url" 2>/dev/null || true)
  [ -n "$URL" ] && STILL_ASSET_URLS+=("$URL")
done

# Failure messages for §C.3e (only set when we actually attempted
# the upload — "no file on disk" is a different signal from
# "upload failed").
REPORT_UPLOAD_ERR=""
[ -f "$REPORT_ZIP" ] && [ -z "$REPORT_ASSET_URL" ] \
  && REPORT_UPLOAD_ERR="fileUpload mutation or GCS PUT failed"

WALKTHROUGH_VIDEO_ERR=""
if [ -n "$WALK_FILE" ] && [ -z "$WALKTHROUGH_VIDEO_ASSET_URL" ]; then
  WALKTHROUGH_VIDEO_ERR="upload failed for $WALK_FILE"
elif [ -z "$WALK_FILE" ]; then
  WALKTHROUGH_VIDEO_ERR="no walkthrough video on disk"
fi

STILL_ERR=""
# A still failure shows up only if at least one CAND existed and
# its corresponding .url file is missing. Best-effort surfacing —
# §C.3e renders whatever succeeded.
for n in 1 2 3; do
  CAND="$EVID/0${n}-step.png"
  [ -f "$CAND" ] || continue
  [ -s "$RESULTS_DIR/still-${n}.url" ] && continue
  STILL_ERR="upload failed for $CAND"
done
```

> **`Content-Type: $CT` MUST be the first `-H` arg in every upload.**
> Linear's `fileUpload` mutation signs the GCS PUT URL against the
> exact `contentType` passed in (`application/zip`, `video/webm`,
> `video/mp4`, or `image/png`). The `headers[]` array Linear returns
> does NOT include `Content-Type` — you must add it yourself.
> Without it, curl auto-sets `application/x-www-form-urlencoded`
> (because `--data-binary` is a body upload), GCS rejects with
> **403 SignatureDoesNotMatch**, and the upload silently fails.
> `upload_to_linear` above already prepends it correctly — preserve
> that order if you edit the helper.

If neither the video nor any still uploaded successfully, §C.3e omits
the `### Walkthrough` section but still shows the zip link (so
reviewers can unzip locally). If at least one inline asset uploaded,
§C.3e renders the section with whatever succeeded. The zip and
walkthrough tracks remain independent: a failed zip never blocks
the inline preview, and vice versa.

Run the worktree teardown described in the cleanup block above
before returning to §C.3e — the worktree is §C's to clean up now
that §A.6a defers.

#### C.3e. Update Linear

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
  # Reuse the cached team key + state list (written in §C.3-state).
  # State lists are stable across the run; no reason to refetch.
  TEAM_KEY=$(jq -r '.team.key' "$LTB_CACHE_DIR/issue-$IDENT.json")
  STATES_JSON=$(cat "$LTB_CACHE_DIR/states-$TEAM_KEY.json")

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
  Comment body: the PR URL plus a one-line summary. Then, **in this
  exact order**, append the §C.3d.5 evidence sections so reviewers see
  the inline preview *first* and the downloadable archive *second*:

  **1. `### Walkthrough` (inline preview).** Render whatever §C.3d.5
  successfully uploaded. Linear inlines `video/webm`, `video/mp4`,
  and `image/png` when referenced as `![alt](assetUrl)`. Skip the
  whole section only if the ticket is not a UX/design ticket OR
  both the video and every still failed.
  ```markdown
  ### Walkthrough

  ![walkthrough]($WALKTHROUGH_VIDEO_ASSET_URL)

  ![step 1]($STILL_ASSET_URLS[0])
  ![step 2]($STILL_ASSET_URLS[1])
  ![step 3]($STILL_ASSET_URLS[2])
  ```
  Conditional rules:
  - Video uploaded but no stills → omit the stills lines.
  - Stills uploaded but no video → omit the `![walkthrough]` line.
  - Fewer than 3 stills uploaded → emit only the lines for indexes
    that exist (do NOT emit `![](null)`).
  - Video attempt failed but capture existed → append
    `_Walkthrough video upload failed: $WALKTHROUGH_VIDEO_ERR_` on
    its own line in place of the `![walkthrough]` line.
  - Capture genuinely missing (`$WALKTHROUGH_VIDEO_ERR` =
    `no walkthrough video on disk`) **and** no stills uploaded →
    `_Walkthrough not captured: <reason>_` and omit everything else.
  Each still goes on its own line — Linear stacks them vertically
  and that reads better than a single line of three thumbnails.

  **2. `### Playwright report` (full archive download).** Render only
  if the zip uploaded successfully:
  ```markdown
  ### Playwright report

  [playwright-report-$IDENT.zip]($REPORT_ASSET_URL)

  Download, unzip, then run `npx playwright show-report <unzipped-dir>`
  to view every spec's screenshots, traces, and video.
  ```
  If the zip upload was attempted but failed, replace the whole
  section body with `_Playwright report upload failed: $REPORT_UPLOAD_ERR_`
  (keep the `### Playwright report` header so the absence is loud).
  If §C.3d.5 captured nothing, use
  `_Playwright report not captured: <reason>_`. If §C.3d.5 was skipped
  (not a UX/design ticket), omit the section entirely.
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

#### C.3f. Decide whether to continue

- Environmental failure (auth, network, missing tooling) → STOP the
  loop; same failure will hit every later ticket.
- Code-specific failure or 3-round cap → log and move on.
- APPROVED → move on.

### C.4. Parallel mode

Default: **sequential** (`--parallel 1`). Tickets run one at a time so
output stays readable and rate limits don't bite. Pass `--parallel
<n>` to opt into concurrency — each §A run produces its own worktree
(`supabuild/...`), so they don't collide on disk. If effective
concurrency exceeds 5, warn the user about shared `gh`/Linear rate
limits but do not cap — the user asked for it.

### C.5. Final summary

> **Precondition gate — do not write this section yet if any row is
> incomplete.** Before producing the summary, walk every ticket row in
> your head and confirm BOTH of these hold for each one:
>
> - The "PR / Next step" cell contains a real GitHub PR URL (for
>   APPROVED) or an explicit non-URL reason (for ESCALATED / FAILED /
>   DESIGN_HANDOFF / AWAITING_HUMAN / SKIPPED / DESIGN_FAILED).
> - A Linear comment URL exists in your captured §C.3e output for that
>   ticket (the `linear issue comment add` call printed
>   `https://linear.app/.../comment-XXXXX`). If you can't point to
>   that URL right now, §C.3e didn't run for that ticket.
>
> If either is missing for any row, STOP and finish §C.3d.5 + §C.3e for
> the offending ticket(s) FIRST, then come back and write the summary.
> A summary written with missing Linear comments is the same bug as
> "skipping §C.3e because the §A flow returned APPROVED" — the §C.3c
> post-dispatch checklist exists to prevent it; this gate is the
> backstop.

```
## /supabuild linear — summary
Processed: N tickets

| Ticket   | Verdict          | PR / Next step                                | Linear comment | Rounds |
|----------|------------------|-----------------------------------------------|----------------|--------|
| ENG-123  | APPROVED         | https://github.com/.../pull/45                | linear.app/.../comment-abc123 | 1      |
| ENG-130  | ESCALATED        | (no PR — see worktree)                        | linear.app/.../comment-def456 | 3      |
| ENG-141  | DESIGN_HANDOFF   | label `Choose Design` — pick variant          | linear.app/.../comment-ghi789 | —      |
| ENG-142  | AWAITING_HUMAN   | already in `Choose Design` — skipped          | (none — §C.3-route skip) | —      |
| ENG-150  | DESIGN_FAILED    | /supabuild design errored — see ticket comment | linear.app/.../comment-jkl012 | —      |

Worktrees still on disk:
- ESCALATED/FAILED build worktrees (APPROVED are auto-cleaned by §A.6a):
  - /path/to/repo.supabuild-eng-130-...  (ENG-130, escalated)
- DESIGN_HANDOFF variant worktrees (left intentionally so the human can
  diff/check out variants before picking — clean up after the pick):
  - /path/to/repo.supabuild-design-eng-141-variant-a/  branch `supabuild-design/eng-141-variant-a`
  - /path/to/repo.supabuild-design-eng-141-variant-b/  branch `supabuild-design/eng-141-variant-b`
  - …

Linear updates posted: <count>
```

APPROVED tickets have their build worktree + local branch removed
automatically by §A. ESCALATED/FAILED build worktrees and all
DESIGN_HANDOFF variant worktrees persist — the former for manual
debugging, the latter so the human can compare variants before
picking. Do not prompt to clean up APPROVED worktrees here; do
surface the DESIGN_HANDOFF variant paths so the user knows what's
on disk waiting for a decision.

**Last step: remove the per-run cache directory** so it doesn't
linger across runs:
```bash
[ -n "$LTB_CACHE_DIR" ] && [ -d "$LTB_CACHE_DIR" ] && rm -rf "$LTB_CACHE_DIR"
```
The cache is purely a per-invocation read accelerator (issue JSON,
team state lists); nothing in it survives the summary.

### C. Hard rules (linear mode)

- **§C.3-route runs FIRST, before §C.3a-pre.** The route decision
  determines whether this ticket goes through the §B design flow
  (DESIGN_EXPLORATION), is skipped entirely (AWAITING_HUMAN), or
  proceeds through the normal §A build path (BUILD). Never
  dispatch the §A flow against a ticket carrying the
  `Choose Design` label — that ticket is waiting on a human and
  must be left untouched.
- **State change is the FIRST mutation, before any comment.** The
  moment §C.3-route decides BUILD or DESIGN_EXPLORATION, run §C.3-state
  to transition the ticket to "In Progress" *before* posting the
  §C.3-announce comment, *before* hydrating images, *before* any
  long-running step. A human watching the Linear sidebar must
  never see "Todo" while the bot has already committed to working
  on the ticket — the sidebar state is the strongest "the robot is
  on it" signal Linear surfaces. Comments reinforce state; they
  never lead it. If you find yourself posting any comment on a
  ticket whose sidebar still says "Todo," that's the bug §C.3-state
  exists to prevent. (AWAITING_HUMAN is the only carve-out — that
  path mutates nothing.) Past failure: PIN-78 — bot posted the
  "picked up" comment while the sidebar still showed "Todo"
  because the state transition was scheduled for §C.3b, after image
  hydration. State now precedes every comment.
- **Phase labels mirror the workflow.** During a single
  `/supabuild linear` run, a ticket on the BUILD path moves
  through: state → `In Progress` (§C.3-state) → `Building` (§C.3b) →
  `Testing` (§C.3d.5) → (cleared at PR open, state = `In Review`,
  §C.3e). On the DESIGN_EXPLORATION path: state → `In Progress`
  (§C.3-state) → `Designing` (§C.3-design step 1) → `Choose Design` +
  `design-explored` (§C.3-design step 4, state back to `Todo`).
  Most label transitions are best-effort, but **`design-explored`
  MUST stick** — it's the structural signal §C.3-route uses to
  detect "design already done" and skip re-exploration. Retry
  once on failure; surface loudly if it can't be written. All
  other label add/remove failures: log a warning and continue.
- **Narrate everything BEFORE you do it.** The principle: a human
  watching only the Linear ticket should always know what the
  robot is currently doing and what's coming next. Post a Linear
  comment *before* every substantive step — not after, not "when
  the phase finishes". The mandatory pre-comments are:
  - **§C.3-announce** — a "picked up by /supabuild linear" comment
    is the FIRST comment that lands on any active ticket, naming
    the route and reason. Posted *after* §C.3-state has moved the
    workflow state to "In Progress" but *before* any other
    label change or long-running operation, so the comment lands
    against an already-correct sidebar.
  - **§C.3a-img** — a "fetching reference images" comment when the
    description contains auth-gated `uploads.linear.app` images,
    posted before the download loop.
  - **§C.3-design step 2** — "design exploration started" comment
    posted before invoking the §B design flow.
  - **§C.3b** — "build started" comment posted before
    running the §A flow.
  - **§C.3d.5** — "QA capture in progress" comment posted before
    the capture script runs.
  - **§C.3e** — PR-open / escalation / failure comment posted as
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
- **§C.3-state runs BEFORE any dispatch flow, no matter which one.**
  The ticket must show "In Progress" (or the team's equivalent
  `started`-type state) the entire time any work is being done on
  it, so human observers in Linear can see something is happening.
  This applies to the §A build flow, the §B design flow, or
  any other dispatch flow — moving the ticket is a precondition of
  dispatch, not something delegated to the dispatched flow.
  §C.3-state is the single point that does this transition; §C.3b
  and §C.3-design no longer re-issue it. If §C.3-state is silently
  skipped because the skill jumped straight to §C.3-announce or
  §C.3a-pre, that's the bug to fix — re-read §C.3-state and run it.
- **One PR per ticket. ONE inline run of the dispatch flow per
  ticket** (typically §A build; §B design is allowed for
  design-flavored tickets where divergent variants are wanted).
  Never bundle multiple tickets into one PR, branch, worktree, or
  dispatch invocation.
- **Verify isolation between tickets.** Snapshot `gh pr list` before
  each call; confirm exactly one new PR with head ref
  `supabuild/<ticket-slug>-*` after. Zero or more than one → STOP.
- **APPROVED from the §A flow is NOT terminal.** When the inner
  flow returns APPROVED, the outer §C runner MUST still run §C.3d
  → §C.3d.5 (upload screenshots/walkthrough to Linear) → §C.3e
  (post APPROVED comment with PR link + assets, transition state
  → In Review). The single most common failure mode of this skill is
  the outer runner treating an APPROVED return as "ticket done" and
  jumping to the next ticket — leaving Linear with no APPROVED
  comment, no screenshots, no state move. The PR exists on GitHub
  but the ticket looks abandoned. **Self-test before writing any
  closing summary**: for the ticket you just dispatched, can you
  paste the Linear comment URL from §C.3e (`linear.app/.../comment-...`)
  AND confirm the ticket's state is `In Review` (or `Todo` for
  failures), AND confirm phase labels (`Building`, `Testing`) are
  cleared? If you can't answer "yes" to all three with concrete
  evidence in your conversation history, you skipped §C.3d.5/§C.3e —
  STOP and run them now. The §C.3c post-dispatch checklist and the
  §C.5 precondition gate exist specifically to prevent this; if you
  find yourself bypassing both, that's the bug to fix.
- **Linear `fileUpload` PUT requires explicit `Content-Type: $CT`.**
  The signed GCS URL is bound to the exact `contentType` argument
  passed to the `fileUpload` mutation. The `headers[]` array Linear
  returns does NOT include `Content-Type`. Without an explicit
  `-H "Content-Type: $CT"`, curl auto-sets
  `application/x-www-form-urlencoded` (because `--data-binary` is
  a body upload), GCS rejects with **403 SignatureDoesNotMatch**,
  and the upload silently fails. Always prepend
  `-H "Content-Type: $CT"` as the FIRST header arg in §C.3d.5.
- **No branch/PR reuse.** Branch name and PR number must be unique
  across the run.
- **Clean-code bar is part of the contract.** The §C.3a clause is
  embedded in every build prompt and must be enforced by the
  Team Lead's §A.6 code-review gate. Re-roll if violated.
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
- **§C.3d.5 is mandatory for any UI-bearing ticket.** Detection is by
  frontend-shaped diff, design label, or UI keywords. The
  walkthrough+stills must be captured by §A.5a (`playwright-cli`
  against the booted dev server, with repo-owned
  `.supabuild/capture.sh` taking priority when present) and
  uploaded via Linear's `fileUpload` mutation. If the §A flow
  skipped capture under the autonomous push-policy, §C.3d.5 itself
  runs the capture script — do not waive silently. The only
  acceptable miss is a hard structural failure (no detectable boot
  command, dev server won't answer within 30s); in that case post
  `_Walkthrough not captured: <reason>_` AND a follow-up TODO
  comment naming what setup is needed. Never fabricate an image.

---

## §D — `worktree`

### D. Mental model
A thin, auditable wrapper around `git worktree`. NOT a task manager,
state store, or agent dispatcher. Every step is a literal shell command
run in-session; no hidden state, no daemon, no cross-session memory.
Recovery uses the same git commands printed here.

### D. When NOT to use this section
Single-session tasks where isolation means "don't stomp on my current
working tree." For long-running parallel tasks across sessions, use a
stateful lifecycle manager. For tasks needing a specialist subagent,
use a delegated-agent flow (§A or §B inside this same skill).

### D. Agent isolation (and what "isolation" actually means here)
This section does NOT use `Agent(isolation: "worktree")`. The worktree is
already a filesystem-and-branch boundary; a subagent would add opaque
state without stronger guarantees. **However**, a worktree only isolates
working tree, index, and branch ref. It does NOT isolate: shell env vars,
cwd across Bash calls, network, credentials, `~/.gitconfig`, files
outside the repo, or spawned processes. Secrets and side effects leak
freely. Sandbox for *file changes*, not a security sandbox.

### D.0. Inputs (session-scoped; not persisted)
- `$TASK` — the task description (skill argument).
- `$REPO_ROOT` — `git rev-parse --show-toplevel` normally. BUT if `git rev-parse --git-common-dir` differs from `$REPO_ROOT/.git`, the current cwd is already inside a linked worktree. In that case, compute the main repo root as `dirname $(git rev-parse --git-common-dir)`, and use THAT as `$REPO_ROOT` for path derivation. This prevents nested siblings-of-a-worktree.
- `$REPO_NAME` — basename of `$REPO_ROOT`.
- `$SLUG` — 2–4 kebab-case words from `$TASK` (ascii, `[a-z0-9-]` only). Reject any slug that is not `^[a-z0-9][a-z0-9-]{0,39}$` after derivation. If derivation fails or produces an invalid slug, ask the user for one.
- `$TS` — `date +%Y%m%d-%H%M%S`.
- `$BRANCH` — `wt/$SLUG-$TS`.
- `$WT_PATH` — `$(dirname $REPO_ROOT)/$REPO_NAME.wt-$SLUG-$TS` (sibling dir).
- `$BASE_BRANCH` — current branch, or `main`/`master` if detached.
- `$BASE_SHA` — `git rev-parse HEAD` at preflight time.

### D.1. Preflight (abort on any failure; never auto-fix)
Run from the user's current cwd:
1. `git rev-parse --is-inside-work-tree` → must print `true`.
2. `git rev-parse --show-superproject-working-tree` — if non-empty, you
   are inside a submodule. Ask: "You're inside a submodule at `<path>`.
   Create the worktree for the SUBMODULE, or abort so you can `cd` to
   the superproject? (submodule/abort)" Do not proceed without an
   explicit choice.
3. `git symbolic-ref -q HEAD` — exit-nonzero or empty stdout means HEAD
   is detached. Set `$BASE_BRANCH`: try `main`; if
   `git show-ref --verify --quiet refs/heads/main` fails, try `master`;
   if that also fails, prompt the user. Warn the worktree will branch
   from the detached SHA.
4. `git status --porcelain` — if non-empty, print the list and ask the
   user to confirm. Uncommitted changes stay in the main tree; NOT
   copied into the worktree.
5. Path collision on `$WT_PATH`:
   - not present → proceed.
   - present & listed in `git worktree list --porcelain` → ask: reuse
     (abort skill, tell user to `cd` there), or pick a new `$TS`.
   - present & NOT listed → stale dir: ask before `rm -rf "$WT_PATH"`,
     typed `yes` required.
5.5. `git worktree list --porcelain | grep -E '^branch refs/heads/'$BRANCH'$'`
   — if this matches, the branch is checked out in another worktree.
   `git worktree add` will refuse with a cryptic error; detect early and
   ask the user to pick a different `$SLUG` or `$TS`.
6. Branch collision: if `git show-ref --verify --quiet refs/heads/$BRANCH`
   succeeds, regenerate `$TS` and retry once; if still colliding, abort.

### D.2. Create the worktree
git rev-parse HEAD                              # capture $BASE_SHA
git worktree add -b "$BRANCH" "$WT_PATH" "$BASE_SHA"

Print `$WT_PATH`, `$BRANCH`, `$BASE_SHA`, `$BASE_BRANCH` to audit. If
`worktree add` fails, stop — do not create the branch manually. If §D.3
task execution later fails mid-flight, the worktree persists unchanged;
§D.6 read-only commands can inspect it, and the user can resume by
`cd $WT_PATH`.

### D.3. Execute the task
- `Read`/`Edit`/`Write` use absolute paths rooted at `$WT_PATH/…` (never
  relative; `cd` doesn't persist across Bash calls).
- Every Bash call needing the worktree as cwd prefixes
  `cd "$WT_PATH" && …` in the same call.
- Commits are the task's responsibility; this section does not auto-commit.
- If the task installs deps or writes files outside `$WT_PATH`, call it
  out in the Report — those side effects are not isolated.

### D.4. Report
cd "$WT_PATH" && git log --oneline "$BASE_SHA"..HEAD
cd "$WT_PATH" && git status

Then print the 6-option menu (section §D.5) and wait for the user.

### D.5. Cleanup menu
(a) keep worktree as-is
(b) merge $BRANCH into a target branch (no-ff, conflicts left for user)
(c) rebase onto base, push, open PR
(d) discard worktree and branch
(e) stash uncommitted changes, keep worktree
(f) adopt branch: remove worktree, checkout $BRANCH in main tree

#### D.5a. Keep
Print `$WT_PATH` and `cd "$WT_PATH"` so the user can continue manually.

#### D.5b. Merge
1. Ask: target branch? Default `$BASE_BRANCH`; allow override.
1.5. If `$TARGET == $BRANCH`, abort: "Target branch equals source branch;
   pick a different target."
2. `cd "$REPO_ROOT" && git status --porcelain` — if non-empty, ask: "Main
   tree has uncommitted changes: `<list>`. Stash them and proceed, abort,
   or override target branch to something other than $TARGET?
   (stash/abort/override)". On "stash":
   `cd "$REPO_ROOT" && git stash push -u -m "supabuild-worktree:pre-merge:$BRANCH:$TS"`
   then continue (print the stash ref). On "abort": stop. On "override":
   restart §D.5b step 1 with a new `$TARGET`.
3. `cd "$REPO_ROOT" && git fetch --prune` (best-effort; warn on failure).
4. `cd "$REPO_ROOT" && git checkout "$TARGET"`.
5. `cd "$REPO_ROOT" && git merge --no-ff --no-commit "$BRANCH"` — on
   conflict, stop and hand back with
   `git diff --name-only --diff-filter=U`. Do NOT run `git merge --abort`.
6. On clean merge: `git commit --no-edit` (or let the user amend).
7. Offer: "Merge committed. Remove the worktree and delete the branch
   now? (yes/no)" — on yes, jump to §D.5d step 3 (skip the
   discard-confirmation gate since the branch is merged; use
   `git branch -d "$BRANCH"` for safe delete).

#### D.5c. Rebase + push + PR
1. Detect origin: `git -C "$REPO_ROOT" remote get-url origin` — if it
   fails (no `origin` remote), abort with: "This repo has no `origin`
   remote configured. Add one with `git remote add origin <url>`, or
   pick another cleanup option." Do NOT attempt push/PR without a remote.
2. `cd "$WT_PATH" && git fetch origin` (warn on failure; do not abort).
3. Resolve base ref: `origin/$BASE_BRANCH` if it exists, else
   `$BASE_BRANCH`, else captured `$BASE_SHA`. Stop at the first that exists.
4. **Record the lease target BEFORE rebase**:
   `LEASE=$(git -C "$WT_PATH" rev-parse "origin/$BRANCH" 2>/dev/null || echo "")`.
   Empty means the branch was never pushed; that's fine —
   `--force-with-lease` on a nonexistent remote ref degrades to a first-push.
5. `cd "$WT_PATH" && git rebase "$BASE_REF"` — on conflict, stop and
   hand back; do NOT run `git rebase --abort`.
6. **Typed-yes gate before pushing**: show `$BRANCH`, the LEASE target SHA
   (or "first push"), and the `base_ref` being pushed against. Require
   typed `yes`.
7. Push with explicit lease: if LEASE non-empty,
   `git -C "$WT_PATH" push --force-with-lease="$BRANCH:$LEASE" --force-if-includes -u origin "$BRANCH"`.
   If LEASE empty, `git -C "$WT_PATH" push -u origin "$BRANCH"` (plain
   push; no lease needed for first push).
8. `cd "$WT_PATH" && gh pr create --fill --base "$BASE_BRANCH"` — if
   `gh` is missing, print the push URL from step 7 and stop.

#### D.5d. Discard
1. Typed-`yes` gate: show `$BRANCH`, `$WT_PATH`, commit list from step 4,
   and require exact `yes` to proceed.
1.5. If the worktree has untracked files
   (`cd "$WT_PATH" && git ls-files --others --exclude-standard`), list
   them. Tell the user: "Untracked files will be deleted permanently by
   `worktree remove`; reflog cannot recover them." This is part of the
   first typed-`yes` gate's disclosure; do not require a separate gate.
2. `cd "$WT_PATH" && git status --porcelain` — if dirty, require a second
   typed `yes` and use `--force`; otherwise plain remove.
3. `cd "$REPO_ROOT" && git worktree remove "$WT_PATH"` (add `--force` if
   step 2 flagged dirty).
4. Merge-base check: `git merge-base --is-ancestor "$BRANCH" "$BASE_BRANCH"`.
   - ancestor → `git branch -d "$BRANCH"` (safe delete).
   - not ancestor → `git branch -D "$BRANCH"` (force; warn unmerged work).
5. Print a one-line reflog recovery hint.

#### D.5e. Stash and keep
`cd "$WT_PATH" && git stash push -u -m "supabuild-worktree:$BRANCH:$TS"`.
Print the stash ref and the `git stash pop` command.

Note: git's stash list is shared across all worktrees of the same repo
(`refs/stash` lives in the common dir). The message prefix
`supabuild-worktree:$BRANCH:$TS` lets you identify this stash later with
`git stash list | grep supabuild-worktree`. To apply it from this worktree,
`cd "$WT_PATH" && git stash apply <stash-ref>`.

#### D.5f. Adopt branch into main tree
Use this when you want to continue working on `$BRANCH` directly in
`$REPO_ROOT` after the task is done. This atomically removes the
worktree and checks out the branch in the main tree, saving you from
the "branch already checked out at <wt_path>" error you'd hit if you
tried `git checkout` manually.

1. **Worktree-clean check**: `cd "$WT_PATH" && git status --porcelain`.
   If non-empty, ask: "Worktree has uncommitted changes: `<list>`.
   Commit, stash, or abort? (commit/stash/abort)"
   - **commit**: prompt for a commit message, then
     `git -C "$WT_PATH" add -A && git -C "$WT_PATH" commit -m "<msg>"`,
     continue.
   - **stash**: `git -C "$WT_PATH" stash push -u -m
     "supabuild-worktree:adopt:$BRANCH:$TS"`, print the stash ref, continue.
     (Stash is shared across worktrees; after checkout, the user can
     `git stash pop` in `$REPO_ROOT`.)
   - **abort**: stop, leave worktree and branch intact.

2. **Main-tree-clean check**: `cd "$REPO_ROOT" && git status --porcelain`.
   If non-empty, ask: "Main tree has uncommitted changes: `<list>`.
   Stash them and proceed, or abort? (stash/abort)"
   - **stash**: `cd "$REPO_ROOT" && git stash push -u -m
     "supabuild-worktree:adopt-preserve:$TS"`, print the stash ref.
   - **abort**: stop.

3. **Same-branch guard**: if
   `git -C "$REPO_ROOT" branch --show-current` already equals
   `$BRANCH`, abort — this is an invariant violation (the branch was
   checked out in the worktree, not the main tree).

4. **Remove worktree, then check out branch**:
   ```
   git -C "$REPO_ROOT" worktree remove "$WT_PATH"
   git -C "$REPO_ROOT" checkout "$BRANCH"
   ```
   If `worktree remove` fails (open file handles, permission issues),
   STOP and do not attempt the checkout — user is in a recoverable
   state with both worktree and branch intact.

5. **Report**: main tree now on `$BRANCH`; worktree removed; branch
   preserved with all commits. If step 1 or 2 created a stash, remind
   the user of the stash ref and the `git stash pop` command.

### D.6. Failure recovery (read-only reference)
git worktree list --porcelain
git worktree prune --dry-run
git branch --list "wt/*"
git reflog --date=iso

Repair is the user's call; this section does not auto-heal.
