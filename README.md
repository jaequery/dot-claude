# dot-claude

My personal Claude Code arsenal — custom slash-command skills and a curated roster of 140+ specialist subagents. Built to turn Claude from a clever assistant into an opinionated team of domain experts.

## Why this exists

Out-of-the-box Claude is a generalist. Real work needs specialists — someone who thinks like a growth hacker, someone who grades plans like a skeptical VP, someone who kills bad startup ideas before you build them. This repo wires that in as slash commands and subagents you can invoke on demand.

---

## Custom Skills — quick index

Invoke any of these from the Claude Code prompt. Each one is a self-contained SOP — no setup required. See [Skill Guides](#skill-guides) below for the deep dive on each.

### Decision & review

- [`/orchestrate`](#orchestrate) — Tournament of rival teams with an independent eval gate.
- [`/next-feature`](#next-feature) — Pick the single best next feature to ship (tournament-judged).
- [`/dda`](#dda--deep-dive-analysis) — Deep Dive Analysis: expert panel grades a plan A–F, Master Brain issues a verdict.
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

---

## Skill Guides

### `/orchestrate`

**What it does.** Runs a tournament-style multi-team decision or build: 2–4 rival teams of specialists each produce a complete attempt, iterate for 3 rounds on private critiques, go all-out in a Finals round, and one winner passes an independent eval gate before shipping.

**When to use.** When the *approach itself* is an open question, the task benefits from best-of-N rather than a single opinion, or the stakes justify 4–6× dispatch cost. Not for routine tasks.

**How to invoke.** `/orchestrate <task>` or phrases like *"run a tournament"*, *"field competing teams"*, *"best-of-N"*, *"multi-team showdown"*. One clarifying question allowed; everything else (bracket size, team diversity, acceptance bar, eval method) is decided by the orchestrator.

**What you get.** Bracket announcement → Round 1/2/3 submissions → Finals → weighted judging table → eval-gate PASS/FAIL report with evidence → final winner (with each team's trajectory) → runner-up salvage notes → next actions and known limits.

**How it works.** Each team runs in isolation (no rival visibility) for the improvement rounds. Finals reveal sanitized rival summaries and loosen constraints. An independent eval panel — declared up front — runs the winner against acceptance criteria. Patch-and-retry capped at 2, extra-round at 1, re-field at 1; after that it escalates to you rather than shipping a "Frankenstein winner."

**Example.**

```
/orchestrate design the pricing page for a dev tool that serves hobbyists and enterprise buyers
```

*Two audiences with opposite needs — rival teams explore different pricing archetypes (freemium / tiered / hybrid), iterate over three rounds, and the winner ships only after passing a conversion-proxy eval gate.*

---

### `/next-feature`

**What it does.** Plans the single most useful next feature for the current project by running an `/orchestrate` tournament of rival feature proposals.

**When to use.** When you want a grounded, judged decision on *what to ship next* — not a brainstorm list or a feature parade.

**How to invoke.** `/next-feature` from inside the project, or *"what should I build next"*, *"pick my next feature"*, *"plan the next feature"*. One clarifying question max about goal/audience.

**What you get.** Tournament bracket → each team's feature submission → weighted scoring table → one winner with a 9-point plan (name, description, strategic case, user story, scope, effort, risks, success metric, implementation sketch) → runner-up salvage → next actions.

**How it works.** Auto-scans `README`, `CLAUDE.md`, manifest, `git log`, `git shortlog`, and roadmap files. Fields 2–4 strategy-lensed teams (e.g. "User Value", "Growth", "Foundation", "Quick Win"). Inherits the full `/orchestrate` playbook including the independent eval gate — and refuses to ship a weak winner (reruns once or escalates).

**Example.**

```
/next-feature
```

*Run inside a year-old side project — the tournament fields "Retention", "Growth", and "Foundation" teams, then ships a single 9-point plan for the winner: "Weekly progress email with one-click streak recovery."*

---

### `/dda` — Deep Dive Analysis

**What it does.** Auto-assembles a 3–6 agent expert panel from the roster, grades your plan A–F across six metrics, then a "Master Brain" synthesis layer issues a GREEN / YELLOW / RED verdict with kill criteria.

**When to use.** You have a plan, spec, strategy, or pitch and want advisory-board-quality review in one command.

**How to invoke.** `/dda <plan>`, or paste a plan / pass a file path / point at prior discussion, then trigger with *"deep dive analysis"*, *"deep dive this plan"*, *"multi-agent expert review"*. One clarifying question allowed if ambiguous.

**What you get.** Panel roster → grade matrix (6 metrics × agents) → consensus strengths, risks, questions, recommended changes → **Master Brain Verdict** (GREEN / YELLOW / RED) → **Path to 10/10** upgrade ladder with scored rungs.

**How it works.** Orchestrator picks domain-fit subagents and *always* includes an adversarial voice (Reality Checker, Evidence Collector, Code Reviewer, etc.) to prevent groupthink. Panel dispatches in parallel with a capped 400-word output contract; grades averaged on an A=4.0 scale.

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
- **Adversarial voices included.** Reality Checker, Evidence Collector, Code Reviewer, Paid Media Auditor, Compliance Auditor, Model QA — built-in skepticism prevents groupthink when `/dda` or `/orchestrate` assembles a panel.
- **Global-market coverage.** The marketing roster covers both Western and Chinese platforms at native depth — rare in public agent collections.
- **Composable.** The Agents Orchestrator, `/orchestrate`, and `/dda` are designed to dispatch multiple specialists in parallel and synthesize results, not run them one at a time.

---

## Layout

```
~/.claude/
├── README.md                    ← you are here
├── skills/                      ← custom slash commands
│   ├── orchestrate/
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

**Skills:** type the slash command (e.g. `/dda`, `/orchestrate`, `/shark-tank`) in Claude Code. They're auto-discovered from `~/.claude/skills/`.

**Agents:** Claude dispatches them via the Agent tool. Invoke implicitly (*"have a security engineer review this"*) or explicitly through `/dda` or `/orchestrate`, which assemble the right panel or teams for you.

## The pattern

Skills codify *workflows* — the sequence of steps you'd want every time.
Agents codify *perspectives* — the domain lens a specialist brings.
`/dda`, `/orchestrate`, and `/next-feature` are the bridge: workflows that assemble perspectives on demand and pit them against each other.

That's the whole philosophy of this repo.
