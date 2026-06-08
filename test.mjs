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
const child = spawn('node', [path.join(here, 'statusline.js')], {
  stdio: ['pipe', 'inherit', 'inherit'],
});
child.stdin.write(JSON.stringify(mock));
child.stdin.end();
