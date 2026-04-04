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

Uses the Playwright browser UI to fill in and submit comments directly via Reddit's comment composer. This is more reliable than API-based approaches (OAuth tokens, CSRF tokens, etc. frequently return 403).

## Implementation

When this skill is invoked:

1. **Parse the input**: Extract the Reddit URL and the comment text from the user's arguments.
   - The first argument is the URL (starts with `http`), everything after it is the comment or instruction.
   - If the comment text is an instruction (e.g. "say something sarcastic"), generate an appropriate comment first and show it to the user before posting.

2. **Post the comment** using this exact Playwright `browser_run_code` pattern. This is the proven approach — do NOT deviate or try API-based methods.

   **IMPORTANT — What works and what doesn't:**
   - DO use `browser_run_code` with the exact pattern below. It handles navigation, composer activation, filling, and submission in one call.
   - Do NOT try Reddit's API endpoints (`/api/comment`, `oauth.reddit.com`). They return 403 due to CSRF/auth issues from the browser context.
   - Do NOT try to manipulate the DOM directly via `innerHTML` or `dispatchEvent`. Reddit's Lexical editor doesn't pick up those changes.
   - Do NOT use `page.evaluate()` to find/click the textbox — it resolves but the element is often invisible inside shadow DOM. Use Playwright locators instead.
   - Do NOT take snapshots to find element refs — it wastes time. The locator selectors below are stable across Reddit posts.
   - Do NOT use `setTimeout` — use `page.waitForTimeout()` instead.

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

3. **For multiple posts**, repeat the pattern above in separate `browser_run_code` calls (one per post). Each call is self-contained with its own navigation. Do NOT try to batch them into a single call — if one fails it won't affect the others.

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
