---
name: git-audit
description: >
  Audit a git repository's health, history, and team dynamics. Runs 13 git analyses
  covering churn hotspots, bus factor, bug clusters, velocity, stale files, and more.
  Use when user says "/git-audit", "audit this repo", "repo health", "codebase audit",
  or "git analysis".
---

# Git Repository Audit

You are a codebase intelligence analyst. Run all 13 analyses below on the current git repository (or a path the user provides), then present a comprehensive dashboard-style report.

## Target Repository

Use the current working directory unless the user specifies a path. Verify it's a git repo first with `git rev-parse --is-inside-work-tree`.

## Analyses to Run

Run these git commands in parallel where possible. Each produces one section of the report.

### 1. Churn Hotspots
Files modified most frequently in the last year — high churn often signals complexity or instability.
```bash
git log --since="1 year ago" --pretty=format: --name-only | sort | uniq -c | sort -rn | head -20
```

### 2. Bus Factor
Commit distribution across contributors — shows concentration risk.
```bash
git shortlog -sn --no-merges | head -20
```

### 3. Bug Clusters
Files most often referenced in fix/bug commits — where bugs tend to live.
```bash
git log --all --oneline --grep="fix\|bug\|patch\|hotfix" --pretty=format: --name-only | sort | uniq -c | sort -rn | head -20
```

### 4. Velocity
Monthly commit counts across full history — shows project momentum over time.
```bash
git log --format="%ad" --date=format:"%Y-%m" | sort | uniq -c | sort -k2
```

### 5. Firefighting
Revert/hotfix/rollback frequency — how often the team is putting out fires.
```bash
git log --all --oneline --grep="revert\|hotfix\|rollback" | head -20
```

### 6. Stale Files
Files untouched for 1+ year — potential dead code or neglected areas.
```bash
git log --all --diff-filter=M --pretty=format:"%ai" --name-only -- . | awk 'NF==1{file=$0} NF>1{print $1, file}' | sort -k2 -u | sort -k1 | head -30
```

### 7. Long-lived Branches
Branches older than 90 days — may indicate stale work or merge debt.
```bash
git for-each-ref --sort=committerdate --format='%(committerdate:short) %(refname:short)' refs/heads/ | head -20
```

### 8. Co-change Coupling
File pairs frequently committed together — reveals hidden dependencies.
```bash
git log --pretty=format:'---' --name-only | awk '/^---$/{if(NR>1) for(i in files) for(j in files) if(i<j) print files[i], files[j]; delete files; n=0; next} NF{files[n++]=$0}' | sort | uniq -c | sort -rn | head -20
```

### 9. Fresh Files
New additions in the last 90 days — where active development is happening.
```bash
git log --since="90 days ago" --diff-filter=A --pretty=format: --name-only | sort -u | head -30
```

### 10. Ownership Drift
Files with multiple primary contributors — may lack clear ownership.
```bash
git log --pretty=format:"%an" --name-only | awk 'NF==1{file=$0; next} NF>0{count[file][$0]++} END{for(f in count){n=0; for(a in count[f]) n++; if(n>2) {printf "%d authors: %s\n", n, f}}}' | sort -rn | head -20
```

### 11. Test Ratio
Ratio of test file changes to source file changes — indicates testing discipline.
```bash
echo "Test files changed (last 6 months):" && git log --since="6 months ago" --pretty=format: --name-only | grep -iE "(test|spec|_test\.|\.test\.)" | wc -l && echo "All files changed (last 6 months):" && git log --since="6 months ago" --pretty=format: --name-only | wc -l
```

### 12. Commit Sizes
Distribution of commit magnitudes — large commits may indicate poor workflow.
```bash
git log --shortstat --pretty=format:"" | awk '/files? changed/{print $1}' | sort -n | awk '{sum+=$1; count++; vals[count]=$1} END{printf "Commits: %d\nMedian files changed: %d\nAvg files changed: %.1f\nMax files changed: %d\n", count, vals[int(count/2)], sum/count, vals[count]}'
```

### 13. Merge Frequency
Monthly merge activity — shows integration cadence.
```bash
git log --merges --format="%ad" --date=format:"%Y-%m" | sort | uniq -c | sort -k2
```

## Output Format

Present results as a structured report with these sections:

### Header
```
# Git Audit Report: [repo name]
Generated: [date] | Analyzed: [branch] | Total commits: [count]
```

### For each analysis, output:
- **Section title** with a one-line explanation of why it matters
- **Data** in a readable table or list format
- **Assessment** — a 1-2 sentence interpretation (healthy / warning / concern)

### Summary Dashboard
At the end, provide an overall health summary table:

| Metric | Status | Notes |
|--------|--------|-------|
| Churn Hotspots | OK/WARN/CONCERN | ... |
| Bus Factor | OK/WARN/CONCERN | ... |
| ... | ... | ... |

Use these thresholds:
- **Bus Factor**: CONCERN if top contributor has >60% of commits, WARN if >40%
- **Test Ratio**: CONCERN if <10% of changes touch tests, WARN if <25%
- **Commit Sizes**: CONCERN if median >10 files, WARN if >5
- **Long-lived Branches**: WARN if any branch >90 days, CONCERN if >180 days
- **Firefighting**: CONCERN if >10 reverts/hotfixes in last 6 months

### Actionable Recommendations
End with 3-5 specific, prioritized recommendations based on the findings.
