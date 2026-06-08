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
  fs.copyFileSync(settingsPath, settingsPath + '.bak');
}

// Always use forward slashes so Git Bash on Windows doesn't break the path
const cmdPath = destScript.replace(/\\/g, '/');
settings.statusLine = { type: 'command', command: `node "${cmdPath}"`, padding: 0 };

fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');

console.log('✓ Claude Code status line installed!');
console.log('  Script :  ' + destScript);
console.log('  Config :  ' + settingsPath + (fs.existsSync(settingsPath + '.bak') ? '  (backup: settings.json.bak)' : ''));
console.log('  Command:  ' + settings.statusLine.command);
console.log('');
console.log('→ Restart Claude Code (or just send a message) to see your new status line.');
