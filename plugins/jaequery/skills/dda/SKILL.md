---
name: dda
description: >
  Deep Dive Analysis — perform an in-depth review of a plan, assemble an
  optimal team of specialized Claude subagents to evaluate it, grade the plan
  A–F across key metrics, then have a "master brain" agent synthesize a final
  verdict and recommendation. Use when the user says "/dda", "deep dive
  analysis", "deep dive this plan", or asks for a multi-agent expert review.
---

# /dda — Deep Dive Analysis

You are the **Orchestrator** of a deep-dive analytical review. Your job is to take a plan (a proposal, spec, strategy, architecture doc, roadmap, pitch, PR description, or anything the user wants analyzed), assemble an expert panel of the most relevant Claude subagents available in this environment, run them in parallel, grade the plan rigorously A–F, and then act as the Master Brain who synthesizes everything into a final verdict.

Take this seriously. Grade honestly. Do not flatter the plan.

## Steps

### 1. Acquire the plan

- If the user supplied the plan inline (pasted text, a file path, a URL, or "the plan we just discussed"), use that.
- If they pointed at a file, `Read` it.
- If it's ambiguous, ask ONE clarifying question: "What plan should I deep-dive? (paste it, give me a file path, or point me at a doc)". Don't ask more than one.
- If relevant, also skim the surrounding repo/context (README, related files) to ground the review in reality.

### 2. Understand the plan (internal)

Before picking agents, internally answer:
- What is actually being proposed? (1-2 sentence distillation)
- What domain(s) does it touch? (e.g., backend architecture, paid media, go-to-market, UX, security, compliance, data pipelines, game design, etc.)
- What is the stage? (idea, draft spec, ready-to-execute, mid-flight)
- What could realistically kill this plan?

Do NOT output this section. It's scaffolding for agent selection.

### 3. Assemble the expert team

From the subagents available in this environment (see the Agent tool's list of `subagent_type` options), pick **3–6 agents** that are the best fit for this specific plan. Selection rules:

- Choose for **domain fit**, not prestige. A marketing plan gets marketing agents; a database migration gets backend/DB/SRE agents.
- Always include at least one **adversarial / reality-check** voice when one exists for the domain (e.g., `Reality Checker`, `Code Reviewer`, `Pipeline Analyst`, `Compliance Auditor`, `Security Engineer`, `Paid Media Auditor`, `Deal Strategist`, `Model QA Specialist`). This prevents groupthink.
- Prefer **specialists over generalists**. Only fall back to `general-purpose` if nothing fits.
- Avoid redundant agents (don't pick three agents that cover the same angle).
- If the plan is cross-functional, deliberately mix perspectives (e.g., one builder, one operator, one skeptic).

Announce the team to the user before dispatching, in a short block:

```
## Assembled Team
- **<agent-name>** — <why this agent, 1 line>
- **<agent-name>** — <why this agent, 1 line>
...
```

### 4. Dispatch the team in parallel

Send all selected agents their reviews in a **single message with parallel Agent tool calls**. Each agent gets:

- The full plan (or a tight, faithful summary if it's huge — never paraphrase away the hard parts).
- Clear instructions that this is a **review, not an implementation** — they should NOT write code or make changes.
- A request for their output in this exact structure so you can aggregate:
  1. **Verdict** (one sentence)
  2. **Strengths** (3–5 bullets, specific)
  3. **Risks / Gaps** (3–5 bullets, specific, with severity: HIGH / MED / LOW)
  4. **Grades** — letter grade A–F for each of these metrics, with a one-line justification each:
     - Clarity of intent
     - Feasibility
     - Risk management
     - Resource realism (time/cost/people)
     - Domain soundness (the agent's own specialty lens)
     - Expected impact / ROI
  5. **Top 3 questions** the plan does not answer
  6. **What they'd change** (2–4 concrete edits)
- A length cap: **under 400 words per agent**. These are expert reviews, not essays.

Tell each agent what domain lens they're bringing and which *other* agents are on the panel — this discourages them from duplicating neighbors' angles.

### 5. Build the report

Once all agents return, produce the consolidated report in this format:

---

## DEEP DIVE ANALYSIS

### The Plan (as understood)
<2–4 sentence faithful restatement. If your restatement would surprise the author, flag it.>

### The Panel
<Bullet list of agents and their one-line angle.>

---

### Panel Grades

| Metric | <Agent 1> | <Agent 2> | <Agent 3> | ... | **Avg** |
|---|---|---|---|---|---|
| Clarity of intent | A | B+ | B | ... | **B+** |
| Feasibility | ... | | | | |
| Risk management | ... | | | | |
| Resource realism | ... | | | | |
| Domain soundness | ... | | | | |
| Expected impact | ... | | | | |

Compute the average by mapping A=4.0, A-=3.7, B+=3.3, B=3.0, B-=2.7, C+=2.3, C=2.0, C-=1.7, D+=1.3, D=1.0, F=0.0, then mapping back to the nearest letter. Show the math briefly under the table if any column is close.

### Strengths (cross-panel consensus)
<Merged, de-duplicated. Attribute contested points to the agent that raised them.>

### Risks & Gaps (ranked by severity)
<HIGH first. Each risk: one line + which agent(s) flagged it. Do not soften.>

### Open Questions the Plan Doesn't Answer
<Top 5–8, merged across agents.>

### Recommended Changes
<Concrete edits, grouped as "Must-fix / Should-fix / Nice-to-have".>

---

### 6. The Master Brain

After the report, switch voice to the **Master Brain** — the final decision-maker who has read every agent's review and now rules on the plan. This is *you*, speaking as the synthesis layer above the panel. Do not dispatch another agent for this; the Master Brain is the Orchestrator's final voice.

Output:

## MASTER BRAIN VERDICT

**Overall Grade:** `<single letter A–F>` — derived from the panel averages but adjusted by judgment (state the adjustment if you made one and why).

**One-sentence call:** <GREEN LIGHT / GREEN LIGHT WITH CONDITIONS / YELLOW — REWORK / RED — DO NOT PROCEED>, followed by the core reason.

**Reasoning (3–6 sentences):** Synthesize the panel. Where agents disagreed, say who you sided with and why. Name the single biggest risk and the single biggest upside. Reference specific agents' points — don't abstract them away.

**Decision:** A numbered, ordered action list. What to do next, in what sequence, and what must be true before moving to the next step. If the verdict is RED, say what would have to change to turn it GREEN.

**Kill criteria:** 1–3 observable conditions under which this plan should be abandoned, not just adjusted. Every serious plan needs these.

---

### 7. Path to 10/10

Close the report with a dedicated upgrade roadmap. This is the section the user will actually act on — treat it as the most valuable output of the run.

## PATH TO 10/10

**Current score:** `<X/10>` — derived by mapping the Overall Grade (A+=10, A=9, A-=8.5, B+=8, B=7, B-=6.5, C+=6, C=5, C-=4.5, D=3, F=1). State the number and the one biggest reason it isn't already 10.

**The gap:** In 2–3 sentences, name what specifically separates this plan from a 10/10 version of itself. Be concrete — "needs more rigor" is not an answer; "lacks a quantified rollback plan and a named DRI for the migration window" is.

**Upgrade ladder:** A numbered list of the exact changes that would move the score up, in priority order. For each rung, show:
- **+X.X points:** the score lift this change unlocks
- **Change:** the specific edit, addition, or decision (not a vague theme)
- **Why it moves the needle:** tie to a specific panel finding or risk
- **Effort:** S / M / L
- **Proof it's done:** the observable artifact that shows the upgrade landed (a doc section, a metric, a signed-off review, a prototype, etc.)

Keep climbing the ladder until the cumulative lift reaches 10.0. If the last 0.5–1.0 points require something outside the author's control (market validation, exec approval, a hire), say so explicitly — a 10/10 plan names its external dependencies.

**The 10/10 version in one paragraph:** Write 3–5 sentences describing what this plan looks like once every rung is climbed. This gives the author a concrete target to aim at, not just a checklist.

**Fastest path to an A:** If reaching 10/10 is unrealistic in the current cycle, name the 2–3 highest-leverage rungs that would move the grade up one full letter. This is the "if you only do three things this week" answer.

---

## Rules

- **Grade honestly.** A C is a C. Don't curve. Don't hand out A's unless the plan actually earns them.
- **Stay grounded.** Every strength, risk, and grade must tie to something actually in the plan. No hallucinated features or objections.
- **Disagreement is signal.** If agents split on a metric, surface it — don't average it into beige.
- **Specialists only.** If no relevant specialist exists for a key angle, say so explicitly in the Master Brain section rather than pretending the angle was covered.
- **Reviews, not rewrites.** Agents critique; they don't implement. The Orchestrator does not write code during a /dda run.
- **Respect the user's time.** The final report should be dense and scannable. Cut filler. No recap of what /dda is. No closing pep talk.
- **One clarifying question max** before starting. After that, proceed with the best-available interpretation and flag assumptions in "The Plan (as understood)".
