#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mock = {
  model: { display_name: 'Sonnet' },
  workspace: { current_dir: process.cwd() },
  cwd: process.cwd(),
  session_id: 'test-session-123',
  context_window: { used_percentage: 68 },
  cost: { total_cost_usd: 1.87, total_duration_ms: 252000 },
  rate_limits: {
    five_hour: { used_percentage: 55, resets_at: Math.floor(Date.now() / 1000) + 2 * 3600 + 15 * 60 },
    seven_day: { used_percentage: 82, resets_at: Math.floor(Date.now() / 1000) + 2 * 86400 + 3 * 3600 },
  },
};

console.log('Preview of your Claude Code status line:\n');
const child = spawn('node', [path.join(here, 'statusline.js')], {
  stdio: ['pipe', 'inherit', 'inherit'],
});
child.stdin.write(JSON.stringify(mock));
child.stdin.end();
