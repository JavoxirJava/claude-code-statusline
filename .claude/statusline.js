#!/usr/bin/env node
'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ---------- config from env ----------
const ENV = process.env;
const NO_COLOR = !!ENV.NO_COLOR;
const NO_EMOJI = ENV.CCSL_NO_EMOJI === '1' || ENV.CCSL_NO_EMOJI === 'true';
const NERD = ENV.CCSL_NERD_FONTS === '1' || ENV.CCSL_NERD_FONTS === 'true';
const HIDE = new Set((ENV.CCSL_HIDE || '').split(',').map(s => s.trim()).filter(Boolean));
const BAR_W = Math.max(4, Math.min(40, parseInt(ENV.CCSL_BAR_WIDTH || '10', 10) || 10));
const FORCE_LINES = parseInt(ENV.CCSL_LINES || '0', 10) || 0;
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
  if (HIDE.has('git') || !cwd) return null;
  const cacheFile = path.join(os.tmpdir(), `ccsl-git-${sessionId || 'nosession'}.txt`);
  const MAX_AGE = 5000;
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
      line = '';
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
  const fiveH = rl.five_hour && rl.five_hour.used_percentage != null ? rl.five_hour.used_percentage : null;
  const week = rl.seven_day && rl.seven_day.used_percentage != null ? rl.seven_day.used_percentage : null;

  // ----- line 1 -----
  let line1 = `${paint('36', icon('◆', '', '*'))} ${paint('1;36', model)}`;
  line1 += `   ${icon('📁', '', '')} ${paint('34', dirname)}`.replace(/ {3,}/g, '   ');

  if (!HIDE.has('git')) {
    const g = gitInfo(sessionId, cwd);
    if (g) {
      let counts = '';
      if (g.staged) counts += ' ' + paint('32', `+${g.staged}`);
      if (g.modified) counts += ' ' + paint('33', `~${g.modified}`);
      if (g.untracked) counts += ' ' + paint('31', `?${g.untracked}`);
      line1 += `  ${icon('🌿', '', 'git:')} ${paint('35', g.branch)}${counts}`;
    }
  }

  // ----- line 2 -----
  const sep = paint('2', ' · ');
  const parts = [];
  parts.push(`${paint(thresh(pct), bar(pct))} ${paint(thresh(pct), pct + '%')}`);
  if (!HIDE.has('cost')) parts.push(`${icon('💰', '', '$')} ${paint('33', '$' + cost.toFixed(2))}`);
  if (!HIDE.has('duration')) parts.push(`${paint('2', icon('⏱', '', ''))} ${durStr}`.trim());
  if (!HIDE.has('ratelimit') && fiveH != null) parts.push(`5h ${paint(thresh(Math.round(fiveH)), Math.round(fiveH) + '%')}`);
  if (!HIDE.has('ratelimit') && week != null) parts.push(`7d ${paint(thresh(Math.round(week)), Math.round(week) + '%')}`);
  const line2 = parts.join(sep);

  // ----- single vs double line -----
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
