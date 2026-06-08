# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project purpose

A cross-platform status line for Claude Code. Claude Code pipes a JSON object to a command via stdin on every update; the first line of stdout becomes the status line. This project provides `statusline.js` (the renderer) plus installer/uninstaller scripts.

## Key commands

```bash
# Preview the status line without Claude Code running
node test.mjs

# Install globally (edits ~/.claude/settings.json)
node install.mjs

# Install per-project (edits ./.claude/settings.json)
node install.mjs --project

# Uninstall (removes statusLine key, leaves script in place)
node uninstall.mjs

# npm shortcuts
npm run preview
npm run install-statusline
npm run uninstall-statusline
```

## Architecture

```
statusline.js   # CJS, zero deps — reads stdin JSON, writes 1-2 ANSI lines to stdout
install.mjs     # ESM — copies statusline.js into .claude/, safely merges statusLine key into settings.json
uninstall.mjs   # ESM — removes statusLine key from settings.json; leaves script file
test.mjs        # ESM — spawns statusline.js with mock JSON so users can preview output
install.sh      # bash wrapper: checks node exists, then: node install.mjs "$@"
install.ps1     # PowerShell wrapper: same idea
```

`statusline.js` is CJS (`package.json` sets `"type": "commonjs"`); `install.mjs`, `uninstall.mjs`, and `test.mjs` are explicit ESM (`.mjs` extension).

## Critical constraints

**statusline.js must always print something and exit 0.** A non-zero exit or empty stdout blanks the Claude Code status line entirely. Every code path, including error paths, must `process.stdout.write(...)` then `process.exit(0)`.

**Forward slashes in the command path.** On Windows, Claude Code runs the command through Git Bash if available, which silently breaks backslash paths. `install.mjs` must convert the destination path with `.replace(/\\/g, '/')` before writing it into `settings.json`.

**settings.json must only merge, never overwrite.** Read the existing file, parse it, set only the `statusLine` key, write back. If the existing file is invalid JSON, abort with a message. Always write a `.bak` before touching the file.

**Git calls are cached** (5 s TTL) in `os.tmpdir()/ccsl-git-<sessionId>.txt` because the script runs ~every 300 ms.

## stdin JSON fields used

| Field | Notes |
|---|---|
| `model.display_name` | e.g. `"Opus"`, `"Sonnet"` |
| `workspace.current_dir` | preferred over `cwd` |
| `session_id` | cache key for git temp file |
| `context_window.used_percentage` | 0–100, may be `null` early in session |
| `cost.total_cost_usd` | estimated USD |
| `cost.total_duration_ms` | wall-clock ms since session start |
| `rate_limits.five_hour.used_percentage` | only present for Pro/Max after first response |
| `rate_limits.seven_day.used_percentage` | same caveat |

## Environment variable overrides (all optional)

| Variable | Effect |
|---|---|
| `NO_COLOR` | disable all ANSI |
| `CCSL_NO_EMOJI=1` | replace emoji with plain text |
| `CCSL_NERD_FONTS=1` | use Nerd Font glyphs |
| `CCSL_HIDE=cost,duration,git,ratelimit` | comma-list of segments to hide |
| `CCSL_BAR_WIDTH=10` | context bar width (4–40) |
| `CCSL_LINES=1\|2` | force single or double line |

Color thresholds: green < 70 %, yellow 70–89 %, red ≥ 90 % — applied to the context bar and rate-limit percentages.

## npx install (for users)

The `bin` field in `package.json` maps `claude-code-statusline` to `install.mjs`, so users can run:

```
npx -y github:YOUR_GITHUB_USERNAME/claude-code-statusline
```

`install.mjs` must keep its `#!/usr/bin/env node` shebang for this to work.
