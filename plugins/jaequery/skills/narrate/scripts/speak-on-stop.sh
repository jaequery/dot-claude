#!/usr/bin/env bash
# speak-on-stop.sh — Stop hook engine for the /narrate skill.
# When Claude finishes a turn, speak a short summary of its final message
# aloud via macOS `say`. macOS only; a clean no-op anywhere `say` is absent.
#
# Toggle (global on/off): presence of  ~/.claude/narrate.enabled
# Voice override:         contents of   ~/.claude/narrate.voice     (default: Samantha)
# Length cap (chars):     contents of   ~/.claude/narrate.maxchars  (default: 300)
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

# Keep it short: cap chars, trimmed back to a sentence boundary when possible.
max="$(cat "$HOME/.claude/narrate.maxchars" 2>/dev/null)"; [ -n "$max" ] || max=300
if [ "${#clean}" -gt "$max" ]; then
  head="${clean:0:$max}"
  trimmed="$(printf '%s' "$head" | sed -E 's/([.!?])[^.!?]*$/\1/')"
  [ -n "$trimmed" ] && clean="$trimmed" || clean="$head"
fi

# De-dupe: never speak the same final message twice (e.g. Stop firing on resume).
STATE="$HOME/.claude/.narrate.last"
hash="$(printf '%s' "$clean" | md5 -q 2>/dev/null || printf '%s' "$clean" | md5sum 2>/dev/null | cut -d' ' -f1)"
[ -n "$hash" ] && [ "$(cat "$STATE" 2>/dev/null)" = "$hash" ] && exit 0
printf '%s' "$hash" > "$STATE"

voice="$(cat "$HOME/.claude/narrate.voice" 2>/dev/null)"
[ -n "$voice" ] || voice="Samantha"

# Speak in the background so the hook returns instantly.
/usr/bin/say -v "$voice" "$clean" >/dev/null 2>&1 &
exit 0
