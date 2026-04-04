---
name: reddit-reply
description: >
  Post a comment on a Reddit post using Playwright MCP. Provide a Reddit post URL
  and either an exact comment or a description of the tone/style you want. Supports
  direct comments and creative/sarcastic/themed replies. Triggers on: "reddit reply",
  "reddit comment", "post on reddit", "comment on reddit", or when user provides a
  Reddit URL with a comment request.
allowed-tools:
  - mcp__playwright__browser_navigate
  - mcp__playwright__browser_run_code
  - mcp__playwright__browser_snapshot
  - Bash
---

# Reddit Reply — Post Comments on Reddit Posts

Post comments on Reddit posts using the Playwright MCP browser session.

## Prerequisites

- Playwright MCP must be connected
- User must be logged into Reddit in the Playwright browser session
- If not logged in, navigate to https://www.reddit.com/login/ and have the user log in first

## Usage

```
/reddit-reply <reddit_post_url> <comment or description of what to say>
```

### Examples

```
/reddit-reply https://www.reddit.com/r/tierlists/comments/abc123/title/ Great list!
/reddit-reply https://www.reddit.com/r/gaming/comments/xyz789/title/ say something sarcastic about their ranking
```

## How It Works

1. Extract the post ID (`t3_xxxxx`) from the Reddit URL
2. Navigate to the post page via Playwright to ensure cookies are active
3. Extract the `token_v2` cookie from the Playwright browser context
4. Post the comment via Reddit's OAuth API (`https://oauth.reddit.com/api/comment`)
5. Verify the response (status 200, empty errors array = success)

## Implementation

When this skill is invoked:

1. **Parse the input**: Extract the Reddit URL and the comment text from the user's arguments.
   - The first argument is the URL (starts with `http`), everything after it is the comment or instruction.
   - If the comment text is an instruction (e.g. "say something sarcastic"), generate an appropriate comment first and show it to the user before posting.

2. **Extract post ID**: Parse the URL to get the post ID in `t3_xxxxx` format.
   - Pattern: `reddit.com/r/*/comments/<id>/` → `t3_<id>`

3. **Post the comment** using this Playwright browser_run_code pattern:

```javascript
async (page) => {
  await page.goto('<REDDIT_POST_URL>');
  await page.waitForTimeout(2000);

  const cookies = await page.context().cookies();
  const token = cookies.find(c => c.name === 'token_v2')?.value;

  if (!token) return 'NOT_LOGGED_IN';

  const comment = "<COMMENT_TEXT>";
  const body = 'thing_id=<POST_ID>&text=' + encodeURIComponent(comment) + '&api_type=json';

  const resp = await page.evaluate(async ({ token, body }) => {
    const r = await fetch('https://oauth.reddit.com/api/comment', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body,
    });
    return { status: r.status, body: (await r.text()).substring(0, 500) };
  }, { token, body });

  return JSON.stringify(resp);
}
```

4. **Handle results**:
   - Status 200 + empty errors = success. Tell the user the comment was posted.
   - `NOT_LOGGED_IN` = tell user to log into Reddit in the Playwright browser first.
   - Any errors = report them to the user.

## Writing Style — Sound Human, Not AI

When generating comments (not when the user provides exact text), follow these rules strictly:

**DO NOT use:**
- Em dashes (—) or en dashes (–). Use commas, periods, or just start a new sentence instead.
- Semicolons. Regular people don't use semicolons on Reddit.
- "Furthermore", "moreover", "additionally", "essentially", "arguably", "notably"
- "I'd recommend", "Worth noting", "That said"
- Overly structured or formatted responses
- Perfect grammar and punctuation. It's Reddit, be casual.
- Exclamation marks on every sentence. One max per comment, if any.
- Starting with "Great question!" or "Love this!" or similar sycophantic openers

**DO use:**
- Short, punchy sentences. Like how people actually type on Reddit.
- Lowercase where natural (dont need to capitalize everything)
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

## Other Notes

- The comment is posted from whatever Reddit account is logged in to the Playwright browser
- Reddit rate limits apply — if you get a 429, wait and retry
