---
name: narrate
description: >
  Toggle spoken summaries of Claude's responses via macOS text-to-speech (macOS only).
  When ON, a Stop hook reads aloud a short summary of each completed turn using the `say`
  command. Enabling it is opt-in and self-contained — it installs a Stop hook into the
  user's own settings; the plugin ships no global hook. Use when the user says "/narrate",
  "/narrate on", "/narrate off", "narrate on", "narrate off", "narrate my responses",
  "speak my responses", "read responses out loud", "voice on/off", "mute the voice",
  "set the narration voice", "stop narrating", "set a personality", "make it funny",
  "narrate in a funny/serious/sarcastic tone", or "change how it talks".
---

# /narrate — speak a summary when Claude finishes (macOS)

`/narrate` is the on/off switch and config front-end for a macOS text-to-speech feature.
When enabled, a **Stop hook** (`scripts/speak-on-stop.sh`) fires every time Claude
completes a turn, extracts Claude's final message from the session transcript, strips
markdown, trims it to a short sentence-bounded summary, and speaks it aloud via `say`.

The skill does **not** speak — only the Stop hook can (the harness fires it on turn
completion). This skill manages the toggle, the voice, and the hook install.

**Opt-in, no global hook.** This plugin stays skill-only: it ships *no* hook. Running
`/narrate on` copies the engine to a stable path (`~/.claude/narrate-engine.sh`) and
merges a Stop hook into the **invoking user's own** `~/.claude/settings.json`. Nothing
runs for anyone who never enables it. macOS only — a clean no-op elsewhere.

## How to handle the invocation

The text after `/narrate` is in `$ARGUMENTS` (e.g. `on`, `off`, `voice Ava (Premium)`).
Run the bundled control script and report its output to the user:

```bash
"$CLAUDE_PLUGIN_ROOT/skills/narrate/scripts/narrate" $ARGUMENTS
```

- No argument → run `narrate status`.
- `on` → install + enable (writes the Stop hook into the user's settings). Tell the user
  that if `settings.json` did not already exist this session, they may need to open
  `/hooks` once or restart so the settings watcher picks it up.
- `off` → mute (leaves the hook installed but inert).
- `status` → show state, voice, length cap, engine-install + hook-wiring status.
- `voice <name>` → set the voice. **Pass multi-word voice names as one quoted arg**, e.g.
  `"$CLAUDE_PLUGIN_ROOT/skills/narrate/scripts/narrate" voice "Ava (Premium)"`.
- `voices` → list installed English voices.
- `length <n>` → max characters spoken per turn (default 300).
- `personality <tone>` → set the spoken tone (`funny`, `serious`, `pirate`, or any free
  text); `off` for verbatim. Each line is rewritten in that tone by Apple's on-device
  model. **Pass multi-word tones as one quoted arg.** First use compiles the helper.
- `build` → (re)compile the on-device rewrite helper.
- `test` → speak a sample line now (in the current personality).
- `uninstall` → remove the Stop hook, engine, and rewriter entirely.

Keep your spoken reply short — the Stop hook will read the start of it aloud.

## Notes

- Speaks on **every** completed turn, including quick answers. `/narrate off` mutes it.
- Voice defaults to **Samantha** (best built-in). For neural quality, download a
  **Premium** voice (System Settings → Accessibility → Spoken Content → Manage Voices),
  then `/narrate voice "Ava (Premium)"`. Siri voices are not accessible to `say`.
- **Personalities** rewrite each spoken line in a chosen tone using Apple's **on-device
  Foundation model** (Apple Intelligence) — free, local, ~0.5s, no API key. The shipped
  Swift helper (`scripts/narrate-rewrite.swift`) is compiled on first use to
  `~/.claude/narrate-rewrite`. Needs macOS 26 + Apple Intelligence enabled + `swiftc`
  (Xcode Command Line Tools); without those, personalities cleanly fall back to verbatim.
  It's a small (~3B) model, so it paraphrases in tone rather than transcribing exactly.
- Config lives at `~/.claude/narrate.enabled` (toggle), `~/.claude/narrate.voice`,
  `~/.claude/narrate.maxchars`, `~/.claude/narrate.personality`. Engine copy at
  `~/.claude/narrate-engine.sh`; rewriter at `~/.claude/narrate-rewrite`.
- Requires `jq` (used to merge the hook and parse the transcript).
