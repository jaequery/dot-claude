# Claude Code Integration

The Agency was built for Claude Code. No conversion needed — agents work
natively with the existing `.md` + YAML frontmatter format.

## Install

```bash
# Copy all agents to your Claude Code agents directory
./scripts/install.sh --tool claude-code

# Or manually copy a category
cp marketing/*.md ~/.claude/agents/
```

> Note: The plugin-marketplace install (`/plugin install jaequery@jaequery`) is
> the canonical path now. The `install.sh` flow above predates the marketplace
> and is kept for users on older Claude Code versions.

## Activate an Agent

In any Claude Code session, reference an agent by name:

```
Activate Frontend Developer and help me build a React component.
```

```
Use the Reality Checker agent to verify this feature is production-ready.
```

## Agent Directory

Agents are organized into divisions. See the [main README](../../README.md) for
the full current roster.
