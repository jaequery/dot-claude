# dot-claude

My personal Claude Code arsenal — custom slash-command skills and a curated roster of 140+ specialist subagents, published as a single **Claude Code plugin marketplace**. Built to turn Claude from a clever assistant into an opinionated team of domain experts.

## Install

This repo is a [Claude Code plugin marketplace](https://docs.claude.com/en/docs/claude-code/plugins). You install it from *inside* a Claude Code session — you do not `git clone` it.

### Prerequisites

- [Claude Code](https://docs.claude.com/en/docs/claude-code) installed and working (`claude --version`).
- Network access to GitHub from your Claude Code host.

### Steps

1. **Start Claude Code** in any directory: `claude`
2. **Add the marketplace:**
   ```
   /plugin marketplace add jaequery/dot-claude
   ```
   This registers the `jaequery` marketplace. It does *not* install anything yet.
3. **Install the plugin:**
   ```
   /plugin install jaequery@jaequery
   ```
   The syntax is `<plugin-name>@<marketplace-name>`. Both are `jaequery`.
4. **Verify:** type `/` and look for entries under `jaequery:*`. You should see `/jaequery:team-build`, `/jaequery:shark-tank`, `/jaequery:dda`, etc.

### Using it after install

- **Skills** — type the slash command, e.g. `/jaequery:shark-tank`, `/jaequery:code-review`, `/jaequery:seo audit https://example.com`. See the [Skill Guides](#skill-guides) below for every skill.
- **Subagents** — Claude dispatches these via the Agent tool. Ask in natural language (*"have a Security Engineer review this diff"*, *"get the Reality Checker to verify this"*) or invoke `/jaequery:dda` / `/jaequery:team-build` to assemble a panel automatically.

### Updating

```
/plugin marketplace update jaequery
```

Fetches the latest skills and agents from this repo.

### Uninstall

```
/plugin uninstall jaequery@jaequery
/plugin marketplace remove jaequery
```

### Troubleshooting

- **`/plugin` command not found** — your Claude Code version is too old; update it.
- **Skills don't show up after install** — restart the Claude Code session so it re-scans plugins.
- **`marketplace add` fails on network error** — check you can reach `github.com` (the marketplace is served from this repo's default branch).

---

## Why this exists

Out-of-the-box Claude is a generalist. Real work needs specialists — someone who thinks like a growth hacker, someone who grades plans like a skeptical VP, someone who kills bad startup ideas before you build them. This repo wires that in as slash commands and subagents you can invoke on demand.

---

## Custom Skills — quick index

Invoke any of these from the Claude Code prompt. Each one is a self-contained SOP — no setup required. See [Skill Guides](#skill-guides) below for the deep dive on each.

### Decision & review

- [`/team-build`](#team-build) — Team Lead orchestrates 2–10 specialist subagents in an isolated worktree, with security audit + QA gate, and opens a PR.
- [`/team-design`](#team-design) — Design Lead generates 2–10 *divergent* design variants in parallel, each on its own worktree + branch (`team-design/<slug>-<variant>`), with screenshots, for the human to pick.
- [`/linear-team-build`](#linear-team-build) — Burn down a Linear "Todo" queue: one `/team-build` invocation per ticket, one PR per ticket.
- [`/github-team-build`](#github-team-build) — Burn down the **Todo** column of a GitHub Project (v2) kanban board: one `/team-build` invocation per issue, one PR per issue (auto-closes via `Closes #<n>`); auto-creates the project if missing.
- [`/planbooq-team-build`](#planbooq-team-build) — Burn down a Planbooq (homebrew Linear clone) "Planning" column via Planbooq's local REST API at `localhost:3636`: one `/team-build` invocation per ticket, one PR per ticket; status auto-flips to `Review` once the PR is up.
- [`/linear-design`](#linear-design) — File a Linear ticket for a design task, run `/team-design`, post each variant's screenshots back as comments on the ticket.
- [`/next-feature`](#next-feature) — Pick the single best next feature to ship (tournament-judged).
- [`/dda`](#dda--deep-dive-analysis) — Deep Dive Analysis: expert panel scores a plan 0–10, separate Master Brain subagent issues a verdict.
- [`/code-review`](#code-review) — Evidence-gated review across Simple / Performant / Clean / Secure / Testable.
- [`/shark-tank`](#shark-tank) — Evaluate the current project as a Shark Tank episode.
- [`/git-audit`](#git-audit) — 13-way repo health and team-dynamics audit.

### Startup playbooks (Paul Graham framework)

A sequenced, zero-to-one operating system:

1. [`/startup-pressure-test-idea`](#startup-pressure-test-idea)
2. [`/startup-validate-problem`](#startup-validate-problem)
3. [`/startup-map-competition`](#startup-map-competition)
4. [`/startup-build-mvp`](#startup-build-mvp)
5. [`/startup-find-customers`](#startup-find-customers)
6. [`/startup-growth-strategy`](#startup-growth-strategy)

### Marketing & growth

- [`/seo`](#seo) — Full SEO suite (audit, page, schema, GEO, plan).
- [`/market-research`](#market-research) — Keyword opportunities from real demand signals.
- [`/marketing-reddit`](#marketing-reddit) — Find Reddit posts, leave comments, create threads.

### Utilities

- [`/cmux-diff`](#cmux-diff) — Sidebar diff viewer for the current repo.
- [`/worktree-task`](#worktree-task) — Run a task in an isolated git worktree.
- [`/debug-trace`](#debug-trace) — Cursor-style AI debug mode: injects fire-and-forget HTTP probes into source, captures runtime values via a local daemon, removes every probe before exit.

---

## Skill Guides

### `/team-build`

**What it does.** Acts as a Team Lead orchestrating a build end-to-end: plans the work, dispatches 2–10 specialist subagents with explicit orders, runs a security audit and a QA + code-review gate, and loops until the work is bug-free. Runs in an isolated git worktree; optionally pushes to a target branch and opens a PR.

**When to use.** Multi-domain features that benefit from a panel of specialists (UI + backend + security) and where you want a hard QA gate before shipping. Not for trivial edits.

**How to invoke.** `/team-build <task>` or *"build this with a team"*, *"team-build"*, *"chief executive build"*. Optional `--branch <target>` to auto-push and open a PR against that branch. Optional `--working-branch <name>` to override the auto-generated `team-build/<slug>-<ts>` branch (used verbatim, no prefix added — useful for honoring upstream conventions like Linear's suggested `branchName`).

**What you get.** Worktree at `../<repo>.team-build-<slug>-<ts>` on branch `team-build/<slug>-<ts>` (or your `--working-branch` override). **Discovery batch** (one `AskUserQuestion` round covering scope, success criteria, data, integrations, non-functional requirements, delivery, constraints — skipped only when invoked by another skill that already supplies a full brief) → **fully thought-out plan** (goal, falsifiable success criteria, explicit out-of-scope, architecture sketch with new/modified files + data + surfaces + env, risks & mitigations, verification map criterion→proof, scoped agent orders, sequencing) → **per-worktree DB branch** (auto-detected from docker-compose: Postgres / MySQL / Mongo; creates an isolated logical DB so parallel worktrees don't trample each other's data; ORM-agnostic bootstrap tries package.json/Makefile/alembic/Django/Rails/Go conventions; auto-dropped on cleanup) → roster → parallel build round → integration check → security audit → **polish & gap pass** (edge cases, loading/empty/error states, a11y, responsive, observability, docs, "what would the user notice in 24h") → code-review + QA gate → **visual evidence pass** (Playwright screenshots for UI, terminal transcripts for CLI/backend, committed under `.team-build/evidence/` and rendered inline in the PR body) → APPROVED report (or up to 3 fix rounds). With `--branch`, a **merge-conflict preflight + post-rebase guard** (refuses to push if `merge-tree` reports conflicting paths against the target, the rebase leaves unmerged entries, or any `<<<<<<<`/`=======`/`>>>>>>>` markers survive), a typed-`yes` push gate, `gh pr create`, then **automatic cleanup** — the worktree and local branch are removed once the PR is open (the work lives on origin). ESCALATED/FAILED runs keep the worktree for manual debugging.

**How it works.** Hard rules: never write to the main working tree, never bypass hooks, never `--no-verify`, push only after typed-`yes`. The Lead never claims completion without the QA + code-review gate passing.

**Example.**

```
/team-build add OAuth login with Google and GitHub --branch main
```

*Spins up a worktree, fields a Team Lead with a backend, frontend, security, and code-review squad, builds across them in parallel, audits the diff, and opens a PR against `main` only after the QA gate passes.*

---

### `/team-design`

**What it does.** A world-class Design Lead generates **2–10 divergent design variants** of the same task in parallel — each on its own isolated git worktree and branch — so the human can preview and pick the direction. Variants are required to diverge on the axes that actually differentiate work (typography, motion, color, density, voice); cousin-variants are critiqued back. Each variant gets a per-thesis team (UI Designer, Frontend Developer, Accessibility Auditor, Whimsy Injector when warranted, etc.) dispatched in parallel, then the Lead reviews every variant against its own thesis and either passes, sends it back for one scoped redo, or kills it. Final lineup ships as `team-design/<slug>-<variant>` branches with screenshots committed inline.

**When to use.** Greenfield design work where the brief is open enough to support real divergence: landing pages, brand directions, dashboard skins, marketing-site rebuilds, onboarding flows, hero treatments. Not for tweaking an existing component to spec — that's a single-track `/team-build`.

**How to invoke.** `/team-design <task description> [flags]`. Flags: `--variants <N>` (2–10, default 4), `--target-branch <branch>` (PR base if you ship), `--branch-prefix <prefix>` (default `team-design`), `--reference <url|path>` (repeatable — Figma file, Dribbble link, competitor URL).

**What you get.** Lead's brief (named directions, not "variant 1/2/3") → N parallel worktrees at `../<repo>.team-design-<slug>-<variant>-<ts>` on branches `team-design/<slug>-<variant>` → per-variant team dispatched in parallel → Playwright screenshots (desktop + mobile + interactive state) committed to each variant's branch → Lead's critique scoring each variant on thesis fidelity / craft / differentiation / verdict (PASS/REDO/KILL) → **visual gallery auto-opened in the browser** (static HTML at `.team-design/gallery-<slug>-<ts>/`, all variants side-by-side with click-to-zoom screenshots, scores, and Pick/Redo/Kill buttons that round-trip to a tiny localhost server) → terminal picker fallback with `(g)allery`, `(p)review`, `(d)iff`, `(o)pen`, `(s)hip`, `(k)ill`, `(c)ompare`, `(a)dopt`, `(q)uit` actions. With `--target-branch`, `s all` ships every PASS variant as a separate PR.

**How it works.** The Lead is opinionated on purpose — Awwwards/FWA-tier bar, weekly trend literacy, refuses to flatter the team. Loop cap: 2 redos per variant before auto-KILL. Hard rules: variants must diverge (cousin-variants are a Lead failure, not a feature); one worktree per variant with no cross-variant writes; PASS verdict requires committed screenshots — words don't ship design; never auto-replace a KILLED variant mid-flight (kills are kept visible to the user); never `--no-verify`, never bypass push gates. Inherits `/team-build`'s §1.5 per-worktree DB branching when a docker-compose DB service is detected, so seeded variants don't trample each other.

**Example.**

```
/team-design redesign the landing page for a B2B AI infra startup --variants 5 --reference https://linear.app
```

*Lead announces 5 named directions (e.g. `editorial-serif`, `swiss-grid`, `kinetic-mono`, `terminal-utility`, `glass-prismatic`), spins up 5 worktrees + branches, dispatches a tailored 3-agent team per variant in parallel, each variant captures desktop + mobile + interactive shots, Lead critiques and ships the picker — typically 3–4 PASS, 1–2 REDO/KILL.*

---

### `/linear-team-build`

**What it does.** Pulls every Linear ticket in **Todo** status and runs `/team-build` on each one independently — **one isolated worktree, one branch, one PR per ticket**. Never bundles tickets.

**When to use.** Burning down a triaged Linear backlog autonomously, where each ticket is sized for a single PR and you want the orchestrator to handle Linear state transitions and PR creation.

**How to invoke.** `/linear-team-build [task description] [flags]`. If you pass a free-form task description as the positional arg, the skill **creates a new Linear ticket in Todo first** (on `--team`, optionally assigned to `--assignee`), then includes it in this run's queue — so a single command both files the work and burns it down. Flags: `--team <key>`, `--assignee <me|email|userId>`, `--limit <n>` (default 10), `--target <branch>` (default `main`), `--parallel <n>` (default: 1 / sequential; pass a number to parallelize; warns above 5 but does not cap), `--dry-run`. Requires the [`@schpet/linear-cli`](https://github.com/schpet/linear-cli) (`linear auth login` once) and authed `gh`.

**What you get.** Numbered ticket queue → per-ticket loop (resolve target branch → move to "In Progress" → **post a "build started" status comment** with working branch / target / mode → invoke `/team-build` → verify exactly one new PR appeared → for UX/design tickets, capture desktop+mobile+state screenshots via Playwright and upload to Linear → comment PR URL (with embedded shots when applicable) → move to "Reviewing") → final summary table. Stakeholders following the ticket in Linear see status comments at start and finish without watching the terminal.

**How it works.** All Linear reads/writes go through the `linear` CLI — `linear issue query --json` to fetch the queue, `linear issue view --json` to pull `branchName`, `linear issue update --state` for transitions, `linear issue comment add --body-file` for comments. No raw GraphQL `curl`. **Working branch defaults to Linear's suggested `branchName`** (e.g. `jaequery/pin-56-...`) and is passed to `/team-build` via `--working-branch`; only falls back to `team-build/<slug>-<ts>` when Linear has none. Per-ticket *target* branch (PR base) resolution: description directive (`Target: <branch>`) → label (`target:<branch>`) → Linear linked branch attachment → `--target` default. Snapshots `gh pr list` before/after each invocation; STOPs the loop if zero or more than one new PR appears. Failed tickets move back to Todo with a comment. Embeds a clean-code bar (reuse existing patterns, minimal diff, no dead code, validate at boundaries) into every per-ticket prompt for the Team Lead's code-review gate to enforce. **Push is not gated** — `/team-build`'s typed-`yes` push confirmation is explicitly skipped so backlog burndown stays autonomous; the PR itself is the review surface.

**Example.**

```
/linear-team-build --team ENG --limit 5
```

*Pulls the top 5 ENG-team Todo tickets, processes each one sequentially: own worktree, own branch (`team-build/eng-123-…`), own PR. Linear state moves Todo → In Progress → Reviewing per ticket; final table shows verdicts and PR URLs.*

---

### `/github-team-build`

**What it does.** Pulls every issue in the **Todo** column of a GitHub Project (v2) kanban board and runs `/team-build` on each one independently — **one isolated worktree, one branch, one PR per issue**. Each PR body includes `Closes #<n>` so merging auto-closes the issue. Never bundles issues. Auto-creates the project (with a **board/kanban view grouped by Status as the default**) + extends its Status field with the full lifecycle options (`Backlog`, `Planning`, `Todo`, `In Progress`, `Reviewing`, `QA`, `Completed`) if missing.

**When to use.** Burning down a triaged GitHub Project board autonomously, where each issue is sized for a single PR and you want the orchestrator to handle Status transitions, comments, and PR creation through the project's native kanban.

**How to invoke.** `/github-team-build [task description] [flags]`. If you pass a free-form task description as the positional arg, the skill **creates a new GitHub issue, adds it to the project, and sets its Status to Todo first**, then includes it in this run's queue — so a single command both files the work and burns it down. Flags: `--repo <owner/name>` (default: current repo), `--project <number|title>` (default: first project linked to the repo, or auto-create one titled `<repo-name>`), `--owner <login>` (default: owner of `--repo`), `--assignee <@me|login>`, `--limit <n>` (default 10), `--target <branch>` (default: repo default branch), `--parallel <n>` (default: 1 / sequential; warns above 5 but does not cap), `--dry-run`. Requires authed `gh` with `project` scope (`gh auth refresh -s project` if missing).

**What you get.** Numbered issue queue → per-issue loop (resolve target branch → flip project Status to `In Progress` → **post a "build started" status comment** with working branch / target / mode → invoke `/team-build` with `--working-branch <number>-<kebab-title>` → verify exactly one new PR appeared and contains `Closes #<n>` → for UX/design issues, capture desktop+mobile+state screenshots via Playwright, commit them to the PR branch, embed via `raw.githubusercontent.com` URLs → comment PR URL → flip Status to `Reviewing`) → final summary table. Issue auto-closes on PR merge; downstream automation/humans drive `QA` and `Completed`.

**How it works.** All GitHub reads/writes go through `gh` — `gh project list/create/link`, `gh project field-list/field-edit` (resolve & extend the Status field), `gh project item-list --format json` (filter to `status == "Todo"`), `gh project item-edit` (set Status), `gh issue view/comment`, `gh pr list/edit`. No raw `curl`. The full kanban lifecycle is `Backlog → Planning → Todo → In Progress → Reviewing → QA → Completed`; the skill only writes the middle three (`Todo` ↔ `In Progress` ↔ `Reviewing`), humans/downstream drive the rest. **Working branch defaults to GitHub's "Create branch" convention** (`<number>-<kebab-title>`, truncated to 60 chars) and is passed to `/team-build` via `--working-branch`; an explicit `Branch: <name>` line in the issue body overrides it. Per-issue *target* branch resolution: body directive (`Target: <branch>`) → label (`target:<branch>`) → `--target` default. Snapshots `gh pr list` before/after each invocation; STOPs the loop if zero or more than one new PR appears. Failed issues are flipped back to `Todo` with a comment. Embeds the same clean-code bar as `/linear-team-build` into every per-issue prompt. **Push is not gated** — the PR itself is the review surface.

**Example.**

```
/github-team-build --repo myorg/myapp --limit 5
```

*Resolves (or creates) the project linked to `myorg/myapp`, ensures its Status field has the seven kanban options, pulls the top 5 issues currently in Todo, processes each one sequentially: own worktree, own branch (`123-add-oauth-login`), own PR with `Closes #123` in the body. Project Status moves Todo → In Progress → Reviewing per issue; final table shows verdicts and PR URLs.*

---

### `/planbooq-team-build`

**What it does.** Pulls every ticket in the **Planning** kanban column of a Planbooq workspace (Planbooq is our homebrew Linear clone) and runs `/team-build` on each one independently — **one isolated worktree, one branch, one PR per ticket**. Each PR body includes a `Closes Planbooq ticket: <id> (<url>)` backlink. Never bundles tickets.

**When to use.** Burning down a triaged Planbooq board autonomously — `Backlog` is raw / untriaged (humans only), `Planning` is the input queue this skill consumes. Each ticket should be sized for a single PR and the orchestrator handles status transitions, comments, and PR creation through Planbooq's REST API.

**How to invoke.** `/planbooq-team-build [task description] [flags]`. Positional arg creates the ticket on the fly (in `Planning`) before the queue runs. Flags: `--workspace <id|slug>` (default: the only workspace visible to the token), `--project <id|slug>` (auto-created from the current GitHub repo name if it doesn't exist yet), `--assignee <me|email|userId>`, `--limit <n>` (default 10), `--target <branch>` (default `main`), `--parallel <n>` (default 1; warns above 5 but does not cap), `--dry-run`. Requires `PLANBOOQ_API_KEY` (`pbq_live_…` from Settings → API Keys) — if it's missing, the skill **prompts once** and persists it to `~/.claude.json`'s `env` block so future sessions never re-prompt. The base URL is hard-coded to `http://localhost:3636/api/v1` (Planbooq is run locally per developer; there is no remote deployment).

**What you get.** Numbered ticket queue → per-ticket loop (resolve target branch → `POST /tickets/{id}/move` to `Building` → post a "build started" comment → invoke `/team-build` with `--working-branch <pbq-id>-<kebab-title>` → verify exactly one new PR appeared and contains the Planbooq backlink → for UX/design tickets, capture desktop+mobile+state screenshots via Playwright and embed via `raw.githubusercontent.com` URLs → comment PR URL → move ticket to `Review`) → final summary table. Status transition is keyed off **whether a PR was opened** (any verdict), not the local QA gate — the PR is the review surface.

**How it works.** All Planbooq reads/writes go through the REST API at `http://localhost:3636/api/v1` (hard-coded — local-only product) with `Authorization: Bearer $PLANBOOQ_API_KEY` and the `{ ok, data | error }` response envelope. No MCP, no SDK, no scraping. Endpoints used: `GET /workspaces`, `GET /workspaces/{id}/{members,statuses,projects}`, `GET /tickets?…&statusId=…`, `GET /tickets/{id}`, `POST /tickets`, `PATCH /tickets/{id}`, `POST /tickets/{id}/move` (`{ toStatusId }`), `POST /tickets/{id}/comments` (`{ body }`). PRs are still opened via `gh` against GitHub. Planbooq's default board is `Backlog → Planning → Building → Review → Shipping`; this skill only writes the middle three (`Planning → Building → Review`), humans drive `Backlog` triage and `Review → Shipping` promotion. **`Review` is mandatory** — preflight aborts if the workspace's status list lacks it. Honours Planbooq's payload constraints (title ≤200, description ≤5000, comment ≤10000, `priority ∈ NO_PRIORITY|URGENT|HIGH|MEDIUM|LOW`, `color = #rrggbb`). Snapshots `gh pr list` before/after each invocation; STOPs the loop if zero or more than one new PR appears. Embeds the same clean-code bar as `/linear-team-build` and `/github-team-build` into every per-ticket prompt. **Push is not gated** — the PR itself is the review surface, even on ESCALATED/FAILED verdicts.

**Example.**

```
/planbooq-team-build --workspace personal --project tierbuddy --limit 5
```

*Resolves the `personal` workspace and `tierbuddy` project, validates the board has `Planning` / `Building` / `Review` columns, pulls the top 5 tickets currently in Planning, processes each sequentially: own worktree, own branch (`pbq-123-add-oauth-login`), own PR with the Planbooq backlink. Status moves Planning → Building → Review per ticket; final table shows verdicts and PR URLs.*

---

### `/linear-design`

**What it does.** Files a Linear ticket for a design task, runs `/team-design` to produce divergent variants in parallel, then posts each variant's screenshots back to the ticket as a comment so stakeholders who don't live in the terminal can review and pick from Linear.

**When to use.** Design exploration where the picker audience (PM, design lead, founder) reviews in Linear, not in the terminal. Skip if you're solo and a local picker is enough — use `/team-design` directly.

**How to invoke.** `/linear-design <task description> [flags]`. Linear flags: `--team <key>` (required unless single-team workspace), `--priority <0-4>`, `--label <name>` (repeatable), `--assignee <me|email|userId>`, `--project <name|id>`, `--existing <IDENT>` (attach to an existing ticket instead of creating). Passthrough to `/team-design`: `--variants <N>`, `--target-branch`, `--branch-prefix`, `--reference` (repeatable). Requires the [`@schpet/linear-cli`](https://github.com/schpet/linear-cli) (`linear auth login` once) and `jq` + `curl`.

**What you get.** New Linear ticket with the brief in the description → `/team-design` runs end-to-end → one comment per variant on the ticket with desktop / mobile / interactive screenshots embedded as Linear-hosted assets (uploaded via the `fileUpload` mutation), thesis, branch name, Lead's scores, and critique → final summary comment with the picker table. Local `/team-design` picker prints to the terminal as usual; shipping is a separate local action.

**How it works.** All Linear reads/writes go through the `linear` CLI. `linear api` is used only as the escape hatch for `fileUpload` (signed URL → PUT bytes → embed `assetUrl` in markdown) and `issueCreate` fields not exposed by structured subcommands — never raw `curl` to the GraphQL endpoint. Hard rules: one ticket per run, one comment per variant (never batched), every PASS/REDO comment includes uploaded screenshots (or an explicit "shots not captured" note), never auto-transitions the ticket's workflow state, never auto-ships from Linear comments.

**Example.**

```
/linear-design redesign the pricing page with 3 directions --team DSGN --variants 3 --priority 2
```

*Creates `DSGN-87` with the brief, runs `/team-design` for 3 variants in parallel, uploads each variant's screenshots to Linear and posts them as comments inline, ends with a picker summary comment — reviewers see and discuss directly on the ticket while the operator runs the local picker to ship.*

---

### `/next-feature`

**What it does.** Plans the single most useful next feature for the current project by running a tournament of rival feature proposals.

**When to use.** When you want a grounded, judged decision on *what to ship next* — not a brainstorm list or a feature parade.

**How to invoke.** `/next-feature` from inside the project, or *"what should I build next"*, *"pick my next feature"*, *"plan the next feature"*. One clarifying question max about goal/audience.

**What you get.** Tournament bracket → each team's feature submission → weighted scoring table → one winner with a 9-point plan (name, description, strategic case, user story, scope, effort, risks, success metric, implementation sketch) → runner-up salvage → next actions.

**How it works.** Auto-scans `README`, `CLAUDE.md`, manifest, `git log`, `git shortlog`, and roadmap files. Fields 2–4 strategy-lensed teams (e.g. "User Value", "Growth", "Foundation", "Quick Win"). Runs the full tournament playbook with an independent eval gate — and refuses to ship a weak winner (reruns once or escalates).

**Example.**

```
/next-feature
```

*Run inside a year-old side project — the tournament fields "Retention", "Growth", and "Foundation" teams, then ships a single 9-point plan for the winner: "Weekly progress email with one-click streak recovery."*

---

### `/dda` — Deep Dive Analysis

**What it does.** Auto-assembles a 3–6 agent expert panel from the roster, scores your plan on a 0–10 anchored rubric across six metrics, then a **separate Master Brain subagent** (dispatched fresh, sees only the panel output) issues a GREEN / YELLOW / RED verdict with kill criteria.

**When to use.** You have a plan, spec, strategy, or pitch and want advisory-board-quality review in one command.

**How to invoke.** `/dda <plan>`, or paste a plan / pass a file path / point at prior discussion, then trigger with *"deep dive analysis"*, *"deep dive this plan"*, *"multi-agent expert review"*. One clarifying question allowed if ambiguous.

**What you get.** Panel roster (with rejected candidates and coverage gaps) → score matrix (6 metrics × agents, with means and spreads) → consensus strengths, risks, surfaced disagreements, open questions, must/should/nice edits → optional rebuttal round when panelists materially disagree → **Master Brain Verdict** (GREEN / YELLOW / RED) → **Top Risk-Flips** (HIGH→MED with effort + proof). Each run appends to `~/.claude/dda-calls.jsonl` for future calibration.

**How it works.** Orchestrator picks domain-fit subagents and *always* includes an adversarial voice (Reality Checker, Code Reviewer, Compliance Auditor, etc.) to prevent groupthink. Panel dispatches in parallel with a strict structured output contract that's schema-validated before aggregation (malformed panelists are re-dispatched once, missing cells marked `N/A` not zero). The Master Brain runs as its own subagent dispatch and never sees the Orchestrator's distillation or selection rationale — separating jury from judge.

**Example.**

```
/dda review this Q2 GTM plan: <paste plan>
```

*Panel assembles a GTM strategist, a CFO-style skeptic, a sales engineer, and Reality Checker. Master Brain returns a **YELLOW** verdict with three kill criteria and a Path-to-10 upgrade ladder.*

---

### `/code-review`

**What it does.** Surgical, evidence-gated code review across five dimensions — **Simple, Performant, Clean, Secure, Testable** — with a hard evidence gate that auto-downgrades speculation to `[needs-verification]`.

**When to use.** You want a rigorous, grounded review of a diff, PR, file, branch, or pasted snippet — one that distinguishes real findings from hand-waving.

**How to invoke.** `/code-review [target]`, or *"review this code"*, *"review my PR"*, *"audit these changes"*, *"security review"*, *"performance review"*, or simply paste a diff. Target auto-resolves via `gh pr`, staged diff, branch-vs-main, `git status`, or `HEAD`.

**What you get.** Quick Summary + verdict (APPROVE / APPROVE-WITH-NITS / REQUEST-CHANGES / BLOCK) → Dimension Coverage table → Findings with `path:line` evidence and severity → Expert-Review-Recommended table → Not-Reviewed list → cost footer.

**How it works.** Runs 77 grep-level checks, executes the project's own test / lint / typecheck commands (classifying infra-SKIP vs genuine-FAIL), caps nits at 10, and refuses to cite a finding without `path:line` evidence.

**Example.**

```
/code-review 247
```

*Resolves PR #247 via `gh pr`, runs the repo's own test + lint + typecheck, and returns a **REQUEST-CHANGES** verdict citing a SQL injection at `api/search.ts:84` and a missing index flagged as `[needs-verification]`.*

---

### `/shark-tank`

**What it does.** Evaluates the current project as a dramatic Shark Tank episode — pitch, Shark reactions, scorecard, verdict.

**When to use.** You want an entertaining-but-honest investor-framed evaluation of your project across problem, product, tech, traction, business model, moat, and team signal. No curve grading.

**How to invoke.** `/shark-tank`, or *"rate this project"*, *"would you invest"*, *"shark tank"*.

**What you get.** A full scripted episode — narrator intro → in-character founder pitch → Shark dialogue → scorecard (7 categories × /10, total /70) → The Good / Concerns / Hard Questions → per-Shark IN/OUT verdicts and The Deal.

**How it works.** Auto-scans `README`, manifest files, `git log -20`, `git shortlog`, top-level dirs, and the landing page/entry point. Plays all roles (narrator + founder + three distinct Shark personas). All claims must be grounded in observed code / docs / git history.

**Example.**

```
/shark-tank
```

*Scans the repo, pitches a side-project-to-SaaS story, Mr. Wonderful tears into the missing revenue model, Cuban sees scale potential, Greiner offers $50K for 20% — ends with The Deal and a 38/70 scorecard.*

---

### `/git-audit`

**What it does.** Dashboard-style health and team-dynamics audit of a git repository — the things `git log` won't tell you at a glance.

**When to use.** You want a high-level signal read on repo risk, ownership, bug clusters, velocity, and test discipline.

**How to invoke.** `/git-audit [path]`, or *"audit this repo"*, *"repo health"*, *"codebase audit"*, *"git analysis"*. Defaults to cwd.

**What you get.** Sectioned report covering churn hotspots, bus factor, bug clusters, velocity, stale files, and more → summary dashboard table (OK / WARN / CONCERN) → 3–5 prioritized recommendations.

**How it works.** Runs 13 specific `git log` / `shortlog` / `for-each-ref` analyses in parallel and applies fixed thresholds (e.g. bus factor CONCERN if top contributor >60%, test ratio CONCERN if <10%).

**Example.**

```
/git-audit
```

*Surfaces that one dev owns 72% of `src/billing/*` (CONCERN), test ratio dropped to 6% last quarter (CONCERN), three files haven't been touched in 14 months, and Friday-night deploys correlate with bug fix commits.*

---

### `/startup-pressure-test-idea`

**What it does.** YC-application-style brutal evaluation of a startup idea — finds every fatal flaw before you waste a week building.

**When to use.** Very early stage — you have an idea and want honest red-team analysis before investing time.

**How to invoke.** `/startup-pressure-test-idea`, or *"pressure test my idea"*, *"evaluate my startup idea"*, *"is this a good startup idea"*. Asks for the idea (what / who / how it makes money) if not supplied.

**What you get.** Core Assumption (falsifiable) + a $0, <1-week validation step → three mechanism-specific Fatal Flaws ranked by severity → Problem Validation (Painkiller / Vitamin / Placebo + current workaround + willingness to pay) → Founder-Market Fit read → **Brutal Verdict** (STRONG / WEAK / PIVOT REQUIRED) + "if I had to bet" one-liner.

**How it works.** PG YC-review framing. Refuses generic advice — every flaw must be specific to *this* idea. Verdict is direct: never "it has potential but."

**Example.**

```
/startup-pressure-test-idea an AI SOAP-note generator for solo therapists — $79/mo subscription
```

*Returns three fatal flaws specific to this idea (HIPAA BAA costs, insurance-coded note formats, therapist trust in AI for mental health) and a **WEAK** verdict with a $0 validation step.*

---

### `/startup-validate-problem`

**What it does.** Validates whether the problem is real and paid-for using Paul Graham's "talk to users" framework.

**When to use.** After the idea exists, before building — you need a customer-discovery plan and a verdict on problem realness.

**How to invoke.** `/startup-validate-problem`, or *"validate my problem"*, *"is this a real problem"*, *"customer discovery"*. Asks for idea + target customer if missing.

**What you get.** Specific Pain (trigger moment, frequency, cost, "in their words") → Early Adopter Profile (a specific person, where to find 10 this week, what they've tried) → 5 Mom-Test discovery questions + what each reveals + banned questions → Validation Criteria (green lights, red flags, minimum bar) → **Verdict**: Painkiller / Vitamin / Placebo + current-workaround test.

**How it works.** Applies *The Mom Test* — no pitching, no hypotheticals, no leading questions. Enforces daily/weekly problems only, early adopter must be a specific person (not a segment), and the user's words must sound like a human, not a pitch deck.

**Example.**

```
/startup-validate-problem idea: AI SOAP notes; customer: solo therapists in private practice
```

*Outputs 5 Mom-Test discovery questions, where to find 10 therapists this week, and a **Painkiller** verdict because every therapist currently burns 30 min after each session writing by hand.*

---

### `/startup-map-competition`

**What it does.** Maps every real competitor — including the invisible ones most founders miss, especially current behavior / inertia.

**When to use.** You need a comprehensive competitive picture, especially to surface the status-quo behavior that is the real competitor.

**How to invoke.** `/startup-map-competition`, or *"map my competition"*, *"competitive analysis"*, *"who are my competitors"*. Asks for idea + target customer if missing.

**What you get.** Current Behavior breakdown (competitor #1) → Direct Competitors table (strength / weakness / awareness / switching cost) → Indirect Competitors table → The Real Enemy (the specific habit / inertia to defeat) → Genuine Differentiation reality-check → competitive verdict (Empty / Emerging / Crowded / Graveyard) + opening.

**How it works.** PG "what are people doing now" framing. Enforces: *"we have no competition"* = always wrong; *"we have AI"* = not differentiation in 2026. Rates each competitor on awareness + switching cost + satisfaction.

**Example.**

```
/startup-map-competition idea: AI SOAP notes; customer: solo therapists
```

*Surfaces Upheal and Mentalyc as direct competitors, SimplePractice's built-in notes as indirect, and "therapists writing by hand during sessions" as The Real Enemy — verdict: **Emerging, narrow opening around insurance-coded formats.***

---

### `/startup-build-mvp`

**What it does.** Designs the smallest MVP that tests one falsifiable core assumption in two weeks.

**When to use.** You have an idea and need a ruthless cut-down MVP scoped to testing a single assumption with real users.

**How to invoke.** `/startup-build-mvp`, or *"design my mvp"*, *"what should I build first"*, *"minimum viable product"*. Asks for idea + core assumption if either is missing.

**What you get.** Core Assumption (falsifiable) → Minimum Feature Set table (3–5 features max) → What Gets Cut table → behavioral Test Criteria (validated / invalidated thresholds + non-valid signals + sample size) → Week 1 Build / Week 2 Launch day-by-day plan → post-test branching (validated / invalidated / ambiguous).

**How it works.** PG "build something people want" framing. Enforces: MVP tests *one* assumption — never two; every non-test feature gets cut; test criteria must be behavioral, not opinion; launch week must end with real users generating signal.

**Example.**

```
/startup-build-mvp idea: AI SOAP notes; assumption: therapists will paste a session transcript and trust the output enough to ship it to their EHR
```

*Cuts scope to 3 features (transcript upload, SOAP generator, copy-to-clipboard), sets "70% of users ship without edits" as the validated threshold, and plans a day-by-day 2-week launch.*

---

### `/startup-find-customers`

**What it does.** Builds a manual plan to acquire the first 10 real customers using "do things that don't scale."

**When to use.** You need a non-automated, channel-specific plan to locate, message, and convert your first 10 users.

**How to invoke.** `/startup-find-customers`, or *"find my first customers"*, *"first 10 users"*, *"early traction plan"*. Asks for idea + target customer if missing.

**What you get.** Table of exact channels / locations with estimates → per-channel manual outreach approach → actual first-message templates (<100 words) → Devastation Test success criteria + politeness-signal red flags → 4-week milestone plan (Research → First Conversations → First Users → PMF Signal).

**How it works.** Rules enforce specificity ("Reddit" isn't; "r/SaaS" is), manual-only (no ads, no automation), and asking for a conversation — never a sale. Templates come with `[bracket]` personalization points.

**Example.**

```
/startup-find-customers idea: AI SOAP notes; customer: solo therapists in private practice
```

*Channel table points to r/therapists, Psychology Today directory scraping, and ADAA conferences. Hands back a 72-word first-message template and a 4-week milestone plan: Research → First Conversations → First Users → PMF Signal.*

---

### `/startup-growth-strategy`

**What it does.** Designs a compounding growth engine rooted in product-driven word of mouth.

**When to use.** You have users and need a 90-day plan to reach 1,000 with a natural growth loop and disciplined channel selection.

**How to invoke.** `/startup-growth-strategy`, or *"growth plan"*, *"how do I grow"*, *"acquisition strategy"*. Asks for idea + current user count + target customer if missing.

**What you get.** Natural Growth Loop (type, speed, strength %) → Top 3 Acquisition Channels (with CAC, time-to-results, 1-week test) → Referral Mechanism (built-in, not bolted on) → 90-day week-by-week plan (Foundation / Amplify / Compound) → The Single Metric (leading, not lagging) + "if you stopped marketing today" test.

**How it works.** PG "make something people want and tell their friends" framing. Enforces: retention <40% weekly → fix retention first; content marketing / SEO aren't strategies; a referral program is a bribe, not a referral.

**Example.**

```
/startup-growth-strategy idea: AI SOAP notes; users: 47; target: solo therapists
```

*Identifies a "your therapist colleague asks what tool you use" word-of-mouth loop, picks r/therapists + Psychology Today + conference sponsorships as the top 3 channels, and lays out a 90-day week-by-week plan to 1,000 users.*

---

### `/seo`

**What it does.** Universal SEO analysis — audits, page/tech/content/schema/images/sitemap reviews, Generative Engine Optimization for AI Overviews / ChatGPT / Perplexity, and strategic planning.

**When to use.** Any SEO work on a URL or site: full audit, page-level review, schema generation, AI-search readiness, or strategic planning by industry.

**How to invoke.** Subcommand + URL or business type:

- `/seo audit <url>` — full site audit
- `/seo page <url>` — single-page deep dive
- `/seo schema <url>` — detect / validate / generate structured data
- `/seo geo <url>` — AI Overviews / ChatGPT / Perplexity readiness
- `/seo plan <business-type>` — strategic SEO roadmap

Also fires on *"SEO"*, *"Core Web Vitals"*, *"E-E-A-T"*, *"AI Overviews"*, *"technical SEO"*, *"structured data"*.

**What you get.** Unified report with SEO Health Score (0–100, weighted across 7 categories) → industry detection → prioritized action plan (Critical → Low) → subcommand-specific deliverables (sitemap, schema markup, competitor pages, hreflang tags).

**How it works.** Orchestrates 12 sub-skills + 6 subagents (`seo-technical`, `seo-content`, `seo-schema`, `seo-sitemap`, `seo-performance`, `seo-visual`) in parallel. Enforces quality gates (hard stop at 50+ location pages, ban on HowTo schema post-deprecation, use INP not FID). Reference files load on-demand.

**Example.**

```
/seo audit https://acme.com
```

*Full audit returns a **62/100** SEO Health Score, industry detected as SaaS, three Critical issues (missing hreflang, INP > 500ms on pricing, duplicate H1s), plus a prioritized 14-item action plan.*

---

### `/market-research`

**What it does.** Scrapes free demand signals across multiple sources and ranks keyword opportunities for content and SEO.

**When to use.** You want keyword opportunities, article ideas, or demand signal around a topic for US / T1 audiences — grounded in real search data, not guesses.

**How to invoke.** *"market research"*, *"keyword research"*, *"find keywords"*, *"article ideas"*. Pass seeds via `--only "topic1, topic2"` — your phrases are used verbatim with no suffixes. Defaults to built-in seeds if none given.

**What you get.** Raw + scored JSON files dated in the skill directory → top-50 console dump → a final markdown report with Top 10 opportunities table, per-keyword content strategy, quick wins, cluster strategy, seasonality notes, and priority ranking.

**How it works.** Runs `node keyword-research.js` which scrapes Google Autocomplete (with a–z expansion), YouTube Autocomplete, Google Related Searches HTML, Reddit post titles, and Google Trends. Cross-source count is the core demand signal.

**Example.**

```
market research --only "home espresso machine, pour over coffee setup"
```

*Scrapes all five sources and returns a Top 10 opportunities table — "jura espresso machine settings" scores **9.2** (high demand + low competition) with a recommended article cluster and seasonality note.*

---

### `/marketing-reddit`

**What it does.** Finds relevant Reddit posts, comments on them, or creates new threads — human-sounding and channel-tailored.

**When to use.** You want to search Reddit authentically, leave tailored comments on matched or URL-given posts, or create a new thread in a specific subreddit. Built for real engagement, not spam.

**How to invoke.** Natural language — *"find reddit posts about X"*, *"comment on this reddit URL"*, *"post to r/SaaS with title ..."*. Triggers include *"reddit find/search/reply/comment"*, *"post on reddit"*, *"create reddit post"*, *"submit to reddit"*, or a Reddit URL with a comment request.

**What you get.** Ranked posts list (score, comments, date, author, permalink) → posted-comments summary table with URLs → created-thread summary table with the new post URL.

**How it works.** Uses `curl` / `urllib` against Reddit's public JSON search API (last-3-days filter) for search, then **Playwright MCP** (`browser_run_code` with stable locators on the Lexical composer) for comments and threads. Enforces strict human style: no em dashes, no sycophancy, no all-lowercase-AI voice.

**Example.**

```
find reddit posts about notion alternatives in the last 3 days and draft comments
```

*Returns 12 ranked posts across r/Notion, r/productivity, and r/selfhosted, then drafts a human-voice 2-sentence comment for each — no dashes, no "great question," no AI tells.*

---

### `/cmux-diff`

**What it does.** Launches a VSCode-style sidebar changes/diff viewer for the current working directory.

**When to use.** You want a browser-based sidebar UI to scan changed files and diffs instead of reading `git diff` in the terminal.

**How to invoke.** `/cmux-diff`, or *"show changes"*, *"changes panel"*, *"diff viewer"*. Operates on `$PWD`.

**What you get.** A background-running local web server (port auto-detected) opened in the cmux browser. Log at `$XDG_STATE_HOME/cmux-diff/`.

**How it works.** Bash-only skill. Ensures `~/Scripts/cmux-diff` has `bun` deps installed, spawns `bun run src/cli.ts --dry-run` in the background, scrapes the port from the log, and calls `cmux browser open`.

**Example.**

```
/cmux-diff
```

*Spawns the local server, scrapes port 48291 from the log, and opens the sidebar changes panel in the cmux browser — ready to click through files without leaving the terminal.*

---

### `/worktree-task`

**What it does.** Runs a task in an isolated git worktree so it doesn't conflict with in-flight changes in your main checkout.

**When to use.** Single-session tasks that need filesystem / branch isolation from the main working tree. **Not** for multi-session parallel work or security sandboxing — worktrees don't isolate env vars, network, credentials, or spawned processes.

**How to invoke.** `/worktree-task <task>`, or *"do X in a worktree"*, *"run this in an isolated branch"*, *"work on Y without conflicting with my current changes"*, *"spin up a worktree for Z"*.

**What you get.** A new worktree + branch (`wt/<slug>-<ts>`) at a sibling path, the task executed there, then a 5-option cleanup menu: (a) keep, (b) merge, (c) rebase + push + PR, (d) discard, (e) stash and keep, (f) adopt branch into main tree.

**How it works.** Thin auditable wrapper around `git worktree add`. Uses `cd "$WT_PATH" && …` per call since cwd doesn't persist. Enforces typed-`yes` gates on destructive ops, `--force-with-lease` on push, and merge-base safety checks before `-d` / `-D`. Preflight aborts on submodule / detached-HEAD / path-collision without explicit user direction.

**Example.**

```
/worktree-task refactor the auth middleware to use jose instead of jsonwebtoken
```

*Creates `../repo-wt/refactor-auth-20260416/` on branch `wt/refactor-auth-20260416`, runs the refactor inside it without touching your in-flight changes in the main checkout, then offers the 5-option cleanup menu — pick (c) to push and open a PR.*

---

### `/debug-trace`

**What it does.** Cursor-style runtime instrumentation debugger. Spins up a tiny localhost daemon, injects fire-and-forget HTTP probes into the user's source at suspect sites, captures runtime values as the program runs, reads them back through the daemon, iterates toward a fix, and **removes every probe before exiting**. Print-debugging on autopilot, with cleanup as a hard invariant.

**When to use.** A bug whose cause is opaque from reading the code — you need to see actual runtime values at specific points without manually scattering and cleaning up `console.log`s.

**How to invoke.** `/debug-trace <bug description>`, or *"instrument and run"*, *"trace these values"*, *"cursor-style debug"*, *"inject debug logs"*, *"find this bug by tracing values"*.

**What you get.** Pre-flight orphan-marker scan → daemon started on a free loopback port (zero-deps Node) → a one-sentence hypothesis → suspect sites instrumented with marker-wrapped probes (UUID per probe, language-appropriate idiom) → user runs the failing scenario → AI reads the JSONL dump, compares actual vs expected, narrows or fixes → mandatory cleanup pass (`git grep '@debug-trace:'` must be empty), daemon shutdown, `.debug-trace/` deleted → final report.

**How it works.** Two pieces: `scripts/daemon.js` (zero-deps, loopback-only, `/log` `/dump` `/clear` `/health` `/shutdown`, body cap 1MB, 10k-line ring rotation) and a SKILL.md that codifies the injection contract — every probe wrapped in `@debug-trace:<uuid>` open/close marker comments using the file's native syntax, every HTTP call fire-and-forget so daemon-down never alters program flow, idiom table covering JS/TS, Python, Go, Ruby, Java/Kotlin, Shell, Rust, C/C++. Cleanup is non-negotiable: never end a turn with markers in the working tree; first action on next invocation is to scan for and remove orphans.

**Example.**

```
/debug-trace orderTotal is wrong on the checkout page when a discount applies
```

*Daemon starts on `127.0.0.1:64157`, AI hypothesizes "discount is double-applied", drops 4 marker-wrapped `fetch()` probes around the discount pipeline in `src/checkout/total.ts`, asks the user to reproduce, reads the dump, sees `subtotal=42 discount=4 total=34` (off by `discount` applied twice), proposes the one-line fix, removes all four probe blocks, shuts down the daemon — `git grep '@debug-trace:'` is empty.*

---

## Subagent roster (140+)

The `agents/` tree is a curated library of specialist subagents Claude can delegate to via the Agent tool. They're organized by function:

| Category | What's inside | Highlights |
|---|---|---|
| **engineering/** | 23 agents | Backend Architect, Security Engineer, SRE, Senior Developer, Code Reviewer, AI Engineer, Database Optimizer, Solidity Engineer, Threat Detection Engineer |
| **testing/** | 8 agents | Reality Checker, Evidence Collector, Accessibility Auditor, Performance Benchmarker, API Tester — the "prove it works" squad |
| **design/** | 8 agents | UX Architect, UI Designer, Brand Guardian, Whimsy Injector, Visual Storyteller, UX Researcher |
| **product/** | 4 agents | Sprint Prioritizer, Trend Researcher, Feedback Synthesizer, Behavioral Nudge Engine |
| **project-management/** | 6 agents | Studio Producer, Project Shepherd, Jira Workflow Steward, Senior PM, Experiment Tracker |
| **marketing/** | 26 agents | Full coverage of US + China: TikTok, Instagram, LinkedIn, Reddit, X, Douyin, Xiaohongshu, WeChat, Weibo, Bilibili, Kuaishou, Zhihu, Baidu SEO, livestream commerce |
| **paid-media/** | 7 agents | PPC Strategist, Paid Social, Programmatic, Search Query Analyst, Paid Media Auditor, Tracking Specialist, Creative Strategist |
| **sales/** | 8 agents | Deal Strategist (MEDDPICC), Discovery Coach, Sales Engineer, Pipeline Analyst, Outbound Strategist, Account Strategist, Proposal Strategist |
| **support/** | 6 agents | Analytics Reporter, Finance Tracker, Legal Compliance Checker, Executive Summary Generator, Infrastructure Maintainer |
| **game-development/** | Unity, Unreal, Godot, Roblox | Engine-specific specialists: shader artists, multiplayer engineers, level designers, technical artists |
| **spatial-computing/** | 6 agents | visionOS Spatial Engineer, WebXR Developer, macOS Metal Engineer, XR Interface Architect |
| **specialized/** | 23 agents | Blockchain Security Auditor, Compliance Auditor, MCP Builder, ZK Steward, Model QA, Agents Orchestrator, Document Generator, Identity Graph Operator |
| **strategy/** | playbooks, runbooks | Coordination patterns, executive briefs, cross-agent workflows |
| **integrations/** | Adapters | Wiring for Aider, Cursor, Gemini CLI, GitHub Copilot, Windsurf, OpenCode, Antigravity, MCP memory |

### Why the roster is good

- **Specialists, not generalists.** Each agent has a narrow charter and opinions. No "helpful assistant" filler.
- **Adversarial voices included.** Reality Checker, Evidence Collector, Code Reviewer, Paid Media Auditor, Compliance Auditor, Model QA — built-in skepticism prevents groupthink when `/dda` or `/team-build` assembles a panel.
- **Global-market coverage.** The marketing roster covers both Western and Chinese platforms at native depth — rare in public agent collections.
- **Composable.** The Agents Orchestrator, `/team-build`, and `/dda` are designed to dispatch multiple specialists in parallel and synthesize results, not run them one at a time.

---

## Layout

```
~/.claude/
├── README.md                    ← you are here
├── skills/                      ← custom slash commands
│   ├── team-build/
│   ├── team-design/
│   ├── linear-team-build/
│   ├── github-team-build/
│   ├── linear-design/
│   ├── next-feature/
│   ├── dda/
│   ├── code-review/
│   ├── shark-tank/
│   ├── git-audit/
│   ├── seo/
│   ├── market-research/
│   ├── marketing-reddit/
│   ├── cmux-diff/
│   ├── worktree-task/
│   └── startup-*/               ← six-skill Paul Graham playbook
└── agents/                      ← specialist subagent roster
    ├── engineering/
    ├── testing/
    ├── design/
    ├── product/
    ├── marketing/
    ├── paid-media/
    ├── sales/
    ├── game-development/
    ├── spatial-computing/
    ├── specialized/
    └── ...
```

## Using it

**Skills:** type the slash command (e.g. `/dda`, `/team-build`, `/shark-tank`) in Claude Code. They're auto-discovered from `~/.claude/skills/`.

**Agents:** Claude dispatches them via the Agent tool. Invoke implicitly (*"have a security engineer review this"*) or explicitly through `/dda` or `/team-build`, which assemble the right panel or teams for you.

## The pattern

Skills codify *workflows* — the sequence of steps you'd want every time.
Agents codify *perspectives* — the domain lens a specialist brings.
`/dda`, `/team-build`, and `/next-feature` are the bridge: workflows that assemble perspectives on demand and pit them against each other.

That's the whole philosophy of this repo.
