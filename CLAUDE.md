# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

This is a **Claude Code plugin marketplace**, not an application. It ships one plugin (`jaequery`) that bundles 16 slash-command skills. There is no build, test, or runtime for the marketplace itself — content is consumed by Claude Code when users run `/plugin marketplace add jaequery/dot-claude` and `/plugin install jaequery@jaequery`.

**This plugin is skill-only.** All specialist subagents (engineering, marketing, sales, game-dev, design, testing, etc. — 161 total) live in the sibling [`jaequery/supabuild`](https://github.com/jaequery/supabuild) plugin. Some skills here (`/dda`, `/next-feature`, `/shark-tank`, `/code-review`) dispatch subagents by name via the Agent tool — those names resolve from supabuild when both plugins are installed.

When adding or changing content, you are editing markdown that ends up in end-users' Claude Code installs. Keep the end-user invocation surface in mind (slash commands resolved as `/jaequery:<slug>`).

## Layout

Two-level structure: the marketplace catalog at the repo root points at a plugin subtree.

```
.claude-plugin/marketplace.json            ← marketplace catalog (lists plugins)
plugins/jaequery/
  .claude-plugin/plugin.json               ← plugin manifest
  skills/<skill-name>/SKILL.md             ← slash command definitions (+ optional scripts/references/hooks/)
```

There is no `agents/` tree in this plugin. If you find yourself wanting to add an agent, add it to the supabuild plugin instead.

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

A skill may include sibling files (`scripts/`, `references/`, `hooks/`, `schema/`, data files). Reference them with relative paths from `SKILL.md` (use `$CLAUDE_PLUGIN_ROOT/skills/<name>/...` for absolute paths inside body text — never hardcode `/Users/...`). Skills are free to dispatch subagents via the Agent tool (they will resolve from supabuild when installed) and to invoke other skills.

## Commands

There is no project-wide test, build, lint, or typecheck. The `/code-review` skill's test runner is a feature of that skill for *other* projects — it doesn't apply to this repo.

## When editing

- **The root `.gitignore` is deny-by-default.** New top-level files won't be tracked unless you add an allowlist entry. The allowlisted tree is: `.claude-plugin/**`, `plugins/jaequery/**`, `.gitignore`, `README.md`, `LICENSE`, `CONTRIBUTING.md`, `CLAUDE.md`. Skill runtime outputs (`plugins/jaequery/skills/market-research/keyword-research-*.{json,md}`) are explicitly ignored.
- **Skill slugs must match their directory name** — Claude Code resolves `/jaequery:<slug>` from the directory, and the frontmatter `name` is how users will type it. Renaming a skill means renaming the directory and the `name:` field together.
- **Cross-references between skills are common** (`/dda` and `/next-feature` dispatch subagents by name; `/shark-tank` runs an investor panel of subagents). When renaming a skill, grep for the old name across `skills/`. When renaming an agent in supabuild, grep for the old name across this repo's `skills/` too.
- **Every skill change must bump `plugin.json` `version` and update `README.md` in the same commit** (release-workflow rule).
- **Use `$CLAUDE_PLUGIN_ROOT`, never `/Users/.../.claude/`** for any path the skill body documents. The marketplace install resolves to a different location per user.

## Commit style

Short imperative subjects, optionally scoped. Examples from history: `Add /worktree-task skill — isolated worktree task runner`, `Fix marketplace.json source schema`, `Restructure repo into a Claude Code plugin marketplace`. No conventional-commit prefixes.
