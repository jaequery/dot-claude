---
name: market
description: >
  Two-stage market intelligence for a product idea. Stage 1 produces a 5–7 competitor
  table (Direct / Indirect / Substitute) with key offering, strengths, weaknesses, and
  how the product is different. Stage 2 mines product-category subreddits for real pain
  points, demand signals, sentiment, and the exact language customers use. Use when the
  user says "/market", "competitor map", "competitive landscape", "voice of customer",
  "reddit sentiment", "customer language", or "market intelligence".
allowed-tools:
  - Bash
  - Read
  - Write
  - WebSearch
  - WebFetch
---

# /market — Competitive Landscape + Voice of Customer

A two-stage market read for a product idea:

1. **Stage 1 — Competitor Map.** A grounded 5–7 row table with type, offering, strengths/weaknesses, and differentiation.
2. **Stage 2 — Trends, Sentiment & Language.** Real subreddits, real posts, real customer wording.

This is distinct from `/market-research` (keyword scraper) and `/marketing-reddit` (Reddit posting). Use `/market` to understand the *space* before building or positioning.

## Usage

```
/market
/market I'm building a SOAP-note tool for solo therapists that drafts notes from session audio
/market target: indie game devs · problem: trailer discoverability · approach: TikTok-native generator
```

## Step 1 — Frame the product

Fill the three slots from this template:

> I'm building a product that helps **[target audience]** **[solve what problem or achieve what goal]** using **[product or approach]**.

If the user supplied a description, extract the three slots and restate them back in one line. If any slot is missing or vague, ask one combined question:

> What's the product? Give me three things: **who it's for**, **the problem or goal**, and **the product or approach**.

Echo a single-line restatement before continuing — you and the user must agree on the framing before research.

---

## Step 2 — Stage 1: Competitor Map

Identify **5 to 7** real competitors using WebSearch + WebFetch. Cover all three types:

- **Direct** — same problem, same target audience, same approach.
- **Indirect** — same problem, different approach or different category.
- **Substitute** — what the target audience does *today* with no dedicated tool (a spreadsheet, a manual workflow, "good enough", "I just don't bother"). This row is **mandatory** — current behavior is always a competitor.

For each candidate:
- Confirm it exists (fetch the homepage; never invent a company).
- Read the homepage / pricing / about / changelog to extract the actual offering, not a guess from the name.
- Note the positioning copy they use — that's how the market frames the problem today.

### Output the table exactly like this — normal markdown, no code block:

| Competitor | Type (Direct / Indirect / Substitute) | Key Offering | Strengths | Weaknesses | How We're Different |
|---|---|---|---|---|---|
| ... | ... | ... | ... | ... | ... |

### Rules for the table

- **5 to 7 rows.** Not 4. Not 10.
- **Type reflects closeness of competition with what's being built**, not surface category. A general-purpose tool used "off-label" for this exact problem is Direct, not Indirect.
- **Strengths and Weaknesses must be specific** — a named feature, a pricing model, a missing capability, a known complaint. No "good UX", no "expensive", no "limited features".
- **"How We're Different" is grounded in the user's stated approach.** Never "we have AI" — that is not differentiation in 2026. Never "we're better."
- If you can't find 5 real direct/indirect competitors, fill the gap with additional Substitute rows (the spreadsheet, the contractor, the manual workflow) rather than padding with fake companies.

---

## Step 3 — Stage 2: Trends, Sentiment & Language

### 3a. Pick subreddits

Choose **3 to 5** subreddits where the target audience actually hangs out. Be specific — broad subreddits like r/business or r/Entrepreneur usually produce noise, not signal. Examples of the right level of specificity:

- Legal tools → `r/lawyers`, `r/legaladvice`, `r/Lawyertalk`
- Solo therapists → `r/therapists`, `r/psychotherapy`
- Indie game devs → `r/gamedev`, `r/IndieDev`, `r/IndieGaming`
- Fitness coaches → `r/personaltraining`, `r/Fitness` (last resort), `r/PersonalTrainer`
- Real-estate agents → `r/realtors`, `r/RealEstate`

State your picks and a one-line rationale per subreddit before fetching anything.

### 3b. Fetch real posts

Hit Reddit's public JSON API (no auth required). Use the `Bash` tool with `curl` and a polite User-Agent. For each subreddit, run both a top-window pull and a search for the core pain term:

```bash
UA="Mozilla/5.0 (compatible; market-skill/1.0)"

# Top posts in the last year
curl -s -A "$UA" "https://www.reddit.com/r/<sub>/top.json?t=year&limit=50"

# Pain-keyword search within the subreddit
curl -s -A "$UA" "https://www.reddit.com/r/<sub>/search.json?q=<term>&restrict_sr=1&sort=relevance&t=year&limit=50"
```

For posts whose title directly hits the pain, also fetch the comments:

```bash
curl -s -A "$UA" "https://www.reddit.com/r/<sub>/comments/<id>.json?limit=100"
```

If a request returns 429 or empty, `sleep 2` and continue with whatever you have. Do not abort the run on a single failure. If Reddit blocks entirely, fall back to WebSearch with `site:reddit.com r/<sub> "<pain term>"` and WebFetch the post pages.

### 3c. Synthesize

From the gathered titles + bodies + top comments, produce these five sections:

**1. Top pain points** — ranked by how often they recur across posts. For each pain:
   - One-line summary.
   - Subreddit(s) it surfaced in.
   - 1–2 **verbatim quotes** with permalinks. Exact wording — do not paraphrase.

**2. Demand signals** — moments where someone explicitly says "I would pay for…", "is there a tool that…", "I tried X and it sucks because…", or describes building a janky workaround. Quote and link each.

**3. Customer language glossary** — 8 to 15 phrases customers actually use. Split into:
   - **Pain terms** (the words they use for the problem)
   - **Outcome terms** (the words they use for what they want instead)
   These are the words that belong on the landing page.

**4. Current alternatives & complaints** — what they use today and why it's not enough. Feed any tool that recurs here back into Stage 1 as a Substitute or Indirect row if it wasn't already there.

**5. Sentiment summary** — one paragraph: how does this community *feel* about existing solutions? Frustrated? Resigned? Skeptical of AI specifically? Burned by a prior product? Name names where the signal supports it.

---

## Step 4 — Market Read

End with a 4 to 6 bullet **Market Read** that ties Stage 1 and Stage 2 together:

- **Crowdedness:** Empty field / Emerging / Crowded / Graveyard of failed attempts.
- **Single most underserved pain** that surfaced on Reddit.
- **Landing-page phrase candidate** — one or two phrases from the language glossary you'd put above the fold first.
- **Wedge competitor** — which Stage 1 entry is most exposed to the underserved pain.
- **Biggest red flag** from the data — a specific reason this might not work (regulatory friction, AI skepticism in this community, a graveyard of failed predecessors, etc.).
- **One next move for the founder** — concrete: "DM these 5 redditors", "build a 1-week test that does X", "post Y in r/Z and see if anyone bites."

---

## Hard rules

- **No fabricated competitors.** Every Stage 1 row must be a real company / product whose homepage you fetched, OR a Substitute row describing current behavior.
- **No fabricated quotes.** Every Reddit quote must have a real permalink. If you cannot verify the permalink, drop the quote.
- **Be specific, not generic.** "Users hate the UX" is not a finding. "Users on r/therapists report Mentalyc misses EMDR session structure — [quote, permalink]" is.
- **The Substitute row is mandatory** — current behavior is always a competitor.
- **TARGET US / T1 audiences** (US, UK, Canada, Australia) for subreddit selection unless the user specifies a region.
- **"We have AI" is not differentiation in 2026.** Push for something the product's approach actually does that nobody else does.
- **Quote, don't paraphrase, for customer language.** The point of Stage 2 is to capture exact wording — paraphrasing destroys the signal.

## Output discipline

- Stage 1 table is rendered as a **normal markdown table, not wrapped in a code block**.
- All Reddit quotes include the subreddit and a real permalink.
- Final structure: (1) one-line restatement, (2) Stage 1 table, (3) Stage 2 sections 1–5, (4) Market Read bullets.
- No filler intros, no "I hope this helps."
