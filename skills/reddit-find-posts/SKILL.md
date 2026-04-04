---
name: reddit-find-posts
description: >
  Find relevant Reddit posts based on a natural language prompt. Searches Reddit's
  JSON API across AI-suggested subreddits and returns ranked results with URLs,
  scores, and comment counts. Triggers on: "reddit find", "find reddit posts",
  "search reddit", "reddit search", or when user asks to find discussions on Reddit.
allowed-tools:
  - Bash
---

# Reddit Find Posts — Search Reddit for Relevant Discussions

Find Reddit posts matching a natural language prompt using Reddit's public JSON API.

## Usage

```
/reddit-find-posts <natural language prompt>
```

### Examples

```
/reddit-find-posts find posts where people are talking about how they created a tier list
/reddit-find-posts people asking for recommendations on ranking tools
/reddit-find-posts discussions about building in public and early revenue
```

## Implementation

When this skill is invoked:

1. **Analyze the prompt**: Understand what the user is looking for and generate:
   - 2-3 concise search queries to use with Reddit's search API
   - 5-10 relevant subreddit names to search within

2. **Search Reddit** using `curl` via Bash and the public JSON API (no auth needed).

**Why curl instead of Playwright:** curl is faster, doesn't get rate limited as easily (Playwright shares a browser session that accumulates 429s across searches), and avoids CORS issues entirely. Save Playwright for posting comments only.

For each subreddit + query combination, fetch results:
```
https://www.reddit.com/r/{subreddit}/search.json?q={query}&restrict_sr=1&sort=new&t=week&limit=10
```

If searching across all of Reddit (no specific subreddit):
```
https://www.reddit.com/search.json?q={query}&sort=new&t=week&limit=15
```

**Default: sort by `new`, time filter `week`.** After fetching, filter results to only include posts from the last 3 days (compare `created_utc` against current time). If the user explicitly asks for older posts, adjust the time filter accordingly (`t=month`, `t=year`, `t=all`).

3. **Use a Python script via Bash** to execute all searches, deduplicate, and return results:

```bash
python3 << 'PYEOF'
import json, urllib.request, urllib.parse, time

results = []
queries = ["query1", "query2", "query3"]
subreddits = ["sub1", "sub2", "sub3"]

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "RedditSearch/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
            for c in data.get("data",{}).get("children",[]):
                d = c["data"]
                results.append({"subreddit": d["subreddit"], "title": d["title"], "score": d["score"],
                    "num_comments": d["num_comments"], "permalink": "https://reddit.com" + d["permalink"],
                    "selftext": d.get("selftext","")[:200], "created_utc": d["created_utc"], "author": d["author"]})
    except: pass

for q in queries:
    fetch(f"https://www.reddit.com/search.json?q={urllib.parse.quote(q)}&sort=new&t=week&limit=15")
    time.sleep(0.6)
    for sub in subreddits:
        fetch(f"https://www.reddit.com/r/{sub}/search.json?q={urllib.parse.quote(q)}&restrict_sr=1&sort=new&t=week&limit=10")
        time.sleep(0.6)

# Filter to last 3 days, deduplicate, sort newest first
import time as t
three_days_ago = t.time() - (3 * 24 * 60 * 60)
recent = [p for p in results if p["created_utc"] >= three_days_ago]
seen = set()
unique = []
for p in recent:
    if p["permalink"] not in seen:
        seen.add(p["permalink"])
        unique.append(p)
unique.sort(key=lambda x: x["created_utc"], reverse=True)
print(json.dumps(unique[:25], indent=2))
PYEOF
```

4. **Present results** in a clean format:

```
## Reddit Posts Found

1. [r/subreddit] Post Title
   ⬆ 123  💬 45  📅 2024-01-15  👤 username
   https://reddit.com/r/subreddit/comments/...
   "Preview of post text..."

2. ...
```

5. **Filter for relevance**: After getting results, review titles and preview text. Only show posts that actually match what the user asked for. If a post is borderline relevant, include it but note why.

## Tips

- For broad topics, search all of Reddit first, then drill into specific subreddits
- Use multiple search queries with different phrasings to cast a wider net
- Reddit's search API is limited — if results are poor, try different query terms
- Time filter options: hour, day, week, month, year, all
- Sort options: relevance, hot, top, new, comments
- Add a 600ms delay between requests to avoid rate limiting
