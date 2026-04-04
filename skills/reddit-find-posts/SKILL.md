---
name: reddit-find-posts
description: >
  Find relevant Reddit posts based on a natural language prompt. Searches Reddit's
  JSON API across AI-suggested subreddits and returns ranked results with URLs,
  scores, and comment counts. Triggers on: "reddit find", "find reddit posts",
  "search reddit", "reddit search", or when user asks to find discussions on Reddit.
allowed-tools:
  - mcp__playwright__browser_run_code
  - mcp__playwright__browser_navigate
  - Bash
  - WebFetch
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

2. **Search Reddit** using the public JSON API (no auth needed). For each subreddit + query combination, fetch results:

```
https://www.reddit.com/r/{subreddit}/search.json?q={query}&restrict_sr=1&sort=relevance&t=year&limit=10
```

Use a `User-Agent: RedditSearch/1.0` header. Add a 500ms delay between requests to avoid rate limiting.

If searching across all of Reddit (no specific subreddit):
```
https://www.reddit.com/search.json?q={query}&sort=relevance&t=year&limit=15
```

3. **Use Playwright browser_run_code** to execute the searches (this avoids CORS issues):

```javascript
async (page) => {
  const results = [];
  const subreddits = ['sub1', 'sub2', ...];
  const queries = ['query1', 'query2'];
  
  for (const query of queries) {
    // Search across all of Reddit first
    const allUrl = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=relevance&t=year&limit=15`;
    const allResp = await page.evaluate(async (url) => {
      const r = await fetch(url, { headers: { 'User-Agent': 'RedditSearch/1.0' } });
      if (!r.ok) return [];
      const data = await r.json();
      return (data?.data?.children ?? []).map(c => ({
        subreddit: c.data.subreddit,
        title: c.data.title,
        score: c.data.score,
        num_comments: c.data.num_comments,
        permalink: 'https://reddit.com' + c.data.permalink,
        selftext: (c.data.selftext || '').slice(0, 200),
        created_utc: c.data.created_utc,
        author: c.data.author,
      }));
    }, allUrl);
    results.push(...allResp);

    // Then search specific subreddits
    for (const sub of subreddits) {
      const url = `https://www.reddit.com/r/${sub}/search.json?q=${encodeURIComponent(query)}&restrict_sr=1&sort=relevance&t=year&limit=10`;
      const resp = await page.evaluate(async (url) => {
        const r = await fetch(url, { headers: { 'User-Agent': 'RedditSearch/1.0' } });
        if (!r.ok) return [];
        const data = await r.json();
        return (data?.data?.children ?? []).map(c => ({
          subreddit: c.data.subreddit,
          title: c.data.title,
          score: c.data.score,
          num_comments: c.data.num_comments,
          permalink: 'https://reddit.com' + c.data.permalink,
          selftext: (c.data.selftext || '').slice(0, 200),
          created_utc: c.data.created_utc,
          author: c.data.author,
        }));
      }, url);
      results.push(...resp);
      await new Promise(r => setTimeout(r, 500));
    }
  }
  
  // Deduplicate by permalink and sort by score
  const seen = new Set();
  const unique = results.filter(p => {
    if (seen.has(p.permalink)) return false;
    seen.add(p.permalink);
    return true;
  });
  unique.sort((a, b) => b.score - a.score);
  return JSON.stringify(unique.slice(0, 25));
}
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
