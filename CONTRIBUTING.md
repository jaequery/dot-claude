# 🤝 Contributing

Thanks for considering a contribution to `jaequery/dot-claude`. This repo is a [Claude Code plugin marketplace](https://docs.claude.com/en/docs/claude-code/plugins) shipping the `jaequery` plugin — **skills only** (16 slash commands).

> **Looking to contribute an agent?** All specialist subagents (engineering, design, marketing, sales, etc.) live in the sibling [`jaequery/supabuild`](https://github.com/jaequery/supabuild) plugin. Open agent PRs there.

---

## 📜 Code of Conduct

- **Be respectful**: healthy debate is encouraged, personal attacks are not.
- **Be inclusive**: welcome people of all backgrounds.
- **Be collaborative**: assume good intent.
- **Be professional**: keep discussions focused on improving the plugin.

---

## 🎯 How to Contribute

### 1. Add a New Skill

A skill is a `SKILL.md` file in its own directory under `plugins/jaequery/skills/`. The directory name *is* the slash command (`/jaequery:<dirname>`).

1. **Fork the repo.**
2. **Create `plugins/jaequery/skills/<your-slug>/SKILL.md`** with this minimum frontmatter:

   ```yaml
   ---
   name: <your-slug>          # MUST match the directory name
   description: >             # used by Claude Code to decide when to invoke;
     What it does. Use when user says "/<your-slug>", "<phrase 1>", "<phrase 2>".
   ---
   ```

   Below the frontmatter, write the SOP — clear steps Claude follows when invoked. Be specific. List inputs, outputs, and edge cases.

3. **(Optional) Add sibling files.** Skills can include `scripts/`, `references/`, `hooks/`, `schema/`, etc. Reference them with relative paths from `SKILL.md`. For absolute paths inside the body, use `$CLAUDE_PLUGIN_ROOT/skills/<your-slug>/...` — never hardcode `/Users/...`.

4. **Bump `plugins/jaequery/.claude-plugin/plugin.json` `version`** and **update `README.md`** in the same commit (release-workflow rule).

5. **Submit a PR** with:
   - A clear description of what the skill does
   - Why it's useful (real use case)
   - Any testing or iteration you've done

### 2. Improve an Existing Skill

Found a sharper trigger phrase? A better SOP step? A bug in a script? Open a PR. Same version-bump-and-README rule applies — every skill change touches `plugin.json` and `README.md`.

### 3. Report Issues

- Search existing issues first.
- Provide reproduction steps and the slash command you ran.
- Mention your Claude Code version (`claude --version`).

---

## 🎨 Skill Design Guidelines

**Great skills are:**

- ✅ **Narrow.** One workflow, done well. Not "do everything for X domain."
- ✅ **Triggerable.** The `description:` field lists the exact phrases that should fire it. Claude routes on this — be explicit.
- ✅ **Stateless or boundaryless.** A skill should work fine in any project. If it needs project state, document it clearly.
- ✅ **Honest about deps.** If a skill needs an MCP server, an external CLI (`gh`, `linear`, etc.), or another plugin (e.g. `supabuild` for agent dispatch), say so up front.

**Avoid:**

- ❌ Vague descriptions ("helps you with marketing"). Claude won't know when to invoke.
- ❌ Hardcoded paths (`/Users/jaelee/...`). Use `$CLAUDE_PLUGIN_ROOT`.
- ❌ Skills that silently invoke the network without telling the user.
- ❌ Embedding huge reference content directly in `SKILL.md`. Put long content in `references/*.md` and load on demand.

---

## 🔄 Pull Request Process

1. **Fork** and **branch**: `git checkout -b add-skill-<name>`
2. **Verify your changes locally** — install the plugin from your fork (`/plugin marketplace add <your-fork>`) and exercise the skill in a real Claude Code session.
3. **Bump version** in `plugins/jaequery/.claude-plugin/plugin.json` and **update `README.md`** in the same commit.
4. **Open the PR** with a short imperative title (e.g., `Add /worktree-task skill — isolated worktree task runner`). No conventional-commit prefixes.

Maintainers will review, possibly request changes, and merge.

---

## 📁 Layout Reference

```
.claude-plugin/marketplace.json            ← marketplace catalog (do not move)
plugins/jaequery/
  .claude-plugin/plugin.json               ← plugin manifest
  skills/<skill-name>/SKILL.md             ← your contribution lives here
README.md
CLAUDE.md                                  ← guidance for Claude Code itself
CONTRIBUTING.md                            ← this file
LICENSE
.gitignore                                 ← deny-by-default; allowlist additions explicitly
```

The root `.gitignore` is deny-by-default. If you add a top-level file or a new tracked path under `plugins/jaequery/`, make sure it falls inside the allowlisted tree (`.claude-plugin/**`, `plugins/jaequery/**`, plus the named root files).

---

## 🎉 Thank You

Your contributions make this plugin sharper for everyone.

[Open an Issue](https://github.com/jaequery/dot-claude/issues) • [Submit a PR](https://github.com/jaequery/dot-claude/pulls)
