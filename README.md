# Claude Code Status Line

🇬🇧 English | [🇺🇿 O'zbekcha](README.uz.md)

A beautiful, cross-platform status line for [Claude Code](https://claude.ai/code) that shows your model, context usage, session cost, git branch, and rate limits — right in the terminal.

```
◆ Opus   📁 tashkent-construction   🌿 main +2 ~1
███████░░░ 68%  ·  💰 $0.42  ·  ⏱ 4m 12s  ·  5h 23% · 7d 41%
```

> Add a real screenshot here (docs/screenshot.png).

---

## Features

- **Model name** — see which Claude model is active
- **Context bar** — color-coded fill: green < 70 %, yellow 70–89 %, red ≥ 90 %
- **Session cost** — estimated USD spent this session
- **Session time** — wall-clock time since session start
- **Git branch + change counts** — staged, modified, and untracked files
- **Rate-limit usage** — 5-hour and 7-day limits (Pro/Max subscribers only)
- **Zero npm dependencies** — only Node.js built-ins
- **Works on macOS, Linux, and Windows**

---

## Requirements

- [Node.js](https://nodejs.org) 18 or later
- [Claude Code](https://claude.ai/code)

---

## Install

### One command (recommended)

```
npx -y github:JavoxirJava/claude-code-statusline
```

### Clone and run

```bash
git clone https://github.com/JavoxirJava/claude-code-statusline
cd claude-code-statusline
node install.mjs
```

### Per-OS scripts

**macOS / Linux:**
```bash
bash install.sh
```

**Windows (PowerShell):**
```powershell
.\install.ps1
```

> **Windows note:** if PowerShell blocks the script, run once:
> ```powershell
> Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
> ```

After installing, **restart Claude Code or send any message** to see the status line.

### Per-project install

Add `--project` to install into `./.claude/settings.json` instead of the global `~/.claude/settings.json`:

```bash
node install.mjs --project
```

---

## What each part means

| Segment | Meaning |
|---|---|
| `◆ Opus` | Active Claude model |
| `📁 my-project` | Current directory name |
| `🌿 main +2 ~1` | Git branch; `+` staged, `~` modified, `?` untracked |
| `███████░░░ 68%` | Context window used (green/yellow/red) |
| `💰 $0.42` | Estimated session cost |
| `⏱ 4m 12s` | Time since session started |
| `5h 23%` | 5-hour rate limit used (Pro/Max only) |
| `7d 41%` | 7-day rate limit used (Pro/Max only) |

Color thresholds apply to the context bar and rate-limit percentages:
- **Green** — under 70 %
- **Yellow** — 70–89 %
- **Red** — 90 % and above

---

## Configuration

All environment variables are optional. Set them inside the `command` in `settings.json` or export them in your shell profile.

| Variable | Values | Effect |
|---|---|---|
| `NO_COLOR` | any | Disable all ANSI colors |
| `CCSL_NO_EMOJI` | `1` | Replace emoji with plain text |
| `CCSL_NERD_FONTS` | `1` | Use Nerd Font / Powerline glyphs |
| `CCSL_HIDE` | `cost,duration,git,ratelimit` | Hide specific segments (comma-separated) |
| `CCSL_BAR_WIDTH` | `4`–`40` | Width of the context bar (default `10`) |
| `CCSL_LINES` | `1` or `2` | Force single or double line |

**Example** — hide rate limits and use Nerd Fonts, set directly in `settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "CCSL_HIDE=ratelimit CCSL_NERD_FONTS=1 node \"/home/you/.claude/statusline.js\"",
    "padding": 0
  }
}
```

On Windows use `set` syntax or set env vars via PowerShell profile / System Properties.

---

## Preview without Claude Code

```bash
node test.mjs
# or
npm run preview
```

---

## Update

Re-run the install command. The installer copies the latest `statusline.js` into `~/.claude/` and updates `settings.json`.

---

## Uninstall

```bash
node uninstall.mjs
```

This removes the `statusLine` key from `settings.json`. The script file itself is left in place — delete `~/.claude/statusline.js` manually if you want a full clean-up.

---

## Troubleshooting

**Status line not showing**
- Accept the workspace trust prompt in Claude Code and restart.
- Make sure Node.js is on your `PATH` (`node --version` should print a version).

**Node not found**
- Install from [nodejs.org](https://nodejs.org).

**Broken path on Windows**
- The installer writes forward slashes automatically. If you edited `settings.json` by hand, make sure the path uses `/` not `\`.

**Values show `--` or are missing**
- Some fields (like rate limits) only appear after the first API response in a session.
- Run `claude --debug` to see any errors coming from the status-line script.

---

## How it works

Claude Code pipes a JSON object to the configured command via stdin on every update (debounced ~300 ms). The script reads all of stdin, parses the JSON, and writes one or two ANSI-colored lines to stdout. The first line of stdout becomes the status line. Git calls are cached for 5 seconds in a temp file to keep things fast.

---

## Credits

- [Claude Code status line docs](https://code.claude.ai/docs/en/statusline)
- MIT License — © 2026 Javohir
