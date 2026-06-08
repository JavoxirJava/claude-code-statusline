# Build a cross-platform "Claude Code Status Line" project

You are setting up a complete, polished, open-source project that adds a **beautiful status line to the bottom of Claude Code**. The project must work on **macOS, Linux, and Windows**, be installable with a **single command**, and be **easy enough for non-technical users**. We will publish it to GitHub so other people can use it.

Work autonomously. Create the folder, write every file, test it, initialize git, and at the end print the exact commands to push to GitHub. Ask me **at most one** question (my GitHub username); if I don't answer, use the placeholder `YOUR_GITHUB_USERNAME` and clearly tell me where to replace it.

---

## 0. Key technical facts (verified against the official Claude Code docs)

Use these — do not guess.

- A status line is configured in `settings.json` under a `statusLine` key:
  ```json
  { "statusLine": { "type": "command", "command": "...", "padding": 0 } }
  ```
- Global settings live at `~/.claude/settings.json` (on Windows: `C:\Users\<name>\.claude\settings.json`). Project settings live at `<project>/.claude/settings.json`.
- On every update, Claude Code pipes a **JSON object to the command via stdin**. **The first line of stdout becomes the status line.** Multiple lines are allowed (each line = one row). **ANSI color codes are supported.**
- If the script **exits non-zero or prints nothing, the status line goes blank.** So our script must **always print something and exit 0**, even on error.
- The script runs frequently (debounced ~300ms), so **slow git calls must be cached**.
- **Windows gotcha (critical):** On Windows, Claude Code runs the command through **Git Bash** if installed, otherwise **PowerShell**. Git Bash eats unquoted backslashes, so a path like `C:\Users\...` silently breaks. **Always write the command path with forward slashes** (e.g. `C:/Users/name/.claude/statusline.js`). The installer must produce an **absolute path with forward slashes**.
- **Node.js is our runtime.** It is cross-platform, is already required by Claude Code, has built-in JSON parsing (no `jq` needed), and one file works on all three OSes. The status-line command will be `node "<abs-path>/statusline.js"`.

### JSON fields available on stdin (the ones we use)
- `model.display_name` — e.g. `"Opus"`, `"Sonnet"`
- `cwd` and `workspace.current_dir` — current directory (same value; prefer `workspace.current_dir`)
- `session_id` — stable per session (use it for the git cache filename)
- `context_window.used_percentage` — number 0–100, **may be `null`** early in a session
- `cost.total_cost_usd` — estimated session cost (USD)
- `cost.total_duration_ms` — wall-clock time since session start
- `cost.total_lines_added`, `cost.total_lines_removed`
- `rate_limits.five_hour.used_percentage`, `rate_limits.five_hour.resets_at`
- `rate_limits.seven_day.used_percentage`, `rate_limits.seven_day.resets_at`
  - ⚠ `rate_limits` is **only present for Claude.ai Pro/Max subscribers** and **only after the first API response**. The script must hide these segments gracefully when absent.

---

## 1. Folder & file layout

Create a folder named `claude-code-statusline` in the current directory, with exactly these files:

```
claude-code-statusline/
├── statusline.js        # the status line itself (Node, zero dependencies)
├── install.mjs          # cross-platform installer (copies script + safely merges settings.json)
├── uninstall.mjs        # removes the statusLine key (and optionally the script)
├── install.sh           # macOS/Linux convenience wrapper (checks Node, runs install.mjs)
├── install.ps1          # Windows convenience wrapper (checks Node, runs install.mjs)
├── test.mjs             # feeds mock JSON to statusline.js so users can preview it
├── package.json         # metadata + npx bin + scripts
├── README.md            # English docs
├── README.uz.md         # Uzbek docs
├── LICENSE              # MIT
└── .gitignore
```

---

## 2. `statusline.js` — use this as the baseline, then refine the styling if you can improve it

Requirements:
- Zero npm dependencies (only Node built-ins).
- Read **all of stdin** using the async event pattern (reliable on Windows pipes), parse JSON in a `try/catch`.
- **Never crash and never print nothing**: wrap everything in try/catch; on any error, print a minimal safe fallback and `process.exit(0)`.
- Two-line default output, colored with ANSI:
  - **Line 1:** `◆ <Model>   📁 <dirname>   🌿 <branch> <+staged ~modified ?untracked>`
  - **Line 2:** `<colored bar> <pct>%  ·  💰 $<cost>  ·  ⏱ <Xm Ys>  ·  5h <p>% · 7d <p>%`
- Color thresholds for the context bar and rate limits: **green < 70%, yellow 70–89%, red ≥ 90%**.
- Graceful fallbacks: no git repo → drop the git segment; `rate_limits` absent → drop those segments; `used_percentage` null → treat as 0.
- **Cache git calls** to a temp file keyed by `session_id` (refresh every 5s) using `os.tmpdir()` so it works on every OS.
- **Zero-config defaults must look great.** Optional environment-variable overrides (all optional):
  - `NO_COLOR` — disable all ANSI colors
  - `CCSL_NO_EMOJI=1` — replace emoji icons with plain text
  - `CCSL_NERD_FONTS=1` — use Nerd Font / powerline glyphs instead of emoji
  - `CCSL_HIDE=cost,duration,git,ratelimit` — comma list of segments to hide
  - `CCSL_BAR_WIDTH=10` — context bar width
  - `CCSL_LINES=1` or `2` — force single or double line (default: auto; collapse to one compact line when `COLUMNS` is small)

Baseline implementation:

```js
#!/usr/bin/env node
'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ---------- config from env (all optional) ----------
const ENV = process.env;
const NO_COLOR = !!ENV.NO_COLOR;
const NO_EMOJI = ENV.CCSL_NO_EMOJI === '1' || ENV.CCSL_NO_EMOJI === 'true';
const NERD = ENV.CCSL_NERD_FONTS === '1' || ENV.CCSL_NERD_FONTS === 'true';
const HIDE = new Set((ENV.CCSL_HIDE || '').split(',').map(s => s.trim()).filter(Boolean));
const BAR_W = Math.max(4, Math.min(40, parseInt(ENV.CCSL_BAR_WIDTH || '10', 10) || 10));
const FORCE_LINES = parseInt(ENV.CCSL_LINES || '0', 10) || 0; // 0 = auto
const COLUMNS = parseInt(ENV.COLUMNS || '0', 10) || 0;

// ---------- helpers ----------
const paint = (codes, s) => (NO_COLOR ? String(s) : `\x1b[${codes}m${s}\x1b[0m`);
const icon = (emoji, nerd, plain) => (NO_EMOJI ? plain : NERD ? nerd : emoji);

function run(cmd, cwd) {
  try {
    return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (_) {
    return '';
  }
}
const countLines = (s) => (s ? s.split('\n').filter(Boolean).length : 0);

function gitInfo(sessionId, cwd) {
  if (HIDE.has('git')) return null;
  const cacheFile = path.join(os.tmpdir(), `ccsl-git-${sessionId || 'nosession'}.txt`);
  const MAX_AGE = 5000; // ms
  let fresh = false;
  try {
    if (Date.now() - fs.statSync(cacheFile).mtimeMs < MAX_AGE) fresh = true;
  } catch (_) {}

  if (!fresh) {
    let line = '';
    try {
      execSync('git rev-parse --git-dir', { cwd, stdio: 'ignore' });
      const branch = run('git branch --show-current', cwd) || run('git rev-parse --short HEAD', cwd);
      const staged = countLines(run('git diff --cached --numstat', cwd));
      const modified = countLines(run('git diff --numstat', cwd));
      const untracked = countLines(run('git ls-files --others --exclude-standard', cwd));
      line = `${branch}\t${staged}\t${modified}\t${untracked}`;
    } catch (_) {
      line = ''; // not a repo
    }
    try { fs.writeFileSync(cacheFile, line); } catch (_) {}
  }

  let content = '';
  try { content = fs.readFileSync(cacheFile, 'utf8'); } catch (_) {}
  if (!content) return null;
  const [branch, staged, modified, untracked] = content.split('\t');
  if (!branch) return null;
  return {
    branch,
    staged: +staged || 0,
    modified: +modified || 0,
    untracked: +untracked || 0,
  };
}

function bar(pct) {
  const filled = Math.round((pct / 100) * BAR_W);
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, BAR_W - filled));
}
const thresh = (p) => (p >= 90 ? '31' : p >= 70 ? '33' : '32');

function render(data) {
  const model = (data.model && data.model.display_name) || 'Claude';
  const cwd = (data.workspace && data.workspace.current_dir) || data.cwd || '';
  const dirname = path.basename(cwd) || cwd || '~';
  const sessionId = data.session_id || '';

  const pct = Math.max(0, Math.min(100, Math.floor(
    Number((data.context_window && data.context_window.used_percentage) || 0) || 0
  )));
  const cost = Number((data.cost && data.cost.total_cost_usd) || 0);
  const durMs = Number((data.cost && data.cost.total_duration_ms) || 0);
  const mins = Math.floor(durMs / 60000);
  const secs = Math.floor((durMs % 60000) / 1000);
  const durStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  const rl = data.rate_limits || {};
  const fiveH = rl.five_hour && rl.five_hour.used_percentage;
  const week = rl.seven_day && rl.seven_day.used_percentage;

  // ----- line 1 -----
  let line1 = `${paint('36', icon('◆', '\uf0e7', '*'))} ${paint('1;36', model)}`;
  line1 += `   ${icon('📁', '\uf07b', '')} ${paint('34', dirname)}`.replace(/ {2,}/g, '  ');

  const g = gitInfo(sessionId, cwd);
  if (g) {
    let counts = '';
    if (g.staged) counts += ' ' + paint('32', `+${g.staged}`);
    if (g.modified) counts += ' ' + paint('33', `~${g.modified}`);
    if (g.untracked) counts += ' ' + paint('31', `?${g.untracked}`);
    line1 += `  ${icon('🌿', '\ue0a0', 'git:')} ${paint('35', g.branch)}${counts}`;
  }

  // ----- line 2 -----
  const sep = paint('2', ' · ');
  const parts = [];
  parts.push(`${paint(thresh(pct), bar(pct))} ${paint(thresh(pct), pct + '%')}`);
  if (!HIDE.has('cost')) parts.push(`${icon('💰', '\uf155', '$')} ${paint('33', '$' + cost.toFixed(2))}`);
  if (!HIDE.has('duration')) parts.push(`${paint('2', icon('⏱', '\uf017', ''))} ${durStr}`.trim());
  if (!HIDE.has('ratelimit') && fiveH != null) parts.push(`5h ${paint(thresh(Math.round(fiveH)), Math.round(fiveH) + '%')}`);
  if (!HIDE.has('ratelimit') && week != null) parts.push(`7d ${paint(thresh(Math.round(week)), Math.round(week) + '%')}`);
  const line2 = parts.join(sep);

  // ----- decide single vs double line -----
  const oneLine = FORCE_LINES === 1 || (FORCE_LINES !== 2 && COLUMNS > 0 && COLUMNS < 55);
  if (oneLine) {
    process.stdout.write(`${line1}${sep}${paint(thresh(pct), pct + '%')}\n`);
  } else {
    process.stdout.write(`${line1}\n${line2}\n`);
  }
}

// ---------- read stdin ----------
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (input += c));
process.stdin.on('end', () => {
  try {
    render(JSON.parse(input || '{}'));
  } catch (_) {
    try { process.stdout.write('Claude Code\n'); } catch (e) {}
  }
  process.exit(0);
});
```

---

## 3. `install.mjs` — the cross-platform installer (this is where the important logic lives)

Requirements:
- Resolve the user's home dir with `os.homedir()`.
- Support an optional `--project` flag to install into `./.claude/settings.json` instead of the global `~/.claude/settings.json` (default = global).
- Create the `.claude` dir if missing (`recursive: true`).
- Copy `statusline.js` (located next to `install.mjs`) into the `.claude` dir.
- **Safely merge `settings.json`**: read the existing file if present, parse it, and **only set/replace the `statusLine` key — never wipe other settings**. If the existing file is invalid JSON, **abort with a clear message** instead of destroying it. **Back up** the existing `settings.json` to `settings.json.bak` before writing.
- Write the command as an **absolute path with forward slashes**, quoted to survive spaces: `node "C:/Users/name/.claude/statusline.js"`.
- Print a friendly summary and tell the user to restart Claude Code (or just send a message) to see it.

Implementation:

```js
#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const projectMode = args.includes('--project');

const here = path.dirname(fileURLToPath(import.meta.url));
const srcScript = path.join(here, 'statusline.js');
if (!fs.existsSync(srcScript)) {
  console.error('✗ Could not find statusline.js next to the installer.');
  process.exit(1);
}

const claudeDir = projectMode
  ? path.join(process.cwd(), '.claude')
  : path.join(os.homedir(), '.claude');

fs.mkdirSync(claudeDir, { recursive: true });

const destScript = path.join(claudeDir, 'statusline.js');
fs.copyFileSync(srcScript, destScript);

const settingsPath = path.join(claudeDir, 'settings.json');
let settings = {};
if (fs.existsSync(settingsPath)) {
  const txt = fs.readFileSync(settingsPath, 'utf8');
  if (txt.trim()) {
    try {
      settings = JSON.parse(txt);
    } catch (e) {
      console.error('✗ Your existing settings.json is not valid JSON. Aborting so nothing is lost.');
      console.error('  File: ' + settingsPath);
      process.exit(1);
    }
  }
  fs.copyFileSync(settingsPath, settingsPath + '.bak'); // safety backup
}

const cmdPath = destScript.replace(/\\/g, '/'); // forward slashes for Git Bash / cross-platform
settings.statusLine = { type: 'command', command: `node "${cmdPath}"`, padding: 0 };

fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');

console.log('✓ Claude Code status line installed!');
console.log('  Script :  ' + destScript);
console.log('  Config :  ' + settingsPath + (fs.existsSync(settingsPath + '.bak') ? '  (backup: settings.json.bak)' : ''));
console.log('  Command:  ' + settings.statusLine.command);
console.log('');
console.log('→ Restart Claude Code (or just send a message) to see your new status line.');
```

---

## 4. `uninstall.mjs`

- Read `~/.claude/settings.json` (or `./.claude/settings.json` with `--project`), delete the `statusLine` key, write it back (keeping everything else).
- Print what was removed. Don't delete the script file by default; mention it can be deleted manually.

```js
#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const projectMode = process.argv.slice(2).includes('--project');
const claudeDir = projectMode ? path.join(process.cwd(), '.claude') : path.join(os.homedir(), '.claude');
const settingsPath = path.join(claudeDir, 'settings.json');

if (!fs.existsSync(settingsPath)) {
  console.log('Nothing to do — ' + settingsPath + ' does not exist.');
  process.exit(0);
}
const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8') || '{}');
if (settings.statusLine) {
  delete settings.statusLine;
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  console.log('✓ Removed the statusLine setting from ' + settingsPath);
  console.log('  (The script at ' + path.join(claudeDir, 'statusline.js') + ' was left in place — delete it manually if you want.)');
} else {
  console.log('No statusLine setting found — nothing changed.');
}
```

---

## 5. `install.sh` (macOS / Linux) and `install.ps1` (Windows)

Thin wrappers: check that Node exists, then run `install.mjs`. Pass through any args (so `--project` works).

`install.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required but was not found." >&2
  echo "Install it from https://nodejs.org and run this again." >&2
  exit 1
fi
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node "$DIR/install.mjs" "$@"
```

`install.ps1`:
```powershell
#!/usr/bin/env pwsh
$ErrorActionPreference = "Stop"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js is required but was not found." -ForegroundColor Red
  Write-Host "Install it from https://nodejs.org and run this again." -ForegroundColor Red
  exit 1
}
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
node "$dir/install.mjs" $args
```

---

## 6. `test.mjs` — lets users preview the status line without launching Claude Code

Spawns `statusline.js`, pipes realistic mock JSON to its stdin, and prints the rendered (ANSI-colored) output to the terminal. Cross-platform (no shell quoting issues).

```js
#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mock = {
  model: { display_name: 'Opus' },
  workspace: { current_dir: process.cwd() },
  cwd: process.cwd(),
  session_id: 'test-session-123',
  context_window: { used_percentage: 68 },
  cost: { total_cost_usd: 0.42, total_duration_ms: 252000 },
  rate_limits: {
    five_hour: { used_percentage: 23 },
    seven_day: { used_percentage: 41 },
  },
};

console.log('Preview of your Claude Code status line:\n');
const child = spawn('node', [path.join(here, 'statusline.js')], { stdio: ['pipe', 'inherit', 'inherit'] });
child.stdin.write(JSON.stringify(mock));
child.stdin.end();
```

---

## 7. `package.json`

```json
{
  "name": "claude-code-statusline",
  "version": "1.0.0",
  "description": "A beautiful, cross-platform status line for Claude Code — shows model, context %, cost, git status, and rate limits.",
  "type": "commonjs",
  "bin": { "claude-code-statusline": "install.mjs" },
  "scripts": {
    "install-statusline": "node install.mjs",
    "uninstall-statusline": "node uninstall.mjs",
    "preview": "node test.mjs"
  },
  "engines": { "node": ">=18" },
  "license": "MIT",
  "keywords": ["claude", "claude-code", "statusline", "cli", "terminal"]
}
```

> `install.mjs` is the npx bin, so `npx -y github:YOUR_GITHUB_USERNAME/claude-code-statusline` runs the installer directly from GitHub on any OS. Make sure `install.mjs` keeps its `#!/usr/bin/env node` shebang.

---

## 8. `.gitignore`

```
node_modules/
*.bak
*.log
.DS_Store
.idea/
.vscode/
```

---

## 9. `LICENSE`

MIT License, year **2026**, author **Javohir** (I can change the name). Use the standard MIT text.

---

## 10. `README.md` (English) — write clear, beginner-friendly prose with these sections

1. **Title + one-line description** and a short "what it looks like" preview. Include an ASCII mock like:
   ```
   ◆ Opus   📁 tashkent-construction   🌿 main +2 ~1
   ███████░░░ 68%  ·  💰 $0.42  ·  ⏱ 4m 12s  ·  5h 23% · 7d 41%
   ```
   Add a line: `> Add a real screenshot here (docs/screenshot.png).`
2. **Features** — model name, context bar with color thresholds, session cost, session time, git branch + change counts, Pro/Max rate-limit usage, zero dependencies, works on macOS/Linux/Windows.
3. **Requirements** — Node.js 18+ and Claude Code.
4. **Install** — present three ways, easiest first:
   - **One command (recommended):**
     ```
     npx -y github:YOUR_GITHUB_USERNAME/claude-code-statusline
     ```
   - **Clone and run:**
     ```
     git clone https://github.com/YOUR_GITHUB_USERNAME/claude-code-statusline
     cd claude-code-statusline
     node install.mjs
     ```
   - **Per-OS scripts:** `bash install.sh` (macOS/Linux) or `./install.ps1` (Windows PowerShell).
   - **Windows note:** if PowerShell blocks the script, run once: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`.
   - After installing, **restart Claude Code or send any message** to see the status line.
5. **What each part means** — short explanation of every segment and the green/yellow/red thresholds.
6. **Configuration** — a table of the optional env vars (`NO_COLOR`, `CCSL_NO_EMOJI`, `CCSL_NERD_FONTS`, `CCSL_HIDE`, `CCSL_BAR_WIDTH`, `CCSL_LINES`) with examples, e.g. how to put `CCSL_HIDE=ratelimit` into the `command` string in settings.json.
7. **Preview without Claude Code** — `node test.mjs` (or `npm run preview`).
8. **Update** — re-run the install command.
9. **Uninstall** — `node uninstall.mjs`.
10. **Troubleshooting** — status line not showing → accept the workspace trust prompt and restart; Node not found → install from nodejs.org; on Windows the path must use forward slashes (the installer already does this); values show `--` → they appear after the first message; run `claude --debug` to see status-line errors.
11. **How it works** — one short paragraph: Claude Code pipes session JSON to the script on stdin; the first line of stdout becomes the status line.
12. **Credits & links** — link to the official docs (`https://code.claude.com/docs/en/statusline`) and the License.

## 11. `README.uz.md` (Uzbek)

A full Uzbek translation of `README.md` with the same sections and the same code blocks. Add a link at the top of `README.md` to the Uzbek version and vice-versa (e.g. `🇬🇧 English | 🇺🇿 O'zbekcha`).

---

## 12. After writing all files — do these steps

1. **Preview it:** run `node test.mjs` and show me the rendered status line output.
2. **Sanity-check cross-platform correctness:** confirm the installer would write a forward-slash absolute path on Windows, and that `settings.json` merging preserves existing keys.
3. **Install it on this machine to demo it (with my OK first, since it edits `~/.claude/settings.json`):** the installer backs up the old file to `settings.json.bak`, so it's safe. Then tell me to send a message in Claude Code to see it live.
4. **Initialize git and make the first commit:**
   ```
   git init
   git add .
   git commit -m "feat: beautiful cross-platform status line for Claude Code"
   ```
5. **Print (do not run) the GitHub push commands** with my username filled in (or the placeholder), e.g.:
   ```
   # create the repo on github.com first (or with: gh repo create claude-code-statusline --public --source=. --push)
   git remote add origin https://github.com/YOUR_GITHUB_USERNAME/claude-code-statusline.git
   git branch -M main
   git push -u origin main
   ```
6. Remind me to **replace `YOUR_GITHUB_USERNAME`** in `README.md`, `README.uz.md`, and the push commands, and to **add a real screenshot** at `docs/screenshot.png`.

## 13. Hard rules
- **Never** overwrite an existing `settings.json` wholesale — only merge the `statusLine` key, and back up first.
- The status-line script must **always print output and exit 0** (a blank/non-zero result hides the status line).
- **No telemetry, no network calls, no extra dependencies.**
- Keep all paths cross-platform (`path.join`, `os.homedir()`, `os.tmpdir()`); only convert to forward slashes for the final command string.
