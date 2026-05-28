#!/usr/bin/env bash
# speak-on-stop.sh — Stop hook engine for the /narrate skill (macOS).
# When Claude finishes a turn, speak a short summary of its final message aloud
# via macOS `say`. macOS only; a clean no-op anywhere `say` is absent.
#
# Toggle (global on/off): presence of  ~/.claude/narrate.enabled
# Voice override:         contents of   ~/.claude/narrate.voice         (default: Samantha)
# Length cap (chars):     contents of   ~/.claude/narrate.maxchars      (default: 300)
# Personality/tone:       contents of   ~/.claude/narrate.personality   (e.g. "funny";
#                         empty = verbatim. Rewritten via the on-device Apple model,
#                         a sibling binary `narrate-rewrite` next to this script.)
# Installed + managed by the /narrate skill's `narrate` control script.

TOGGLE="$HOME/.claude/narrate.enabled"
[ -f "$TOGGLE" ] || exit 0                       # toggled off → stay silent
command -v say >/dev/null 2>&1 || exit 0         # not macOS / no TTS → no-op

payload="$(cat)"

# The Stop payload points at the session transcript (JSONL).
transcript="$(printf '%s' "$payload" | jq -r '.transcript_path // ""' 2>/dev/null)"
{ [ -n "$transcript" ] && [ -f "$transcript" ]; } || exit 0

# Walk the transcript newest-first; grab the most recent assistant message
# that actually contains text (skips trailing tool-use / tool-result lines).
raw=""
while IFS= read -r line; do
  t="$(printf '%s' "$line" | jq -r '
        select(.type=="assistant")
        | .message.content
        | if   type=="array"  then [ .[] | select(.type=="text") | .text ] | join("\n")
          elif type=="string" then .
          else "" end' 2>/dev/null)"
  if [ -n "$t" ] && [ "$t" != "null" ]; then raw="$t"; break; fi
done < <(tail -r "$transcript" 2>/dev/null)

[ -n "$raw" ] || exit 0

# Strip markdown/code so TTS reads cleanly (drop fenced code blocks entirely;
# keep inline-code words and link text, drop URLs and markup chars).
clean="$(printf '%s' "$raw" \
  | sed -e '/```/,/```/d' \
  | sed -E 's/\[([^]]*)\]\([^)]*\)/\1/g; s/[*_#>`|]//g' \
  | tr '\n' ' ' \
  | sed -E 's/  +/ /g; s/^ //; s/ $//')"
[ -n "$clean" ] || exit 0

# De-dupe on the source message: never narrate the same turn twice (e.g. Stop
# firing again on resume) — and skip the rewrite call entirely on repeats.
STATE="$HOME/.claude/.narrate.last"
hash="$(printf '%s' "$clean" | md5 -q 2>/dev/null || printf '%s' "$clean" | md5sum 2>/dev/null | cut -d' ' -f1)"
[ -n "$hash" ] && [ "$(cat "$STATE" 2>/dev/null)" = "$hash" ] && exit 0
printf '%s' "$hash" > "$STATE"

voice="$(cat "$HOME/.claude/narrate.voice" 2>/dev/null)";       [ -n "$voice" ] || voice="Samantha"
max="$(cat "$HOME/.claude/narrate.maxchars" 2>/dev/null)";      [ -n "$max" ]   || max=300
personality="$(cat "$HOME/.claude/narrate.personality" 2>/dev/null)"
REWRITE="$(cd "$(dirname "$0")" && pwd)/narrate-rewrite"

# Trim verbatim to a sentence boundary within the char cap. Used as-is when no
# personality is set, and as the fallback if the rewrite is unavailable/fails.
trim() {
  local s="$1"
  if [ "${#s}" -gt "$max" ]; then
    local h="${s:0:$max}" t
    t="$(printf '%s' "$h" | sed -E 's/([.!?])[^.!?]*$/\1/')"
    [ -n "$t" ] && s="$t" || s="$h"
  fi
  printf '%s' "$s"
}

# Speak asynchronously so the hook returns instantly. When a personality is set,
# rewrite the line with Apple's on-device model first (free, local, ~0.5s warm);
# fall back to the verbatim summary if that's unavailable or returns nothing.
{
  spoken="$(trim "$clean")"
  if [ -n "$personality" ] && [ -x "$REWRITE" ]; then
    r="$(printf '%s' "${clean:0:1200}" | "$REWRITE" "$personality" 2>/dev/null \
         | tr -d '`*_#"' | sed -E 's/  +/ /g; s/^ //; s/ $//')"
    [ -n "$r" ] && spoken="$r"
  fi
  /usr/bin/say -v "$voice" "$spoken"
} >/dev/null 2>&1 &
exit 0
