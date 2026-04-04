---
name: marketing-reddit
description: >
  Find relevant Reddit posts, leave comments on them, or create new threads/posts.
  Searches Reddit's JSON API across AI-suggested subreddits and returns ranked results.
  Can post comments on existing posts or create new threads via Playwright MCP.
  Triggers on: "reddit find", "find reddit posts", "search reddit", "reddit search",
  "reddit reply", "reddit comment", "post on reddit", "comment on reddit",
  "create reddit post", "new reddit thread", "submit to reddit",
  or when user provides a Reddit URL with a comment request.
allowed-tools:
  - Bash
  - mcp__playwright__browser_navigate
  - mcp__playwright__browser_run_code
  - mcp__playwright__browser_snapshot
---

# Reddit — Find Posts, Comment, or Create Threads

Find Reddit posts matching a natural language prompt, leave comments on them, or create new threads in subreddits.

## Usage

```
/marketing-reddit <natural language prompt>
/marketing-reddit <natural language prompt> and comment <what to say>
/marketing-reddit <reddit_post_url> <comment or description of what to say>
/marketing-reddit post to r/<subreddit> <title and body or description>
/marketing-reddit create thread in r/<subreddit> about <topic>
```

### Examples

```
/marketing-reddit find posts where people are talking about how they created a tier list
/marketing-reddit people asking for recommendations on ranking tools
/marketing-reddit discussions about building in public and early revenue
/marketing-reddit https://www.reddit.com/r/tierlists/comments/abc123/title/ Great list!
/marketing-reddit post to r/webdev asking what ai website builders people are using
/marketing-reddit create thread in r/SideProject about my new ai tool
```

## Detecting Intent

Before executing, determine which action the user wants:

1. **Find posts only** — user says "find", "search", "look for", or just describes a topic with no mention of commenting or posting
2. **Find posts + comment** — user says "comment", "reply", "leave a comment", or "and say..."
3. **Comment on a specific URL** — user provides a reddit.com URL with comment text
4. **Create a new thread** — user says "post to", "create thread", "submit to", "new post in", "make a post", or names a specific subreddit with content to post

If ambiguous, ask the user to clarify whether they want to comment on existing posts or create a new thread.

## Part 1: Finding Posts

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

## Part 2: Commenting (Optional)

Only post comments if the user explicitly asks to comment/reply. If the user just wants to find posts, stop after Part 1.

### Prerequisites

- Playwright MCP must be connected
- User must be logged into Reddit in the Playwright browser session
- If not logged in, navigate to https://www.reddit.com/login/ and have the user log in first

### How It Works

Uses the Playwright browser UI to fill in and submit comments directly via Reddit's comment composer. This is more reliable than API-based approaches (OAuth tokens, CSRF tokens, etc. frequently return 403).

### Posting Comments

1. **Parse the input**: Extract the Reddit URL and the comment text.
   - If the comment text is an instruction (e.g. "say something sarcastic"), generate an appropriate comment first and show it to the user before posting.

2. **Post the comment** using this exact Playwright `browser_run_code` pattern. This is the proven approach, do NOT deviate or try API-based methods.

   **IMPORTANT, what works and what doesn't:**
   - DO use `browser_run_code` with the exact pattern below. It handles navigation, composer activation, filling, and submission in one call.
   - Do NOT try Reddit's API endpoints (`/api/comment`, `oauth.reddit.com`). They return 403 due to CSRF/auth issues from the browser context.
   - Do NOT try to manipulate the DOM directly via `innerHTML` or `dispatchEvent`. Reddit's Lexical editor doesn't pick up those changes.
   - Do NOT use `page.evaluate()` to find/click the textbox, it resolves but the element is often invisible inside shadow DOM. Use Playwright locators instead.
   - Do NOT take snapshots to find element refs, it wastes time. The locator selectors below are stable across Reddit posts.
   - Do NOT use `setTimeout`, use `page.waitForTimeout()` instead.

```javascript
async (page) => {
  const url = '<REDDIT_POST_URL>';
  const comment = '<COMMENT_TEXT>';

  // Step 1: Navigate and wait for full page load
  await page.goto(url);
  await page.waitForTimeout(3000);

  // Step 2: Get the post title and date for the summary
  const title = await page.locator('h1[id^="post-title"]').first().textContent().catch(() => 
    page.title().then(t => t.replace(/ : r\/.*$/, ''))
  );
  const postDate = await page.locator('time').first().getAttribute('datetime').catch(() => 'unknown');

  // Step 3: Click the "Join the conversation" textbox to activate the composer
  // MUST use #main-content scoping to avoid hitting the search textbox.
  const tb = page.locator('#main-content').getByRole('textbox');
  await tb.click();
  await page.waitForTimeout(1000);

  // Step 4: Fill the now-visible composer textbox
  const composer = page.locator('div[role="textbox"][aria-placeholder="Join the conversation"]');
  await composer.fill(comment);
  await page.waitForTimeout(500);

  // Step 5: Click the Comment button to submit
  await page.getByRole('button', { name: 'Comment', exact: true }).click();
  await page.waitForTimeout(2000);

  // Step 6: Return structured result for the summary
  return JSON.stringify({ title, url, comment, date: postDate });
}
```

3. **For multiple posts**, repeat the pattern above in separate `browser_run_code` calls (one per post). Each call is self-contained with its own navigation. Do NOT try to batch them into a single call, if one fails it won't affect the others.

   **CRITICAL: Tailor each comment to the specific post.** When commenting on multiple posts, NEVER copy-paste the same comment across all of them. Instead:
   - Read the post title and body text (available from the search results or the page itself)
   - Write a unique comment that responds to what that specific post is about
   - Reference details from the post so it feels like a natural reply to that conversation
   - The user's core message/question should be woven in naturally, not pasted verbatim
   
   For example, if the user wants to ask "Berkeley DS or CMU IS?" across multiple posts:
   - On a post about CMU vs GT: "im deciding between schools too but different programs, got into CMU for IS and Berkeley for DS. leaning CMU but the berkeley campus is hard to pass up lol. what made you lean toward CMU?"
   - On a post about Berkeley data science: "also got into berkeley DS! but im torn bc i also got into CMU for information systems. do you think DS at berkeley sets you up well for tech jobs or is it too theoretical?"
   - On a post about CS career advice: "kind of related, im choosing between berkeley DS and CMU IS right now. im mostly a vibe coder so idk which program fits better for someone who codes but isnt super into theory"

4. **Handle results**:
   - If `browser_run_code` returns without error, the comment was posted successfully.
   - If the textbox click times out, the user may not be logged in. Navigate to `https://www.reddit.com/login/` and ask them to log in.
   - If you get rate limited (429 or posting fails), wait 30 seconds before retrying.

5. **Show a summary after all comments are posted.** Parse the JSON returned by each `browser_run_code` call and display a table like this:

```
## Comments Posted

| # | Post | Date | Comment |
|---|------|------|---------|
| 1 | [Post Title](url) | Apr 4, 2026 | The actual comment text that was left |
| 2 | [Post Title](url) | Apr 3, 2026 | The actual comment text that was left |
```

Always show the actual comment text, not a description of it. The date is when the original post was created (parsed from the `datetime` attribute on the `<time>` element). This lets the user verify exactly what was posted and when.

## Writing Style — Sound Human, Not AI

When generating comments (not when the user provides exact text), follow these rules strictly:

**DO NOT use:**
- Any dashes at all. No em dashes, en dashes, or hyphens used as punctuation. Use commas, periods, or just start a new sentence instead.
- Capital letters. Everything should be lowercase, including the first word of sentences. Never capitalize anything.
- Semicolons. Regular people don't use semicolons on Reddit.
- "Furthermore", "moreover", "additionally", "essentially", "arguably", "notably"
- "I'd recommend", "Worth noting", "That said"
- Overly structured or formatted responses
- Perfect grammar and punctuation. It's Reddit, be casual.
- Exclamation marks on every sentence. One max per comment, if any.
- Starting with "Great question!" or "Love this!" or similar sycophantic openers

**DO use:**
- Short, punchy sentences. Like how people actually type on Reddit.
- All lowercase, always. never capitalize anything, not even the first word of a sentence
- Common Reddit slang/tone: "honestly", "ngl", "tbh", "lol", "haha"
- Occasional typos or informal spelling are fine
- First person anecdotes. "we tried X and it was solid" not "I would suggest trying X"
- One main point per comment. Don't cover 5 things.

**Examples of BAD (AI-sounding) comments:**
- "That's a really interesting perspective — I'd suggest checking out datebooq.com for some creative alternatives!"
- "Great list! I stumbled upon datebooq.com a while back, and it's been surprisingly helpful for finding low-key activities we wouldn't have considered on our own."

**Examples of GOOD (human-sounding) comments:**
- "we had the same problem lol. started using datebooq.com for ideas and its been pretty solid honestly"
- "oh man this is so relatable. check out datebooq.com, they got some good ones on there"
- "been there. datebooq.com helped us out when we were stuck in the same dinner and movie loop"

## Part 3: Creating New Threads (Optional)

Only create new threads if the user explicitly asks to post/submit/create a thread. Do NOT create threads when the user asks to "comment" or "reply".

### Prerequisites

Same as Part 2: Playwright MCP connected, user logged into Reddit.

### How It Works

Uses Playwright to navigate to the subreddit's submit page and fill in the post form.

### Creating a Thread

1. **Parse the input**: Extract the target subreddit, post title, and body text.
   - If the user gives a description/instruction (e.g. "post asking about ai tools"), generate an appropriate title and body first and show them to the user for approval before posting.
   - The same human writing style rules from Part 2 apply to generated thread titles and bodies.

   **CRITICAL: Tailor each thread to the specific subreddit.** When posting to multiple subreddits, NEVER use the same title and body across all of them. Instead:
   - Read the subreddit's culture and typical post style (e.g. r/startups is founder focused, r/cscareerquestions is career focused, r/Entrepreneur is business focused)
   - Write a unique title and body that fits naturally in that specific community
   - Reference the subreddit's typical concerns and language so it reads like a native post
   - The user's core question should be woven in naturally, adapted to the subreddit's context
   
   For example, if the user wants to ask "where to find startup jobs" across subreddits:
   - r/startups: "whats the best way to find early stage startup roles right now" with body about wanting to join as an early employee and build something
   - r/cscareerquestions: "anyone here go from big tech to a startup, how did you find the role" with body about career transition and where to look
   - r/Entrepreneur: "hiring for my startup is tough, where do founders actually post jobs" with body flipped to the founder perspective to get answers from the other side

2. **Create the thread** using this Playwright `browser_run_code` pattern:

```javascript
async (page) => {
  const subreddit = '<SUBREDDIT_NAME>';
  const title = '<POST_TITLE>';
  const body = '<POST_BODY>';

  // Step 1: Navigate to the subreddit submit page
  await page.goto(`https://www.reddit.com/r/${subreddit}/submit`);
  await page.waitForTimeout(3000);

  // Step 2: Make sure we're on the Text tab (not image/link/poll)
  const textTab = page.locator('button, a').filter({ hasText: /^Text$/ }).first();
  await textTab.click().catch(() => {});
  await page.waitForTimeout(500);

  // Step 3: Fill in the title
  const titleInput = page.locator('#main-content').getByRole('textbox').first();
  await titleInput.click();
  await titleInput.fill(title);
  await page.waitForTimeout(500);

  // Step 4: Fill in the body
  // The body textbox is typically the second textbox or has a specific placeholder
  const bodyBox = page.locator('div[role="textbox"][contenteditable="true"]').first();
  await bodyBox.click();
  await bodyBox.fill(body);
  await page.waitForTimeout(500);

  // Step 5: Click the Post/Submit button
  const postBtn = page.getByRole('button', { name: /^Post$/i }).first();
  await postBtn.click();
  await page.waitForTimeout(3000);

  // Step 6: Get the URL of the newly created post
  const newUrl = page.url();

  return JSON.stringify({ subreddit, title, body, url: newUrl });
}
```

3. **If the submit page layout doesn't match** (Reddit changes their UI), fall back to taking a snapshot and adapting selectors. But try the pattern above first.

4. **Handle results**:
   - If the page URL changed to a `/comments/` URL after clicking Post, the thread was created successfully.
   - If the user isn't logged in, the submit page will redirect to login. Navigate to `https://www.reddit.com/login/` and ask the user to log in.
   - If the subreddit requires flair, a modal may appear. Take a snapshot and select the most appropriate flair, or ask the user.
   - Some subreddits restrict posting (karma requirements, approved submitters only). If posting fails, inform the user.

5. **Show a summary after the thread is created:**

```
## Thread Created

| Subreddit | Title | Post Body/Message | URL |
|-----------|-------|-------------------|-----|
| r/webdev | post title here | the full post body text | https://reddit.com/r/webdev/comments/... |
```

## Tips

- For broad topics, search all of Reddit first, then drill into specific subreddits
- Use multiple search queries with different phrasings to cast a wider net
- Reddit's search API is limited, if results are poor, try different query terms
- Time filter options: hour, day, week, month, year, all
- Sort options: relevance, hot, top, new, comments
- Add a 600ms delay between requests to avoid rate limiting
- **Focus queries on the topic's subreddits first.** Generic cross-Reddit searches return a lot of noise. If the user asks about "CS at Berkeley", search r/berkeley and r/csMajors directly, don't waste queries on global search with vague terms.
- **Filter aggressively for relevance.** After fetching, check titles and selftext against the user's actual intent. Drop posts that only match on common words. Show 5-10 high-quality matches rather than 25 weak ones.
- The comment is posted from whatever Reddit account is logged in to the Playwright browser
- Reddit rate limits apply, if you get a 429, wait and retry
