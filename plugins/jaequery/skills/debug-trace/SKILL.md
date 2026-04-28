---
name: debug-trace
description: >
  Cursor-style runtime instrumentation debugger. Spins up a local HTTP daemon,
  injects fire-and-forget HTTP probes into the user's source code at suspect
  sites, captures runtime values as the program runs, reads them back, and
  iterates toward a fix — then removes every probe before exiting. Language-
  agnostic: picks the right HTTP-call idiom (fetch / requests.post / curl /
  net/http / Net::HTTP / etc.) per file. Use when the user says
  "/debug-trace", "instrument and run", "trace these values", "cursor-style
  debug", "inject debug logs", "find this bug by tracing values", "log
  runtime values to find this bug", or wants AI-driven print-debugging that
  cleans up after itself.
---

# debug-trace

## Mental model
A thin, auditable orchestrator around a tiny localhost daemon.

- **Instrumentation is plain source edits** — no AST tooling, no agents, no
  hidden state. Every probe is wrapped in unique marker comments so removal
  is `grep + Edit`.
- **Probes are fire-and-forget** — if the daemon dies or the port is wrong,
  the user's program must still run unchanged. Never throw, never await
  blocking, never alter return values.
- **Cleanup is a hard invariant** — at session end, `git grep '@debug-trace:'`
  MUST return empty. Treat this with the same severity as "don't commit
  secrets."

This skill is the *instrumentation* loop. `/gsd-debug` is the *reasoning*
loop (scientific method, hypothesis state). They compose; this one runs
inside the other when you need ground-truth runtime values.

## Daemon protocol

Daemon: `scripts/daemon.js` (zero-deps Node, loopback-only).

| Method | Path        | Purpose                                                      |
|--------|-------------|--------------------------------------------------------------|
| GET    | `/health`   | `{ok, port, count}`                                          |
| POST   | `/log`      | Append JSON line to `.debug-trace/log.jsonl`                 |
| GET    | `/dump`     | Stream the JSONL file                                        |
| POST   | `/clear`    | Truncate the log                                             |
| POST   | `/shutdown` | Graceful exit                                                |

Probe payload (recommended shape):
```json
{ "trace_id": "<uuid>", "label": "user.id after auth", "value": <any>, "file": "src/auth.ts", "line": 42 }
```
The daemon adds `ts` server-side. Body cap 1MB. Log auto-rotates at 10k lines.
Non-loopback connections are refused.

## Injection rules

1. **Marker comments** — every probe is wrapped in unique markers using the
   target file's native comment syntax. UUID is per-probe so removal is
   trivial:
   ```js
   /* @debug-trace:7f3a */
   fetch(`http://127.0.0.1:${PORT}/log`, {method:'POST', body: JSON.stringify({trace_id:'7f3a', label:'user after auth', value:user})}).catch(()=>{});
   /* @/debug-trace:7f3a */
   ```
2. **Fire-and-forget per language** — pick the idiom; all variants must be
   silent on failure and must NOT block program flow:

   | Language    | Idiom                                                                                         |
   |-------------|-----------------------------------------------------------------------------------------------|
   | JS / TS     | `fetch(url,{method:'POST',body:JSON.stringify(p)}).catch(()=>{})`                              |
   | Python      | `try:\n    import urllib.request,json\n    urllib.request.urlopen(urllib.request.Request(url,data=json.dumps(p).encode(),headers={'content-type':'application/json'}),timeout=0.2)\nexcept Exception: pass` |
   | Go          | `go func(){ b,_:=json.Marshal(p); http.Post(url,"application/json",bytes.NewReader(b)) }()`   |
   | Ruby        | `begin; require 'net/http'; Net::HTTP.post(URI(url), p.to_json, 'content-type'=>'application/json'); rescue; end` |
   | Java/Kotlin | Wrap `HttpURLConnection.POST` in `try{}catch(Throwable t){}`                                  |
   | Shell       | `curl -s -m 1 -XPOST -d "$P" "$URL" >/dev/null 2>&1 \|\| true`                                |
   | Rust        | Spawn tokio task with `reqwest::Client::new().post(url).json(&p).send()`; ignore `Result`     |
   | C / C++     | Prefer `popen("curl ...")`; never link a new dep                                              |

3. **Port discovery** — read the port at probe time:
   - JS bundlers won't have process.env at runtime in the browser; for
     browser code, hardcode `http://127.0.0.1:<PORT>` after reading
     `.debug-trace/port`.
   - For Node/Python/Go/etc., either hardcode the port literal into each
     probe (simplest, since probes are short-lived), or read
     `.debug-trace/port` at module import.

4. **Don't break the program**:
   - No probes inside hot loops without sampling (e.g. `if (i % 1000 === 0)`).
   - No probes that depend on async runtime before it's available.
   - No probes that change evaluation order (don't unwrap promises, don't
     stringify objects with custom `toJSON` side-effects — pre-compute a
     plain shape).
   - In typed languages, ensure the probe block is statement-level, not
     expression-level (don't wedge it inside a ternary).

5. **Stable labels** — the `label` is what you'll grep the dump by. Make it
   human-meaningful: `"orderTotal before discount"`, not `"x"`.

## Lifecycle (run this loop in-session)

1. **Pre-flight cleanup check** — `git grep -n '@debug-trace:' || true`. If
   matches exist from a prior aborted session, offer to remove them before
   anything else.
2. **Start daemon** in the background:
   ```bash
   node "$CLAUDE_PLUGIN_ROOT/skills/debug-trace/scripts/daemon.js" >/tmp/debug-trace.out 2>&1 &
   ```
   (Or resolve the script path relative to this SKILL.md if `$CLAUDE_PLUGIN_ROOT`
   isn't set — `plugins/jaequery/skills/debug-trace/scripts/daemon.js`.)
3. **Wait for ready** — poll `.debug-trace/port` (≤ 1s), then
   `curl -s localhost:$(cat .debug-trace/port)/health`.
4. **Identify suspect sites** from the bug description. State your hypothesis
   in one sentence before instrumenting — this is what the values will
   confirm or refute.
5. **Insert probes** with marker comments via the Edit tool. Generate a fresh
   short UUID per probe. Keep probes <10 per round; add more after reading
   the first dump.
6. **Run the failing scenario** — either ask the user to run their normal
   command, or run it via Bash if it's headless. Wait for it to finish (or
   reproduce the bug).
7. **Read the dump** — `curl -s localhost:$PORT/dump`. Parse line-by-line.
   Compare actual vs expected per label.
8. **Iterate** — narrow the search (more probes near the divergence) or
   jump to fix. Use `POST /clear` between rounds to keep dumps focused.
9. **Cleanup (mandatory)** —
   ```bash
   # remove every probe block
   git grep -l '@debug-trace:' | while read f; do
     # hand off to Edit tool per file: delete each marker pair and the lines between
   done
   git grep '@debug-trace:'   # MUST be empty
   curl -s -XPOST localhost:$PORT/shutdown
   rm -rf .debug-trace
   ```
10. **Report** — summarize what you found, what you changed, and confirm
    `git grep '@debug-trace:'` is empty.

## Cleanup contract (non-negotiable)

- **Never** end your turn with markers still present in the working tree.
- If the user interrupts mid-loop, your *first* action on the next
  invocation of this skill is to scan for and remove orphan markers.
- Never `git add` while markers exist. If the user asks to commit during a
  trace session, refuse and clean up first.
- Marker syntax is fixed: `@debug-trace:<uuid>` opening and
  `@/debug-trace:<uuid>` closing. Don't invent variants — the cleanup grep
  depends on exact strings.

## Failure modes & how to handle

- **Port already taken** — daemon binds `:0`, kernel picks free; just read
  `.debug-trace/port`.
- **Daemon crashed mid-run** — probes silently no-op, program still runs.
  Restart daemon, lose nothing but the unflushed values.
- **Probes ended up in committed code** — loud warning to user, immediate
  cleanup pass, recommend `git revert` of the offending commit if pushed.
- **Browser code can't reach `127.0.0.1`** — works in dev, fails behind
  CORS/CSP. Document the limitation; fall back to `console.error` with a
  unique tag and tail the browser console instead.
- **Sandboxed runtime (no network)** — fall back to `console.error` /
  `print` with a recognizable prefix; `tail -f` the log file.

## Out of scope
- No DAP / breakpoint integration.
- No persistent log history across sessions — `.debug-trace/` is ephemeral.
- No remote / non-loopback daemon.
- No automatic fix application — propose the fix, let the user accept.
