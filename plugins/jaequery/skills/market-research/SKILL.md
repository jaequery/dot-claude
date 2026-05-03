---
name: market-research
description: >
  Scrape Google Autocomplete, Reddit, YouTube, and Google Trends for keyword opportunities around any topic.
  Analyzes demand signals and outputs a ranked report with scored keywords and suggested content ideas.
  Triggers on: "market research", "keyword research", "find keywords", "seo keywords", "article ideas".
allowed-tools:
  - Bash
  - Read
  - Write
  - Agent
---

# Market Research — Keyword & Demand Signal Analysis

Scrape multiple free sources for keyword opportunities around any topic, then analyze and rank them by demand score.

## Usage

```
/market-research date night ideas
/market-research "best laptops, gaming monitors"
/market-research --only "hoa management, property management"
```

## Instructions

When invoked, follow these steps:

### Step 1: Run the scraper

Run the keyword research script. Pass the user's seeds via `--only` (the most common case — research exactly what they asked for):

```bash
SCRIPT="node $CLAUDE_PLUGIN_ROOT/skills/market-research/keyword-research.js"

# Research specific topics
$SCRIPT --only "date night ideas, romantic restaurants"

# No args — use built-in default seeds
$SCRIPT
```

Pass the user's input directly as seeds. Do NOT append "tier list" or any other suffix — use the exact phrases the user provides.

The script scrapes:
- Google Autocomplete API (real-time search suggestions + alphabet expansion a-z)
- YouTube Autocomplete (video-heavy keyword signals)
- Google Related Searches (HTML extraction)
- Reddit post titles (relevance-sorted)
- Google Trends suggestions (filtered to relevant results)

It outputs (in the skill directory `$CLAUDE_PLUGIN_ROOT/skills/market-research/`):
- Raw keywords JSON: `keyword-research-raw-YYYY-MM-DD.json`
- Scored keywords JSON: `keyword-research-scored-YYYY-MM-DD.json`
- Console output with top 50 keywords by demand signal

### Step 2: Analyze the results

After the script runs, read the scored keywords JSON and the raw keywords JSON. Then provide the user with a comprehensive analysis:

1. **Top 10 Keyword Opportunities** — a table with:
   - Target keyword
   - Demand score (from the scored JSON)
   - Source count (how many independent sources surfaced it)
   - Search intent (informational, investigational, transactional)
   - Trend velocity (trending up/down/stable) and seasonal notes

2. **Detailed breakdown** for each of the top 10:
   - Suggested article/content title (SEO-optimized, under 60 chars)
   - Why this keyword is a good opportunity
   - Content strategy (what to cover, how to structure, where to promote)
   - SERP features likely present (featured snippet, video carousel, PAA, image pack)

3. **Quick wins** — lower-competition keywords that could gain traction quickly

4. **Content cluster strategy** — how to group related keywords into topic clusters with internal linking. Check for cannibalization: if multiple keywords target the same intent, group them under one URL

5. **Seasonality notes** — flag keywords with seasonal patterns and recommend optimal publish timing

6. **Recommended priority** — which content to create first based on effort vs. impact

### Step 3: Save the report

Save the full analysis as a markdown report at `$CLAUDE_PLUGIN_ROOT/skills/market-research/keyword-research-YYYY-MM-DD.md`.

### Important Notes

- **TARGET US / T1 AUDIENCES**: Optimize for US audiences primarily, and Tier 1 English-speaking countries (US, UK, Canada, Australia) secondarily.
- Keywords appearing in more independent sources (higher source count) indicate stronger real-world demand.
- Consider the user's existing content and business context when recommending opportunities.
- If some sources fail (rate limiting, etc.), the script continues gracefully — analyze whatever data is available.
