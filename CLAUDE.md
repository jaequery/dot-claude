# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

This is a **Claude Code plugin marketplace**, not an application. It ships one plugin (`jaequery`) that bundles ~16 slash-command skills and ~98 specialist subagents. There is no build, test, or runtime for the marketplace itself — content is consumed by Claude Code when users run `/plugin marketplace add jaequery/dot-claude` and `/plugin install jaequery@jaequery`.

The `engineering`, `design`, `specialized`, and `testing` agent categories were moved to a separate `supabuild` plugin — do not re-add agents in those categories here.

When adding or changing content, you are editing markdown that ends up in end-users' Claude Code installs. Keep the end-user invocation surface in mind (slash commands, Agent-tool `subagent_type`).

## Layout

Two-level structure: the marketplace catalog at the repo root points at a plugin subtree.

```
.claude-plugin/marketplace.json            ← marketplace catalog (lists plugins)
plugins/jaequery/
  .claude-plugin/plugin.json               ← plugin manifest
  skills/<skill-name>/SKILL.md             ← slash command definitions (+ optional scripts/references/hooks/)
  agents/<category>/<agent-name>.md        ← subagent definitions
  agents/scripts/{lint-agents,convert,install}.sh
  agents/integrations/<tool>/              ← generated outputs for non-Claude-Code tools
```

Agent categories under `plugins/jaequery/agents/`: `game-development`, `marketing`, `paid-media`, `product`, `project-management`, `sales`, `spatial-computing`, `strategy`, `support`, plus `examples/` and `integrations/`. (Engineering / design / specialized / testing live in the supabuild plugin.)

## Authoring contracts

### Skills (`plugins/jaequery/skills/<name>/SKILL.md`)

Required frontmatter:

```yaml
---
name: <slug>                # must match the directory name; becomes /jaequery:<slug>
description: >              # used by Claude Code to decide when to invoke; list trigger phrases explicitly
  What it does. Use when user says "/<name>", "<phrase 1>", "<phrase 2>".
---
```

A skill may include sibling files (`scripts/`, `references/`, `hooks/`, `schema/`, data files). Reference them with relative paths from `SKILL.md`. Skills are free to dispatch subagents via the Agent tool and to invoke other skills.

### Agents (`plugins/jaequery/agents/<category>/<name>.md`)

Required frontmatter (enforced by lint): `name`, `description`, `color`. Optional: `emoji`, `vibe`, `services`. Linter also warns if the body omits "Identity", "Core Mission", or "Critical Rules" sections, or is <50 words.

Filenames are `<category>-<slug>.md` (e.g. `engineering-backend-architect.md`). The frontmatter `name` is human-readable ("Backend Architect"); the Agent-tool `subagent_type` is the plugin-namespaced form (`jaequery:engineering:Backend Architect`).

See `CONTRIBUTING.md` for the full agent template and the persona/operations section grouping that `convert.sh` relies on.

## Commands

Run from `plugins/jaequery/agents/` (scripts resolve paths relative to their own location and the `agents/` root):

```bash
./scripts/lint-agents.sh                      # lint every agent; errors fail, missing sections warn
./scripts/lint-agents.sh <file>...            # lint specific files

./scripts/convert.sh                          # regenerate agents/integrations/<tool>/ for all non-Claude-Code tools
./scripts/convert.sh --tool gemini-cli        # regenerate one tool's output

./scripts/install.sh --tool claude-code       # copy agents into a user's ~/.claude/agents/ (legacy path, predates the plugin marketplace install)
```

The `convert.sh`/`install.sh` toolchain produces outputs for Aider, Antigravity, Cursor, Gemini CLI, GitHub Copilot, OpenClaw, OpenCode, Windsurf, and others under `agents/integrations/<tool>/`. For Claude Code itself, the plugin marketplace is the distribution path — the `install.sh --tool claude-code` flow is historical.

There is no project-wide test, build, or typecheck. The `/code-review` skill's test runner is a feature of that skill for *other* projects — it doesn't apply to this repo.

## When editing

- **The root `.gitignore` is deny-by-default.** New top-level files won't be tracked unless you add an allowlist entry. The allowlisted tree is: `.claude-plugin/**`, `plugins/jaequery/**`, `.gitignore`, `README.md`, `LICENSE`, `CONTRIBUTING.md`. Skill runtime outputs (`plugins/jaequery/skills/market-research/keyword-research-*.{json,md}`) are explicitly ignored.
- **After adding/renaming an agent,** run `./scripts/lint-agents.sh` and, if downstream integrations matter, `./scripts/convert.sh` and commit the regenerated `agents/integrations/` files.
- **Skill slugs must match their directory name** — Claude Code resolves `/jaequery:<slug>` from the directory, and the frontmatter `name` is how users will type it. Renaming a skill means renaming the directory and the `name:` field together.
- **Cross-references between skills are common** (`/next-feature` invokes `/orchestrate`; `/dda` dispatches subagents by name). When renaming, grep for the old name across both `skills/` and `agents/`.
- **Don't add an `emoji`, `version`, or `color` field to examples in Qwen-targeted docs** — Qwen's SubAgent format only uses `name` and `description` (see `CONTRIBUTING.md` "Tool-Specific Compatibility").

## Commit style

Short imperative subjects, optionally scoped. Examples from history: `Add /worktree-task skill — isolated worktree task runner`, `Fix marketplace.json source schema`, `Restructure repo into a Claude Code plugin marketplace`. No conventional-commit prefixes.
