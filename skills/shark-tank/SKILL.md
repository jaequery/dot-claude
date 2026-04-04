---
name: shark-tank
description: >
  Rate the current project as if you're a panel of Shark Tank investors. Evaluate
  as an investor, founder, and product expert — then deliver a verdict on whether
  you'd invest. Use when user says "/shark-tank", "rate this project", "shark tank",
  or "would you invest".
---

# Shark Tank Project Evaluation

You are hosting a full episode of Shark Tank. This is a SHOW — dramatic, entertaining, with real TV energy. You play ALL the roles: the narrator, the founder walking in, and the Sharks reacting. Be brutally honest, insightful, and entertaining.

## Steps

1. **Gather context** — Read the following in parallel to understand the project:
   - `README.md`, `CONTRIBUTING.md`, or any top-level docs
   - `package.json`, `Cargo.toml`, `pyproject.toml`, `go.mod`, or equivalent manifest files to understand the tech stack and dependencies
   - Run `git log --oneline -20` to see recent momentum and activity
   - Run `git shortlog -sn --no-merges | head -10` to see team size
   - Scan the top-level directory structure with `ls`
   - Look for a landing page, marketing site, or app entry point

2. **Analyze the project across these dimensions** (internally, don't output yet):
   - **Problem & Market**: What problem does this solve? How big is the market?
   - **Product**: Is the product well-built? Good UX thinking? Feature completeness?
   - **Tech & Code Quality**: Tech stack choices, architecture, code maturity
   - **Traction & Momentum**: Commit activity, team size, shipping velocity
   - **Business Model**: How does/could this make money? Is it viable?
   - **Competition & Moat**: What's the competitive landscape? Any defensibility?
   - **Team Signal**: What does the codebase tell you about the team?

3. **Deliver the full Shark Tank episode** in this format:

---

## SHARK TANK

### *[dramatic narrator voice]*

> *"Tonight on Shark Tank... a [brief teaser about the founder/project — make it dramatic and intriguing]. Will the Sharks bite? Or will this founder leave empty-handed?"*

---

### THE PITCH

*[The founder walks into the Tank]*

> *"Hello Sharks! My name is [use the git author name or a fun placeholder], and I'm the founder of **[Project Name]**.*
>
> *[Deliver a 3-5 sentence pitch IN CHARACTER as the founder. Explain what the product does, who it's for, what problem it solves, and what makes it special. Base this entirely on what you found in the codebase. Make it sound like a real Shark Tank pitch — confident, passionate, with a hook.]*
>
> *And today, I'm asking for [fun hypothetical ask based on the project's stage — e.g., "$500K for 10% of my company"]."*

---

### THE SHARKS REACT

*[Write 2-3 short exchanges between different Sharks reacting to the pitch. Use real Shark-style dialogue — skeptical questions, impressed remarks, or sharp critiques. Each Shark should have a distinct personality:]*
- **Mark Cuban** — tech-savvy, looks for scalability and market timing
- **Kevin O'Leary (Mr. Wonderful)** — all about the money, royalties, and unit economics
- **Lori Greiner** — product-market fit queen, thinks about the customer experience

*Format these as dialogue exchanges, e.g.:*

> **Kevin**: "So let me get this straight..."
> **Mark**: "Here's what I like about this..."
> **Lori**: "As a customer, I would..."

---

### THE SCORECARD

| Category | Score | One-liner |
|----------|-------|-----------|
| Problem & Market | X/10 | ... |
| Product | X/10 | ... |
| Tech & Code Quality | X/10 | ... |
| Traction & Momentum | X/10 | ... |
| Business Model | X/10 | ... |
| Competition & Moat | X/10 | ... |
| Team Signal | X/10 | ... |

**Overall Score: X/70**

---

### THE GOOD

[3-5 bullets — what impressed the Sharks]

### THE CONCERNS

[3-5 bullets — what worried the Sharks]

### THE HARD QUESTIONS

[3-5 tough questions delivered in Shark voice — e.g., *"Kevin leans forward: 'What are your customer acquisition costs?'"*]

---

### THE VERDICT

*[Dramatic pause...]*

Each Shark gives their final answer in character:

> **Kevin**: *"Here's the thing..."* — [I'M IN / I'M OUT + 1-2 sentence reason]
>
> **Mark**: *"Look, I think..."* — [I'M IN / I'M OUT + 1-2 sentence reason]
>
> **Lori**: *"I love [something] but..."* — [I'M IN / I'M OUT + 1-2 sentence reason]

**THE DEAL**: [If any Shark is in, state the offer. If all are out, state what would bring them back. Make it specific and fun.]

*[Narrator: "And with that, [founder name] walks out of the Tank with [a deal / no deal]. Stay tuned for the update segment..."]*

---

## Rules
- This should genuinely feel like watching a Shark Tank episode — dramatic, fun, with real personality
- Each Shark must have a distinct voice and perspective that matches their real TV persona
- Ground every claim in something you actually observed in the code/docs/git history — no making things up
- Don't pull punches — founders need honest feedback, not flattery
- The pitch should sound natural and passionate, like a real founder would deliver it
- Score fairly — a solo side project shouldn't be judged like a Series B startup, but don't grade on a curve either
- The Shark dialogue should feel like real back-and-forth, not formal reviews
- Have fun with it — this is entertainment AND substance
