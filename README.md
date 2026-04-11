# dot-claude

My personal Claude Code arsenal — custom slash-command skills and a curated roster of 140+ specialist subagents. Built to turn Claude from a clever assistant into an opinionated team of domain experts.

## Why this exists

Out-of-the-box Claude is a generalist. Real work needs specialists — someone who thinks like a growth hacker, someone who grades plans like a skeptical VP, someone who kills bad startup ideas before you build them. This repo wires that in as slash commands and subagents you can invoke on demand.

---

## Custom Skills (slash commands)

Invoke any of these from the Claude Code prompt. Each one is a self-contained SOP — no setup required.

### Analysis & decision-making

- **`/dda` — Deep Dive Analysis.** Takes any plan, auto-assembles a 3–6 agent expert panel from the roster, grades it A–F across six metrics, then a "Master Brain" synthesis layer delivers a GREEN/YELLOW/RED verdict with kill criteria. The review you'd get from a good advisory board, in one command.
- **`/shark-tank` — Project evaluation as Shark Tank.** Analyzes the current repo and stages a full episode — pitch, Shark reactions, scorecard, verdict. Brutally honest and entertaining.
- **`/git-audit` — Repo health audit.** Runs 13 git analyses covering churn hotspots, bus factor, bug clusters, velocity, stale files, and team dynamics. Surfaces what `git log` won't tell you at a glance.

### Startup playbooks (Paul Graham framework)

Six skills that compose into a full zero-to-one operating system:

- **`/startup-pressure-test-idea`** — Finds every fatal flaw YC-style before you waste a week building.
- **`/startup-validate-problem`** — "Talk to users" framework: is this a real problem people pay for?
- **`/startup-build-mvp`** — Smallest MVP that tests the core assumption in two weeks.
- **`/startup-find-customers`** — Manual plan for the first 10 customers; "do things that don't scale."
- **`/startup-map-competition`** — Maps every real competitor, including the invisible ones most founders miss.
- **`/startup-growth-strategy`** — "Make something people want and tell their friends," wired into a compounding engine.

Why they're good: each one is scoped to a single decision, refuses to hand out participation trophies, and ends with a concrete next action — not a strategy deck.

### Marketing & growth

- **`/seo`** — Full SEO suite: site audits, single-page deep dives, technical checks (crawlability, Core Web Vitals, INP), schema validation/generation, content quality scoring.
- **`/market-research`** — Scrapes Google Autocomplete, Reddit, YouTube, and Google Trends for a topic. Outputs a ranked keyword report with demand scores and content ideas grounded in real signals.
- **`/marketing-reddit`** — Finds relevant Reddit posts across AI-suggested subreddits, ranks them, and can comment or post via Playwright MCP. Built for authentic engagement, not spam.

### Utilities

- **`/cmux-diff`** — VSCode-style changes panel in a sidebar layout for reviewing diffs without leaving the terminal.

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
- **Adversarial voices included.** Reality Checker, Evidence Collector, Code Reviewer, Paid Media Auditor, Compliance Auditor, Model QA — built-in skepticism prevents groupthink when `/dda` assembles a panel.
- **Global-market coverage.** The marketing roster covers both Western and Chinese platforms at native depth — rare in public agent collections.
- **Composable.** The Agents Orchestrator and `/dda` skill are designed to dispatch multiple specialists in parallel and synthesize results, not run them one at a time.

---

## Layout

```
~/.claude/
├── README.md                ← you are here
├── skills/                  ← custom slash commands
│   ├── dda/
│   ├── shark-tank/
│   ├── git-audit/
│   ├── seo/
│   ├── market-research/
│   ├── marketing-reddit/
│   ├── cmux-diff/
│   └── startup-*/           ← six-skill Paul Graham playbook
└── agents/                  ← specialist subagent roster
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

Skills: type the slash command (e.g. `/dda`, `/shark-tank`) in Claude Code. They're auto-discovered from `~/.claude/skills/`.

Agents: Claude dispatches them via the Agent tool. Invoke implicitly ("have a security engineer review this") or explicitly through `/dda`, which picks the right panel for you.

## The pattern

Skills codify *workflows* — the sequence of steps you'd want every time. Agents codify *perspectives* — the domain lens a specialist brings. `/dda` is the bridge: a workflow that assembles perspectives on demand. That's the whole philosophy of this repo.
