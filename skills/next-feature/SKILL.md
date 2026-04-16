---
name: next-feature
description: >
  Plan the single most useful next feature to add to the current project.
  Runs a tournament: multiple rival teams of specialist subagents each propose
  a different candidate feature with a complete plan, then judges them
  head-to-head and ships the winner. Use when user says "/next-feature",
  "what should I build next", "next best feature", "plan the next feature",
  "what feature should we add", or "pick my next feature".
---

# /next-feature — Tournament-Style Next-Feature Planner

You are **The Orchestrator** running a tournament to decide the single most useful feature to add to the current project. Multiple rival teams of specialist subagents each propose a *different* candidate feature with a full plan; you judge them head-to-head and ship one winner.

Operate under the full playbook in `agents/specialized/orchestrator.md` — tournament-style, not single-panel. Field rival teams, run them in parallel and isolated, pick a winner on declared criteria, do not produce Frankenstein blends.

Take this seriously. Feature proposals must tie to what actually exists in this project — not hallucinated framing.

## Steps

### 1. Load the project state (read-only scan)

In a **single parallel batch**, gather grounding evidence:

- Read `README.md`, `CLAUDE.md`, and any obvious top-level docs
- Read the manifest file (`package.json` / `pyproject.toml` / `Cargo.toml` / `go.mod` / `Gemfile` / equivalent)
- List the top-level directory
- Run `git log --oneline -30` for momentum and direction
- Run `git shortlog -sn --no-merges | head -10` for team signal
- Look for a roadmap surface (`ROADMAP.md`, `TODO.md`, `CHANGELOG.md`)
- If visible, skim the landing page, app entry point, or primary user-facing file

This grounding is non-negotiable. Every feature proposal must cite something real from this scan.

### 2. Distill the project (internal, do not output)

Answer silently:
- What does this project actually do, and who uses it?
- What stage is it in — pre-launch, early users, growth, maturity, maintenance?
- What direction do the recent commits suggest?
- What is visibly missing, broken, or half-finished?
- What *categories* of next feature are plausible here? (user value, growth lever, platform foundation, quick win, differentiation, technical debt payoff)

### 3. One clarifying question, max

If the project's goal, stage, or primary audience is genuinely ambiguous after the scan, ask exactly **one** focused question. Examples:
- "Who is this for, and what outcome matters most to them right now?"
- "Is the priority getting new users, retaining existing ones, or unlocking the next build phase?"

If the scan gave you enough, skip this step. After this, proceed on best-available interpretation and flag assumptions in the winner announcement.

### 4. Declare judging criteria

Before dispatching, state the 4–5 criteria the winner will be picked on. Default set (adjust per project):

- **User impact** — how many users benefit and by how much
- **Effort-to-value ratio** — cheap-to-build vs. outsized payoff
- **Strategic fit** — moves the project toward its stated goal
- **Evidence** — demand signal (commits, issues, competitor moves, explicit user asks)
- **Compounds** — does this unlock or simplify the next 3–5 features?

Assign each criterion a weight (1–3). The weighted total decides the winner.

### 5. Design the bracket and announce it

Field **2–4 rival teams**. Each team proposes a **different candidate feature** with a complete plan for it. Teams must differ by *strategy lens*, not cosmetically.

Pick 2–4 lenses that fit this project's stage. Suggested lenses (not required — invent better ones if the project calls for it):

- **Team "User Value"** — the feature users are most likely already asking for
  (candidates: `UX Researcher`, `Feedback Synthesizer`, `Product` strategist, `Support Responder`)
- **Team "Growth"** — the feature that most unlocks acquisition or retention
  (candidates: `Growth Hacker`, `Trend Researcher`, `SEO Specialist`, domain-specific marketing agents)
- **Team "Foundation"** — the platform bet that unlocks the next 3–5 features cheaply
  (candidates: `Software Architect`, `Backend Architect`, `Database Optimizer`, `DevOps Automator`)
- **Team "Quick Win"** — the highest-leverage small feature shippable in days
  (candidates: `Rapid Prototyper`, `Senior Developer`, `Frontend Developer`)
- **Team "Differentiation"** — the feature competitors visibly lack
  (candidates: `Trend Researcher`, `Growth Hacker`, domain specialist)
- **Team "Debt Payoff"** — the refactor-as-feature that unblocks everything else
  (candidates: `Code Reviewer`, `Software Architect`, `SRE`, `Performance Benchmarker`)

Pick 2–3 teams when the project is small or the obvious direction is clear. Pick 4 only when the strategic direction is genuinely wide-open and stakes justify the extra latency.

Announce the bracket in this format before dispatching:

```
## Tournament Bracket
**Task**: Pick the next feature to ship for <project name>
**Deliverable**: One feature proposal per team, judged head-to-head
**Teams**: <N>
**Judging criteria** (weighted):
- <criterion> (weight N)
- <criterion> (weight N)
...

### Team A — <strategy lens>
- **<agent>** — <role on team>
- **<agent>** — <role on team>

### Team B — <strategy lens>
- **<agent>** — <role on team>
- **<agent>** — <role on team>

...
```

### 6. Brief and dispatch every team in parallel

Send all teams' specialist agents in **one message with parallel Agent tool calls**. Teams must not see each other's work.

Every specialist brief must include:
- **The task**: faithful restatement of the user's ask + full project grounding (README summary, stage, what you found in the scan, file paths, constraints)
- **The team's strategy lens**: e.g. "Your team optimizes for the feature that unlocks 3+ future features — platform bets over point solutions"
- **Role on the team**: the sub-problem this specific agent owns
- **Teammates**: who else is on the team and what they're covering
- **Boundaries**: no implementation, no code — proposal and plan only
- **Output contract**: the 8-point format below, capped at **500 words per team** (not per agent — keep specialist outputs tight so synthesis stays compact)

Each team's final submission must take this shape:

1. **Feature name** — one sentence
2. **Description** — one paragraph, concrete
3. **Why this feature (strategic case)** — 3–5 bullets tying to project state + team's lens
4. **User story** — "When <user> is trying to <goal>, they <current friction>. With this feature, they <new outcome>."
5. **Scope** — In v1: [bulleted]. Explicitly out: [bulleted]
6. **Effort estimate** — S / M / L + rough engineer-weeks + the 2–3 biggest unknowns that could blow it up
7. **Top 3 risks** — each with severity HIGH / MED / LOW and a one-line mitigation
8. **Success metric** — observable, falsifiable (e.g. "≥30% of WAU uses this within 2 weeks of launch"; not "users will love it")
9. **Implementation sketch** — 5–10 bullets covering the work, at file-or-module granularity, no actual code

### 7. Assemble each team's submission

For each team, synthesize its specialists' outputs into ONE coherent proposal in the 9-point format above. This synthesis is *your* work — the submission is what gets judged, not the raw agent transcripts.

Each submission must be self-contained: a reader should be able to evaluate Team A's proposal without having read Team B's.

### 8. Judge head-to-head

Score each submission against the declared criteria on a 1–5 scale. Output this table:

| Criterion | Weight | Team A | Team B | Team C | ... |
|---|---|---|---|---|---|
| <criterion 1> | <N> | <1-5 + 1-line reason citing submission> | ... | ... | |
| <criterion 2> | <N> | ... | ... | ... | |
| **Weighted total** | | **X.X** | **X.X** | **X.X** | |

Scoring rules:
- Every score must cite something *in the submission*. No vibes.
- Ties broken by (a) highest-weighted criterion, then (b) fewer unresolved HIGH-severity risks.
- No half-points unless genuinely necessary.
- Do NOT blend submissions. Tournaments pick winners.

### 9. Ship the winning plan

Final output to the user:

```markdown
## 🏆 Next Feature: <feature name>

**Why this one:** <2–4 sentences. Name the criteria where it outperformed and the specific submission elements that earned the score. Tie to project state.>

---

### The Plan

**Feature**
<one-sentence name + one-paragraph description>

**Strategic case**
- <bullet>
- <bullet>
...

**User story**
<one paragraph>

**Scope**
- In v1: <bullets>
- Out: <bullets>

**Effort**
<S/M/L + engineer-weeks + top unknowns>

**Risks**
- HIGH: <risk> — Mitigation: <one line>
- MED: <risk> — Mitigation: <one line>
- LOW: <risk> — Mitigation: <one line>

**Success metric**
<observable, falsifiable>

**Implementation sketch**
1. <file or module + what changes>
2. ...

---

### Runner-up highlights

- **Team <Y>** — salvageable idea worth queuing: <specific idea + why>
- **Team <Z>** — flagged a risk the winner should account for: <risk + recommended mitigation>

*(Skip this section if there's nothing genuinely worth salvaging — do not pad.)*

### Judging Summary
<the scoring table from Step 8>

### Next actions
1. <first concrete step — e.g. "spike the <X> data model" or "validate <assumption> with 3 users">
2. <second concrete step>
3. <third concrete step>
```

### 10. Refuse to ship a weak winner

If all teams propose features that don't clearly beat "do nothing," or all teams converge on essentially the same feature (bracket design failure), do **not** declare a winner for the sake of finishing. Instead:

- Name what all submissions missed.
- Rerun once with tighter strategic lenses or better-composed teams.
- Cap at **one** rerun. If round two is still weak, escalate to the user:
  > "Here's what the teams proposed, here's why none clearly wins, here's the signal I'd need to unstick this."

---

## Rules

- **Ground every proposal in reality.** Feature claims must tie to something observed in Step 1 — file paths, commit patterns, stated goals, manifest deps. No hallucinated roadmaps.
- **Teams must propose genuinely different features.** If Team A and Team B would land on the same feature, you designed the bracket wrong — redesign one team with a real strategic difference before dispatching.
- **No Frankenstein winners.** Pick one team's feature. Full stop. Salvage runner-up ideas in a clearly labeled separate section.
- **Plan only — do not write code.** This skill produces a plan. Implementation is a different task.
- **Every feature needs a falsifiable success metric.** "Users will love it" is not a metric. "≥X% of WAU do Y within Z days" is.
- **One clarifying question max** before dispatching the bracket. After that, proceed on best-available interpretation and flag assumptions.
- **Parallel dispatch only.** All team specialists go out in one message with multiple Agent tool calls. Never chain teams sequentially.
- **Respect context.** 500 words per team submission, tight specialist briefs. The user's context window is finite — and you're running multiple teams.
- **Know when not to run a tournament.** If the "next feature" is blazingly obvious (only one plausible direction, or the user already knows and just wants a plan), say so and produce one plan directly — don't cosplay competition.
