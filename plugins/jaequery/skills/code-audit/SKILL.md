---
name: code-audit
description: >
  Audit a codebase at the code level — organization, complexity, redundancy, security,
  performance, design quality, dependency hygiene, and test coverage. Runs ~14 static
  analyses and produces a dashboard-style report with OK / WARN / CONCERN ratings and
  prioritized recommendations. Use when user says "/code-audit", "audit this code",
  "code quality audit", "codebase quality", "audit the code", or "code-level audit".
  Distinct from /code-review (diff-level, evidence-gated) and /git-audit (history-level).
---

# Code-Level Audit

You are a senior engineering quality analyst. Run all analyses below against the current codebase (or a path the user provides), then present a comprehensive dashboard-style report.

## Target

Use the current working directory unless the user specifies a path. If it's a git repo, scope file enumeration to tracked files (`git ls-files`) so generated/vendored junk doesn't pollute results. Otherwise fall back to `find` excluding common noise (`node_modules`, `.git`, `dist`, `build`, `vendor`, `.venv`, `target`, `.next`, `.cache`).

Detect primary language(s) from extensions to set sensible defaults (e.g. JS/TS → check `package.json`; Python → `requirements*.txt`/`pyproject.toml`; Go → `go.mod`).

## Conventions

- Define once and reuse: `FILES="$(git ls-files 2>/dev/null || find . -type f -not -path './node_modules/*' -not -path './.git/*' -not -path './dist/*' -not -path './build/*' -not -path './vendor/*' -not -path './.venv/*' -not -path './target/*' -not -path './.next/*')"`
- Restrict to source files where useful: filter `$FILES` by extension (`\.(ts|tsx|js|jsx|py|go|rs|rb|java|kt|swift|cs|cpp|c|h|hpp|php|scala|sh)$`).
- Run analyses in parallel when independent. Many can be a single Bash call.
- Treat any analysis that errors or returns nothing as **N/A**, not zero.

## Analyses to Run

### 1. Codebase Footprint
Total tracked files, source-file count, total LOC, language breakdown — sets baseline for everything else.
```bash
echo "Tracked files: $(git ls-files 2>/dev/null | wc -l)"; git ls-files 2>/dev/null | awk -F. 'NF>1{print tolower($NF)}' | sort | uniq -c | sort -rn | head -10; echo "Total LOC (source):"; git ls-files 2>/dev/null | grep -E '\.(ts|tsx|js|jsx|py|go|rs|rb|java|kt|swift|cs|cpp|c|h|hpp|php|scala|sh)$' | xargs wc -l 2>/dev/null | tail -1
```

### 2. File Size Outliers
Largest source files by LOC — files >500 LOC often need decomposition; >1000 LOC almost always do.
```bash
git ls-files 2>/dev/null | grep -E '\.(ts|tsx|js|jsx|py|go|rs|rb|java|kt|swift|cs|cpp|c|h|hpp|php|scala|sh)$' | xargs wc -l 2>/dev/null | sort -rn | head -20
```

### 3. Function/Method Length Outliers
Long functions are a strong code-smell proxy. Heuristic: contiguous indented blocks following `function`/`def`/`func`. Approximation, not exact.
```bash
git ls-files 2>/dev/null | grep -E '\.(ts|tsx|js|jsx|py|go|rb|java|kt|cs)$' | while read f; do awk -v F="$f" '/^[[:space:]]*(function|def |func |public |private |protected |async )/{if(name)print len, F":"start":"name; name=$0; start=NR; len=0} {len++} END{if(name)print len, F":"start":"name}' "$f" 2>/dev/null; done | sort -rn | head -15
```

### 4. Duplication / Redundancy
Lines repeated verbatim across the source tree (≥30 chars, appearing 5+ times) — fast proxy for copy-paste smell. Not a real clone detector but catches the obvious.
```bash
git ls-files 2>/dev/null | grep -E '\.(ts|tsx|js|jsx|py|go|rs|rb|java|kt)$' | xargs awk 'length($0)>30 && !/^[[:space:]]*(\/\/|#|\*|\/\*)/{print}' 2>/dev/null | sort | uniq -c | sort -rn | awk '$1>=5' | head -15
```

### 5. TODO / FIXME / HACK Debt Markers
Counts and locations of self-flagged debt — high counts or stale markers are concern signals.
```bash
git ls-files 2>/dev/null | xargs grep -nE '\b(TODO|FIXME|HACK|XXX|KLUDGE)\b' 2>/dev/null | head -30; echo "---"; echo "Total markers:"; git ls-files 2>/dev/null | xargs grep -cE '\b(TODO|FIXME|HACK|XXX|KLUDGE)\b' 2>/dev/null | awk -F: '{s+=$2} END{print s}'
```

### 6. Comment Density
Comment lines vs source lines — both extremes (near-zero, near-50%) signal a problem.
```bash
git ls-files 2>/dev/null | grep -E '\.(ts|tsx|js|jsx|py|go|rs|java|kt)$' | xargs awk 'BEGIN{c=0;l=0} /^[[:space:]]*(\/\/|#|\*|\/\*)/{c++} /./{l++} END{if(l>0)printf "Comments: %d / Lines: %d (%.1f%%)\n", c, l, 100*c/l}' 2>/dev/null
```

### 7. Cyclomatic Complexity Proxy
Branch-keyword density per file as a proxy for complexity (`if|else|for|while|case|switch|catch|&&|\|\|`). High counts on a single file are red flags.
```bash
git ls-files 2>/dev/null | grep -E '\.(ts|tsx|js|jsx|py|go|rb|java|kt|cs)$' | while read f; do n=$(grep -cE '\b(if|else|for|while|case|switch|catch)\b|&&|\|\|' "$f" 2>/dev/null); echo "$n $f"; done | sort -rn | head -15
```

### 8. Security Smells
Common high-signal patterns: hardcoded secrets, dangerous eval/exec, unparametrized SQL, `dangerouslySetInnerHTML`, weak crypto, disabled TLS verification.
```bash
echo "== Hardcoded secrets =="; git ls-files 2>/dev/null | xargs grep -nIE '(api[_-]?key|secret|password|token|access[_-]?key)\s*[:=]\s*["\047][A-Za-z0-9_\-]{16,}' 2>/dev/null | grep -vE '(example|sample|test|fixture|\.md:|placeholder|YOUR_|<.*>)' | head -10
echo "== eval/exec =="; git ls-files 2>/dev/null | xargs grep -nE '\b(eval|exec)\s*\(' 2>/dev/null | head -10
echo "== SQL string-build =="; git ls-files 2>/dev/null | xargs grep -nE '("(SELECT|INSERT|UPDATE|DELETE)[^"]*"\s*\+|f"(SELECT|INSERT|UPDATE|DELETE)[^"]*\{)' 2>/dev/null | head -10
echo "== dangerouslySetInnerHTML =="; git ls-files 2>/dev/null | xargs grep -nE 'dangerouslySetInnerHTML|innerHTML\s*=' 2>/dev/null | head -10
echo "== weak crypto / disabled TLS =="; git ls-files 2>/dev/null | xargs grep -nE '\b(md5|sha1)\(|rejectUnauthorized:\s*false|verify=False|InsecureSkipVerify' 2>/dev/null | head -10
```

### 9. Error Handling Hygiene
Empty `catch`/`except` blocks and bare `except:` — silent failure is worse than crashing.
```bash
echo "== Empty catch =="; git ls-files 2>/dev/null | xargs grep -nE 'catch\s*\([^)]*\)\s*\{\s*\}|catch\s*\{\s*\}' 2>/dev/null | head -15
echo "== Bare except (Python) =="; git ls-files 2>/dev/null | grep '\.py$' | xargs grep -nE '^\s*except\s*:' 2>/dev/null | head -15
echo "== Swallowed errors (logged but not handled) =="; git ls-files 2>/dev/null | xargs grep -nE 'catch.*\{\s*(console\.(log|error)|print|log\.).*\}\s*$' 2>/dev/null | head -10
```

### 10. Performance Smells
Common gotchas: `await` inside loops, N+1 ORM patterns, sync I/O on hot paths, missing indexes hint, `SELECT *`.
```bash
echo "== await in loop =="; git ls-files 2>/dev/null | grep -E '\.(ts|tsx|js|jsx)$' | xargs grep -nE 'for\s*\([^)]*\)\s*\{[^}]*await|\.forEach\([^)]*async' 2>/dev/null | head -10
echo "== sync fs in JS =="; git ls-files 2>/dev/null | grep -E '\.(ts|tsx|js|jsx)$' | xargs grep -nE 'fs\.(readFileSync|writeFileSync|existsSync)\b' 2>/dev/null | head -10
echo "== SELECT * =="; git ls-files 2>/dev/null | xargs grep -niE 'SELECT\s+\*\s+FROM' 2>/dev/null | head -10
```

### 11. Dependency Hygiene
Direct dep count, outdated/unused signals where the toolchain is available. Skip silently if tooling isn't installed.
```bash
if [ -f package.json ]; then echo "== package.json =="; node -e "const p=require('./package.json');console.log('deps:',Object.keys(p.dependencies||{}).length,'devDeps:',Object.keys(p.devDependencies||{}).length)" 2>/dev/null; (command -v npm >/dev/null && npm outdated --json 2>/dev/null | head -50) || true; fi
if [ -f pyproject.toml ] || [ -f requirements.txt ]; then echo "== Python deps =="; (command -v pip >/dev/null && pip list --outdated 2>/dev/null | head -20) || true; fi
if [ -f go.mod ]; then echo "== go.mod =="; (command -v go >/dev/null && go list -m -u all 2>/dev/null | grep '\[' | head -20) || true; fi
```

### 12. Test Coverage Surface
Source file count vs test file count — coarse coverage signal. Real coverage tools beat this, but this works without setup.
```bash
SRC=$(git ls-files 2>/dev/null | grep -E '\.(ts|tsx|js|jsx|py|go|rs|rb|java|kt)$' | grep -viE '(test|spec|__tests__|\.test\.|\.spec\.)' | wc -l); TST=$(git ls-files 2>/dev/null | grep -iE '(test|spec|__tests__|\.test\.|\.spec\.)' | grep -E '\.(ts|tsx|js|jsx|py|go|rs|rb|java|kt)$' | wc -l); echo "Source files: $SRC, Test files: $TST"; [ "$SRC" -gt 0 ] && awk -v s=$SRC -v t=$TST 'BEGIN{printf "Test/Source ratio: %.1f%%\n", 100*t/s}'
```

### 13. Coupling / Import Hotspots
Most-imported modules across the tree — high in-degree means a change there blast-radiuses everywhere.
```bash
git ls-files 2>/dev/null | grep -E '\.(ts|tsx|js|jsx)$' | xargs grep -hE "^(import|.*require\()" 2>/dev/null | grep -oE "['\"]([^'\"]+)['\"]" | sort | uniq -c | sort -rn | head -15
```

### 14. Organization / Naming Hygiene
Naming-inconsistency signals at directory level — mixed kebab/camel/snake at the same depth, files with generic names (`utils.ts`, `helpers.py`, `misc.go`), and one-file directories.
```bash
echo "== Generic-named files =="; git ls-files 2>/dev/null | grep -iE '/(utils|helpers|misc|common|stuff|tmp)\.(ts|tsx|js|jsx|py|go|rb|java)$' | head -20
echo "== Directories with mixed casing =="; git ls-files 2>/dev/null | awk -F/ '{p=""; for(i=1;i<NF;i++){p=p"/"$i; print p, $i}}' | sort -u | awk '{kc=$2~/-/; cc=$2~/[A-Z]/; sc=$2~/_/; if(kc+cc+sc>1) print}' | head -10
```

## Output Format

### Header
```
# Code Audit Report: [repo/dir name]
Generated: [date] | Primary language: [detected] | Source files: [n] | LOC: [n]
```

### Per-section format
- **Section title** + one-line "why it matters"
- **Data** (table or list)
- **Assessment** — 1–2 sentences (healthy / warning / concern), grounded in the data above

### Summary Dashboard
| Metric | Status | Notes |
|---|---|---|
| File Size | OK/WARN/CONCERN | … |
| Function Length | … | … |
| Duplication | … | … |
| Debt Markers | … | … |
| Complexity | … | … |
| Security Smells | … | … |
| Error Handling | … | … |
| Performance | … | … |
| Dependencies | … | … |
| Test Coverage | … | … |
| Coupling | … | … |
| Organization | … | … |

Thresholds:
- **File Size**: WARN if any source file >500 LOC; CONCERN if any >1000 LOC.
- **Function Length**: WARN if any function >60 lines; CONCERN if any >150.
- **Duplication**: WARN if 5+ duplicated 30-char blocks; CONCERN if 20+.
- **Debt Markers**: WARN if >50 total; CONCERN if >150 or any single file has >10.
- **Complexity**: WARN if any file's branch-keyword count >100; CONCERN if >250.
- **Security Smells**: any genuine hit (filtering examples) → CONCERN.
- **Error Handling**: WARN if any empty catch / bare except; CONCERN if >5.
- **Performance**: WARN if any await-in-loop or SELECT *; CONCERN if >5.
- **Dependencies**: WARN if outdated count >25% of deps; CONCERN if >50%.
- **Test Coverage**: CONCERN if test/source ratio <10%; WARN if <25%.
- **Coupling**: WARN if any single import appears in >40% of source files.
- **Organization**: WARN if generic-named files exist; CONCERN if 5+.

### Top Findings
List the 5–10 highest-severity individual findings with `path:line` where applicable, severity, and a one-line reason.

### Actionable Recommendations
End with 3–5 specific, prioritized recommendations. Each must reference a concrete file or pattern from the report — no generic advice.

## Scope discipline

- This is a **read-only audit**. Do not edit code, do not run formatters, do not "while we're here" fix things. The user can follow up with `/code-review` on a focused diff if they want fixes.
- If the codebase is huge (>5000 source files), warn the user up front, and suggest scoping to a subdirectory.
- If a section returns no signal, say "No findings" — do not invent issues to fill the report.
